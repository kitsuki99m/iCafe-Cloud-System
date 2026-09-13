import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root=process.cwd()
const read=(file)=>readFileSync(resolve(root,file),'utf8')

test('Guest prepaid logout with remaining time requires destructive confirmation',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(page,/isGuest && hasActiveSession && session\?\.billing === "prepaid" && Number\(remainingSeconds \|\| 0\) > 0/)
  assert.match(page,/title="Forfeit remaining session time\?"/)
  assert.match(page,/Forfeit & Log Out/)
  assert.match(page,/Keep Session/)
  assert.match(page,/This cannot be undone\./)
})

test('Confirmed Guest logout forfeits authoritative remaining time before clearing Guest identity',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(page,/await endSession\(activePc, \{ disposition: "forfeit" \}\)/)
  assert.match(page,/await logout\(\{ reason: "guest_forfeit_logout" \}\)/)
  assert.match(data,/function endSession\(pc, options = \{\}\)/)
  assert.match(data,/apiPost\(path, \{ disposition \}\)/)
})

test('Both local Edge and Cloud Guest end paths accept forfeit and preserve Guest-only authority',()=>{
  const edge=read('backend/src/routes/apiRoutes.js')
  const cloud=read('supabase/functions/station-api/index.ts')
  const sql=read('supabase/migrations/20260913000010_wallet_customer_self_start.sql')
  assert.match(edge,/\["save", "forfeit"\]\.includes\(disposition\)/)
  assert.match(edge,/disposition === "forfeit"[\s\S]*saved_remaining_seconds=0/)
  assert.match(cloud,/publicEndMatch&&\(s\.member_id!==null\|\|String\(s\.billing_type\|\|''\)\.toLowerCase\(\)!=='prepaid'\)/)
  assert.match(cloud,/disposition:requestBody\?\.disposition\|\|'save'/)
  assert.match(sql,/elsif disposition='forfeit' then remaining:=0/)
})
