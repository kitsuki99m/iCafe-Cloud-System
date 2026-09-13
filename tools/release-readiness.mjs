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
  'supabase/config.toml','supabase/migrations/20260913000001_aezakmi_cloud_base.sql',
  'supabase/migrations/20260913000002_cloud_admin_idempotency.sql',
  'supabase/migrations/20260913000003_pairing_code_security.sql',
  'supabase/migrations/20260913000004_registration_approval.sql',
  'supabase/functions/admin-api/index.ts',
  'supabase/functions/edge-sync/index.ts',
  'supabase/functions/request-business-access/index.ts',
  'supabase/functions/developer-registrations/index.ts',
  'supabase/functions/activate-registration/index.ts',
  'docs/DEPLOYMENT_SUPABASE_VERCEL.md','docs/DEVELOPER_APPROVAL_SETUP.md'
]
for(const p of required)check(exists(p),`Missing required release file: ${p}`)
check(!exists('apps/cloud'),'Legacy apps/cloud must be removed; apps/admin is the single Admin codebase.')
check(!exists('render.yaml'),'Render configuration must not be present.')
check(!exists('services/cloud-api'),'Legacy Render cloud API must not be present.')
check(!exists('supabase/functions/_shared'),'Supabase functions must be single-file for Docker-free API deployment.')
for(const name of ['pair-edge','edge-sync','edge-unpair','create-pairing-code','issue-command','admin-action','admin-api','update-branch-config','create-branch','revoke-edge','request-business-access','developer-registrations','activate-registration']){
  const dir=`supabase/functions/${name}`
  const tsFiles=walk(dir).filter(p=>p.endsWith('.ts'))
  check(tsFiles.length===1&&tsFiles[0]===`${dir}/index.ts`,`${name} must contain only index.ts for API bundling.`)
  if(exists(`${dir}/index.ts`))check(!/from\s*['"]\.\.?\//.test(read(`${dir}/index.ts`)),`${name} must not import local filesystem modules.`)
}

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
check(!/@supabase\/supabase-js|supabase\.co|VITE_SUPABASE/.test(customerText),'Customer Electron must never connect directly to Supabase.')
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
