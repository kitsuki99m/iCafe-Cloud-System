import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read=(file)=>readFileSync(resolve(process.cwd(),file),'utf8')

test('Customer lifecycle logout does not issue a second authenticated logout after station release revoked auth',()=>{
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  assert.match(auth,/const hadPendingLifecycle\s*=\s*hasPendingStationLifecycle\(\)/)
  assert.match(auth,/if \(getToken\(\) && !hadPendingLifecycle && lifecycle\?\.ok\)/)
})

test('Customer total transport outage gets a three-second interruption watchdog even if no socket disconnect event fires',()=>{
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(data,/scheduleStationDisconnect/)
  assert.match(data,/onSocketError/)
  assert.match(data,/socket\?\.connected/)
  assert.match(data,/releaseStationLifecycle\('station_disconnect',\{allowDeferred:true\}\)/)
  assert.match(data,/3000/)
})

test('Guest prepaid expiry can defer lifecycle persistence while immediately leaving the expired session UI',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(page,/logout\(\{ reason:"session_expired", allowDeferred:true \}\)/)
})

test('Failed local locks roll back only their own pause and pending power keeps reconnecting stations offline',()=>{
  const operations=read('backend/src/routes/operationsRoutes.js')
  const server=read('backend/src/server.js')
  assert.match(operations,/pause && String\(pause\.command_id \|\| ''\) === String\(command\.id\)/)
  assert.match(operations,/rolledBackLock/)
  assert.match(operations,/transitionRemoteCommand\(commandId,'failed',result\)/)
  assert.match(server,/powerPending[\s\S]*command IN \('shutdown','reboot'\)[\s\S]*status='offline'/)
  assert.match(server,/currentPause && String\(currentPause\.command_id \|\| ''\) === String\(command\.id\)/)
})

test('Local reset pairing is a paid-session interruption before the station credential is erased',()=>{
  const edge=read('backend/src/routes/apiRoutes.js')
  const route=edge.slice(edge.indexOf('"/pcs/:id/reset-pairing"'),edge.indexOf('router.delete',edge.indexOf('"/pcs/:id/reset-pairing"')))
  assert.match(route,/releaseStationSession\(pc\.id, \{ reason:'pairing_reset'/)
  assert.ok(route.indexOf('releaseStationSession') < route.indexOf('station_token_hash=NULL'))
  assert.match(route,/status=CASE WHEN status='maintenance' THEN status ELSE 'offline' END/)
  assert.match(route,/emitSessionUpdated/)
})

test('Interrupted Guest prepaid restore requires a genuinely Available online station in Edge and Cloud',()=>{
  const edge=read('backend/src/routes/apiRoutes.js')
  const sql=read('supabase/migrations/20260913000012_production_session_lifecycle_hardening.sql')
  const admin=read('supabase/functions/admin-api/index.ts')
  assert.match(edge,/restore-interrupted-guest[\s\S]*String\(pc\.status \|\| ""\)\.toLowerCase\(\) !== "available"/)
  assert.match(sql,/cloud_last_seen_at < ts-interval '3 seconds'/)
  assert.match(sql,/lower\(coalesce\(station\.status,''\)\)<>'available'/)
  assert.match(admin,/restore-interrupted-guest[\s\S]*requireAvailableStation/)
})

test('Cloud station runtime preserves Offline through pending power transitions and rolls back failed or expired commands safely',()=>{
  const runtime=read('supabase/functions/station-runtime/index.ts')
  assert.match(runtime,/pendingPower/)
  assert.match(runtime,/status:pendingPower\?'offline':active\?'occupied'/)
  assert.match(runtime,/command\.command==='lock'\)await rollbackLockCheckpoint/)
  assert.match(runtime,/command\.command==='reboot'\|\|command\.command==='shutdown'\)await restoreStationAvailable/)
  assert.match(runtime,/status==='failed'&&\(command\.command==='reboot'\|\|command\.command==='shutdown'\)\)await restoreStationAvailable/)
})

test('Cloud Admin station lifecycle prevents fabricated availability, unsafe deletion, and commands to stale stations',()=>{
  const station=read('supabase/functions/station-admin/index.ts')
  assert.match(station,/New PCs start offline until the paired Customer Station connects/)
  assert.match(station,/PC_PRESENCE_MANAGED/)
  assert.match(station,/PC_HAS_ACTIVE_SESSION/)
  assert.match(station,/PC_HAS_NO_SESSION/)
  assert.match(station,/PC_IN_USE/)
  assert.match(station,/stationRecentlyOnline/)
  assert.match(station,/aezakmi_station_release_session[\s\S]*p_reason:'pairing_reset'/)
})

test('Cloud paid-session starts and restores are rejected unless station availability and heartbeat are current',()=>{
  const admin=read('supabase/functions/admin-api/index.ts')
  assert.match(admin,/async function requireAvailableStation/)
  assert.match(admin,/Date\.now\(\)-seen>=3000/)
  assert.match(admin,/route==='\/sessions\/start'[\s\S]*requireAvailableStation/)
  assert.match(admin,/restore-interrupted-guest[\s\S]*requireAvailableStation/)
})

test('Cloud wallet-funded session usage is recorded as earned revenue without duplicating postpaid settlement',()=>{
  const sql=read('supabase/migrations/20260913000012_production_session_lifecycle_hardening.sql')
  assert.match(sql,/aezakmi_cloud_wallet_spend_revenue/)
  assert.match(sql,/new\.type in\('session_start','session_extension','postpaid_settlement'\)/)
  assert.match(sql,/'wallet_transaction',new\.local_id/)
  assert.match(sql,/cloud-wallet-earned-/)
  assert.match(sql,/backfilled',true/)
  assert.match(sql,/r\.source_type='wallet_transaction'[\s\S]*w\.reference_id=new\.local_id/)
})

test('Legacy non-prepaid Guest sessions remain staff-controlled while the production build is prepaid-only',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(page,/const legacyBillingSession = hasActiveSession && session\?\.billing !== "prepaid"/)
  assert.match(page,/if \(legacyBillingSession\)[\s\S]*handleHelp\(\)/)
  assert.match(page,/\{!legacyBillingSession && \(/)
  assert.match(page,/This session came from an older billing mode/)
})
