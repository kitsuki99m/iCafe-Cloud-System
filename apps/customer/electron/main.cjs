const { app, BrowserWindow, Menu, Tray, globalShortcut, ipcMain, nativeImage, session, safeStorage } = require('electron')
const { spawn, execFile, execFileSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const crypto = require('node:crypto')
const { Readable } = require('node:stream')
const { pipeline } = require('node:stream/promises')

const isDev = !app.isPackaged
const DEV_URL = process.env.AEZAKMI_CUSTOMER_DEV_URL || 'http://localhost:5173'
const CUSTOMER_LOCAL_DATA_DIR = '.aezakmi-customer'
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
  if (!isDev && isLoopbackHost(host)) {
    const error = new Error('Customer Station cannot use this PC as Café Edge. Enter the cashier/Admin PC LAN address instead.')
    error.code = 'LOCAL_CUSTOMER_EDGE_DISABLED'
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
  // A packaged Customer Station is not a Café Edge server. Without an
  // explicitly saved LAN server, local fallback is unavailable and the
  // renderer must keep its last-known cache rather than querying a fresh
  // per-PC database on 127.0.0.1.
  return {
    host: '',
    port: 3000,
    origin: null,
    apiBase: null,
    configured: false,
    source: 'not-configured',
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
function markActiveSession(data={}){const stamp=new Date().toISOString();return writeSessionLifecycleMarker({active:true,runtimeInstanceId:lifecycleRuntimeId,sessionId:data?.sessionId||data?.id||null,memberId:data?.memberId||null,role:data?.role||null,billing:data?.billing||null,startedAt:data?.startedAt||null,username:data?.username||null,balance:Number.isFinite(Number(data?.balance))?Number(data.balance):null,pcLabel:data?.pcLabel||null,remainingSeconds:Number.isFinite(Number(data?.remainingSeconds))?Math.max(0,Math.floor(Number(data.remainingSeconds))):null,markedAt:stamp,lastSeenAt:stamp,checkpointedAt:stamp,exitReason:null,exitRequestedAt:null})}
let lifecycleTouchAt=0
function touchSessionLifecycle(data={}){const nowMs=Date.now();if(nowMs-lifecycleTouchAt<3000)return true;const current=readSessionLifecycleMarker();if(!current?.active)return true;lifecycleTouchAt=nowMs;const next={...current,lastSeenAt:new Date(nowMs).toISOString(),checkpointedAt:new Date(nowMs).toISOString()};if(data?.username!=null)next.username=String(data.username);if(data?.pcLabel!=null)next.pcLabel=String(data.pcLabel);if(Number.isFinite(Number(data?.balance)))next.balance=Number(data.balance);if(Number.isFinite(Number(data?.remainingSeconds)))next.remainingSeconds=Math.max(0,Math.floor(Number(data.remainingSeconds)));writeSessionLifecycleMarker(next);return true}
function markSessionExit(data={}){const current=readSessionLifecycleMarker()||{};const existingAt=current.exitRequestedAt||null;return writeSessionLifecycleMarker({...current,active:true,runtimeInstanceId:current.runtimeInstanceId||lifecycleRuntimeId,exitReason:String(data?.reason||current.exitReason||'station_exit'),exitRequestedAt:existingAt||String(data?.interruptedAt||new Date().toISOString())})}
function clearSessionLifecycleMarker(){try{fs.unlinkSync(sessionLifecyclePath())}catch{}void tryInstallPendingUpdate();return true}

const updateRuntime={status:'managed',currentVersion:app.getVersion(),availableVersion:null,downloadedVersion:null,progress:null,lastCheckedAt:null,error:null,installerPath:null,releaseNotes:null,installWhenIdle:false,managedByAdmin:true}
let updateInstallTimer=null
let updateDownloadPromise=null
let activeUpdateController=null
function updateConfigPath(){return path.join(app.getPath('userData'),'update-config.json')}
function updateDeploymentPath(){return path.join(app.getPath('userData'),'update-deployment.json')}
function readUpdateConfig(){
  let saved={}
  try{saved=JSON.parse(fs.readFileSync(updateConfigPath(),'utf8'))||{}}catch{}
  const manifestUrl=String(process.env.AEZAKMI_CUSTOMER_UPDATE_MANIFEST_URL||saved.manifestUrl||saved.url||'').trim()
  const allowInsecure=String(process.env.AEZAKMI_ALLOW_INSECURE_UPDATE_URL??saved.allowInsecure??'false').toLowerCase()==='true'
  return{manifestUrl,allowInsecure}
}
function readUpdateDeployment(){try{const value=JSON.parse(fs.readFileSync(updateDeploymentPath(),'utf8'));return value&&typeof value==='object'?value:{}}catch{return{}}}
function writeUpdateDeployment(value={}){const file=updateDeploymentPath();const temp=`${file}.tmp`;try{fs.writeFileSync(temp,JSON.stringify(value,null,2),{encoding:'utf8',mode:0o600});fs.renameSync(temp,file)}catch{}return value}
function clearUpdateDeployment(){try{fs.rmSync(updateDeploymentPath(),{force:true})}catch{}}
function publicUpdateInfo(){return{status:updateRuntime.status,currentVersion:updateRuntime.currentVersion,availableVersion:updateRuntime.availableVersion,downloadedVersion:updateRuntime.downloadedVersion,progress:updateRuntime.progress,lastCheckedAt:updateRuntime.lastCheckedAt,error:updateRuntime.error,releaseNotes:updateRuntime.releaseNotes,installWhenIdle:Boolean(updateRuntime.installWhenIdle),managedByAdmin:true}}
function sendUpdateState(){try{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('customer:update-state',publicUpdateInfo())}catch{}}
function setUpdateState(patch){Object.assign(updateRuntime,patch);sendUpdateState();return publicUpdateInfo()}
function parseVersion(value){const text=String(value||'0.0.0').trim().replace(/^v/i,'').split('+')[0],parts=text.split('-',2),core=parts[0].split('.').map(part=>Number.parseInt(part,10)||0),pre=parts.length>1?parts[1].split('.'):[];return{core:[core[0]||0,core[1]||0,core[2]||0],pre}}
function compareVersions(a,b){const av=parseVersion(a),bv=parseVersion(b);for(let i=0;i<3;i++){if(av.core[i]!==bv.core[i])return av.core[i]>bv.core[i]?1:-1}if(!av.pre.length&&!bv.pre.length)return 0;if(!av.pre.length)return 1;if(!bv.pre.length)return-1;for(let i=0;i<Math.max(av.pre.length,bv.pre.length);i++){const x=av.pre[i],y=bv.pre[i];if(x==null)return-1;if(y==null)return 1;if(x===y)continue;const xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);if(xn&&yn)return Number(x)>Number(y)?1:-1;if(xn!==yn)return xn?-1:1;return x>y?1:-1}return 0}
function updateUrlAllowed(raw,allowInsecure=false){try{const parsed=new URL(raw);if(parsed.protocol==='https:')return true;if(allowInsecure&&parsed.protocol==='http:')return true;return false}catch{return false}}
function safeUpdateFileName(value){const base=path.basename(String(value||''));if(!base||base!==String(value||'')||!base.toLowerCase().endsWith('.exe'))throw new Error('Update manifest contains an invalid installer file name.');return base}
async function sha256File(file){return await new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256'),stream=fs.createReadStream(file);stream.on('data',chunk=>hash.update(chunk));stream.on('error',reject);stream.on('end',()=>resolve(hash.digest('hex')))})}
function stationHasProtectedSession(){
  if(windowState===WINDOW_STATES.ACTIVE||sessionStartTransitionPending||remoteLockSnapshot?.windowState===WINDOW_STATES.ACTIVE)return true
  const marker=readSessionLifecycleMarker()
  return Boolean(marker?.active)
}
function updateInstallSafe(){return process.platform==='win32'&&windowState===WINDOW_STATES.LOCKED&&!stationHasProtectedSession()&&!appIsQuitting}
function resolveUpdateSource(explicitUrl='',explicitAllowInsecure=null){
  const config=readUpdateConfig(),manifestUrl=String(explicitUrl||config.manifestUrl||'').trim()
  const allowInsecure=explicitAllowInsecure==null?config.allowInsecure:Boolean(explicitAllowInsecure)
  if(!manifestUrl)throw Object.assign(new Error('Admin did not provide a Customer update source.'),{code:'UPDATE_SOURCE_MISSING'})
  if(!updateUrlAllowed(manifestUrl,allowInsecure))throw Object.assign(new Error('Customer update manifest must use HTTPS unless Admin explicitly selected a trusted LAN source.'),{code:'UPDATE_URL_INSECURE'})
  return{manifestUrl,allowInsecure}
}
async function downloadCustomerUpdate(manifest,manifestUrl,{allowInsecure=false}={}){
  if(updateDownloadPromise)return updateDownloadPromise
  updateDownloadPromise=(async()=>{
    const file=safeUpdateFileName(manifest.file),targetDir=path.join(app.getPath('userData'),'updates',String(manifest.version)),target=path.join(targetDir,file),partial=`${target}.part`
    fs.mkdirSync(targetDir,{recursive:true})
    setUpdateState({status:'downloading',progress:0,error:null,availableVersion:String(manifest.version)})
    const source=new URL(file,manifestUrl).toString()
    if(!updateUrlAllowed(source,allowInsecure))throw Object.assign(new Error('Update installer URL must use HTTPS unless Admin selected a trusted LAN source.'),{code:'UPDATE_URL_INSECURE'})
    const controller=new AbortController();activeUpdateController=controller
    const timeout=setTimeout(()=>controller.abort('timeout'),5*60_000)
    try{
      const response=await fetch(source,{cache:'no-store',signal:controller.signal})
      if(!response.ok||!response.body)throw new Error(`Update download failed (${response.status}).`)
      const total=Number(response.headers.get('content-length')||manifest.size||0)
      let received=0,lastEmit=0
      const sourceStream=Readable.fromWeb(response.body)
      sourceStream.on('data',chunk=>{received+=chunk.length;const now=Date.now();if(now-lastEmit>400){lastEmit=now;setUpdateState({progress:total>0?Math.min(100,Math.round(received/total*100)):null})}})
      await pipeline(sourceStream,fs.createWriteStream(partial,{flags:'w'}))
    }finally{clearTimeout(timeout);if(activeUpdateController===controller)activeUpdateController=null}
    const expected=String(manifest.sha256||'').trim().toLowerCase()
    if(!/^[a-f0-9]{64}$/.test(expected))throw new Error('Update manifest is missing a valid SHA-256 checksum.')
    const actual=String(await sha256File(partial)).toLowerCase()
    if(actual!==expected){try{fs.rmSync(partial,{force:true})}catch{};throw Object.assign(new Error('Update checksum verification failed.'),{code:'UPDATE_CHECKSUM_FAILED'})}
    try{fs.rmSync(target,{force:true})}catch{}
    fs.renameSync(partial,target)
    setUpdateState({status:updateRuntime.installWhenIdle&&!updateInstallSafe()?'waiting_idle':'ready',downloadedVersion:String(manifest.version),installerPath:target,progress:100,error:null})
    return true
  })().catch(error=>{
    const cancelled=error?.name==='AbortError'||String(error?.message||'').toLowerCase().includes('abort')
    setUpdateState({status:cancelled?'cancelled':'error',error:cancelled?'Update download cancelled by Admin.':(error?.message||String(error)),progress:null})
    return false
  }).finally(()=>{updateDownloadPromise=null})
  return updateDownloadPromise
}
async function checkCustomerUpdate({manifestUrl='',allowInsecure=null,download=false,targetVersion=''}={}){
  if(isDev)return setUpdateState({status:'development',lastCheckedAt:new Date().toISOString(),error:null})
  if(updateRuntime.status==='installing')return publicUpdateInfo()
  const source=resolveUpdateSource(manifestUrl,allowInsecure)
  setUpdateState({status:'checking',error:null})
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000)
  try{
    const response=await fetch(source.manifestUrl,{cache:'no-store',headers:{'Accept':'application/json'},signal:controller.signal})
    if(!response.ok)throw new Error(`Update manifest request failed (${response.status}).`)
    const manifest=await response.json()
    const version=String(manifest?.version||'').trim()
    if(!version)throw new Error('Update manifest does not contain a version.')
    if(targetVersion&&String(targetVersion)!==version)throw Object.assign(new Error(`Admin requested ${targetVersion}, but this release feed currently provides ${version}.`),{code:'UPDATE_VERSION_MISMATCH'})
    const lastCheckedAt=new Date().toISOString()
    if(compareVersions(version,app.getVersion())<=0){clearUpdateDeployment();return setUpdateState({status:'current',availableVersion:null,downloadedVersion:null,installerPath:null,releaseNotes:null,lastCheckedAt,error:null,progress:null,installWhenIdle:false})}
    setUpdateState({status:'available',availableVersion:version,releaseNotes:String(manifest?.releaseNotes||''),lastCheckedAt,error:null})
    if(download)await downloadCustomerUpdate(manifest,source.manifestUrl,{allowInsecure:source.allowInsecure})
    return publicUpdateInfo()
  }catch(error){return setUpdateState({status:'error',lastCheckedAt:new Date().toISOString(),error:error?.name==='AbortError'?'Update check timed out.':(error?.message||String(error))})}
  finally{clearTimeout(timeout)}
}
function launchPendingInstaller(){
  if(!updateRuntime.installerPath||!fs.existsSync(updateRuntime.installerPath)||!updateInstallSafe())return false
  const installer=updateRuntime.installerPath,installDir=customerInstallRoot(),currentExe=process.execPath
  const ps=(value)=>`'${String(value).replace(/'/g,"''")}'`
  const script=`Wait-Process -Id ${process.pid} -ErrorAction SilentlyContinue; $p=Start-Process -FilePath ${ps(installer)} -ArgumentList @('/S',${ps(`/D=${installDir}`)}) -Wait -PassThru; if ($p.ExitCode -eq 0 -and (Test-Path ${ps(currentExe)})) { Start-Process -FilePath ${ps(currentExe)} }`
  try{
    const child=spawn('powershell.exe',['-NoProfile','-NonInteractive','-WindowStyle','Hidden','-ExecutionPolicy','Bypass','-Command',script],{detached:true,stdio:'ignore',windowsHide:true})
    child.unref();clearUpdateDeployment();appIsQuitting=true;setTimeout(()=>app.quit(),400);return true
  }catch(error){setUpdateState({status:'error',error:`Unable to launch updater: ${error?.message||error}`});return false}
}
async function tryInstallPendingUpdate(){
  if(!updateRuntime.installWhenIdle||!['ready','waiting_idle'].includes(updateRuntime.status)||!updateRuntime.installerPath||!fs.existsSync(updateRuntime.installerPath))return false
  if(!updateInstallSafe()){if(updateRuntime.status!=='waiting_idle')setUpdateState({status:'waiting_idle'});return false}
  setUpdateState({status:'installing',error:null})
  // Give the renderer enough time to acknowledge the Admin command before the
  // Electron process exits and NSIS replaces the application files.
  setTimeout(()=>{if(!launchPendingInstaller())setUpdateState({status:'error',error:updateRuntime.error||'Unable to start Customer update installer.'})},1800)
  return true
}
async function handleAdminUpdateCommand(input={}){
  const action=String(input.action||input.command||'').toLowerCase()
  const manifestUrl=String(input.manifestUrl||input.manifest_url||'').trim()
  const allowInsecure=input.allowInsecure??input.allow_insecure??null
  const targetVersion=String(input.targetVersion||input.version||'').trim()
  if(action==='customer_update_cancel'){
    try{activeUpdateController?.abort()}catch{}
    updateRuntime.installWhenIdle=false;clearUpdateDeployment()
    return setUpdateState({status:updateRuntime.downloadedVersion?'ready':'managed',error:null,installWhenIdle:false})
  }
  if(action==='customer_update_check')return checkCustomerUpdate({manifestUrl,allowInsecure,targetVersion})
  if(action==='customer_update_download')return checkCustomerUpdate({manifestUrl,allowInsecure,download:true,targetVersion})
  if(action==='customer_update_install_when_idle'||action==='customer_update_install_now'){
    updateRuntime.installWhenIdle=true
    writeUpdateDeployment({installWhenIdle:true,manifestUrl,targetVersion,allowInsecure:Boolean(allowInsecure),requestedAt:new Date().toISOString()})
    if(!updateRuntime.downloadedVersion||!updateRuntime.installerPath||!fs.existsSync(updateRuntime.installerPath)||(targetVersion&&String(updateRuntime.downloadedVersion)!==targetVersion)){
      await checkCustomerUpdate({manifestUrl,allowInsecure,download:true,targetVersion})
    }
    if(updateRuntime.status==='current'){updateRuntime.installWhenIdle=false;clearUpdateDeployment();return publicUpdateInfo()}
    if(!updateRuntime.downloadedVersion||!updateRuntime.installerPath||!fs.existsSync(updateRuntime.installerPath))return publicUpdateInfo()
    if(action==='customer_update_install_now'&&!updateInstallSafe()){
      updateRuntime.installWhenIdle=false;clearUpdateDeployment()
      throw Object.assign(new Error('Install Now is blocked while a member/guest session or protected station state is active. Use Install When Idle instead.'),{code:'UPDATE_NOT_SAFE'})
    }
    setUpdateState({status:updateInstallSafe()?'ready':'waiting_idle',installWhenIdle:true,error:null})
    void tryInstallPendingUpdate()
    return publicUpdateInfo()
  }
  throw Object.assign(new Error('Unsupported Customer update command.'),{code:'INVALID_UPDATE_COMMAND'})
}
function startCustomerUpdater(){
  if(isDev){setUpdateState({status:'development'});return}
  setUpdateState({status:'managed',managedByAdmin:true,error:null})
  updateInstallTimer=setInterval(()=>void tryInstallPendingUpdate(),3000)
  const pending=readUpdateDeployment()
  if(pending?.installWhenIdle){setTimeout(()=>void handleAdminUpdateCommand({action:'customer_update_install_when_idle',manifestUrl:pending.manifestUrl,targetVersion:pending.targetVersion,allowInsecure:pending.allowInsecure}).catch(error=>setUpdateState({status:'error',error:error?.message||String(error)})),6000)}
}

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
  if (action.startsWith('customer_update_')) return handleAdminUpdateCommand({ action, ...(descriptor.payload && typeof descriptor.payload === 'object' ? descriptor.payload : {}) })
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
  handleTrusted('client:update-widget', (_event, data) => touchSessionLifecycle(data || {}))
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
  handleTrusted('client:server-config:set', async (_event, value) => writeServerConfig(value))
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
  ipcMain.on('client:get-software-info', event => {
    if (!isTrustedRenderer(event)) { event.returnValue=null; return }
    event.returnValue=publicUpdateInfo()
  })
  handleTrusted('client:check-update', () => checkCustomerUpdate({manual:true}))
  handleTrusted('client:set-cloud-station-credential', (_event, value) => writeCloudStationCredential(String(value || '').slice(0, 16384)))
  handleTrusted('client:clear-cloud-station-credential', () => writeCloudStationCredential(''))

  createTray()
  createWindow()
  startCustomerUpdater()
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
  if (hookRestartTimer) clearTimeout(hookRestartTimer)
  if (updateInstallTimer) clearInterval(updateInstallTimer)
  stopFocusEnforcement()
  try {
    if (windowsKeyHook?.stdin && !windowsKeyHook.stdin.destroyed && !windowsKeyHook.stdin.writableEnded) windowsKeyHook.stdin.write('stop\n')
  } catch {}
  try { windowsKeyHook?.kill() } catch {}
  try { globalShortcut.unregisterAll() } catch {}
  try { tray?.destroy() } catch {}
})

app.on('window-all-closed', () => {})
