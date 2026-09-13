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

test('Customer Electron never imports or calls Supabase directly',()=>{
  const text=walk('apps/customer').filter(f=>/\.(js|jsx|cjs|mjs)$/.test(f)).map(read).join('\n')
  assert.doesNotMatch(text,/@supabase\/supabase-js|supabase\.co|VITE_SUPABASE/)
})

test('Edge stores only public Supabase configuration and revocable device credentials',()=>{
  const env=read('backend/.env.example'),client=read('backend/src/cloud/client.js'),store=read('backend/src/cloud/store.js')
  assert.match(env,/AEZAKMI_SUPABASE_PUBLISHABLE_KEY/)
  assert.doesNotMatch(env,/SUPABASE_SECRET|SUPABASE_SERVICE_ROLE|sb_secret_/)
  assert.match(client,/x-aezakmi-edge-token/)
  assert.match(store,/edge_token/)
})

test('all required Supabase functions exist',()=>{
  for(const n of['pair-edge','edge-sync','edge-unpair','create-pairing-code','issue-command','admin-action','admin-api','update-branch-config','create-branch','revoke-edge','request-business-access','developer-registrations','activate-registration'])assert.ok(exists(`supabase/functions/${n}/index.ts`),n)
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
  assert.match(page,/Approve & invite/)
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
  const functionNames=['pair-edge','edge-sync','edge-unpair','create-pairing-code','issue-command','admin-action','admin-api','update-branch-config','create-branch','revoke-edge','request-business-access','developer-registrations','activate-registration']
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
