import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')

test('public registration uses six-digit server-generated verification plus submission throttles',()=>{
  const fn=read('supabase/functions/request-business-access/index.ts')
  const ui=read('apps/admin/src/components/auth/AdminLoginForm.jsx')
  assert.match(fn,/String\(bytes\[0\]%1_000_000\)\.padStart\(6,'0'\)/)
  assert.match(fn,/registration_submit_ip/)
  assert.match(fn,/registration_submit_email/)
  assert.match(fn,/registration_captcha/)
  assert.match(ui,/captchaChallengeId/)
  assert.match(ui,/captchaAnswer/)
  assert.match(ui,/pattern="\[0-9\]\{6\}"/)
})

test('pairing allows fifteen retries per installation window while retaining broad IP abuse control',()=>{
  const station=read('supabase/functions/pair-station/index.ts')
  const edge=read('supabase/functions/pair-edge/index.ts')
  assert.match(station,/station_pairing[^\n]+15,900/)
  assert.match(edge,/edge_pairing[^\n]+15,900/)
  assert.match(station,/station_pairing_ip[^\n]+60,3600/)
  assert.match(edge,/edge_pairing_ip[^\n]+60,3600/)
})

test('Customer cloud member login and activation have database-backed brute-force limits',()=>{
  const stationApi=read('supabase/functions/station-api/index.ts')
  const activation=read('supabase/functions/activate-registration/index.ts')
  assert.match(stationApi,/station_member_login[^\n]+20,600/)
  assert.match(stationApi,/station_member_login_device[^\n]+80,600/)
  assert.match(activation,/registration_activation[^\n]+10,900/)
})

test('requested easy-use credentials remain intentionally unchanged',()=>{
  const edgeEnv=read('backend/src/config/env.js')
  const electron=read('apps/customer/electron/main.cjs')
  const localApi=read('backend/src/routes/apiRoutes.js')
  const cloudAdmin=read('supabase/functions/admin-api/index.ts')
  assert.match(edgeEnv,/AEZAKMI_STATION_SETUP_MASTER_PIN \?\? '062321'/)
  assert.match(electron,/AEZAKMI_STATION_SETUP_MASTER_PIN \|\| '062321'/)
  assert.match(localApi,/TEMPORARY_CUSTOMER_PASSWORD = "1234"/)
  assert.match(cloudAdmin,/setMemberCredential\(admin,branchId,localId,username,'1234',true\)/)
})

test('hidden Customer Lock and Unlock execute locally before optional Cafe Edge checkpoint',()=>{
  const guard=read('apps/customer/src/components/common/EmergencyControlGuard.jsx')
  const localIndex=guard.indexOf('await executeLocally()')
  const edgeIndex=guard.indexOf("apiPost('/public/station-control'")
  assert.ok(localIndex>=0)
  assert.ok(edgeIndex>localIndex)
  assert.match(guard,/completed locally; Café Edge checkpoint unavailable/)
})

test('active Customer minimization becomes an extra-small background timer with a dashboard button',()=>{
  const electron=read('apps/customer/electron/main.cjs')
  const view=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(electron,/const COMPACT_WIDTH = 84/)
  assert.match(electron,/const COMPACT_HEIGHT = 22/)
  assert.match(electron,/DEFAULT_TIMER_PREFERENCES = Object\.freeze\(\{ visible:true, opacity:0\.8 \}\)/)
  assert.match(electron,/function applyCompactSessionMode\(\)[\s\S]*setAlwaysOnTop\(false\)/)
  assert.match(electron,/mainWindow\.on\('minimize',[\s\S]*hideMiniDashboard\(\)/)
  const compact=view.match(/if \(compactView && hasActiveSession\) \{[\s\S]*?\n  \}\n\n  return \(/)?.[0]||''
  assert.match(compact,/compactTimer/)
  assert.match(compact,/text-\[11px\]/)
  assert.match(compact,/aria-label="Open dashboard"/)
  assert.match(compact,/Right-click for settings/)
  assert.match(electron,/function showCompactTimerContextMenu\(\)[\s\S]*Show Timer[\s\S]*Opacity/)
  assert.doesNotMatch(compact,/<img|progress|PC|left|Expand|Maximize/)
})

test('Cafe Edge automatically creates verified rotating SQLite backups and provides guarded restore',()=>{
  const backup=read('backend/src/services/databaseBackup.js')
  const restore=read('backend/scripts/restore-backup.mjs')
  const server=read('backend/src/server.js')
  const env=read('backend/src/config/env.js')
  assert.match(backup,/db\.backup\(tempPath\)/)
  assert.match(backup,/quick_check/)
  assert.match(backup,/pruneBackups/)
  assert.match(server,/startDatabaseBackupScheduler\(\)/)
  assert.match(env,/databaseBackupIntervalHours/)
  assert.match(restore,/integrity_check/)
  assert.match(restore,/--confirm/)
  assert.match(restore,/pre-restore/)
})

test('production error aggregation exists in Cloud and Cafe Edge, is bounded, and redacts credentials',()=>{
  const cloud=read('supabase/functions/_shared/security.ts')
  const migration=read('supabase/migrations/20260915000030_observability_events.sql')
  const local=read('backend/src/utils/observability.js')
  const sync=read('backend/src/cloud/syncWorker.js')
  const developer=read('supabase/functions/developer-registrations/index.ts')
  assert.match(cloud,/aezakmi_record_observability_event/)
  assert.match(cloud,/password\|secret\|token\|authorization\|cookie\|pin\|api\[_-\]\?key/i)
  assert.match(migration,/occurrence_count/)
  assert.match(migration,/interval '90 days'/)
  assert.match(local,/password\|secret\|token\|authorization\|cookie\|pin/i)
  assert.match(local,/observabilityRetentionDays/)
  assert.match(sync,/observabilityEvents/)
  assert.match(developer,/system_observability_events/)
})

test('abuse-control storage self-prunes and the Edge sync default remains request-efficient',()=>{
  const migration=read('supabase/migrations/20260915000029_public_abuse_controls.sql')
  const env=read('backend/src/config/env.js')
  const example=read('backend/.env.example')
  assert.match(migration,/interval '2 days'/)
  assert.match(migration,/interval '1 day'/)
  assert.match(env,/AEZAKMI_CLOUD_SYNC_INTERVAL_SECONDS \?\? 60/)
  assert.match(example,/AEZAKMI_CLOUD_SYNC_INTERVAL_SECONDS=60/)
})
