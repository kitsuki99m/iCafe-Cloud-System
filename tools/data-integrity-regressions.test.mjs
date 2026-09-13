import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (p) => fs.readFileSync(path.join(root,p),'utf8')

function backendRoutes() {
  const files=['backend/src/routes/apiRoutes.js','backend/src/routes/authRoutes.js','backend/src/routes/operationsRoutes.js','backend/src/routes/cloudRoutes.js']
  const rows=[]
  for(const file of files){
    const src=read(file), prefix=file.endsWith('authRoutes.js')?'/auth':''
    const re=/router\.(get|post|patch|put|delete)\s*\(\s*(['"])(.*?)\2/gs
    for(const m of src.matchAll(re)) rows.push([m[1].toUpperCase(),prefix+m[3]])
  }
  return rows
}
function frontendCalls(){
  const rows=[]
  for(const base of ['apps/admin/src','apps/customer/src']){
    const walk=(dir)=>{for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory())walk(p);else if(/\.(js|jsx)$/.test(ent.name)){const src=fs.readFileSync(p,'utf8');const re=/\b(apiGet|apiPost|apiPatch|apiPut|apiDelete)\(\s*([`'"])(.*?)\2/gs;for(const m of src.matchAll(re)){rows.push([{apiGet:'GET',apiPost:'POST',apiPatch:'PATCH',apiPut:'PUT',apiDelete:'DELETE'}[m[1]],m[3].replace(/\n/g,' ')])}}}}
    walk(path.join(root,base))
  }
  return rows
}
function routeMatches(front,back){
  const clean=(v)=>v.replace(/\$\{[^}]+\}/g,':x').replace(/\?.*$/,'').split('/').filter(Boolean)
  const a=clean(front),b=clean(back);if(a.length!==b.length)return false
  return a.every((part,i)=>b[i].startsWith(':')||part===b[i]||(part===':x'&&b[i].startsWith(':')))
}

test('every frontend API method/path has a matching backend route',()=>{
  const routes=backendRoutes(), missing=frontendCalls().filter(([method,p])=>!routes.some(([m,r])=>m===method&&routeMatches(p,r)))
  assert.deepEqual(missing,[])
})

test('backend idempotency protects PUT mutations as well as POST/PATCH/DELETE',()=>{
  assert.match(read('backend/src/middleware/idempotency.js'),/\['POST','PATCH','PUT','DELETE'\]\.includes\(req\.method\)/)
})

test('authenticated GCash top-ups enforce the same 09xxxxxxxxx contract as public top-ups',()=>{
  const src=read('backend/src/routes/apiRoutes.js')
  const start=src.indexOf('router.post("/top-ups"')
  const end=src.indexOf('router.patch(',start)
  const section=src.slice(start,end)
  assert.match(section,/\^09\\d\{9\}\$/)
})

test('admin listens only to the canonical support request socket event',()=>{
  const src=read('apps/admin/src/context/AppDataContext.jsx')
  assert.doesNotMatch(src,/support:new['"]/)
  assert.match(src,/support:new_request/)
})

test('session extension confirmations publish pcId so the owning station room receives the event',()=>{
  const src=read('backend/src/routes/apiRoutes.js')
  const start=src.indexOf('"/session-extensions/:id/confirm"')
  const end=src.indexOf("router.get('/transfer-requests'",start)
  assert.match(src.slice(start,end),/pcId:\s*result\.pc_id/)
})

test('member session-time transfers publish pcId for both active source and destination sessions',()=>{
  const src=read('backend/src/routes/apiRoutes.js')
  const start=src.indexOf('"/members/:id/session-time-transfers"')
  const end=src.indexOf('router.get("/rate-plans"',start)
  const section=src.slice(start,end)
  assert.match(section,/sourcePcId/)
  assert.match(section,/destinationPcId/)
  assert.match(section,/pcId:\s*result\.sourcePcId/)
  assert.match(section,/pcId:\s*result\.destinationPcId/)
})

test('station disconnect checkpoints members and guests, revokes station auth, and requires a fresh login after reconnect',()=>{
  const src=read('backend/src/server.js')
  assert.match(src,/releaseStationSession\(pcId,\{reason:'station_disconnect',at:disconnectedAt,markAvailable:false\}\)/)
  assert.match(src,/end_reason=COALESCE\(end_reason,'station_disconnect'\)/)
  assert.match(src,/status='offline'/)
  assert.doesNotMatch(src,/reason:'station_offline'/)
})

test('prepaid extensions use the shared pause-aware session extension helper',()=>{
  const util=read('backend/src/utils/sessionTime.js')
  assert.match(util,/export function extendPrepaidSession/)
  assert.match(util,/activeSessionPause\(session\.id\)/)
  const routes=read('backend/src/routes/apiRoutes.js')
  assert.ok((routes.match(/extendPrepaidSession\(/g)||[]).length>=3)
})

test('SQLite constraint races surface as 409 data conflicts instead of internal errors',()=>{
  const src=read('backend/src/middleware/errorHandler.js')
  assert.match(src,/SQLITE_CONSTRAINT/)
  assert.match(src,/DATA_CONFLICT/)
})
