import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const read=(file)=>readFileSync(resolve(process.cwd(),file),'utf8')

test('Customer Electron no longer continuously steals Windows focus',()=>{
  const main=read('apps/customer/electron/main.cjs')
  assert.doesNotMatch(main,/enforceCustomerWindowFocus/)
  assert.doesNotMatch(main,/focusEnforcementTimer/)
  assert.doesNotMatch(main,/\bstopFocusEnforcement\s*\(/)
  assert.doesNotMatch(main,/mainWindow\.moveTop\(\)/)
  assert.doesNotMatch(main,/mainWindow\.on\('blur'[\s\S]*mainWindow\.focus\(\)/)
  // Kiosk/login protection remains mode-based rather than a 500 ms focus loop.
  assert.match(main,/function applyLockedWindowMode\(\)[\s\S]*setKiosk\(true\)[\s\S]*setAlwaysOnTop\(true, 'screen-saver'\)/)
  // Active expanded dashboard uses fullscreen kiosk; compact timer drops to the desktop layer.
  assert.match(main,/function applyCompactSessionMode\(\)[\s\S]*setAlwaysOnTop\(false\)/)
})

test('Customer Station shows on taskbar when a game is launched, hides on logout',()=>{
  const main=read('apps/customer/electron/main.cjs')
  // gameIsLaunched state variable exists and is initialized to false.
  assert.match(main,/let gameIsLaunched = false/)
  // onLaunched sets gameIsLaunched=true and shows on taskbar.
  assert.match(main,/gameIsLaunched = true[\s\S]*setSkipTaskbar\(false\)/)
  // Compact mode uses gameIsLaunched to conditionally skip taskbar.
  assert.match(main,/function applyCompactSessionMode[\s\S]*setSkipTaskbar\(!\(gameIsLaunched/)
  // Logout/lock/idle resets gameIsLaunched and hides from taskbar.
  assert.match(main,/function showLoginKiosk[\s\S]*gameIsLaunched = false/)
  assert.match(main,/function applyLockedWindowMode[\s\S]*gameIsLaunched = false/)
  assert.match(main,/function applyIdleDashboardMode[\s\S]*gameIsLaunched = false/)
})

test('successful Cloud pairing requires a clean Customer Station relaunch instead of hot reload',()=>{
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const pairing=read('apps/customer/src/components/auth/StationCloudPairing.jsx')
  const preload=read('apps/customer/electron/preload.cjs')
  const main=read('apps/customer/electron/main.cjs')
  assert.match(auth,/stationRestartRequired/)
  assert.doesNotMatch(auth,/window\.location\.reload\(\)/)
  assert.match(pairing,/title="Restart Customer Station"/)
  assert.match(pairing,/restartCustomerStation/)
  assert.match(pairing,/Only Customer Station restarts; Windows stays running/)
  assert.match(preload,/restartCustomerStation:\(\) => ipcRenderer\.invoke\('client:restart-app'\)/)
  assert.match(main,/client:restart-app/)
  assert.match(main,/app\.relaunch\(\)/)
})


test('Customer Station pairing uses a compact login-style centered container',()=>{
  const pairing=read('apps/customer/src/components/auth/StationCloudPairing.jsx')
  const css=read('apps/customer/src/index.css')
  assert.match(pairing,/className="customer-pairing-shell"/)
  assert.match(pairing,/className="customer-pairing-container"/)
  assert.match(css,/\.customer-pairing-container[\s\S]*width: min\(100%, 960px\)[\s\S]*height: min\(640px, calc\(100vh - 32px\)\)/)
  assert.doesNotMatch(pairing,/min-h-\[calc\(100vh-3rem\)\]/)
})
