import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8')

test('promo validation uses its local Cloud promo window instead of an out-of-scope transaction label',()=>{
  const sql=read('supabase/migrations/20260913000007_cloud_transaction_engine.sql')
  assert.match(sql,/promo_window_start timestamptz; promo_window_end timestamptz/)
  assert.match(sql,/r\.window_start=promo_window_start/)
  assert.doesNotMatch(sql,/cloud_tx\.window_start/)
  assert.doesNotMatch(sql,/cloud_tx\.window_end/)
})

test('Cloud transaction migration repairs legacy duplicate active sessions before adding uniqueness indexes',()=>{
  const sql=read('supabase/migrations/20260913000007_cloud_transaction_engine.sql')
  const repair=sql.indexOf('Repair legacy duplicate active rows')
  const index=sql.indexOf('create unique index if not exists branch_sessions_active_pc_idx')
  assert.ok(repair>=0 && index>repair)
  assert.match(sql,/row_number\(\) over\(partition by branch_id,pc_id/)
  assert.match(sql,/row_number\(\) over\(partition by branch_id,member_id/)
})

test('Edge reconciliation turns active-session uniqueness collisions into conflicts instead of aborting the sync batch',()=>{
  const sql=read('supabase/migrations/20260913000007_cloud_transaction_engine.sql')
  assert.match(sql,/ACTIVE_SESSION_CONFLICT/)
  assert.match(sql,/s\.status='active' and s\.local_id<>payload->>'id'/)
})

test('Cloud Customer accepts the PATCH compatibility acknowledgement emitted by the current renderer',()=>{
  const station=read('supabase/functions/station-api/index.ts')
  const customer=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(customer,/apiPatch\(`\/public\/remote-commands\/\$\{payload\.id\}`/)
  assert.match(station,/\(method==='POST'\|\|method==='PATCH'\).*public\\\/remote-commands/)
})

test('Cloud Admin support requests are read from Supabase and resolved without Café Edge',()=>{
  const client=read('apps/admin/src/lib/cloudClient.js')
  const api=read('supabase/functions/admin-api/index.ts')
  assert.match(client,/branch_support_requests\?select=\*&branch_id=eq\./)
  assert.doesNotMatch(client,/route === "\/support"\) return \{ success:true, supportRequests:\[\] \}/)
  assert.match(api,/supportResolve=route\.match\(\/\^\\\/support\\\/\(\[\^\/\]\+\)\\\/resolve\$\//)
  assert.match(api,/from\('branch_support_requests'\)\.update\(\{status:'resolved'/)
})

test('Cloud Admin feedback honors archived/status pagination and keeps legacy UI field aliases',()=>{
  const client=read('apps/admin/src/lib/cloudClient.js')
  assert.match(client,/url\.searchParams\.get\("archived"\) === "1"/)
  assert.match(client,/customer_name:/)
  assert.match(client,/pc_label:/)
  assert.match(client,/created_at:/)
  assert.match(client,/pagination:\{page,limit,total,pages:/)
})

test('Cloud top-up view preserves the customer GCash number stored by the Cloud transaction engine',()=>{
  const client=read('apps/admin/src/lib/cloudClient.js')
  assert.match(client,/gcashNumber: data\.gcashNumber \|\| data\.refNo \|\| null/)
})

test('Cloud transaction PL/pgSQL keeps every IF structurally closed',()=>{
  const sql=read('supabase/migrations/20260913000007_cloud_transaction_engine.sql')
  const marker='create or replace function public.aezakmi_cloud_execute('
  const start=sql.indexOf(marker)
  assert.ok(start>=0,'cloud transaction function is missing')
  const bodyStart=sql.indexOf('as $$',start)
  const bodyEnd=sql.indexOf('end$$;',bodyStart)
  assert.ok(bodyStart>=0 && bodyEnd>bodyStart,'cloud transaction function body is incomplete')
  let body=sql.slice(bodyStart+5,bodyEnd)
    .replace(/--.*$/gm,'')
    .replace(/'(?:''|[^'])*'/g,"''")
  const endIfCount=(body.match(/\bend\s+if\b/gi)||[]).length
  const allIfCount=(body.match(/\bif\b/gi)||[]).length
  const openingIfCount=allIfCount-endIfCount
  assert.equal(openingIfCount,endIfCount,'unbalanced IF / END IF in aezakmi_cloud_execute()')
})

test('Cloud transaction migration does not contain known whitespace-corrupted PL/pgSQL tokens',()=>{
  const sql=read('supabase/migrations/20260913000007_cloud_transaction_engine.sql')
  assert.doesNotMatch(sql,/\b(?:endif|thenreturn|andstatus|nullthen|p_branch_idand|pauseswhere|tswhere|setwallet_balance)\b/i)
})
