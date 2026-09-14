import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('terminal Guest close is a login-kiosk transition, not a reversible station lock',()=>{
  const main=read('apps/customer/electron/main.cjs')
  const preload=read('apps/customer/electron/preload.cjs')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  assert.match(main,/function showLoginKiosk\(\)/)
  assert.match(main,/notifyStationLocked\(false\)/)
  assert.match(main,/if \(!preserveState\) return showLoginKiosk\(\)/)
  assert.match(main,/client:show-login-kiosk/)
  assert.match(preload,/showLoginKiosk:\(\) => ipcRenderer\.invoke\('client:show-login-kiosk'\)/)
  assert.match(customer,/window\.aezakmiClient\?\.showLoginKiosk/)
  assert.match(customer,/aezakmi:admin-session-logout/)
  assert.match(customer,/forcedLogout:true/)
  assert.match(auth,/showLoginKiosk \|\| window\.aezakmiClient\?\.lockClient/)
})

test('Pause & Save and Forfeit preserve close identity through terminal commit',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(admin,/guestSession/)
  assert.match(admin,/memberId:result\?\.memberId \?\? prepared\.memberId \?\? null/)
  assert.match(customer,/sessionId:payload\?\.payload\?\.sessionId \|\| null/)
  assert.match(customer,/disposition/)
  assert.match(customer,/aezakmi:admin-session-logout/)
})

test('member idle transition also dismisses the temporary prepared-close overlay',()=>{
  const main=read('apps/customer/electron/main.cjs')
  const start=main.indexOf('function showIdleDashboard()')
  const end=main.indexOf('function applyAuthenticatedWindowMode()',start)
  const block=main.slice(start,end)
  assert.match(block,/const hadRemoteLock = Boolean\(remoteLockSnapshot\)/)
  assert.match(block,/if \(hadRemoteLock\) notifyStationLocked\(false\)/)
})

test('legacy force-focus cleanup names are harmless compatibility guards only',()=>{
  const main=read('apps/customer/electron/main.cjs')
  assert.match(main,/const stopFocusEnforcement = \(\) => true/)
  assert.match(main,/const stopForceFocusEnforcement = stopFocusEnforcement/)
  assert.match(main,/const stopForcedFocusEnforcement = stopFocusEnforcement/)
  const willQuit=main.slice(main.indexOf("app.on('will-quit'"))
  assert.doesNotMatch(willQuit,/stop(?:Force|Forced)?FocusEnforcement\s*\(/)
})
