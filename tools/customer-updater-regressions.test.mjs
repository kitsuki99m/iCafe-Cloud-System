import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const main = read('apps/customer/electron/main.cjs')
const preload = read('apps/customer/electron/preload.cjs')
const station = read('apps/customer/src/lib/cloudStation.js')
const runtime = read('supabase/functions/station-runtime/index.ts')
const builder = read('scripts/build-installer.mjs')
const pcCard = read('apps/admin/src/components/floor/PcCard.jsx')

test('Customer production updater uses a versioned manifest and verifies SHA-256 before marking ready', () => {
  assert.match(main, /update-config\.json/)
  assert.match(main, /manifest\.sha256/)
  assert.match(main, /UPDATE_CHECKSUM_FAILED/)
  assert.match(main, /status:'ready'/)
  assert.match(builder, /latest\.json/)
  assert.match(builder, /createHash\('sha256'\)/)
})

test('Customer updater will not install while a protected session is active', () => {
  assert.match(main, /function stationHasProtectedSession\(\)/)
  assert.match(main, /marker\?\.active/)
  assert.match(main, /windowState===WINDOW_STATES\.LOCKED/)
  assert.match(main, /!stationHasProtectedSession\(\)/)
  assert.match(main, /tryInstallPendingUpdate/)
})

test('insecure update transport is opt-in while HTTPS is accepted by default', () => {
  assert.match(main, /parsed\.protocol==='https:'/)
  assert.match(main, /allowInsecure&&parsed\.protocol==='http:'/)
  assert.match(main, /AEZAKMI_ALLOW_INSECURE_UPDATE_URL/)
})

test('Customer update version/state is exposed through preload and cloud heartbeat', () => {
  assert.match(preload, /getSoftwareInfo/)
  assert.match(preload, /checkForUpdates/)
  assert.match(preload, /onUpdateState/)
  assert.match(station, /softwareVersion/)
  assert.match(station, /updateState/)
  assert.match(station, /updateVersion/)
})

test('Cloud station runtime persists Customer software/update telemetry and Admin PC cards expose it', () => {
  assert.match(runtime, /software_version/)
  assert.match(runtime, /customer_version/)
  assert.match(runtime, /customer_update_state/)
  assert.match(pcCard, /customerVersion/)
  assert.match(pcCard, /Update ready/)
})
