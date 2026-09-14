import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('Admin Forfeit prepares both guest and member logout before authoritative close',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(admin,/async function prepareSessionClose\(pc, disposition\)/)
  assert.match(admin,/command:'game_update'/)
  assert.match(admin,/if \(disposition === 'forfeit'\) prepared=await prepareSessionClose\(pc, disposition\)/)
  assert.match(admin,/else if \(!guestSession && disposition === 'save'\) prepared=await prepareSessionClose\(pc, disposition\)/)
  assert.match(admin,/if \(!guestSession\) prepared=await prepareSessionClose\(pc, 'refund'\)/)
  assert.doesNotMatch(admin,/prepareGuestSessionClose/)
})

test('forfeit close fence forces logout before ACK and does not checkpoint remaining time',()=>{
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(auth,/ADMIN_SESSION_CLOSE_PENDING/)
  assert.match(auth,/aezakmi:admin-forfeit-logout/)
  const closeStart=customer.indexOf('if (sessionClose)')
  const forfeitStart=customer.indexOf("if (disposition === 'forfeit')",closeStart)
  const saveStart=customer.indexOf('// Save/refund protection',forfeitStart)
  const forfeitBlock=customer.slice(forfeitStart,saveStart)
  assert.match(forfeitBlock,/aezakmi:admin-session-close-pending/)
  assert.match(forfeitBlock,/clearStationLifecycleMarker\(\)/)
  assert.match(forfeitBlock,/showLoginKiosk/)
  assert.match(forfeitBlock,/aezakmi:admin-forfeit-logout/)
  assert.match(forfeitBlock,/sessionExitReady:true/)
  assert.doesNotMatch(forfeitBlock,/releaseStationLifecycle/)
  assert.doesNotMatch(forfeitBlock,/command:'lock'/)
})

test('failed final forfeit remains logged out while reversible close modes can roll back',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(admin,/sessionCloseRelease:true/)
  assert.match(admin,/if \(prepared\) await releasePreparedSessionClose\(pc, prepared\)/)
  assert.match(customer,/sessionCloseRelease/)
  assert.match(customer,/if \(disposition === 'forfeit'\)[\s\S]*showLoginKiosk[\s\S]*keptLoggedOut:true/)
  assert.match(customer,/executeRemoteCommand[\s\S]*command:'unlock'/)
  assert.match(customer,/aezakmi:admin-session-close-release/)
})

test('guest terminal reasons cover every normal session-ending lifecycle plus dedicated forfeit',()=>{
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  for (const reason of ['session_saved','session_refunded','session_ended','session_expired','session_settled','session_forfeited']) assert.match(customer,new RegExp(reason))
})

test('latest Electron quit and compact pairing fixes are preserved',()=>{
  const main=read('apps/customer/electron/main.cjs')
  const pairing=read('apps/customer/src/components/auth/StationCloudPairing.jsx')
  assert.doesNotMatch(main,/stopFocusEnforcement\(\)/)
  assert.match(pairing,/customer-pairing-shell/)
  assert.match(pairing,/customer-pairing-container/)
})


test('Cloud Admin final close does not fall through to Cafe Edge',()=>{
  const cloud=read('apps/admin/src/lib/cloudClient.js')
  const fn=read('supabase/functions/station-admin/index.ts')
  const migration=read('supabase/migrations/20260914000020_admin_atomic_session_close.sql')
  assert.match(cloud,/session_preview/)
  assert.match(cloud,/session_close/)
  assert.match(cloud,/refundSessionMatch/)
  assert.match(fn,/aezakmi_admin_close_session/)
  assert.match(migration,/savedRemainingSeconds/)
  assert.match(migration,/cloud_operation_receipts/)
})

test('successful prepared close has a terminal commit signal and only failed DB commit releases it',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(admin,/sessionCloseCommit:true/)
  assert.match(customer,/const sessionCloseCommit=/)
  assert.match(customer,/sessionCloseCommitted:true/)
  assert.match(customer,/showIdleDashboard/)
  assert.match(customer,/aezakmi:guest-session-ended/)
  assert.match(customer,/forcedLogout:true/)
})
