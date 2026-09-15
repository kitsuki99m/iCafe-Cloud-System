import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root=process.cwd()
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')
const exists=(p)=>fs.existsSync(path.join(root,p))
const failures=[]
const check=(ok,msg)=>{if(!ok)failures.push(msg)}

const required=[
  'package.json','package-lock.json','vercel.json',
  'apps/admin/package.json','apps/admin/.env.cloud.example','apps/admin/vercel.json','apps/admin/electron/main.cjs',
  'apps/customer/package.json','apps/customer/electron/main.cjs',
  'backend/package.json','backend/.env.example','backend/src/cloud/syncWorker.js',
  'backend/src/services/databaseBackup.js','backend/src/utils/observability.js','backend/scripts/backup.mjs','backend/scripts/restore-backup.mjs',
  'supabase/config.toml','supabase/migrations/20260913000001_aezakmi_cloud_base.sql',
  'supabase/migrations/20260913000002_cloud_admin_idempotency.sql',
  'supabase/migrations/20260913000003_pairing_code_security.sql',
  'supabase/migrations/20260913000004_registration_approval.sql',
  'supabase/migrations/20260913000005_business_lifecycle_controls.sql',
  'supabase/migrations/20260913000006_cloud_primary_customer_stations.sql',
  'supabase/migrations/20260913000009_station_repairing.sql',
  'supabase/migrations/20260914000015_presence_jitter_grace.sql',
  'supabase/migrations/20260914000020_admin_atomic_session_close.sql',
  'supabase/migrations/20260914000021_admin_close_session_rpc_guard.sql',
  'supabase/migrations/20260914000022_earnings_receipts_not_wallet_activity.sql',
  'supabase/migrations/20260914000023_earnings_receipt_edge_dedupe_guard.sql',
  'supabase/migrations/20260914000024_member_starting_wallet_receipt_guard.sql',
  'supabase/migrations/20260914000025_atomic_platform_pricing_catalog.sql',
  'supabase/migrations/20260915000026_station_delete_tombstones.sql',
  'supabase/migrations/20260915000027_station_runtime_heartbeat_rpc.sql',
  'supabase/migrations/20260915000028_station_presence_heartbeat_grace.sql',
  'supabase/migrations/20260915000029_public_abuse_controls.sql',
  'supabase/migrations/20260915000030_observability_events.sql',
  'supabase/functions/admin-api/index.ts',
  'supabase/functions/edge-sync/index.ts',
  'supabase/functions/request-business-access/index.ts',
  'supabase/functions/developer-registrations/index.ts',
  'supabase/functions/activate-registration/index.ts',
  'docs/DEPLOYMENT_SUPABASE_VERCEL.md','docs/DEVELOPER_APPROVAL_SETUP.md','docs/BACKUP_RECOVERY_OBSERVABILITY_2026-09-15.md'
]
for(const p of required)check(exists(p),`Missing required release file: ${p}`)
check(!exists('apps/cloud'),'Legacy apps/cloud must be removed; apps/admin is the single Admin codebase.')
check(!exists('render.yaml'),'Render configuration must not be present.')
check(!exists('services/cloud-api'),'Legacy Render cloud API must not be present.')
check(exists('supabase/functions/_shared/security.ts'),'Shared Supabase security helper is required.')
for(const name of ['pair-edge','edge-sync','edge-unpair','create-pairing-code','issue-command','admin-action','admin-api','update-branch-config','create-branch','revoke-edge','request-business-access','developer-registrations','activate-registration','station-admin','pair-station','station-runtime','station-api']){
  const dir=`supabase/functions/${name}`
  const tsFiles=walk(dir).filter(p=>p.endsWith('.ts'))
  check(tsFiles.length===1&&tsFiles[0]===`${dir}/index.ts`,`${name} must contain only index.ts for API bundling.`)
}

const hardeningSource=[read('supabase/functions/request-business-access/index.ts'),read('supabase/functions/pair-station/index.ts'),read('supabase/functions/pair-edge/index.ts'),read('supabase/functions/station-api/index.ts')].join('\n')
check(/registration_captcha_challenges/.test(hardeningSource)&&/registration_submit_ip/.test(hardeningSource),'Public registration CAPTCHA/rate limiting is missing.')
check(/station_pairing[^\n]+15,900/.test(hardeningSource)&&/edge_pairing[^\n]+15,900/.test(hardeningSource),'Pairing must retain the 15-attempt abuse limit.')
check(/station_member_login/.test(hardeningSource),'Customer Cloud login rate limiting is missing.')
check(/AEZAKMI_STATION_SETUP_MASTER_PIN \?\? '062321'/.test(read('backend/src/config/env.js')),'Requested Station Setup Master PIN default changed unexpectedly.')
check(/TEMPORARY_CUSTOMER_PASSWORD = "1234"/.test(read('backend/src/routes/apiRoutes.js')),'Requested temporary member password changed unexpectedly.')
check(/COMPACT_WIDTH = 84/.test(read('apps/customer/electron/main.cjs'))&&/COMPACT_HEIGHT = 22/.test(read('apps/customer/electron/main.cjs'))&&/opacity:0\.8/.test(read('apps/customer/electron/main.cjs'))&&/function applyCompactSessionMode\(\)[\s\S]*setAlwaysOnTop\(false\)/.test(read('apps/customer/electron/main.cjs'))&&/transparent:true/.test(read('apps/customer/electron/main.cjs'))&&/backgroundColor: `rgba\(32, 41, 55, \${timerPreferences\.opacity}\)`/.test(read('apps/customer/src/pages/CustomerSessionView.jsx')),'Customer compact timer must remain extra-small, 80% background opacity by default, transparent-capable, and non-topmost.')
check(/const ACTIVE_WIDTH = 960/.test(read('apps/customer/electron/main.cjs'))&&/const ACTIVE_HEIGHT = 680/.test(read('apps/customer/electron/main.cjs'))&&/function applyIdleDashboardMode\(\)[\s\S]*setFullScreen\(true\)[\s\S]*setAlwaysOnTop\(true, 'screen-saver'\)/.test(read('apps/customer/electron/main.cjs'))&&/function enterActiveState\(\)[\s\S]*applyActiveWindowMode\(\{ show:true \}\)/.test(read('apps/customer/electron/main.cjs'))&&/function completeSessionStartTransition\(\)[\s\S]*applyActiveWindowMode\(\{ show:true \}\)/.test(read('apps/customer/electron/main.cjs'))&&/function applyActiveWindowMode[\s\S]*unmaximize\(\)[\s\S]*setAlwaysOnTop\(false\)[\s\S]*setSize\(ACTIVE_WIDTH, ACTIVE_HEIGHT, false\)/.test(read('apps/customer/electron/main.cjs')),'Customer no-session mode must stay fullscreen/topmost while member and Guest active sessions open as a non-topmost 960x680 dashboard.')
check(/system_observability_events/.test(read('supabase/migrations/20260915000030_observability_events.sql')),'Central observability migration is incomplete.')

const secretPatterns=[/sb_secret_[A-Za-z0-9_-]+/g,/SUPABASE_SERVICE_ROLE_KEY\s*=\s*[^\s#]+/g,/SUPABASE_SECRET_KEY\s*=\s*[^\s#]+/g]
const sourceRoots=['apps','backend','supabase','scripts','tools','docs']
function normalizeRel(p){return p.split(path.sep).join('/')}
function walk(dir){if(!exists(dir))return[];return fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(e=>{const rel=normalizeRel(path.join(dir,e.name));if(e.isDirectory()){if(['node_modules','dist','installer','.temp'].includes(e.name))return[];return walk(rel)}return[rel]})}
for(const file of sourceRoots.flatMap(walk)){
  if(!/\.(?:js|jsx|mjs|cjs|ts|tsx|json|md|txt|toml|example)$/i.test(file))continue
  const text=read(file)
  for(const pattern of secretPatterns){pattern.lastIndex=0;const match=pattern.exec(text);if(match&&!/REPLACE_ME|YOUR_|example/i.test(match[0]))failures.push(`Possible secret in ${file}: ${match[0].slice(0,28)}…`)}
}


const approvalSql=read('supabase/migrations/20260913000004_registration_approval.sql')
const cloudAdminSource=walk('apps/admin/src').filter(p=>/\.(?:js|jsx)$/.test(p)).map(read).join('\n')
check(/platform_developers/.test(approvalSql)&&/registration_requests/.test(approvalSql),'Developer approval migration is incomplete.')
check(/revoke all on function public\.aezakmi_create_organization\(text,text\) from public, anon, authenticated/.test(approvalSql),'Authenticated users must not retain self-service tenant creation.')
check(!/\/auth\/v1\/signup/.test(cloudAdminSource),'Cloud Admin must not expose direct public Auth sign-up.')
check(/cloudRequestBusinessAccess/.test(cloudAdminSource)&&/DeveloperConsolePage/.test(cloudAdminSource),'Approval-only registration UI is incomplete.')

const customerText=walk('apps/customer').filter(p=>/\.(?:js|jsx|cjs|mjs)$/.test(p)).map(read).join('\n')
check(/VITE_SUPABASE_URL/.test(customerText)&&/station-api/.test(customerText),'Customer Electron must use the cloud-primary station transport.')
check(!/SUPABASE_SECRET|SUPABASE_SERVICE_ROLE|sb_secret_/.test(customerText),'Customer Electron must never contain privileged Supabase credentials.')
check(!/ownerPassword|businessOwnerPassword|service_role/i.test(customerText),'Customer Station must never store the business owner password or a service-role credential.')
const adminEnv=read('apps/admin/.env.cloud.example')
check(/VITE_SUPABASE_URL/.test(adminEnv)&&/VITE_SUPABASE_PUBLISHABLE_KEY/.test(adminEnv),'Cloud Admin example env is incomplete.')
check(!/SECRET|SERVICE_ROLE|sb_secret_/.test(adminEnv),'Cloud Admin example must contain public Supabase values only.')
const edgeEnv=read('backend/.env.example')
check(/AEZAKMI_SUPABASE_PUBLISHABLE_KEY/.test(edgeEnv),'Edge example env is missing publishable key.')
check(!/SUPABASE_SECRET|SUPABASE_SERVICE_ROLE|sb_secret_/.test(edgeEnv),'Distributed Edge must not contain a Supabase secret/service-role key.')

for(const file of walk('backend/src').filter(p=>p.endsWith('.js'))){
  const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'})
  if(result.status!==0)failures.push(`Node syntax check failed: ${file}\n${result.stderr}`)
}
for(const file of [...walk('apps/admin/electron'),...walk('apps/customer/electron')].filter(p=>p.endsWith('.cjs'))){
  const result=spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'})
  if(result.status!==0)failures.push(`Electron syntax check failed: ${file}\n${result.stderr}`)
}

if(failures.length){console.error(`Release readiness FAILED (${failures.length})`);for(const f of failures)console.error(`- ${f}`);process.exit(1)}
console.log('Release readiness static checks passed.')
