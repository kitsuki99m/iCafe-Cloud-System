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

test('Customer Start Session appears from wallet credit and offers preset/custom wallet spend',()=>{
  const page=read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(page,/stationCanAttemptStart/)
  assert.match(page,/canResumeSavedTime \|\| wallet > 0/)
  assert.doesNotMatch(page,/pc\?\.status === "available"/)
  assert.match(page,/choose a preset amount or enter a custom amount/)
  assert.match(page,/ratePlans=\{walletStartPlans\}/)
  const modal=read('apps/customer/src/components/customer/StartSessionModal.jsx')
  assert.match(modal,/function startPresets\(plan, wallet\)/)
  assert.match(modal,/Custom amount/)
  assert.match(modal,/amount <= wallet/)
  assert.match(modal,/eligibleWalletStartPlans/)
  assert.match(modal,/startSelfServiceSession\(pc\.id, memberId, hasSavedTime \? null : ratePlanId, hasSavedTime \? null : amount/)
})

test('Wallet-funded start ignores Add Time self-service toggle but preserves extension gating',()=>{
  const rates=read('apps/customer/src/lib/rates.js')
  assert.match(rates,/function eligibleWalletStartPlans/)
  assert.doesNotMatch(rates,/eligibleWalletStartPlans[\s\S]{0,600}customerSelfService/)
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(api,/walletStartEligible: walletStartEligibility\.eligible/)
  assert.match(api,/requireSelfService: false/)
  const eligibility=read('backend/src/utils/rateEligibility.js')
  assert.match(eligibility,/const requireSelfService = options\?\.requireSelfService !== false/)
  const migration=read('supabase/migrations/20260913000010_wallet_customer_self_start.sql')
  assert.match(migration,/wallet credit may start against any active rate/)
  assert.doesNotMatch(migration,/RATE_PLAN_NOT_AVAILABLE[^\n]+customer self-service/)
})

test('Cloud customer wallet refresh polls fast enough for approved top-ups to map Start Session promptly',()=>{
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(data,/setInterval\(queueRefresh,user\?\.role === 'customer' \? 1000 : 5000\)/)
})

test('Cloud Customer start ignores stale Edge offline state but server-side blocks maintenance',()=>{
  const station=read('supabase/functions/station-api/index.ts')
  assert.match(station,/persistedStatus==='maintenance'\?'maintenance':'available'/)
  assert.match(station,/String\(pcState\?\.status\|\|'available'\)\.toLowerCase\(\)==='maintenance'/)
  assert.doesNotMatch(station,/pcState\?\.status[^\n]{0,120}==='offline'[^\n]{0,120}throw/)
})
