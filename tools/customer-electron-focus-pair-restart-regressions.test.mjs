import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const read=(file)=>readFileSync(resolve(process.cwd(),file),'utf8')

test('Customer Electron no longer continuously steals Windows focus',()=>{
  const main=read('apps/customer/electron/main.cjs')
  assert.doesNotMatch(main,/enforceCustomerWindowFocus/)
  assert.doesNotMatch(main,/focusEnforcementTimer/)
  assert.doesNotMatch(main,/mainWindow\.moveTop\(\)/)
  assert.doesNotMatch(main,/mainWindow\.on\('blur'[\s\S]*mainWindow\.focus\(\)/)
  // Kiosk/login protection remains mode-based rather than a 500 ms focus loop.
  assert.match(main,/function applyLockedWindowMode\(\)[\s\S]*setKiosk\(true\)[\s\S]*setAlwaysOnTop\(true, 'screen-saver'\)/)
  assert.match(main,/function applyActiveWindowMode[\s\S]*setAlwaysOnTop\(false\)/)
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
  assert.match(pairing,/Windows and the PC itself will not reboot/)
  assert.match(preload,/restartCustomerStation:\(\) => ipcRenderer\.invoke\('client:restart-app'\)/)
  assert.match(main,/client:restart-app/)
  assert.match(main,/app\.relaunch\(\)/)
})
