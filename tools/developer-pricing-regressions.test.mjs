import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('Developer pricing editor saves all tiers and quote defaults through one atomic action',()=>{
  const ui=read('apps/admin/src/pages/DeveloperConsolePage.jsx')
  const fn=read('supabase/functions/developer-registrations/index.ts')
  const migration=read('supabase/migrations/20260914000025_atomic_platform_pricing_catalog.sql')
  assert.match(ui,/cloudDeveloperRegistrations\('update_pricing_catalog'/)
  assert.doesNotMatch(ui,/cloudDeveloperRegistrations\('update_package'/)
  assert.match(fn,/action==='update_pricing_catalog'/)
  assert.match(fn,/admin\.rpc\('aezakmi_update_platform_pricing_catalog'/)
  assert.match(migration,/create or replace function public\.aezakmi_update_platform_pricing_catalog/)
  assert.match(migration,/update public\.platform_subscription_packages/)
  assert.match(migration,/insert into public\.platform_pricing_settings/)
})

test('Developer pricing validates the complete tier order before saving',()=>{
  const ui=read('apps/admin/src/pages/DeveloperConsolePage.jsx')
  const fn=read('supabase/functions/developer-registrations/index.ts')
  const migration=read('supabase/migrations/20260914000025_atomic_platform_pricing_catalog.sql')
  for (const source of [ui,fn,migration]) assert.match(source,/Bronze to Silver to Gold|bronze_cap < silver_cap and silver_cap < gold_cap/i)
})

test('Ultra limits are bounded above Gold in assignment, approval, and quotations',()=>{
  const ui=read('apps/admin/src/pages/DeveloperConsolePage.jsx')
  const fn=read('supabase/functions/developer-registrations/index.ts')
  assert.match(ui,/const ultraFloor=/)
  assert.match(ui,/validatedUltraLimit/)
  assert.match(ui,/approveSelected/)
  assert.match(ui,/Ultra quotations require at least \$\{ultraFloor\} PCs/)
  assert.match(fn,/const ultraFloor=Math\.max\(1,goldCap\+1\)/)
  assert.match(fn,/ULTRA_LIMIT_TOO_LOW/)
  assert.match(fn,/stationCount<pkg\.ultraFloor/)
})

test('Developer recurring refresh updates the selected application instead of keeping a stale closure',()=>{
  const ui=read('apps/admin/src/pages/DeveloperConsolePage.jsx')
  assert.match(ui,/setSelected\(current=>current\?\(requests\.find\(x=>x\.id===current\.id\)\|\|null\):current\)/)
})

test('Developer quote API rejects invalid values instead of silently clamping them',()=>{
  const fn=read('supabase/functions/developer-registrations/index.ts')
  assert.match(fn,/INVALID_QUOTE_STATION_COUNT/)
  assert.match(fn,/INVALID_QUOTE_BRANCH_COUNT/)
  assert.match(fn,/INVALID_QUOTE_PRICE/)
  assert.match(fn,/INVALID_QUOTE_DEPLOYMENT_FEE/)
  assert.match(fn,/INVALID_QUOTE_VALIDITY/)
  assert.doesNotMatch(fn,/const branchCount=Math\.max\(1,Math\.min\(1000/)
})

test('Developer function exposes actionable schema-lag error for atomic pricing migration',()=>{
  const fn=read('supabase/functions/developer-registrations/index.ts')
  assert.match(fn,/20260914000025_atomic_platform_pricing_catalog\.sql/)
  assert.match(fn,/code:'CLOUD_SCHEMA_OUTDATED',exposeMessage:true/)
  assert.match(fn,/status>=500&&!error\?\.exposeMessage\?fallback/)
})
