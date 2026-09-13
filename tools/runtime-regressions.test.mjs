import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))

test('Electron file renderers use HashRouter rather than BrowserRouter', () => {
  for (const app of ['admin', 'customer']) {
    const source = read(`apps/${app}/src/main.jsx`)
    assert.match(source, /import \{ HashRouter \} from ['"]react-router-dom['"]/)
    assert.match(source, /<HashRouter>/)
    assert.doesNotMatch(source, /BrowserRouter/)
  }
})

test('both Electron apps are single-instance and restore the existing window on second launch', () => {
  for (const app of ['admin', 'customer']) {
    const source = read(`apps/${app}/electron/main.cjs`)
    assert.match(source, /requestSingleInstanceLock\(\)/)
    assert.match(source, /app\.on\(['"]second-instance['"]/)
  }
})

test('customer IPC handlers reject senders other than the customer renderer', () => {
  const source = read('apps/customer/electron/main.cjs')
  assert.match(source, /function isTrustedRenderer\(event\)/)
  assert.match(source, /function handleTrusted\(channel, handler\)/)
  assert.doesNotMatch(source, /ipcMain\.handle\(['"]client:/)
  assert.match(source, /handleTrusted\(['"]client:remote-command['"]/)
  assert.match(source, /event\.sender === mainWindow\?\.webContents/)
})

test('admin IPC handlers use the same trusted-renderer boundary', () => {
  const source = read('apps/admin/electron/main.cjs')
  assert.match(source, /function isTrustedRenderer\(event\)/)
  assert.match(source, /event\.sender === adminWindow\?\.webContents/)
})

test('dynamic installer builder builds fresh renderer output through the npm CLI without spawning Windows cmd shims directly', () => {
  const source = read('scripts/build-installer.mjs')
  assert.match(source, /repoRoot/)
  assert.match(source, /process\.env\.npm_execpath/)
  assert.match(source, /process\.execPath/)
  assert.match(source, /['"]run['"],\s*['"]build['"]/)
  assert.match(source, /['"]exec['"],\s*['"]--yes=false['"]/ )
  assert.match(source, /electron-builder/)
  assert.doesNotMatch(source, /spawnSync\([^\n]*npm\.cmd/)
  assert.match(source, /packageJson\.build\?\.productName/)
  assert.doesNotMatch(source, /requestedName \|\| ['"]iCafe Management System['"]/)
})

test('installer scripts do not hard-code executable startup registry entries', () => {
  for (const app of ['admin', 'customer']) {
    const source = read(`apps/${app}/installer.nsh`)
    assert.doesNotMatch(source, /CurrentVersion\\Run/)
  }
})

test('generated electron-builder configs and machine-specific local env files are not source artifacts', () => {
  for (const app of ['admin', 'customer']) {
    assert.equal(exists(`apps/${app}/.electron-builder.generated.json`), false)
    assert.equal(exists(`apps/${app}/.env.local`), false)
  }
})

test('customer production builds use runtime server configuration instead of requiring a build-time backend URL', () => {
  const vite = read('apps/customer/vite.config.js')
  const config = read('apps/customer/src/lib/serverConfig.js')
  assert.doesNotMatch(vite, /loadEnv|command === ['"]build['"]|production build requires VITE_API_BASE_URL/i)
  assert.match(config, /getRuntimeServerConfig/)
  assert.match(config, /CAFE_EDGE_NOT_CONFIGURED/)
})

test('Electron AppUserModelId matches each package appId', () => {
  const adminPackage = JSON.parse(read('apps/admin/package.json'))
  const customerPackage = JSON.parse(read('apps/customer/package.json'))
  assert.match(read('apps/admin/electron/main.cjs'), new RegExp(adminPackage.build.appId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  assert.match(read('apps/customer/electron/main.cjs'), new RegExp(customerPackage.build.appId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('Vite keeps renderer asset URLs relative for Electron loadFile', () => {
  for (const app of ['admin', 'customer']) {
    assert.match(read(`apps/${app}/vite.config.js`), /base:\s*['"]\.\/['"]/)
  }
})

test('HashRouter migration leaves no raw hash-anchor navigation in routed admin content', () => {
  const settings = read('apps/admin/src/pages/SettingsPage.jsx')
  assert.doesNotMatch(settings, /href=\{?`?#\$?\{?settings-/)
  assert.match(settings, /scrollIntoView/)
})

test('packaged customer launches the Windows key hook from extraResources rather than app.asar', () => {
  const source = read('apps/customer/electron/main.cjs')
  assert.match(source, /process\.resourcesPath[\s\S]{0,120}windows-key-hook\.ps1/)
  assert.match(source, /isDev[\s\S]{0,160}__dirname[\s\S]{0,160}process\.resourcesPath/)
})

test('admin tray uses one attached context menu instead of manually popping a second copy', () => {
  const source = read('apps/admin/electron/main.cjs')
  assert.match(source, /tray\.setContextMenu\(menu\)/)
  assert.doesNotMatch(source, /tray\.popUpContextMenu\(/)
})

test('dynamic desktop installers rebuild native backend modules and always restore them after packaging', () => {
  const source = read('scripts/build-installer.mjs')
  assert.match(source, /process\.platform === ['"]win32['"][\s\S]*rebuild:backend/)
  assert.match(source, /finally[\s\S]*restore:backend/)
  assert.doesNotMatch(source, /process\.exit\(/)
})

test('Electron renderers run sandboxed and preload scripts do not require unrestricted Node os access', () => {
  for (const app of ['admin', 'customer']) {
    const main = read(`apps/${app}/electron/main.cjs`)
    const preload = read(`apps/${app}/electron/preload.cjs`)
    assert.match(main, /sandbox:\s*true/)
    assert.doesNotMatch(preload, /require\(['"]node:os['"]\)|require\(['"]os['"]\)/)
  }
})

test('customer local IP detection is delegated to trusted main-process IPC without a global prefix channel', () => {
  const main = read('apps/customer/electron/main.cjs')
  const preload = read('apps/customer/electron/preload.cjs')
  assert.match(main, /require\(['"]node:os['"]\)/)
  assert.match(main, /client:get-local-ipv4/)
  assert.doesNotMatch(main, /client:set-ip-prefix|runtimeIpPrefix|AEZAKMI_IP_PREFIX/)
  assert.match(preload, /sendSync\(['"]client:get-local-ipv4['"]\)/)
  assert.doesNotMatch(preload, /client:set-ip-prefix|setIpPrefix/)
})

test('admin blocks top-level renderer navigation outside the loaded SPA', () => {
  const main = read('apps/admin/electron/main.cjs')
  assert.match(main, /webContents\.on\(["']will-navigate["'][\s\S]*?preventDefault\(\)/)
})

test('Windows packages use a dedicated ICO application icon instead of an SVG build icon', () => {
  for (const appName of ['admin', 'customer']) {
    const pkg = JSON.parse(read(`apps/${appName}/package.json`))
    assert.match(String(pkg.build?.win?.icon || pkg.build?.icon || ''), /\.ico$/i)
    assert.equal(exists(`apps/${appName}/electron/app-icon.ico`), true)
  }
})

test('bundled admin backend has one authoritative DATABASE_PATH environment assignment', () => {
  const main = read('apps/admin/electron/main.cjs')
  assert.equal((main.match(/DATABASE_PATH\s*:/g) || []).length, 1)
})

test('customer auth refresh cannot bypass an active remote station lock', () => {
  const main = read('apps/customer/electron/main.cjs')
  const body = main.match(/function applyAuthenticatedWindowMode\(\) \{([\s\S]*?)\n\}/)?.[1] || ''
  assert.match(body, /remoteLockSnapshot/)
  assert.match(body, /applyLockedWindowMode\(\)/)
})

test('customer tray tooltip uses installed cafe branding', () => {
  const main = read('apps/customer/electron/main.cjs')
  assert.match(main, /tray\.setToolTip\(installedCafeName\(\)\s*\+\s*['"] — Customer Station['"]\)/)
})

test('per-app Windows packaging scripts delegate to the guarded shared installer builder', () => {
  const admin = JSON.parse(read('apps/admin/package.json'))
  const customer = JSON.parse(read('apps/customer/package.json'))
  assert.equal(admin.scripts['dist:win'], 'node ../../scripts/build-installer.mjs admin')
  assert.equal(customer.scripts['dist:win'], 'node ../../scripts/build-installer.mjs customer')
})

test('shared installer builder stops running Electron instances and clears prior installer output before packaging', () => {
  const source = read('scripts/build-installer.mjs')
  assert.match(source, /kill:electron/)
  assert.match(source, /kill:admin/)
  assert.match(source, /kill:customer/)
  assert.match(source, /fs\.rmSync\([^\n]*installer/)
})
