import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(path,'utf8')

test('Admin session start UI exposes prepaid only and reservation check-in is prepaid',()=>{
  const modal=read('apps/admin/src/components/floor/SessionModal.jsx')
  assert.doesNotMatch(modal,/setBilling\(['"]postpaid['"]\)/)
  assert.doesNotMatch(modal,/Billing Type/)
  assert.match(modal,/This production build uses prepaid billing only/)
  assert.match(modal,/billing: 'prepaid'/)
  assert.match(modal,/Check In & Start Prepaid/)
})

test('Admin settings and rates no longer expose Postpaid controls',()=>{
  const settings=read('apps/admin/src/pages/SettingsPage.jsx')
  const tariffs=read('apps/admin/src/pages/TariffsPage.jsx')
  assert.match(settings,/Prepaid only/)
  assert.doesNotMatch(settings,/<option value="postpaid">/)
  assert.match(tariffs,/Prepaid only/)
  assert.doesNotMatch(tariffs,/policyModal === "postpaid"/)
  assert.doesNotMatch(tariffs,/>Postpaid Rate</)
})

test('Café Edge rejects all new non-prepaid session starts and postpaid configuration',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(api,/String\(billing\)\.toLowerCase\(\) !== "prepaid"[\s\S]*POSTPAID_DISABLED/)
  assert.match(api,/"\/billing-policy\/postpaid-rate"[\s\S]*POSTPAID_DISABLED/)
  assert.match(api,/const effectiveBilling = "prepaid"/)
  assert.match(api,/out\.defaultBilling = 'prepaid'/)
  assert.match(api,/out\.postpaidMinutesPerPeso = 0/)
})

test('Cloud Admin rejects Postpaid creation while Customer self-start remains forced prepaid',()=>{
  const admin=read('supabase/functions/admin-api/index.ts')
  const station=read('supabase/functions/station-api/index.ts')
  const action=read('supabase/functions/admin-action/index.ts')
  assert.match(admin,/route==='\/sessions\/start'[\s\S]*POSTPAID_DISABLED/)
  assert.match(admin,/billing:'prepaid'/)
  assert.match(admin,/route==='\/billing-policy\/postpaid-rate'[\s\S]*POSTPAID_DISABLED/)
  assert.match(station,/base==='\/sessions\/start'[\s\S]*billing:'prepaid'/)
  assert.match(station,/rawSettings[\s\S]*defaultBilling:'prepaid',postpaidMinutesPerPeso:0/)
  assert.match(action,/action==='billing\.session'[\s\S]*POSTPAID_DISABLED/)
  assert.match(action,/action==='settings\.update'[\s\S]*POSTPAID_DISABLED/)
  assert.doesNotMatch(action,/billing\.postpaid_rate/)
})

test('Legacy settlement/read code remains available only to close historical records safely',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  const cloud=read('supabase/functions/admin-api/index.ts')
  assert.match(api,/settle-interrupted/)
  assert.match(api,/postpaid_settlement/)
  assert.match(cloud,/settle-interrupted/)
})
