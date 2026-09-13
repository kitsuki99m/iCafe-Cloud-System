import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const capMigration = read('supabase/migrations/20260913000014_subscription_packages_station_caps.sql')
const pricingMigration = read('supabase/migrations/20260914000018_platform_pricing_quotes_and_customer_updates.sql')
const developer = read('supabase/functions/developer-registrations/index.ts')
const stationAdmin = read('supabase/functions/station-admin/index.ts')
const developerUi = read('apps/admin/src/pages/DeveloperConsolePage.jsx')
const settings = read('apps/admin/src/pages/SettingsPage.jsx')
const invite = read('supabase/templates/invite.html')
const recovery = read('supabase/templates/recovery.html')

const expected = { bronze:[10,499], silver:[25,799], gold:[50,1299] }

test('four-tier subscription migration drops the legacy fixed-cap invariant before remapping rows', () => {
  const drop = pricingMigration.indexOf('alter table public.subscriptions drop constraint if exists subscriptions_package_station_limit_check')
  const remap = pricingMigration.indexOf('update public.subscriptions')
  assert.ok(drop >= 0, 'legacy package cap constraint must be dropped')
  assert.ok(remap >= 0, 'subscription rows must be remapped')
  assert.ok(drop < remap, 'drop the old fixed-cap constraint before changing plan/max_stations')
  assert.match(pricingMigration, /greatest\(1, least\(10000, coalesce\(max_stations, 10\)\)\)/)
})

test('commercial catalog defaults to Bronze, Silver, Gold, and Ultra and remains developer editable', () => {
  for (const [plan, [cap, price]] of Object.entries(expected)) {
    assert.match(pricingMigration, new RegExp(`\\('${plan}','[^']+',\\d+,${cap},${price}`))
  }
  assert.match(pricingMigration, /\('ultra','Ultra',40,null,1999,'\+ \/ month'/)
  assert.match(pricingMigration, /platform_subscription_packages/)
  assert.match(developer, /update_package/)
  assert.match(developer, /PC limits must increase from Bronze to Silver to Gold/)
  assert.doesNotMatch(developerUi, /Platinum|Diamond/)
})

test('station cap stays enforced by the race-safe organization-wide database trigger', () => {
  assert.match(stationAdmin, /requireStationCapacity/)
  assert.match(stationAdmin, /STATION_LIMIT_REACHED/)
  assert.match(capMigration, /for update/)
  assert.match(capMigration, /branch_stations_subscription_limit/)
  assert.match(capMigration, /exists\(select 1 from public\.branch_stations where branch_id=new\.branch_id and local_id=new\.local_id\)/)
  assert.match(pricingMigration, /lower\(plan\) in \('bronze','silver','gold','ultra'\) and max_stations between 1 and 10000/)
})

test('developer console owns package assignment, editable pricing, and branded quotations', () => {
  assert.match(developerUi, /set_subscription/)
  assert.match(developerUi, /savePricingEditor/)
  assert.match(developerUi, /Send branded quotation/)
  assert.match(developer, /SUBSCRIPTION_BELOW_USAGE/)
  assert.match(developer, /subscription_package_changed/)
  assert.match(developer, /send_quote/)
  assert.match(developer, /RESEND_API_KEY/)
  assert.match(pricingMigration, /platform_quotations/)
})

test('business owner settings exposes dynamic package and organization station usage', () => {
  assert.match(settings, /cloudGetSubscriptionOverview/)
  assert.match(settings, /Subscription/)
  assert.match(settings, /stationCount/)
  assert.match(settings, /platform developer/)
})

test('owner invitation and resend templates remain Aezakmi branded and package aware', () => {
  for (const template of [invite, recovery]) {
    assert.match(template, /AEZAKMI CAFÉ/)
    assert.match(template, /\.Data\.business_name/)
    assert.match(template, /\.Data\.subscription_plan/)
    assert.match(template, /\.Data\.max_stations/)
    assert.match(template, /\.ConfirmationURL/)
  }
  assert.match(developer, /subscription_plan:pkg\.plan/)
  assert.match(developer, /max_stations:pkg\.maxStations/)
})
