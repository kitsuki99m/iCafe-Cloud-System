import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('forfeit and refund keep the neutral close barrier for both guest and member sessions',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(admin,/async function prepareSessionClose\(pc, disposition\)/)
  assert.match(admin,/command:'game_update'/)
  assert.match(admin,/disposition === 'save' \|\| disposition === 'forfeit'/)
  assert.match(admin,/prepareSessionClose\(pc, disposition\)/)
  assert.match(admin,/await prepareSessionClose\(pc, 'refund'\)/)
  assert.doesNotMatch(admin,/prepareGuestSessionClose/)
})

test('guest close fence blocks auto-restore without clearing auth before commit',()=>{
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(auth,/ADMIN_SESSION_CLOSE_PENDING/)
  assert.match(auth,/hasPendingStationLifecycle\(\) \|\| readAdminSessionCloseFence\(\)/)
  assert.match(customer,/aezakmi:admin-session-close-pending/)
  const closeStart=customer.indexOf('if (sessionClose)')
  const closeEnd=customer.indexOf("if (['shutdown','reboot']",closeStart)
  const closeBlock=customer.slice(closeStart,closeEnd)
  assert.doesNotMatch(closeBlock,/clearStationLifecycleMarker\(\)/)
  assert.doesNotMatch(closeBlock,/aezakmi:admin-session-interruption/)
})

test('failed final close has a neutral local rollback path',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(admin,/sessionCloseRelease:true/)
  assert.match(admin,/if \(prepared\) await releasePreparedSessionClose\(pc, prepared\)/)
  assert.match(customer,/sessionCloseRelease/)
  assert.match(customer,/executeRemoteCommand[\s\S]*command:'unlock'/)
  assert.match(customer,/aezakmi:admin-session-close-release/)
})

test('guest terminal reasons cover every normal session-ending lifecycle',()=>{
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  for (const reason of ['session_saved','session_forfeited','session_refunded','session_ended','session_expired','session_settled']) assert.match(customer,new RegExp(reason))
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
})
