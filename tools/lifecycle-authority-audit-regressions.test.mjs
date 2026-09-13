import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root=process.cwd()
const read=(file)=>readFileSync(resolve(root,file),'utf8')

test('Customer login kiosk preserves the fixed 180-second shutdown policy while unauthenticated',()=>{
  const src=read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  assert.match(src,/remaining = 180;[\s\S]*setIdleSeconds\(remaining\)/)
  assert.match(src,/remaining -= 1;/)
  assert.match(src,/if \(remaining > 0 \|\| shutdownTriggered\.current\) return;/)
  assert.doesNotMatch(src,/idlePausedRef/)
  assert.doesNotMatch(src,/addEventListener\(eventName, resetIdle/)
})

test('Signed-in idle shutdown pauses for all customer modals and resets on activity',()=>{
  const src=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(src,/topUpOpen \|\| extendOpen \|\| startOpen \|\| logoutOpen \|\| feedbackOpen \|\| announcementsOpen \|\| viewFeedback \|\| powerConfirm/)
  assert.match(src,/\["pointermove", "pointerdown", "keydown", "touchstart", "wheel"\]/)
  assert.match(src,/idleUiPausedRef\.current\) return/)
  assert.match(src,/await logout\(\{ reason:"idle_shutdown", allowDeferred:true \}\)/)
})

test('Natural prepaid expiry logs out and locks Guests only, not authenticated members',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  const expiry=page.slice(page.indexOf('endSession(activePc).finally'),page.indexOf('}, [',page.indexOf('endSession(activePc).finally')))
  assert.ok(expiry.includes('if (isGuest) {'))
  assert.ok(expiry.indexOf('if (isGuest) {') < expiry.indexOf('lockClient'))
  assert.ok(expiry.includes('logout({ reason:"session_expired", allowDeferred:true })'))

  const appData=read('apps/customer/src/context/AppDataContext.jsx')
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  assert.doesNotMatch(appData,/aezakmi:session-expired/)
  assert.doesNotMatch(auth,/aezakmi:session-expired/)
  assert.match(appData,/aezakmi:guest-session-ended/)
  assert.match(auth,/aezakmi:guest-session-ended/)
})

test('Café Edge natural prepaid expiry no longer revokes member authentication',()=>{
  const server=read('backend/src/server.js')
  const start=server.indexOf('function cleanupExpiredComputerSessions()')
  const end=server.indexOf('\ncleanupExpiredComputerSessions()',start+1)
  const cleanup=server.slice(start,end)
  assert.match(cleanup,/session_seconds_remaining=0/)
  assert.doesNotMatch(cleanup,/auth_sessions SET revoked_at/)
})

test('Dead legacy Customer LoginForm with missing admin auth APIs is removed',()=>{
  assert.equal(existsSync(resolve(root,'apps/customer/src/components/auth/LoginForm.jsx')),false)
  const app=read('apps/customer/src/App.jsx')
  assert.match(app,/CustomerLoginForm/)
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  assert.doesNotMatch(auth,/loginAdminPin|loginAdminPassword/)
})

test('Cloud public Guest end and extension endpoints cannot act on member or postpaid sessions',()=>{
  const stationApi=read('supabase/functions/station-api/index.ts')
  assert.match(stationApi,/select\('pc_id,member_id,billing_type'\)/)
  assert.match(stationApi,/publicEndMatch&&\(s\.member_id!==null\|\|String\(s\.billing_type\|\|''\)\.toLowerCase\(\)!=='prepaid'\)/)
  assert.match(stationApi,/GUEST_SESSION_REQUIRED/)
  assert.match(stationApi,/Only prepaid sessions can be extended with purchased time/)
  assert.match(stationApi,/Guest extensions must be paid by cash or GCash/)
  assert.match(stationApi,/String\(session\.member_id\|\|''\)!==String\(auth\.member\.local_id\)/)
})

test('Signed-in member owns the station against conflicting Guest or member starts',()=>{
  const edgeAuth=read('backend/src/routes/authRoutes.js')
  const edgeApi=read('backend/src/routes/apiRoutes.js')
  const stationApi=read('supabase/functions/station-api/index.ts')
  const adminApi=read('supabase/functions/admin-api/index.ts')
  assert.match(edgeAuth,/stationActiveSession[\s\S]*PC_IN_USE/)
  assert.match(edgeApi,/PC_MEMBER_SIGNED_IN/)
  assert.match(stationApi,/stationActive[\s\S]*PC_IN_USE/)
  assert.match(adminApi,/branch_customer_auth_sessions[\s\S]*PC_MEMBER_SIGNED_IN/)
  assert.match(adminApi,/requireAvailableStation\(admin,branchId,String\(body\?\.pcId\|\|''\),body\?\.customerId\?String\(body\.customerId\):null\)/)
})

test('Admin lifecycle rolls back expired power transitions and legacy Edge commands are station-scoped',()=>{
  const stationAdmin=read('supabase/functions/station-admin/index.ts')
  const issue=read('supabase/functions/issue-command/index.ts')
  assert.match(stationAdmin,/async function restoreStationAvailable/)
  assert.match(stationAdmin,/command\.command==='reboot'\|\|command\.command==='shutdown'\)await restoreStationAvailable/)
  assert.match(issue,/branch_stations/)
  assert.match(issue,/Station does not belong to this Café Edge branch/)
})


test('Pairing does not fabricate online availability before the required Electron restart',()=>{
  const cloud=read('apps/customer/src/lib/cloudStation.js')
  const pair=read('supabase/functions/pair-station/index.ts')
  const runtime=read('supabase/functions/station-runtime/index.ts')
  const admin=read('supabase/functions/admin-api/index.ts')
  const fnStart=cloud.indexOf('export async function pairCloudStation')
  const fnEnd=cloud.indexOf('export async function cloudStationApiFetch',fnStart)
  const pairClient=cloud.slice(fnStart,fnEnd)
  assert.doesNotMatch(pairClient,/startCloudStationRuntime\(\)/)
  assert.doesNotMatch(pairClient,/markCloudStationOnline\(\)/)
  assert.match(pair,/cloud_connection_status:'paired'/)
  assert.match(pair,/cloud_last_seen_at:null/)
  assert.match(pair,/status:\['maintenance','reserved'\]\.includes\(persistedStatus\)\?persistedStatus:'offline'/)
  assert.match(runtime,/cloud_connection_status:'unpaired'[\s\S]*status:\['maintenance','reserved'\]\.includes\(persistedStatus\)\?persistedStatus:'offline'/)
  assert.match(admin,/STATION_NOT_PAIRED/)
})

test('Pairing remains single-use and branch/station scoped',()=>{
  const pair=read('supabase/functions/pair-station/index.ts')
  assert.match(pair,/code_hash/)
  assert.match(pair,/is\('used_at',null\)/)
  assert.match(pair,/gt\('expires_at',now\)/)
  assert.match(pair,/eq\('branch_id',pairing\.branch_id\)\.eq\('local_id',pairing\.local_station_id\)/)
  assert.match(pair,/STATION_ALREADY_PAIRED/)
  assert.match(pair,/PAIRING_USED/)
})
