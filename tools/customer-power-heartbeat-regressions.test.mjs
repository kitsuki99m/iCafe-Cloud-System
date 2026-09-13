import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
const root=process.cwd()
const read=(file)=>readFileSync(resolve(root,file),'utf8')

test('Customer idle shutdown notices stay bottom-left and clear of the power controls',()=>{
  const login=read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  const session=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(login,/fixed bottom-4 left-4 z-\[600\]/)
  assert.match(session,/fixed bottom-4 left-4 z-\[600\]/)
  assert.doesNotMatch(login,/fixed bottom-4 right-4 z-\[600\]/)
  assert.doesNotMatch(session,/fixed bottom-4 right-4 z-\[600\]/)
})

test('Electron power commands persist the interruption marker before the Windows shutdown command',()=>{
  const main=read('apps/customer/electron/main.cjs')
  const start=main.indexOf("if (action === 'reboot' || action === 'shutdown')")
  const marker=main.indexOf('markSessionExit({reason:interruptionReason})',start)
  const notify=main.indexOf("station:app-exit-requested",marker)
  const execute=main.indexOf("execFile('shutdown.exe'",notify)
  assert.ok(start>=0&&marker>start&&notify>marker&&execute>notify)
})

test('Sustained Customer realtime loss uses the same three-second offline boundary and clears signed-in UI',()=>{
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  assert.match(data,/const onSocketDisconnect = \(socketReason\)/)
  assert.match(data,/releaseStationLifecycle\('station_disconnect',\{allowDeferred:true\}\)/)
  assert.match(data,/aezakmi:station-session-interruption/)
  assert.match(data,/\},3000\)/)
  assert.match(data,/target\.on\('disconnect', onSocketDisconnect\)/)
  assert.match(auth,/aezakmi:station-session-interruption/)
  assert.match(auth,/onStationSessionInterruption[\s\S]*lock\(\)/)
})

test('Customer restart and shutdown save concurrently during the Electron warning instead of waiting to begin power handling',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  const start=page.indexOf('const logoutPromise = logout({ reason:command, allowDeferred:true })')
  const restart=page.indexOf('await window.aezakmiClient?.restartClient?.()',start)
  const shutdown=page.indexOf('await window.aezakmiClient?.shutdownClient?.()',start)
  const wait=page.indexOf('await logoutPromise',start)
  assert.ok(start>=0&&restart>start&&shutdown>start&&wait>shutdown)
})
