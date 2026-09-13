const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, session, safeStorage } = require('electron')
const { spawn, execFile, execFileSync } = require('node:child_process')
const net = require('node:net')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')

const isDev = !app.isPackaged
const DEV_URL = process.env.AEZAKMI_CUSTOMER_DEV_URL || 'http://localhost:5173'
const CUSTOMER_LOCAL_DATA_DIR = '.aezakmi-customer'
const LOCAL_BACKEND_HOST = '127.0.0.1'
const LOCAL_BACKEND_PORT = 3000
const STATION_SETUP_MASTER_PIN = String(process.env.AEZAKMI_STATION_SETUP_MASTER_PIN || '062321')

// Customer-local fallback state must stay with the Customer Station install.
// This is intentionally configured before the single-instance lock, BrowserWindow,
// or defaultSession are created so Chromium IndexedDB/localStorage follows the
// installation drive instead of silently landing under C:\Users\...\AppData.
const legacyUserDataPath = app.getPath('userData')
const legacySessionDataPath = app.getPath('sessionData')

function customerInstallRoot() {
  if (isDev) return path.resolve(__dirname, '..')
  return path.dirname(process.execPath)
}

function customerLocalDataPath() {
  return path.join(customerInstallRoot(), CUSTOMER_LOCAL_DATA_DIR)
}

function copyLegacyEntry(sourceRoot, targetRoot, name) {
  const source = path.join(sourceRoot, name)
  const target = path.join(targetRoot, name)
  if (!fs.existsSync(source)) return false
  if (fs.existsSync(target)) return true
  try {
    fs.cpSync(source, target, { recursive:true, errorOnExist:false, force:false })
    return true
  } catch (error) {
    console.warn(`Unable to migrate legacy Customer data ${name}:`, error?.message || error)
    return false
  }
}

function migrateLegacyCustomerStorage(target) {
  const marker = path.join(target, '.install-storage-v1')
  if (fs.existsSync(marker)) return

  // Preserve identity and the cached public/fallback snapshot used by the
  // renderer. We deliberately skip Chromium caches; they can be rebuilt.
  const entries = [
    'server-config.json',
    'station-credential.bin',
    'cloud-station-credential.bin',
    'station-installation-id.txt',
    'IndexedDB',
    'Local Storage',
  ]
  const roots = [...new Set([legacyUserDataPath, legacySessionDataPath].filter(Boolean))]
  const migrated = []
  for (const root of roots) {
    if (!root || path.resolve(root) === path.resolve(target)) continue
    for (const name of entries) {
      if (copyLegacyEntry(root, target, name)) migrated.push({ root, name })
    }
  }

  // Remove the old copies after the install-relative copy exists. This includes
  // IndexedDB/Local Storage so the fallback database is not left authoritative
  // on C: after a station is migrated to an install on another drive.
  for (const { root, name } of migrated) {
    const source = path.join(root, name)
    const targetFile = path.join(target, name)
    try {
      if (fs.existsSync(targetFile)) fs.rmSync(source, { recursive:true, force:true })
    } catch (error) {
      console.warn(`Unable to remove migrated legacy Customer data ${name}:`, error?.message || error)
    }
  }

  try { fs.writeFileSync(marker, new Date().toISOString(), { encoding:'utf8', mode:0o600 }) } catch {}
}

function configureCustomerInstallStorage() {
  const target = customerLocalDataPath()
  try {
    fs.mkdirSync(target, { recursive:true })
    migrateLegacyCustomerStorage(target)
    app.setPath('userData', target)
    app.setPath('sessionData', target)
    if (process.platform === 'win32') {
      try { execFileSync('attrib.exe', ['+H', target], { windowsHide:true, stdio:'ignore' }) } catch (error) {
        console.warn('Unable to mark Customer local-data folder hidden:', error?.message || error)
      }
    }
    return target
  } catch (error) {
    // Never silently fall back to C:\Users\...\AppData. If the chosen install
    // directory is not writable, fail clearly so the station is not split over
    // two drives and does not lose its fallback identity after disk imaging.
    const wrapped = new Error(`Customer Station cannot initialize local data beside the installed app: ${target}. Choose a writable installation folder. ${error?.message || error}`)
    wrapped.code = 'CUSTOMER_INSTALL_STORAGE_UNAVAILABLE'
    throw wrapped
  }
}

const customerDataRoot = configureCustomerInstallStorage()
const ACTIVE_WIDTH = 960
const ACTIVE_HEIGHT = 680
const WINDOW_STATES = Object.freeze({ LOCKED:'locked', IDLE:'idle', ACTIVE:'active' })

let mainWindow = null
let tray = null
let windowsKeyHook = null
let windowState = WINDOW_STATES.LOCKED
let dashboardVisible = false
let appIsQuitting = false
let hookRestartTimer = null
let sessionStartTransitionPending = false
// A healthy active-session marker belongs to this Electron process. Only a
// marker from an older process (crash/restart) or one with an explicit exit
// request is recovery work. Without this ownership id, the renderer's recovery
// timer mistakes every newly-started session for a crashed session and logs the
// member out immediately after Start Session.
const lifecycleRuntimeId = crypto.randomUUID()
let remoteLockSnapshot = null
let localBackendProcess = null
let localBackendLogStream = null

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

function serverConfigPath() {
  return path.join(app.getPath('userData'), 'server-config.json')
}

function normalizeServerConfig(value) {
  const host = String(value?.host || '').trim()
  const port = Number(value?.port)
  if (!host || /^https?:\/\//i.test(host) || /[\/\\\s]/.test(host)) {
    const error = new Error('Enter only the server IP or hostname, without http:// or a path.')
    error.code = 'INVALID_SERVER_HOST'
    throw error
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('Port must be a whole number from 1 to 65535.')
    error.code = 'INVALID_SERVER_PORT'
    throw error
  }
  const origin = `http://${host}:${port}`
  return { host, port, origin, apiBase: `${origin}/api`, configured: true, source: 'saved' }
}

function readServerConfig() {
  try {
    const parsed = JSON.parse(fs.readFileSync(serverConfigPath(), 'utf8'))
    return normalizeServerConfig(parsed)
  } catch (error) {
    if (error?.code !== 'ENOENT' && error?.code !== 'INVALID_SERVER_HOST' && error?.code !== 'INVALID_SERVER_PORT' && !(error instanceof SyntaxError)) {
      console.warn('Unable to read server config:', error?.message || error)
    }
  }
  return {
    host: LOCAL_BACKEND_HOST,
    port: LOCAL_BACKEND_PORT,
    origin: `http://${LOCAL_BACKEND_HOST}:${LOCAL_BACKEND_PORT}`,
    apiBase: `http://${LOCAL_BACKEND_HOST}:${LOCAL_BACKEND_PORT}/api`,
    configured: false,
    source: 'local-default',
  }
}

function writeServerConfig(value) {
  const normalized = normalizeServerConfig(value)
  const file = serverConfigPath()
  const temp = `${file}.tmp`
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(temp, JSON.stringify({ host: normalized.host, port: normalized.port }, null, 2), { mode: 0o600 })
  fs.renameSync(temp, file)
  return normalized
}

function isLoopbackHost(host) {
  const value = String(host || '').trim().toLowerCase()
  return value === '127.0.0.1' || value === 'localhost' || value === '::1'
}

function verifyStationSetupMasterPin(value) {
  const supplied = Buffer.from(String(value || '').trim())
  const expected = Buffer.from(STATION_SETUP_MASTER_PIN)
  if (supplied.length !== expected.length) return false
  return crypto.timingSafeEqual(supplied, expected)
}

function tcpReachable(host = LOCAL_BACKEND_HOST, port = LOCAL_BACKEND_PORT, timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port })
    let settled = false
    const done = (value) => {
      if (settled) return
      settled = true
      try { socket.destroy() } catch {}
      resolve(value)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
    socket.setTimeout(timeoutMs, () => done(false))
  })
}

async function waitForLocalBackend(timeoutMs = 7000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    if (await tcpReachable(LOCAL_BACKEND_HOST, LOCAL_BACKEND_PORT, 450)) return true
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  const error = new Error(`Local backend did not become ready on ${LOCAL_BACKEND_HOST}:${LOCAL_BACKEND_PORT}.`)
  error.code = 'LOCAL_BACKEND_START_TIMEOUT'
  throw error
}

function localBackendPaths() {
  const backendRoot = isDev
    ? path.resolve(__dirname, '../../../backend')
    : path.join(process.resourcesPath, 'backend')
  return { backendRoot, backendEntry:path.join(backendRoot, 'src', 'server.js') }
}

function ensureLocalBackendSecret() {
  const secretPath = path.join(customerDataRoot, 'backend-jwt-secret')
  let secret = ''
  try { secret = fs.readFileSync(secretPath, 'utf8').trim() } catch {}
  if (secret.length >= 32) return secret
  secret = crypto.randomBytes(48).toString('hex')
  fs.writeFileSync(secretPath, secret, { encoding:'utf8', mode:0o600 })
  return secret
}

async function ensureLocalBackend() {
  if (await tcpReachable()) return { ok:true, alreadyRunning:true, host:LOCAL_BACKEND_HOST, port:LOCAL_BACKEND_PORT }
  if (localBackendProcess && localBackendProcess.exitCode === null) {
    await waitForLocalBackend()
    return { ok:true, alreadyRunning:false, host:LOCAL_BACKEND_HOST, port:LOCAL_BACKEND_PORT }
  }

  const { backendRoot, backendEntry } = localBackendPaths()
  if (!fs.existsSync(backendEntry)) {
    const error = new Error(`Bundled local backend was not found at ${backendEntry}.`)
    error.code = 'LOCAL_BACKEND_MISSING'
    throw error
  }

  const dataDir = path.join(customerDataRoot, 'backend-data')
  fs.mkdirSync(dataDir, { recursive:true })
  const jwtSecret = ensureLocalBackendSecret()
  const logPath = path.join(customerDataRoot, 'local-backend.log')
  localBackendLogStream?.end?.()
  localBackendLogStream = fs.createWriteStream(logPath, { flags:'a' })
  localBackendLogStream.write(`\n--- local backend start ${new Date().toISOString()} ---\n`)

  const command = isDev ? (process.env.npm_node_execpath || process.env.NODE || 'node') : process.execPath
  const env = {
    ...process.env,
    NODE_ENV: 'production',
    HOST: '0.0.0.0',
    PORT: String(LOCAL_BACKEND_PORT),
    AEZAKMI_DESKTOP_BACKEND: '1',
    AEZAKMI_EMBEDDED_CUSTOMER_SERVER: '1',
    DATABASE_PATH: path.join(dataDir, 'aezakmi.sqlite'),
    JWT_SECRET: jwtSecret,
    CORS_ORIGIN: 'http://localhost:5173,http://127.0.0.1:5173,null',
  }
  if (!isDev) env.ELECTRON_RUN_AS_NODE = '1'

  localBackendProcess = spawn(command, [backendEntry], {
    cwd: backendRoot,
    env,
    stdio:['ignore','pipe','pipe'],
    windowsHide:true,
  })
  localBackendProcess.stdout?.on('data', (data) => localBackendLogStream?.write(`[stdout] ${data}`))
  localBackendProcess.stderr?.on('data', (data) => localBackendLogStream?.write(`[stderr] ${data}`))
  localBackendProcess.once('error', (error) => {
    localBackendLogStream?.write(`[spawn-error] ${error?.stack || error}\n`)
    localBackendProcess = null
  })
  localBackendProcess.once('exit', (code, signal) => {
    localBackendLogStream?.write(`[exit] code=${code} signal=${signal}\n`)
    localBackendProcess = null
  })

  await waitForLocalBackend()
  return { ok:true, alreadyRunning:false, host:LOCAL_BACKEND_HOST, port:LOCAL_BACKEND_PORT }
}

function stopLocalBackend() {
  if (localBackendProcess) {
    try { localBackendProcess.kill() } catch {}
    localBackendProcess = null
  }
  try { localBackendLogStream?.end?.() } catch {}
  localBackendLogStream = null
}

function isTrustedRenderer(event) {
  return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender === mainWindow?.webContents)
}

function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedRenderer(event)) {
      const error = new Error('IPC request rejected: untrusted renderer.')
      error.code = 'UNTRUSTED_IPC_SENDER'
      throw error
    }
    return handler(event, ...args)
  })
}

function getLocalIPv4() {
  const addresses = []
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const item of entries || []) {
      if (item?.family === 'IPv4' && !item.internal) addresses.push(item.address)
    }
  }
  const unique = [...new Set(addresses)]
  return unique.find(ip => /^10\./.test(ip))
    || unique.find(ip => /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip))
    || unique.find(ip => /^192\.168\./.test(ip))
    || unique[0]
    || null
}

function installedCafeName() {
  if (process.platform !== 'win32') return 'iCafe Management System'
  try {
    const output = execFileSync('reg', ['query', 'HKCU\\Software\\iCafe Management System', '/v', 'CafeName'], { encoding:'utf8', windowsHide:true })
    const match = output.match(/CafeName\s+REG_SZ\s+(.+)/i)
    return match?.[1]?.trim() || 'iCafe Management System'
  } catch { return 'iCafe Management System' }
}
function stationCredentialPath() { return path.join(app.getPath('userData'),'station-credential.bin') }
function readStationCredential() { try { const data=fs.readFileSync(stationCredentialPath());return safeStorage.isEncryptionAvailable()?safeStorage.decryptString(data):data.toString('utf8') } catch { return '' } }
function writeStationCredential(value) { const text=String(value||'');const data=safeStorage.isEncryptionAvailable()?safeStorage.encryptString(text):Buffer.from(text);fs.writeFileSync(stationCredentialPath(),data,{mode:0o600});return true }
function cloudStationCredentialPath() { return path.join(app.getPath('userData'),'cloud-station-credential.bin') }
function readCloudStationCredential() { try { const data=fs.readFileSync(cloudStationCredentialPath());return safeStorage.isEncryptionAvailable()?safeStorage.decryptString(data):data.toString('utf8') } catch { return '' } }
function writeCloudStationCredential(value) { const text=String(value||'');if(!text){try{fs.unlinkSync(cloudStationCredentialPath())}catch{};return true}const data=safeStorage.isEncryptionAvailable()?safeStorage.encryptString(text):Buffer.from(text);fs.writeFileSync(cloudStationCredentialPath(),data,{mode:0o600});return true }
function installationIdPath(){return path.join(app.getPath('userData'),'station-installation-id.txt')}
function readInstallationId(){try{const value=fs.readFileSync(installationIdPath(),'utf8').trim();if(value)return value}catch{}const value=crypto.randomUUID();fs.writeFileSync(installationIdPath(),value,{encoding:'utf8',mode:0o600});return value}

function sessionLifecyclePath(){return path.join(app.getPath('userData'),'session-lifecycle.json')}
function readSessionLifecycleMarker(){try{const value=JSON.parse(fs.readFileSync(sessionLifecyclePath(),'utf8'));return value&&typeof value==='object'?value:null}catch{return null}}
function lifecycleMarkerForRenderer(){
  const marker=readSessionLifecycleMarker()
  if(!marker)return null
  const owner=String(marker.runtimeInstanceId||'')
  // Legacy markers without an owner are conservatively treated as leftovers
  // from an older process. A current-process active marker is healthy unless
  // an exit has explicitly been requested.
  const recoveryRequired=Boolean(marker.active && (marker.exitRequestedAt || !owner || owner!==lifecycleRuntimeId))
  return {...marker,recoveryRequired}
}
function writeSessionLifecycleMarker(value){const file=sessionLifecyclePath();const temp=`${file}.tmp`;fs.writeFileSync(temp,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(temp,file);return value}
function markActiveSession(data={}){const stamp=new Date().toISOString();return writeSessionLifecycleMarker({active:true,runtimeInstanceId:lifecycleRuntimeId,sessionId:data?.sessionId||data?.id||null,memberId:data?.memberId||null,role:data?.role||null,billing:data?.billing||null,startedAt:data?.startedAt||null,markedAt:stamp,lastSeenAt:stamp,exitReason:null,exitRequestedAt:null})}
let lifecycleTouchAt=0
function touchSessionLifecycle(){const nowMs=Date.now();if(nowMs-lifecycleTouchAt<4000)return true;const current=readSessionLifecycleMarker();if(!current?.active)return true;lifecycleTouchAt=nowMs;writeSessionLifecycleMarker({...current,lastSeenAt:new Date(nowMs).toISOString()});return true}
function markSessionExit(data={}){const current=readSessionLifecycleMarker()||{};const existingAt=current.exitRequestedAt||null;return writeSessionLifecycleMarker({...current,active:true,runtimeInstanceId:current.runtimeInstanceId||lifecycleRuntimeId,exitReason:String(data?.reason||current.exitReason||'station_exit'),exitRequestedAt:existingAt||String(data?.interruptedAt||new Date().toISOString())})}
function clearSessionLifecycleMarker(){try{fs.unlinkSync(sessionLifecyclePath())}catch{}return true}

function isLocked() { return windowState === WINDOW_STATES.LOCKED }
function isActive() { return windowState === WINDOW_STATES.ACTIVE }

function startWindowsKeyHook() {
  if (process.platform !== 'win32') return null
  if (windowsKeyHook && !windowsKeyHook.killed && windowsKeyHook.exitCode === null) return windowsKeyHook

  const script = isDev
    ? path.join(__dirname, 'windows-key-hook.ps1')
    : path.join(process.resourcesPath, 'windows-key-hook.ps1')
  const child = spawn(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script],
    { stdio:['pipe','ignore','ignore'], windowsHide:true },
  )

  windowsKeyHook = child
  child.on('error', (error) => {
    if (windowsKeyHook === child) windowsKeyHook = null
    if (error?.code !== 'EPIPE') console.warn('Windows key hook error:', error?.message || error)
    scheduleHookRestart()
  })
  child.on('exit', () => {
    if (windowsKeyHook === child) windowsKeyHook = null
    if ((isLocked() || isIdleDashboard()) && !appIsQuitting) scheduleHookRestart()
  })

  return child
}

function scheduleHookRestart() {
  if (process.platform !== 'win32' || (!isLocked() && !isIdleDashboard()) || appIsQuitting || hookRestartTimer) return
  hookRestartTimer = setTimeout(() => {
    hookRestartTimer = null
    if ((!isLocked() && !isIdleDashboard()) || appIsQuitting) return
    sendWindowsKeyCommand('lock')
  }, 750)
}

function sendWindowsKeyCommand(command) {
  if (process.platform !== 'win32') return
  const child = startWindowsKeyHook()
  if (!child?.stdin || child.stdin.destroyed || child.stdin.writableEnded || !child.stdin.writable) {
    scheduleHookRestart()
    return
  }
  try {
    child.stdin.write(`${command}\n`)
  } catch (error) {
    if (error?.code !== 'EPIPE') console.warn('Windows key hook command failed:', error?.message || error)
    if (windowsKeyHook === child) windowsKeyHook = null
    scheduleHookRestart()
  }
}

function setWindowsKeyLocked(locked) {
  sendWindowsKeyCommand(locked ? 'lock' : 'unlock')
}

function loadTrayIcon() {
  const iconPath = path.join(__dirname, 'tray-icon-32.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (!icon.isEmpty()) return icon
  return nativeImage.createFromDataURL(
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#E8A33D"/><path d="M9 22 16 8l7 14" fill="none" stroke="#0B1017" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="17" r="2" fill="#0B1017"/></svg>'
    ),
  )
}

function updateTrayMenu() {
  if (!tray || tray.isDestroyed()) return
  const template = isActive()
    ? [
        { label:'Check Session Time', click:showMiniDashboard },
        { label:'Open Mini Dashboard', click:showMiniDashboard },
        { label:'Hide Mini Dashboard', enabled:dashboardVisible, click:hideMiniDashboard },
        { type:'separator' },
        { label:'Lock / Log Out', click:() => mainWindow?.webContents.send('tray:logout') },
      ]
    : [{ label:'Customer Station Locked', enabled:false }]
  tray.setContextMenu(Menu.buildFromTemplate(template))
}

function createTray() {
  if (tray && !tray.isDestroyed()) {
    updateTrayMenu()
    return tray
  }
  tray = new Tray(loadTrayIcon())
  tray.setToolTip(installedCafeName() + ' — Customer Station')
  tray.on('right-click', updateTrayMenu)
  tray.on('double-click', () => { if (isActive()) showMiniDashboard() })
  tray.on('click', () => { if (isActive()) showMiniDashboard() })
  updateTrayMenu()
  return tray
}

function applyLockedWindowMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setMinimumSize(0, 0)
  mainWindow.setMaximumSize(0, 0)
  mainWindow.setSkipTaskbar(true)
  mainWindow.setResizable(false)
  mainWindow.setKiosk(true)
  mainWindow.setFullScreen(true)
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.show()
  mainWindow.focus()
  dashboardVisible = false
}

function applyActiveWindowMode({ show = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setMinimumSize(ACTIVE_WIDTH, ACTIVE_HEIGHT)
  mainWindow.setMaximumSize(ACTIVE_WIDTH, ACTIVE_HEIGHT)
  mainWindow.setKiosk(false)
  mainWindow.setFullScreen(false)
  // ACTIVE paid sessions use a normal desktop window. Never force the mini
  // dashboard above the customer's other applications.
  mainWindow.setAlwaysOnTop(false)
  mainWindow.setSkipTaskbar(true)
  mainWindow.setResizable(false)
  mainWindow.setSize(ACTIVE_WIDTH, ACTIVE_HEIGHT, false)
  mainWindow.center()
  if (show) {
    mainWindow.show()
    mainWindow.focus()
    dashboardVisible = true
  }
}

function applyIdleDashboardMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.setMinimumSize(ACTIVE_WIDTH, ACTIVE_HEIGHT)
  mainWindow.setMaximumSize(0, 0)
  // The signed-in/no-session station is the customer-facing shell. Keep it
  // in true kiosk fullscreen so the Windows taskbar and desktop cannot show
  // around the maximized dashboard.
  mainWindow.setKiosk(true)
  mainWindow.setFullScreen(true)
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setSkipTaskbar(true)
  mainWindow.setResizable(false)
  mainWindow.maximize()
  mainWindow.show()
  mainWindow.focus()
  dashboardVisible = true
}

function isIdleDashboard() { return windowState === WINDOW_STATES.IDLE }

function showIdleDashboard() {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  if (isIdleDashboard()) {
    if (!mainWindow.isVisible() || !mainWindow.isFullScreen()) applyIdleDashboardMode()
    return true
  }
  windowState = WINDOW_STATES.IDLE
  sessionStartTransitionPending = false
  remoteLockSnapshot = null
  // Keep the shell key hook active while the station is signed in. This
  // prevents Win+Tab/virtual-desktop switching from bypassing the station.
  setWindowsKeyLocked(true)
  applyIdleDashboardMode()
  updateTrayMenu()
  return true
}

function applyAuthenticatedWindowMode() {
  // Auth bootstrap/reload is not authorization to clear a remote station lock.
  // Only the explicit remote/emergency unlock command may restore that snapshot.
  if (remoteLockSnapshot) {
    applyLockedWindowMode()
    notifyStationLocked(true)
    return false
  }
  return showIdleDashboard()
}

function enterActiveState() {
  if (!mainWindow || mainWindow.isDestroyed()) return false

  if (isActive()) {
    // Repeated renderer refreshes must not resize/hide an already-active window.
    // A deliberate session-start transition is completed by its own IPC.
    if (sessionStartTransitionPending) return true
    updateTrayMenu()
    return true
  }

  windowState = WINDOW_STATES.ACTIVE
  setWindowsKeyLocked(false)
  applyActiveWindowMode({ show:false })
  mainWindow.hide()
  dashboardVisible = false
  createTray()
  updateTrayMenu()
  return true
}

function beginSessionStartTransition() {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  windowState = WINDOW_STATES.ACTIVE
  setWindowsKeyLocked(false)
  createTray()
  sessionStartTransitionPending = true
  mainWindow.setMinimumSize(0, 0)
  mainWindow.setMaximumSize(0, 0)
  mainWindow.setKiosk(true)
  mainWindow.setFullScreen(true)
  mainWindow.setAlwaysOnTop(true, 'screen-saver')
  mainWindow.setSkipTaskbar(true)
  mainWindow.show()
  mainWindow.focus()
  dashboardVisible = true
  updateTrayMenu()
  return true
}

function completeSessionStartTransition() {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  sessionStartTransitionPending = false
  if (!isActive()) return false
  applyActiveWindowMode({ show:false })
  mainWindow.hide()
  dashboardVisible = false
  updateTrayMenu()
  return true
}

function showMiniDashboard() {
  if (!isActive() || !mainWindow || mainWindow.isDestroyed()) return false
  applyActiveWindowMode({ show:true })
  updateTrayMenu()
  return true
}

function hideMiniDashboard() {
  if (!isActive() || !mainWindow || mainWindow.isDestroyed()) return false
  mainWindow.hide()
  dashboardVisible = false
  updateTrayMenu()
  return true
}

function notifyStationLocked(locked) {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('client:station-locked', locked)
}

function lockClientWindow({ preserveState = false } = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  // Only a lock that interrupts a live/idle session (i.e. triggered remotely
  // by staff or the emergency shortcut) should surface the in-app "session is
  // locked" overlay. A lock that happens while already locked (e.g. the
  // normal boot/login state) has no session to interrupt.
  const isRemoteInterrupt = preserveState && !remoteLockSnapshot && windowState !== WINDOW_STATES.LOCKED
  if (preserveState && !remoteLockSnapshot) remoteLockSnapshot = { windowState, dashboardVisible }
  windowState = WINDOW_STATES.LOCKED
  sessionStartTransitionPending = false
  dashboardVisible = false
  setWindowsKeyLocked(true)
  applyLockedWindowMode()
  updateTrayMenu()
  if (isRemoteInterrupt) notifyStationLocked(true)
  return true
}

function unlockClientWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false
  const snapshot=remoteLockSnapshot
  const hadRemoteLock = Boolean(snapshot)
  remoteLockSnapshot=null
  if (hadRemoteLock) notifyStationLocked(false)
  if (snapshot?.windowState === WINDOW_STATES.ACTIVE) {
    windowState=WINDOW_STATES.ACTIVE
    setWindowsKeyLocked(false)
    applyActiveWindowMode({show:Boolean(snapshot.dashboardVisible)})
    if (!snapshot.dashboardVisible) mainWindow.hide()
    updateTrayMenu()
    return true
  }
  if (snapshot?.windowState === WINDOW_STATES.IDLE) {
    windowState=WINDOW_STATES.IDLE
    return showIdleDashboard()
  }
  return applyAuthenticatedWindowMode()
}

function remoteCommandExpiredError() {
  const error = new Error('Remote command expired before execution.')
  error.code = 'REMOTE_COMMAND_EXPIRED'
  return error
}

function parsedDeadline(value) {
  if (!value) return null
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : null
}

async function executeRemoteCommand(command) {
  const descriptor = command && typeof command === 'object' ? command : { command }
  const action = String(descriptor.command || '').toLowerCase()
  const expiresAt = parsedDeadline(descriptor.expiresAt)
  if (expiresAt !== null && Date.now() >= expiresAt) throw remoteCommandExpiredError()
  if (action === 'lock') return lockClientWindow({preserveState:true})
  if (action === 'unlock' || action === 'wake') return unlockClientWindow()
  if (action === 'reboot' || action === 'shutdown') {
    if (process.platform !== 'win32') return false
    const interruptionReason = action === 'reboot' ? 'restart' : 'shutdown'
    // Persist the interruption before the Windows power command starts. This is
    // the last-resort checkpoint for Start-menu shutdowns, renderer crashes, or
    // a network loss that prevents the lifecycle HTTP request from completing.
    markSessionExit({reason:interruptionReason})
    mainWindow?.webContents.send('station:app-exit-requested',{reason:interruptionReason,powerCommand:true})
    try {
      const warningExpiresAt = parsedDeadline(descriptor.warningExpiresAt)
      if (warningExpiresAt !== null && Date.now() >= warningExpiresAt) throw remoteCommandExpiredError()
      const requestedWarningSeconds = Math.max(0, Number(descriptor.warningSeconds ?? 5) || 0)
      const remainingWarningMs = warningExpiresAt !== null
        ? Math.max(0, warningExpiresAt - Date.now())
        : requestedWarningSeconds * 1000
      const displayWarningSeconds = Math.max(0, Math.ceil(remainingWarningMs / 1000))
      mainWindow?.webContents.send('station:power-warning', { command:action, seconds:displayWarningSeconds })
      if (remainingWarningMs > 0) await new Promise((resolve) => setTimeout(resolve, remainingWarningMs))
      if (expiresAt !== null && Date.now() >= expiresAt) throw remoteCommandExpiredError()
      const args = action === 'reboot' ? ['/r', '/f', '/t', '0'] : ['/s', '/f', '/t', '0']
      const executed = await new Promise((resolve,reject) => {
        execFile('shutdown.exe', args, { windowsHide:true }, (error) => {
          if (error) { console.warn(`Remote ${action} failed:`, error.message); reject(error); return }
          resolve(true)
        })
      })
      mainWindow?.webContents.send('station:power-command-result',{command:action,status:'completed'})
      return executed
    } catch (error) {
      mainWindow?.webContents.send('station:power-command-result',{command:action,status:'failed',error:error?.message || 'Power command failed.'})
      throw error
    }
  }
  if (action === 'game_update') return false
  return false
}

async function executeEmergencyCommand(command) {
  if (String(command || '').toLowerCase() === 'quit') {
    markSessionExit({reason:'app_exit'})
    mainWindow?.webContents.send('station:app-exit-requested',{reason:'app_exit'})
    appIsQuitting = true
    setTimeout(()=>app.quit(),3000)
    return true
  }
  return executeRemoteCommand(command)
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1280,
    height:720,
    title:installedCafeName(),
    icon:path.join(__dirname,'app-icon.ico'),
    frame:false,
    kiosk:true,
    fullscreen:true,
    alwaysOnTop:true,
    skipTaskbar:true,
    autoHideMenuBar:true,
    closable:true,
    webPreferences:{
      preload:path.join(__dirname,'preload.cjs'),
      contextIsolation:true,
      nodeIntegration:false,
      sandbox:true,
    },
  })
  mainWindow.on('query-session-end', () => {
    markSessionExit({reason:'shutdown'})
    mainWindow?.webContents.send('station:app-exit-requested',{reason:'shutdown'})
  })
  mainWindow.on('session-end', () => { markSessionExit({reason:'shutdown'}) })

  mainWindow.webContents.on('before-input-event', (event,input) => {
    if (isActive()) return
    const key=String(input.key||'').toLowerCase()
    if (
      (input.alt && (key==='f4'||key==='tab')) ||
      (input.control && input.shift && key==='escape') ||
      input.meta ||
      key==='f11' ||
      (input.control && (key==='w'||key==='q'||key==='r'||key==='l')) ||
      (input.control && input.shift && (key==='i'||key==='j')) ||
      key==='f12'
    ) event.preventDefault()
  })

  mainWindow.webContents.on('context-menu', event => event.preventDefault())
  mainWindow.webContents.on('will-navigate', event => event.preventDefault())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action:'deny' }))

  mainWindow.on('close', event => {
    if (appIsQuitting) return
    event.preventDefault()
    if (isActive()) hideMiniDashboard()
    else if (isIdleDashboard()) applyIdleDashboardMode()
    else applyLockedWindowMode()
  })


  mainWindow.on('closed', () => { mainWindow=null })

  mainWindow.webContents.on('did-finish-load', () => {
    if (isLocked()) applyLockedWindowMode()
    else if (sessionStartTransitionPending) beginSessionStartTransition()
    else if (isIdleDashboard()) applyIdleDashboardMode()
    else applyActiveWindowMode({show:dashboardVisible})
    // The renderer just (re)mounted — replay the current remote-lock state
    // so a page reload while locked still shows the "session is locked"
    // overlay instead of silently losing it.
    if (remoteLockSnapshot) notifyStationLocked(true)
  })

  if (isDev) mainWindow.loadURL(DEV_URL)
  else mainWindow.loadFile(path.join(app.getAppPath(),'dist','index.html'))
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('Customer renderer failed to load:', code, description, url)
  })

  for (const [accelerator, command] of [['Alt+Shift+W','quit'], ['Alt+Shift+L','lock'], ['Alt+Shift+U','unlock']]) {
    try { globalShortcut.register(accelerator, () => mainWindow?.webContents.send('emergency:command', command)) } catch {}
  }
}

app.on('second-instance', () => {
  if (!hasSingleInstanceLock) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow()
    return
  }
  if (isActive()) showMiniDashboard()
  else if (isIdleDashboard()) applyIdleDashboardMode()
  else applyLockedWindowMode()
})

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return
  if (!isDev) app.setLoginItemSettings({openAtLogin:true,openAsHidden:false})
  app.setAppUserModelId('com.icafe.customer')
  session.defaultSession.setPermissionRequestHandler((_webContents,_permission,callback)=>callback(false))

  handleTrusted('client:unlock', () => applyAuthenticatedWindowMode())
  handleTrusted('client:show-idle-dashboard', () => showIdleDashboard())
  handleTrusted('client:unlock-only', () => { setWindowsKeyLocked(false); return true })
  handleTrusted('client:activate-session', (_event, data) => { markActiveSession(data || {}); return enterActiveState() })
  handleTrusted('client:begin-session-start', () => beginSessionStartTransition())
  handleTrusted('client:complete-session-start', () => completeSessionStartTransition())
  handleTrusted('client:cancel-session-start', () => showIdleDashboard())
  handleTrusted('client:hide-dashboard', () => hideMiniDashboard())
  handleTrusted('client:show-dashboard', () => showMiniDashboard())
  handleTrusted('client:update-widget', () => touchSessionLifecycle())
  handleTrusted('client:lock', () => lockClientWindow())
  handleTrusted('client:deactivate-session', () => lockClientWindow())
  ipcMain.on('client:get-session-lifecycle-marker', event => { if (!isTrustedRenderer(event)) { event.returnValue=null; return } event.returnValue=lifecycleMarkerForRenderer() })
  handleTrusted('client:mark-session-exit', (_event, data) => markSessionExit(data || {}))
  handleTrusted('client:clear-session-lifecycle-marker', () => clearSessionLifecycleMarker())
  handleTrusted('client:remote-command', (_event, command) => executeRemoteCommand(command))
  handleTrusted('client:shutdown', () => executeRemoteCommand('shutdown'))
  handleTrusted('client:restart', () => executeRemoteCommand('reboot'))
  handleTrusted('client:restart-app', () => {
    // Pairing changes the station identity used by every Cloud/Edge request. A
    // clean Electron relaunch reinitializes that identity atomically without
    // rebooting Windows or leaving an in-place renderer reload half-bootstrapped.
    appIsQuitting = true
    app.relaunch()
    app.quit()
    return true
  })
  handleTrusted('client:emergency-command', (_event, command) => executeEmergencyCommand(command))
  ipcMain.on('client:server-config:get', event => {
    if (!isTrustedRenderer(event)) { event.returnValue = null; return }
    event.returnValue = readServerConfig()
  })
  handleTrusted('client:server-config:set', async (_event, value) => {
    const saved = writeServerConfig(value)
    if (isLoopbackHost(saved.host) && Number(saved.port) === LOCAL_BACKEND_PORT) await ensureLocalBackend()
    return saved
  })
  handleTrusted('client:local-backend:ensure', () => ensureLocalBackend())
  handleTrusted('client:verify-setup-master-pin', (_event, value) => ({ verified:verifyStationSetupMasterPin(value) }))
  ipcMain.on('client:get-local-ipv4', event => {
    if (!isTrustedRenderer(event)) { event.returnValue=null; return }
    event.returnValue=getLocalIPv4()
  })
  ipcMain.on('client:get-station-credential', event => {
    if (!isTrustedRenderer(event)) { event.returnValue=''; return }
    event.returnValue=readStationCredential()
  })
  handleTrusted('client:set-station-credential', (_event, value) => writeStationCredential(String(value || '').slice(0, 4096)))
  ipcMain.on('client:get-cloud-station-credential', event => {
    if (!isTrustedRenderer(event)) { event.returnValue=''; return }
    event.returnValue=readCloudStationCredential()
  })
  ipcMain.on('client:get-installation-id', event => {
    if (!isTrustedRenderer(event)) { event.returnValue=''; return }
    event.returnValue=readInstallationId()
  })
  ipcMain.on('client:get-local-data-path', event => {
    if (!isTrustedRenderer(event)) { event.returnValue=''; return }
    event.returnValue=customerDataRoot
  })
  handleTrusted('client:set-cloud-station-credential', (_event, value) => writeCloudStationCredential(String(value || '').slice(0, 16384)))
  handleTrusted('client:clear-cloud-station-credential', () => writeCloudStationCredential(''))

  const startupServer = readServerConfig()
  if (isLoopbackHost(startupServer.host) && Number(startupServer.port) === LOCAL_BACKEND_PORT) {
    try { await ensureLocalBackend() }
    catch (error) { console.error('Unable to start Customer Station local backend:', error?.message || error) }
  }

  createTray()
  createWindow()
  windowState = WINDOW_STATES.LOCKED
  setWindowsKeyLocked(true)
  applyLockedWindowMode()

  app.on('activate', () => {
    if (!mainWindow) createWindow()
    if (isActive()) showMiniDashboard()
    else if (isIdleDashboard()) applyIdleDashboardMode()
    else applyLockedWindowMode()
  })
})

app.on('will-quit', () => {
  appIsQuitting=true
  stopLocalBackend()
  if (hookRestartTimer) clearTimeout(hookRestartTimer)
  stopFocusEnforcement()
  try {
    if (windowsKeyHook?.stdin && !windowsKeyHook.stdin.destroyed && !windowsKeyHook.stdin.writableEnded) windowsKeyHook.stdin.write('stop\n')
  } catch {}
  try { windowsKeyHook?.kill() } catch {}
  try { globalShortcut.unregisterAll() } catch {}
  try { tray?.destroy() } catch {}
})

app.on('window-all-closed', () => {})
