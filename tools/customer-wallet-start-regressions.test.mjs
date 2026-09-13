import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=p=>fs.readFileSync(path.join(root,p),'utf8')

test('Customer normalizes mirrored snake_case rate plans for wallet-funded starts',()=>{
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(data,/customerSelfService:normalizeBoolean\(plan\.customerSelfService \?\? plan\.customer_self_service/)
  assert.match(data,/isActive:normalizeBoolean\(plan\.isActive \?\? plan\.is_active, true\)/)
  assert.match(data,/pesoUnit:nullableNumber\(plan\.pesoUnit \?\? plan\.peso_unit\)/)
  assert.match(data,/minutesPerUnit:nullableNumber\(plan\.minutesPerUnit \?\? plan\.minutes_per_unit\)/)
})

test('Cloud station API returns canonical rate plans and treats a connected non-maintenance station as available',()=>{
  const station=read('supabase/functions/station-api/index.ts')
  assert.match(station,/function canonicalRatePlan/)
  assert.match(station,/customerSelfService:b\(p\.customerSelfService\?\?p\.customer_self_service,false\)/)
  assert.match(station,/map\(\(r:any\)=>canonicalRatePlan\(r\.data,r\.local_id\)\)/)
  assert.match(station,/persistedStatus==='maintenance'\?'maintenance':'available'/)
})

test('Customer Start Session remains wallet-enabled with zero saved time when an eligible self-service rate exists',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(page,/hasPurchasableSelfServiceRate = selfServicePlans\.length > 0/)
  assert.match(page,/canResumeSavedTime \|\| wallet > 0/)
  assert.match(page,/wallet > 0 && hasPurchasableSelfServiceRate/)
  assert.match(page,/Your wallet is available\. Open Start Session to choose a customer rate/)
  const modal=read('apps/customer/src/components/customer/StartSessionModal.jsx')
  assert.match(modal,/amount <= wallet/)
  assert.match(modal,/startSelfServiceSession\(pc\.id, memberId, hasSavedTime \? null : ratePlanId, hasSavedTime \? null : amount/)
})

test('Cloud Customer start ignores stale Edge offline state but server-side blocks maintenance',()=>{
  const station=read('supabase/functions/station-api/index.ts')
  assert.match(station,/persistedStatus==='maintenance'\?'maintenance':'available'/)
  assert.match(station,/String\(pcState\?\.status\|\|'available'\)\.toLowerCase\(\)==='maintenance'/)
  assert.doesNotMatch(station,/pcState\?\.status[^\n]{0,120}==='offline'[^\n]{0,120}throw/)
})
