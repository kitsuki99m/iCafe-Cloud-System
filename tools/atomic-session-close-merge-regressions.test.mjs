import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('Admin Pause & Save and Forfeit commit authority before any station terminal signal',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const start=admin.indexOf('async function endSession')
  const end=admin.indexOf('async function refundSession',start)
  const block=admin.slice(start,end)
  const close=block.indexOf('apiPost(`/sessions/${sessionId}/end`')
  const commit=block.indexOf('commitPreparedSessionClose',close)
  assert.ok(close>=0&&commit>close)
  assert.doesNotMatch(block,/await prepareSessionClose/)
  assert.doesNotMatch(block,/releasePreparedSessionClose/)
})

test('legacy prepared Forfeit compatibility path logs out before ACK and never checkpoints remaining time',()=>{
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

test('failed authoritative close does not send an unlock rollback because Admin never pre-locks Save/Forfeit',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const start=admin.indexOf('async function endSession')
  const end=admin.indexOf('async function refundSession',start)
  const block=admin.slice(start,end)
  assert.match(block,/catch \(error\) \{[\s\S]*refresh\(\)[\s\S]*throw error/)
  assert.doesNotMatch(block,/releasePreparedSessionClose/)
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
  assert.match(fn,/aezakmi_station_release_session/)
  assert.match(migration,/savedRemainingSeconds/)
  assert.match(migration,/cloud_operation_receipts/)
})

test('successful Admin close terminal signal logs both Member and Guest back to login',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(admin,/sessionCloseCommit:true/)
  assert.match(customer,/const sessionCloseCommit=/)
  assert.match(customer,/sessionCloseCommitted:true/)
  const start=customer.indexOf('if (sessionCloseCommit)')
  const end=customer.indexOf('if (sessionCloseRelease)',start)
  const block=customer.slice(start,end)
  assert.match(block,/showLoginKiosk/)
  assert.match(block,/aezakmi:admin-session-logout/)
  assert.match(block,/aezakmi:admin-forfeit-logout/)
  assert.match(block,/forcedLogout:true/)
  assert.doesNotMatch(block,/showIdleDashboard/)
})
