import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const migration = read('supabase/migrations/20260913000014_subscription_packages_station_caps.sql')
const developer = read('supabase/functions/developer-registrations/index.ts')
const stationAdmin = read('supabase/functions/station-admin/index.ts')
const developerUi = read('apps/admin/src/pages/DeveloperConsolePage.jsx')
const settings = read('apps/admin/src/pages/SettingsPage.jsx')
const invite = read('supabase/templates/invite.html')
const recovery = read('supabase/templates/recovery.html')

const expected = { bronze: 50, silver: 100, gold: 200, platinum: 350, diamond: 500 }

test('subscription packages use the requested fixed station caps and Ultra custom limits', () => {
  for (const [plan, cap] of Object.entries(expected)) {
    assert.match(developer, new RegExp(`${plan}:${cap}`))
    assert.match(migration, new RegExp(`lower\\(plan\\)='${plan}'.*max_stations=${cap}`))
  }
  assert.match(developer, /ultra:null/)
  assert.match(developer, /10,000/)
  assert.match(migration, /lower\(plan\)='ultra' and max_stations between 1 and 10000/)
})

test('station cap is enforced in both Edge validation and a race-safe database trigger', () => {
  assert.match(stationAdmin, /requireStationCapacity/)
  assert.match(stationAdmin, /STATION_LIMIT_REACHED/)
  assert.match(migration, /for update/)
  assert.match(migration, /branch_stations_subscription_limit/)
  assert.match(migration, /exists\(select 1 from public\.branch_stations where branch_id=new\.branch_id and local_id=new\.local_id\)/)
})

test('developer console owns package assignment and protects downgrades below usage', () => {
  assert.match(developerUi, /SUBSCRIPTION_PACKAGES/)
  assert.match(developerUi, /set_subscription/)
  assert.match(developerUi, /Ultra station limit/)
  assert.match(developer, /SUBSCRIPTION_BELOW_USAGE/)
  assert.match(developer, /subscription_package_changed/)
})

test('business owner settings exposes package and organization station usage', () => {
  assert.match(settings, /cloudGetSubscriptionOverview/)
  assert.match(settings, /Subscription/)
  assert.match(settings, /stationCount/)
  assert.match(settings, /Package changes are assigned by the Aezakmi platform developer/)
})

test('owner invitation and resend templates are Aezakmi branded and package aware', () => {
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
