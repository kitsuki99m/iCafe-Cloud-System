import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=p=>fs.readFileSync(path.join(root,p),'utf8')
const exists=p=>fs.existsSync(path.join(root,p))
const walk=d=>!exists(d)?[]:fs.readdirSync(path.join(root,d),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name).replaceAll('\\','/')):[path.join(d,e.name).replaceAll('\\','/')])

test('cloud architecture is Supabase-only and Render/duplicate cloud app are removed',()=>{
  assert.equal(exists('render.yaml'),false)
  assert.equal(exists('services/cloud-api'),false)
  assert.equal(exists('apps/cloud'),false)
  const pkg=JSON.parse(read('package.json'))
  assert.ok(!pkg.workspaces?.includes('services/cloud-api'))
  assert.equal(pkg.scripts['start:cloud'],undefined)
  assert.equal(pkg.scripts['cloud:bootstrap'],undefined)
})

test('apps/admin is the single Vercel and Emergency Electron Admin codebase',()=>{
  for(const f of['apps/admin/package.json','apps/admin/src/App.jsx','apps/admin/src/lib/cloudClient.js','apps/admin/electron/main.cjs','apps/admin/.env.cloud.example','apps/admin/vercel.json','vercel.json'])assert.ok(exists(f),f)
  const pkg=read('package.json')
  assert.match(pkg,/scripts\/cloud-admin\.mjs/)
  const env=read('apps/admin/.env.cloud.example')
  assert.match(env,/VITE_ADMIN_MODE=cloud/)
  assert.match(env,/VITE_SUPABASE_URL/)
  assert.match(env,/VITE_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(env,/SUPABASE_SECRET_KEY|SERVICE_ROLE_KEY|sb_secret_/)
  const vercel=read('apps/admin/vercel.json')
  assert.match(vercel,/index\.html/)
})

test('Customer Electron is cloud-primary without carrying privileged Supabase credentials',()=>{
  const text=walk('apps/customer').filter(f=>/\.(js|jsx|cjs|mjs)$/.test(f)).map(read).join('\n')
  const station=read('apps/customer/src/lib/cloudStation.js')
  assert.match(station,/VITE_SUPABASE_URL/)
  assert.match(station,/VITE_SUPABASE_PUBLISHABLE_KEY/)
  assert.match(station,/station-api/)
  assert.match(station,/station-runtime/)
  assert.match(station,/pair-station/)
  assert.doesNotMatch(text,/SUPABASE_SERVICE_ROLE|SUPABASE_SECRET|sb_secret_/)
  assert.doesNotMatch(text,/ownerPassword|businessOwnerPassword/)
})

test('Edge stores only public Supabase configuration and revocable device credentials',()=>{
  const env=read('backend/.env.example'),client=read('backend/src/cloud/client.js'),store=read('backend/src/cloud/store.js')
  assert.match(env,/AEZAKMI_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(env,/SUPABASE_SECRET|SUPABASE_SERVICE_ROLE|sb_secret_/)
  assert.match(client,/x-aezakmi-edge-token/)
  assert.match(store,/edge_token/)
})

test('all required Supabase functions exist',()=>{
  for(const n of['pair-edge','edge-sync','edge-unpair','create-pairing-code','issue-command','admin-action','admin-api','update-branch-config','create-branch','revoke-edge','request-business-access','developer-registrations','activate-registration','station-admin','pair-station','station-runtime','station-api'])assert.ok(exists(`supabase/functions/${n}/index.ts`),n)
})

test('privileged Edge RPCs are denied to browser roles and service-role-only',()=>{
  const sql=read('supabase/migrations/20260913000001_aezakmi_cloud_base.sql')
  assert.match(sql,/revoke all on function public\.aezakmi_verify_edge\(uuid,text\) from public, anon, authenticated/)
  assert.match(sql,/grant execute on function public\.aezakmi_verify_edge\(uuid,text\) to service_role/)
  assert.match(sql,/revoke all on function public\.aezakmi_ingest_edge_events\(uuid,jsonb\) from public, anon, authenticated/)
})

test('pairing-code secrets are RLS protected and service-role-only',()=>{
  const sql=read('supabase/migrations/20260913000001_aezakmi_cloud_base.sql')
  const upgrade=read('supabase/migrations/20260913000003_pairing_code_security.sql')
  for(const text of[sql,upgrade]){
    assert.match(text,/edge_pairing_codes enable row level security/)
    assert.match(text,/revoke all on table public\.edge_pairing_codes from public, anon, authenticated/)
    assert.match(text,/grant select, ?insert, ?update, ?delete on table public\.edge_pairing_codes to service_role/)
  }
})

test('cloud replication omits local credential hashes',()=>{
  const schema=read('backend/src/db/schema.js'),outbox=read('backend/src/cloud/outbox.js')
  const cloudBlock=schema.slice(schema.indexOf('CREATE TRIGGER cloud_members_insert'),schema.indexOf('const userColumns'))
  assert.doesNotMatch(cloudBlock,/password_hash|station_token_hash/)
  assert.match(outbox,/\['password_hash'\]/)
  assert.match(outbox,/\['station_token_hash'\]/)
})

test('re-pairing queues a fresh full baseline namespace',()=>{
  const outbox=read('backend/src/cloud/outbox.js'),worker=read('backend/src/cloud/syncWorker.js')
  assert.match(outbox,/enqueueInitialCloudSnapshot\(namespace=crypto\.randomUUID\(\)\)/)
  assert.match(outbox,/baseline:\$\{namespace\}/)
  assert.match(worker,/enqueueInitialCloudSnapshot\(r\.pairedAt\|\|crypto\.randomUUID\(\)\)/)
})

test('cloud Admin actions reuse local REST business rules and valid local auth sessions',()=>{
  const api=read('backend/src/cloud/adminApi.js'),actions=read('backend/src/cloud/adminActions.js')
  assert.match(api,/127\.0\.0\.1/)
  assert.match(api,/Idempotency-Key/)
  assert.match(api,/jwt_id/)
  assert.match(api,/cloud_command_id/)
  assert.doesNotMatch(api,/client_kind/)
  assert.match(actions,/'topup\.approve':a=>\['PATCH'/)
  assert.match(actions,/'support\.resolve':a=>\['PATCH'/)
})

test('Vercel mutation retries carry idempotency from browser through Supabase',()=>{
  const browser=read('apps/admin/src/lib/api.js')+read('apps/admin/src/lib/cloudClient.js')
  const fn=read('supabase/functions/admin-api/index.ts')
  const sql=read('supabase/migrations/20260913000002_cloud_admin_idempotency.sql')
  assert.match(browser,/operationKey/)
  assert.match(fn,/idempotency_key/)
  assert.match(fn,/23505/)
  assert.match(sql,/unique index if not exists cloud_commands_idempotency_idx/)
})

test('station command lifecycle is acknowledged back to Supabase',()=>{
  const ops=read('backend/src/routes/operationsRoutes.js'),cmd=read('backend/src/cloud/commands.js')
  assert.match(ops,/command\.cloud_command_id/)
  assert.match(ops,/cloud_command\.ack/)
  assert.match(cmd,/Station command acknowledgement timed out/)
})

test('local sync remains durable and advisory licensing never shuts down the cafe',()=>{
  const worker=read('backend/src/cloud/syncWorker.js'),edge=read('supabase/functions/edge-sync/index.ts')
  assert.match(worker,/pendingCloudEvents/)
  assert.match(worker,/markCloudEventsFailed/)
  assert.match(edge,/advisoryOnly:true/)
  assert.doesNotMatch(worker,/process\.exit|shutdown|disable.*session/i)
})

test('Vercel Admin uses branch-scoped IndexedDB cache and optimistic local state',()=>{
  const data=read('apps/admin/src/context/AppDataContext.jsx'),cache=read('apps/admin/src/lib/localCache.js')
  assert.match(data,/admin:cloud:/)
  assert.match(data,/cloudBranchId\(\)/)
  assert.match(data,/optimisticState/)
  assert.match(data,/writeSnapshot/)
  assert.match(data,/setInterval\(cloudRefresh,5000\)/)
  assert.match(cache,/indexedDB/)
})

test('local Admin and Customer cache optimistic state before reconciliation',()=>{
  const a=read('apps/admin/src/context/AppDataContext.jsx'),c=read('apps/customer/src/context/AppDataContext.jsx')
  for(const s of[a,c]){assert.match(s,/optimisticState/);assert.match(s,/writeSnapshot/);assert.match(s,/\.catch\(\(error\)=>\{refresh\(\)/)}
})

test('Cloud Admin is approval-only while local Emergency Admin keeps local credentials',()=>{
  const auth=read('apps/admin/src/context/AuthContext.jsx'),login=read('apps/admin/src/components/auth/AdminLoginForm.jsx'),client=read('apps/admin/src/lib/cloudClient.js')
  assert.match(auth,/cloudSignIn/)
  assert.doesNotMatch(auth,/cloudSignUp|registerCloud/)
  assert.doesNotMatch(client,/\/auth\/v1\/signup/)
  assert.match(client,/cloudRequestBusinessAccess/)
  assert.match(login,/Request Aezakmi Cloud access/)
  assert.match(login,/BackendStatusIndicator/)
})



test('business registration requires developer approval before Auth invitation and tenant creation',()=>{
  const sql=read('supabase/migrations/20260913000004_registration_approval.sql')
  const requestFn=read('supabase/functions/request-business-access/index.ts')
  const developerFn=read('supabase/functions/developer-registrations/index.ts')
  const activateFn=read('supabase/functions/activate-registration/index.ts')
  const config=read('supabase/config.toml')
  assert.match(sql,/create table if not exists public\.platform_developers/)
  assert.match(sql,/create table if not exists public\.registration_requests/)
  assert.match(sql,/aezakmi_finalize_registration_approval/)
  assert.match(sql,/revoke all on function public\.aezakmi_create_organization\(text,text\) from public, anon, authenticated/)
  assert.doesNotMatch(requestFn,/inviteUserByEmail|organization_members/)
  assert.match(developerFn,/requireDeveloper/)
  assert.match(developerFn,/inviteUserByEmail/)
  assert.match(developerFn,/aezakmi_finalize_registration_approval/)
  assert.match(activateFn,/status:'activated'/)
  assert.match(config,/\[functions\.request-business-access\][\s\S]*verify_jwt = false/)
  assert.match(config,/\[functions\.developer-registrations\][\s\S]*verify_jwt = true/)
})

test('invitation callback is consumed before HashRouter and owner must set a password',()=>{
  const client=read('apps/admin/src/lib/cloudClient.js'),auth=read('apps/admin/src/context/AuthContext.jsx'),app=read('apps/admin/src/App.jsx'),main=read('apps/admin/src/main.jsx')
  assert.match(client,/cloudConsumeAuthCallback/)
  assert.match(client,/access_token=/)
  assert.match(client,/INVITE_SETUP_KEY/)
  assert.match(main,/cloudConsumeAuthCallback\(\)/)
  assert.match(auth,/completeCloudInvitation/)
  assert.match(auth,/cloudActivateRegistration/)
  assert.match(app,/CloudInviteSetup/)
  assert.match(app,/CloudAccessPending/)
})

test('developer console is visible only to platform developers',()=>{
  const app=read('apps/admin/src/App.jsx'),layout=read('apps/admin/src/components/layout/MainLayout.jsx'),page=read('apps/admin/src/pages/DeveloperConsolePage.jsx')
  assert.match(app,/user\.cloudDeveloper/)
  assert.match(layout,/cloudDeveloper/)
  assert.match(page,/Approve & send invite/)
  assert.match(page,/cloudDeveloperRegistrations/)
})

test('Git repository ignores secrets, runtime databases, build output and Vercel local state',()=>{
  const g=read('.gitignore')
  for(const pat of['.env','*.sqlite','node_modules/','**/dist/','.vercel/'])assert.match(g,new RegExp(pat.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
})

test('cloud admin launcher avoids direct npm.cmd spawning on modern Windows Node', () => {
  const source = read('scripts/cloud-admin.mjs')
  assert.match(source, /process\.env\.npm_execpath/)
  assert.match(source, /process\.execPath/)
  assert.doesNotMatch(source, /spawn\(npmCommand/)
  assert.doesNotMatch(source, /const npmCommand = process\.platform === ['"]win32['"] \? ['"]npm\.cmd['"]/)
})

test('Supabase Edge Functions are single-file for Docker-free API bundling',()=>{
  const functionNames=['pair-edge','edge-sync','edge-unpair','create-pairing-code','issue-command','admin-action','admin-api','update-branch-config','create-branch','revoke-edge','request-business-access','developer-registrations','activate-registration','station-admin','pair-station','station-runtime','station-api']
  assert.equal(exists('supabase/functions/_shared'),false,'shared filesystem helpers must not be required by API deployment')
  for(const name of functionNames){
    const dir=`supabase/functions/${name}`
    const index=read(`${dir}/index.ts`)
    const files=walk(dir).filter(f=>f.endsWith('.ts'))
    assert.deepEqual(files,[`${dir}/index.ts`],`${name} must deploy from index.ts alone`)
    assert.doesNotMatch(index,/from\s*['"]\.\.?\//,`${name} must not use local filesystem imports`)
    assert.match(index,/npm:@supabase\/supabase-js@2/,`${name} may only rely on remotely resolvable Supabase client import`)
  }
})


test('release readiness normalizes Windows paths before validating single-file Supabase functions', () => {
  const release = read('tools/release-readiness.mjs')
  assert.match(release, /split\(path\.sep\)\.join\(['"]\/['"]\)/)
  assert.match(release, /normalizeRel\(path\.join\(dir,e\.name\)\)/)
})

test('developer business lifecycle controls preserve local operation while enforcing Cloud suspension',()=>{
  const sql=read('supabase/migrations/20260913000005_business_lifecycle_controls.sql')
  const developer=read('supabase/functions/developer-registrations/index.ts')
  const edgeSync=read('supabase/functions/edge-sync/index.ts')
  const pairEdge=read('supabase/functions/pair-edge/index.ts')
  const adminApi=read('supabase/functions/admin-api/index.ts')
  const page=read('apps/admin/src/pages/DeveloperConsolePage.jsx')
  const client=read('apps/admin/src/lib/cloudClient.js')
  const pending=read('apps/admin/src/components/cloud/CloudAccessPending.jsx')

  assert.match(sql,/lifecycle_status text not null default 'active'/)
  assert.match(sql,/lifecycle_status in\('active','grace_period','suspended','terminated'\)/)
  assert.match(sql,/invite_cancelled/)
  assert.match(sql,/o\.lifecycle_status in\('active','grace_period'\)/)
  assert.match(sql,/using\(user_id=auth\.uid\(\)\)/)

  for(const action of['cancel_invite','resend_invite','grace_period','suspend','reactivate','terminate','delete_owner','purge_business','copy_activation_link'])assert.match(developer,new RegExp(`action===['"]${action}['"]|includes\\(action\\)`),action)
  assert.match(developer,/admin\.auth\.admin\.deleteUser/)
  assert.match(developer,/generateLink/)
  assert.match(developer,/inviteUserByEmail/)
  assert.match(developer,/resetPasswordForEmail/)
  assert.match(developer,/emailSent:true/)
  assert.match(developer,/localEdgeUnaffected:true/)
  assert.match(developer,/purgeEligibleAt:addDays\(now,30\)/)
  assert.match(developer,/Terminate the business before deleting the owner login/)

  assert.match(adminApi,/BUSINESS_SUSPENDED/)
  assert.match(pairEdge,/BUSINESS_SUSPENDED/)
  assert.doesNotMatch(edgeSync,/BUSINESS_SUSPENDED|BUSINESS_TERMINATED/)
  assert.match(edgeSync,/advisoryOnly:true/)

  assert.match(client,/organizationStatus/)
  assert.match(client,/get\("aezakmi"\) === "activate"/)
  assert.match(pending,/local café Edge and Customer Stations are not remotely shut down/)
  assert.match(page,/Cancel invite/)
  assert.match(page,/Delete owner login/)
  assert.match(page,/Permanently delete data/)
  assert.match(page,/Copy activation link/)
  assert.match(page,/Resend invite email/)
  assert.match(page,/Invitation email sent automatically/)
})


test('cloud-primary Customer Stations use the owner-generated one-time code as the permanent organization/branch/station enrollment boundary',()=>{
  const sql=read('supabase/migrations/20260913000006_cloud_primary_customer_stations.sql')
  const pair=read('supabase/functions/pair-station/index.ts')
  const station=read('apps/customer/src/lib/cloudStation.js')
  const setup=read('apps/customer/src/components/auth/StationCloudPairing.jsx')
  assert.match(sql,/create table if not exists public\.station_devices/)
  assert.match(sql,/organization_id uuid not null/)
  assert.match(sql,/branch_id uuid not null/)
  assert.match(sql,/local_station_id text not null/)
  assert.doesNotMatch(pair,/body\.ownerEmail/)
  assert.doesNotMatch(setup,/Business owner email/)
  assert.match(pair,/pairingCode/)
  assert.match(pair,/organization_id/)
  assert.match(pair,/branch_id/)
  assert.match(pair,/local_station_id/)
  assert.match(station,/organizationId/)
  assert.match(station,/branchId/)
  assert.match(station,/localStationId/)
})

test('Customer-side pairing reset revokes the Cloud station before clearing Electron credentials',()=>{
  const station=read('apps/customer/src/lib/cloudStation.js')
  const auth=read('apps/customer/src/context/AuthContext.jsx')
  const runtime=read('supabase/functions/station-runtime/index.ts')
  const pair=read('supabase/functions/pair-station/index.ts')
  assert.match(station,/export async function unpairCloudStation/)
  assert.match(station,/action:'unpair'/)
  assert.match(auth,/await unpairCloudStation\(\)/)
  assert.match(runtime,/action==='unpair'/)
  assert.match(runtime,/cloud_connection_status:'unpaired'/)
  assert.match(runtime,/status:'revoked'/)
  assert.match(pair,/Heal a stale branch pointer/)
})

test('revoked Customer Station history does not block a PC from pairing again after reset or reinstall',()=>{
  const migration=read('supabase/migrations/20260913000009_station_repairing.sql')
  const pair=read('supabase/functions/pair-station/index.ts')
  assert.match(migration,/drop constraint if exists station_devices_branch_id_local_station_id_key/)
  assert.match(migration,/create unique index station_devices_active_branch_station_uidx/)
  assert.match(migration,/where revoked_at is null/)
  assert.match(pair,/activeForStation/)
  assert.match(pair,/is\('revoked_at',null\)/)
  assert.match(pair,/existing\.data\.revoked_at/)
})

test('Customer Station uses Cloud first and opens local Socket.IO only as fallback',()=>{
  const api=read('apps/customer/src/lib/api.js')
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  const cloud=read('apps/customer/src/lib/cloudStation.js')
  assert.match(api,/cloudStationApiFetch/)
  assert.match(api,/setFallbackTransportActive\(true/)
  assert.match(data,/cloudStationTransport\(\)/)
  assert.match(data,/transport.*fallback|mode.*fallback/s)
  assert.match(cloud,/setFallbackTransportActive/)
  assert.match(cloud,/station-wakeup:/)
})

test('Cloud Admin reads branch mirrors directly and never opens Socket.IO against Vercel',()=>{
  const client=read('apps/admin/src/lib/cloudClient.js')
  const earnings=read('apps/admin/src/pages/EarningsPage.jsx')
  const notifications=read('apps/admin/src/components/admin/AdminNotificationCenter.jsx')
  assert.match(client,/cloudDirectRead/)
  assert.match(client,/branch_stations/)
  assert.match(client,/branch_members/)
  assert.match(client,/branch_rate_plans/)
  assert.match(client,/station-admin/)
  assert.match(earnings,/if \(isCloudAdmin\(\)\)/)
  assert.match(notifications,/if \(isCloudAdmin\(\)\) return undefined/)
})

test('cloud Earnings derives gross from every paid revenue event and returns wallet activity as display-only data',()=>{
  const api=read('supabase/functions/admin-api/index.ts')
  assert.match(api,/async function walletLedgerRows/)
  assert.match(api,/function earningsFromRows\(rows:any\[\],walletRows:any\[\],bounds:any\)/)
  assert.match(api,/r\.event_type!=='session_refund'/)
  assert.doesNotMatch(api,/r\.source_type!=='wallet_transaction'/)
  assert.doesNotMatch(api,/funding=walletRows\.filter/)
  assert.match(api,/net=gross-expenses/)
  assert.match(api,/walletActivity:/)
  assert.match(api,/walletFunding=n\(categories\.wallet_top_up\)\+n\(categories\.initial_wallet\)/)
  assert.match(api,/Promise\.all\(\[revenueRows\(admin,branchId,bounds\.start,bounds\.end\),walletLedgerRows\(admin,branchId,bounds\.start,bounds\.end\)\]\)/)
})

test('cloud Earnings uses Manila reporting boundaries and repairs missing paid wallet receipts once',()=>{
  const api=read('supabase/functions/admin-api/index.ts')
  assert.match(api,/timeZone:'Asia\/Manila'/)
  assert.match(api,/function manilaStartIso\(year:number,month:number,day:number\)/)
  assert.match(api,/\.gte\('occurred_at',start\)\.lt\('occurred_at',end\)/)
  assert.match(api,/function isPaidWalletReceipt\(row:any\)/)
  assert.match(api,/countedWalletReceiptLedgers/)
  assert.match(api,/ids\.find\(ledgerId=>!countedWalletReceiptLedgers\.has\(ledgerId\)\)\|\|ids\[0\]\|\|null/)
  assert.match(api,/receiptCategoryForWalletRow/)
  assert.match(api,/categories\[category\]=\(categories\[category\]\|\|0\)\+n\(row\.amount\)/)
})

test('Cloud wallet receipt trigger skips Edge-origin ledger rows and removes prior generated duplicates',()=>{
  const migration=read('supabase/migrations/20260914000023_earnings_receipt_edge_dedupe_guard.sql')
  assert.match(migration,/new\.edge_id is not null/)
  assert.match(migration,/metadata->>'authority'.*= 'edge'/)
  assert.match(migration,/delete from public\.branch_revenue_events generated/)
  assert.match(migration,/generated\.local_id = 'wallet-receipt-' \|\| w\.local_id/)
  assert.match(migration,/generated\.event_type = 'member_initial_wallet'/)
})

test('cloud member creation writes a deterministic starting-wallet receipt guard',()=>{
  const api=read('supabase/functions/admin-api/index.ts')
  assert.match(api,/local_id:`wallet-receipt-\$\{initialWalletId\}`/)
  assert.match(api,/event_type:'member_initial_wallet'/)
  assert.match(api,/source_type:'wallet_receipt'/)
  assert.match(api,/directGuard:true/)
  assert.match(api,/onConflict:'branch_id,local_id',ignoreDuplicates:true/)
})

test('cloud Earnings includes paid member prepaid sessions regardless of payment method',()=>{
  const api=read('supabase/functions/admin-api/index.ts')
  assert.doesNotMatch(api,/r\.payment_method!=='wallet'/)
  assert.doesNotMatch(api,/\!\(r\.event_type==='session_start'&&r\.member_id\)/)
})

test('Cloud Admin can generate a Customer Station pairing code for an unpaired logical PC',()=>{
  const page=read('apps/admin/src/pages/FloorMatrix.jsx')
  const fn=read('supabase/functions/station-admin/index.ts')
  assert.match(page,/Pair Customer PC/)
  assert.match(page,/cloudStationAdmin\('pairing_code'/)
  assert.doesNotMatch(page,/enter the owner email/i)
  assert.match(fn,/action==='pairing_code'/)
  assert.match(fn,/STATION_ALREADY_PAIRED/)
})

test('Customer Station live auth/session/wallet traffic is Cloud-native with local Edge fallback only',()=>{
  const cloud=read('supabase/functions/station-api/index.ts')
  const api=read('apps/customer/src/lib/api.js')
  assert.match(cloud,/aezakmi_cloud_execute/)
  assert.match(cloud,/branch_member_credentials/)
  assert.match(cloud,/branch_customer_auth_sessions/)
  assert.match(cloud,/base==='\/sessions\/start'/)
  assert.match(cloud,/base==='\/top-ups'/)
  assert.match(cloud,/base==='\/session-extensions'/)
  assert.match(api,/cloudStationApiFetch/)
  assert.match(api,/isLocalOnlyStationPath/)
  assert.match(api,/Café Edge over LAN until Cloud recovers/)
})

test('Cloud Admin management pages are Supabase-native before any Cafe Edge lookup',()=>{
  const fn=read('supabase/functions/admin-api/index.ts')
  const branding=read('apps/admin/src/hooks/useBranding.js')
  const settings=read('apps/admin/src/pages/SettingsPage.jsx')
  const nativeIndex=fn.indexOf('const native=await cloudNative')
  const edgeIndex=fn.indexOf("admin.from('edge_servers')",nativeIndex)
  assert.ok(nativeIndex>=0&&edgeIndex>nativeIndex,'cloud-native routing must run before Edge lookup')
  for(const marker of ["route==='/settings'","route==='/branding/logo'","route==='/rate-plans'","route==='/analytics'","route==='/earnings'","route==='/expenses'","route==='/announcements'","route==='/members'"]){
    assert.match(fn,new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')))
  }
  assert.match(fn,/refreshManagedConfig/)
  assert.match(branding,/isCloudAdmin\(\)[\s\S]{0,120}String\(raw\.logoUrl\)/)
  assert.match(settings,/Customer Stations are cloud-primary/)
  assert.doesNotMatch(settings,/Customer Stations connect only to the local Edge/)
})


test('Cloud transaction engine owns online money/time/session mutations atomically',()=>{
  const sql=read('supabase/migrations/20260913000007_cloud_transaction_engine.sql')
  const admin=read('supabase/functions/admin-api/index.ts')
  for(const marker of ['branch_member_credentials','branch_customer_auth_sessions','cloud_operation_receipts','aezakmi_cloud_execute','branch_wallet_operation_idx','branch_sessions_active_pc_idx','branch_sessions_active_member_idx']) assert.match(sql,new RegExp(marker))
  for(const action of ['session.start','session.end','session.refund','wallet.set','wallet.adjust','wallet.transfer','topup.request','topup.approve','topup.reject','extension.request','extension.confirm','extension.reject','session.topup','session.time_adjust','session.time_transfer','session.pause_pc','session.resume_pc','session.heartbeat']) assert.ok(sql.includes(action),action)
  const nativeCall=admin.indexOf('const native=await cloudNative')
  const edgeIndex=admin.indexOf("admin.from('edge_servers')",nativeCall)
  assert.ok(nativeCall>=0&&edgeIndex>nativeCall,'live Cloud transactions must route before Edge lookup')
})

test('Cloud migration explicitly replaces the legacy integer Edge ingest RPC before changing it to JSONB',()=>{
  const base=read('supabase/migrations/20260913000001_aezakmi_cloud_base.sql')
  const upgrade=read('supabase/migrations/20260913000007_cloud_transaction_engine.sql')
  assert.match(base,/aezakmi_ingest_edge_events\(p_edge_id uuid,p_events jsonb\) returns integer/)
  const dropIndex=upgrade.indexOf('drop function if exists public.aezakmi_ingest_edge_events(uuid,jsonb);')
  const createIndex=upgrade.indexOf('create function public.aezakmi_ingest_edge_events(p_edge_id uuid,p_events jsonb)')
  assert.ok(dropIndex>=0&&createIndex>dropIndex,'legacy RETURNS integer RPC must be dropped before creating the RETURNS jsonb replacement')
  assert.match(upgrade.slice(createIndex,createIndex+180),/returns jsonb/)
})

test('Cafe Edge reconciliation is authority-aware and Cloud snapshots do not loop back',()=>{
  const sql=read('supabase/migrations/20260913000007_cloud_transaction_engine.sql')
  const outbox=read('backend/src/cloud/outbox.js')
  const apply=read('backend/src/cloud/configApply.js')
  const sync=read('backend/src/cloud/syncWorker.js')
  assert.match(sql,/authority='mirror'/)
  assert.match(sql,/authority='bootstrap'/)
  assert.match(sql,/authority='edge'/)
  assert.match(sql,/_cloudBaseSyncAt/)
  assert.match(sql,/WALLET_CONFLICT/)
  assert.match(sql,/SESSION_CONFLICT/)
  assert.match(sql,/processedEventIds/)
  assert.match(sql,/conflicts/)
  assert.match(outbox,/_authority:'bootstrap'/)
  assert.match(outbox,/baseline\?'bootstrap':'edge'/)
  assert.match(outbox,/_cloudBaseSyncAt/)
  assert.match(apply,/cloud_apply_in_progress/)
  assert.match(apply,/applyCloudRuntime/)
  assert.match(sync,/applyCloudRuntime/)
  assert.match(sync,/cloud_runtime_cursor/)
  assert.match(sync,/cloud_last_conflicts/)
})

test('Edge runtime mirror preserves Cloud member and station sessions for seamless offline fallback',()=>{
  const schema=read('backend/src/db/schema.js')
  const middleware=read('backend/src/middleware/auth.js')
  const auth=read('backend/src/routes/authRoutes.js')
  const edgeSync=read('supabase/functions/edge-sync/index.ts')
  const customerApi=read('apps/customer/src/lib/api.js')
  const runtime=read('apps/customer/src/lib/cloudStation.js')
  assert.match(schema,/cloud_member_credentials/)
  assert.match(schema,/cloud_customer_auth_sessions/)
  assert.match(middleware,/cloudFallbackAuth/)
  assert.match(middleware,/cloud_customer_auth_sessions/)
  assert.match(auth,/verifyCloudMemberPassword/)
  assert.match(auth,/member_credential\.upsert/)
  assert.match(edgeSync,/branch_member_credentials/)
  assert.match(edgeSync,/branch_customer_auth_sessions/)
  assert.match(edgeSync,/device_token_hash/)
  assert.match(customerApi,/getCloudStationCredential\(\)\?\.stationToken/)
  assert.match(runtime,/localIp/)
})

test('Admin and Customer no longer require Cafe Edge for normal online live session and wallet operations',()=>{
  const admin=read('supabase/functions/admin-api/index.ts')
  const station=read('supabase/functions/station-api/index.ts')
  for(const marker of ["route==='/sessions/start'","'session.end'","'session.refund'","'wallet.set'","'wallet.adjust'","'wallet.transfer'","'session.topup'","'session.time_adjust'","'session.time_transfer'","'topup.request'","'extension.request'"]) assert.ok(admin.includes(marker),marker)
  assert.match(station,/cloudExecute\(admin,station,'session\.start'/)
  assert.match(station,/cloudExecute\(admin,station,'topup\.request'/)
  assert.match(station,/cloudExecute\(admin,station,'extension\.request'/)
  assert.doesNotMatch(station,/EDGE_REQUIRED/)
})
