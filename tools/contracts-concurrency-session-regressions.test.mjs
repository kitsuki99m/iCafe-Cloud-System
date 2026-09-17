import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')

function normalizeRoute(p){
  return p.replace(/\$\{[^}]+\}/g,':param').replace(/:[^/]+/g,':param').split('?')[0]
}
function pathMatches(front, back){
  const a=normalizeRoute(front).split('/').filter(Boolean)
  const b=normalizeRoute(back).split('/').filter(Boolean)
  return a.length===b.length && a.every((seg,i)=>seg===b[i] || seg===':param' || b[i]===':param')
}

test('every literal frontend API call has a backend route with the same HTTP method',()=>{
  const calls=[]
  for(const app of ['admin','customer']){
    const src=path.join(root,'apps',app,'src')
    const walk=(dir)=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)])
    for(const file of walk(src).filter(f=>/\.(jsx?|mjs)$/.test(f))){
      const text=fs.readFileSync(file,'utf8')
      for(const m of text.matchAll(/api(Get|Post|Put|Patch|Delete)\(\s*([`'"])(\/[^`'"]*)\2/g)){
        calls.push({method:m[1].toUpperCase(),path:m[3],file:path.relative(root,file)})
      }
    }
  }
  const routes=[]
  for(const file of ['backend/src/routes/authRoutes.js','backend/src/routes/apiRoutes.js','backend/src/routes/operationsRoutes.js','backend/src/routes/cloudRoutes.js']){
    const text=read(file)
    const prefix=file.endsWith('authRoutes.js')?'/auth':''
    for(const m of text.matchAll(/router\.(get|post|put|patch|delete)\(\s*(["'])(\/[^"']*)\2/g)) routes.push({method:m[1].toUpperCase(),path:prefix+m[3]})
  }
  const cloudOnlyRoutes=new Set(['GET /app-data'])
  const missing=calls.filter(c=>!cloudOnlyRoutes.has(`${c.method} ${normalizeRoute(c.path)}`)&&!routes.some(r=>r.method===c.method&&pathMatches(c.path,r.path)))
  assert.deepEqual(missing,[])
})

test('runtime role contract supports cashier role with restricted permissions',()=>{
  const auth = read('backend/src/routes/authRoutes.js')
  const api = read('backend/src/routes/apiRoutes.js')
  assert.match(auth, /cashier/)
  assert.match(api, /requireAdmin/)
  assert.match(api, /requireStaff/)
})

test('guest Extend Time uses a paired public session-extension endpoint and staff can approve/reject it',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(api,/router\.post\("\/public\/session-extensions"/)
  assert.match(api,/\/session-extensions\/:id\/reject/)
  assert.match(customer,/user\?\.role\s*===\s*['"]guest['"].*\/public\/session-extensions/s)
  assert.match(admin,/sessionExtensions/)
  assert.match(admin,/confirmSessionExtension/)
  assert.match(admin,/rejectSessionExtension/)
})

test('session extension realtime contract reaches staff plus the owning member or PC',()=>{
  const realtime=read('backend/src/realtime.js')
  const api=read('backend/src/routes/apiRoutes.js')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  const admin=read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(realtime,/emitSessionExtensionRequest/)
  assert.match(realtime,/emitSessionExtensionUpdated/)
  assert.match(api,/emitSessionExtensionRequest/)
  assert.match(api,/emitSessionExtensionUpdated/)
  assert.match(customer,/extension:updated/)
  assert.match(admin,/extension:new_request/)
  assert.match(admin,/extension:updated/)
})

test('write transactions acquire an IMMEDIATE SQLite lock before read-modify-write work',()=>{
  const connection=read('backend/src/db/connection.js')
  assert.match(connection,/tx\.immediate\(\)/)
})

test('only one pending transfer request can exist per session at database level',()=>{
  const schema=read('backend/src/db/schema.js')
  assert.match(schema,/CREATE UNIQUE INDEX IF NOT EXISTS idx_transfer_requests_one_pending[\s\S]*WHERE status='pending'/)
})

test('top-up approve and reject use conditional pending-state transitions',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(api,/UPDATE top_up_requests SET status=.*WHERE id=\? AND status='pending'/s)
  assert.match(api,/TOPUP_STATE_CONFLICT/)
})

test('GCash extension payments are linked to the exact extension id instead of member+amount guessing',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(api,/`EXT-\$\{extId\}`/)
  assert.match(api,/WHERE reference=\?/)
  assert.doesNotMatch(api,/SELECT id FROM payments WHERE member_id=\? AND amount=\? AND status='pending'/)
})

test('station disconnect releases active sessions after a grace period and never auto-resumes a logged-out station',()=>{
  const server=read('backend/src/server.js')
  assert.match(server,/STATION_DISCONNECT_GRACE_MS = 10000/)
  assert.match(server,/releaseStationSession\(pcId,\{reason:'station_disconnect',at:disconnectedAt,markAvailable:false\}\)/)
  assert.match(server,/UPDATE auth_sessions SET revoked_at=/)
  assert.doesNotMatch(server,/resumeActiveSession\(presencePcId/)
})

test('prepaid extensions share pause-aware backend accounting instead of anchoring to wall clock',()=>{
  const util=read('backend/src/utils/sessionTime.js')
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(util,/export function extendPrepaidSession/)
  assert.ok((api.match(/extendPrepaidSession\(/g)||[]).length>=3)
  assert.doesNotMatch(api,/Math\.max\(currentExpires, Date\.now\(\)\) \+ .*minutes/s)
})

test('session API views expose authoritative remaining and elapsed snapshots',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(api,/remainingSeconds:\s*remainingSecondsForSession\(active\)/)
  assert.match(api,/billableSeconds:\s*elapsedBillableSeconds\(session\)/)
  assert.match(api,/observedAt:\s*Date\.now\(\)/)
})

test('admin and customer renderers use the shared snapshot timer model instead of bespoke countdown math',()=>{
  const adminTime=read('apps/admin/src/lib/sessionTime.js')
  const customerTime=read('apps/customer/src/lib/sessionTime.js')
  const card=read('apps/admin/src/components/floor/PcCard.jsx')
  const view=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(adminTime,/session\.remainingSeconds/)
  assert.equal(customerTime,adminTime)
  assert.match(card,/remainingSessionSeconds/)
  assert.match(card,/elapsedSessionSeconds/)
  assert.match(view,/remainingSessionSeconds/)
  assert.match(view,/elapsedSessionSeconds/)
})

test('session extension records retain the selected rate plan and promo redemption uses that plan',()=>{
  const schema=read('backend/src/db/schema.js')
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(schema,/session_extensions[\s\S]*rate_plan_id TEXT/)
  assert.match(api,/ext\.rate_plan_id[\s\S]*SELECT \* FROM rate_plans WHERE id=\?/)
  const extensionStart=api.indexOf('router.post("/session-extensions", auth')
  const walletStart=api.indexOf('if (paymentMethod === "wallet")',extensionStart)
  const walletEnd=api.indexOf('return res.status(201)',walletStart)
  const walletSection=api.slice(walletStart,walletEnd)
  assert.match(walletSection,/recordPromoRedemption\(\{ plan,/)
  assert.match(walletSection,/ratePlanId: plan\.id/)
})

test('session expiry revalidates the candidate after acquiring the write transaction',()=>{
  const server=read('backend/src/server.js')
  const start=server.indexOf('function cleanupExpiredComputerSessions')
  const end=server.indexOf('cleanupExpiredComputerSessions()',start + 'function cleanupExpiredComputerSessions'.length)
  const section=server.slice(start,end)
  assert.match(section,/transaction\(\(\) =>/)
  assert.match(section,/Revalidate after obtaining the IMMEDIATE write lock/)
  assert.match(section,/WHERE id=\? AND status='active' AND expires_at IS NOT NULL AND expires_at<=\?/)
})

test('pending authenticated GCash extensions create the extension and payment atomically',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  const start=api.indexOf('router.post("/session-extensions", auth')
  const end=api.indexOf('router.get("/session-extensions"',start)
  const section=api.slice(start,end)
  const pending=section.slice(section.lastIndexOf('const extId = id();'))
  assert.match(pending,/const requestedAt = nowIso\(\);[\s\S]*transaction\(\(\) => \{[\s\S]*INSERT INTO session_extensions[\s\S]*INSERT INTO payments/)
})

test('public transfer requests require station pairing and transfer decisions are conditional',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  const start=api.indexOf("router.post('/public/transfer-requests'")
  const end=api.indexOf("router.get('/promos/",start)
  const section=api.slice(start,end)
  assert.match(section,/stationAuthenticated/)
  assert.match(section,/transaction\(\(\)=>/)
  assert.match(section,/WHERE id=\? AND status='pending'/)
})

test('admin customer-request center exposes pending session-extension approval controls',()=>{
  const center=read('apps/admin/src/components/admin/AdminNotificationCenter.jsx')
  assert.match(center,/sessionExtensions/)
  assert.match(center,/confirmSessionExtension/)
  assert.match(center,/rejectSessionExtension/)
  assert.match(center,/SessionExtensionRow/)
})

test('route read-modify-write operations use the shared IMMEDIATE transaction wrapper',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  const operations=read('backend/src/routes/operationsRoutes.js','backend/src/routes/cloudRoutes.js')
  assert.doesNotMatch(api,/\bdb\.transaction\(/)
  assert.doesNotMatch(operations,/\bdb\.transaction\(/)
})
