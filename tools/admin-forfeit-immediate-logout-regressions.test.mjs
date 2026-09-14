import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('Admin Forfeit is server-authoritative and never gated by Lock Session or a station ACK',()=>{
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  const start=admin.indexOf('async function endSession')
  const end=admin.indexOf('async function refundSession',start)
  const block=admin.slice(start,end)
  const close=block.indexOf('apiPost(`/sessions/${sessionId}/end`')
  const commit=block.indexOf('commitPreparedSessionClose',close)
  assert.ok(close>=0,'Admin must close the authoritative session')
  assert.ok(commit>close,'station terminal signal must happen only after the close commits')
  assert.doesNotMatch(block,/await prepareSessionClose/)
  assert.doesNotMatch(block,/releasePreparedSessionClose/)
  assert.doesNotMatch(block,/command:'lock'/)
})

test('forced Admin close bypasses normal customer lifecycle saving',()=>{
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const start=auth.indexOf('const onAdminForfeitLogout')
  const end=auth.indexOf('const onStationSessionInterruption',start)
  const block=auth.slice(start,end)
  assert.match(block,/clearStationLifecycleMarker\(\)/)
  assert.match(block,/lock\(\)/)
  assert.doesNotMatch(block,/releaseStationLifecycle/)
})

test('Cafe Edge revokes active customer auth for both Admin Pause & Save and Forfeit',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(api,/const adminTerminalClose = req\.auth\.role === "admin" && \["save", "forfeit"\]\.includes\(disposition\)/)
  assert.match(api,/end_reason=COALESCE\(end_reason,\?\)/)
  assert.match(api,/disposition === "forfeit" \? "admin_forfeit" : "admin_pause_save"/)
  assert.match(api,/user_id IN \(SELECT id FROM users WHERE role='customer'\)/)
  assert.match(api,/emit\('auth:revoked',[\s\S]*admin_pause_save/)
  assert.match(api,/forceLogout: adminTerminalClose/)
})

test('Cloud Admin closes revoke station customer auth and broadcast forced logout',()=>{
  const fn=read('supabase/functions/station-admin/index.ts')
  assert.match(fn,/branch_customer_auth_sessions/)
  assert.match(fn,/reason=disposition==='forfeit'\?'session_forfeited':disposition==='refund'\?'session_refunded':'session_saved'/)
  assert.match(fn,/forceLogout:true/)
  assert.match(fn,/aezakmi_station_release_session/)
})
