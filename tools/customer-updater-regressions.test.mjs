import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')
const exists=(file)=>fs.existsSync(path.join(root,file))
const main=read('apps/customer/electron/main.cjs')
const preload=read('apps/customer/electron/preload.cjs')
const station=read('apps/customer/src/lib/cloudStation.js')
const runtime=read('supabase/functions/station-runtime/index.ts')
const builder=read('scripts/build-installer.mjs')
const pcCard=read('apps/admin/src/components/floor/PcCard.jsx')

test('Customer production build produces an installer without a legacy update manifest workflow',()=>{
  assert.doesNotMatch(main,/update-config\.json|manifest\.sha256|UPDATE_CHECKSUM_FAILED/)
  assert.doesNotMatch(builder,/latest\.json|createHash\(['"]sha256['"]\)/)
  assert.equal(exists('scripts/serve-customer-updates.mjs'),false)
  assert.equal(exists('docs/customer-update-config.example.json'),false)
})

test('Customer session safety no longer depends on an updater install loop',()=>{
  assert.doesNotMatch(main,/stationHasProtectedSession|tryInstallPendingUpdate|pendingUpdate/)
  assert.match(main,/readSessionLifecycleMarker/)
  assert.match(main,/sessionStartTransitionPending/)
})

test('Customer production runtime has no insecure-update transport escape hatch',()=>{
  assert.doesNotMatch(main,/AEZAKMI_ALLOW_INSECURE_UPDATE_URL|allowInsecure.*parsed\.protocol|update.*manifestUrl/i)
})

test('Customer preload and cloud heartbeat expose version diagnostics only',()=>{
  assert.match(preload,/getSoftwareInfo/)
  assert.doesNotMatch(preload,/checkForUpdates|onUpdateState|downloadUpdate|installUpdate/)
  assert.match(station,/softwareVersion/)
  assert.doesNotMatch(station,/updateState|updateVersion|updateProgress|updateInstallWhenIdle/)
})

test('Cloud runtime persists installed Customer version but Admin PC cards expose no updater state',()=>{
  assert.match(runtime,/software_version/)
  assert.match(runtime,/customer_version/)
  assert.doesNotMatch(runtime,/customer_update_state|customer_update_progress|customer_update_install_when_idle/)
  assert.match(pcCard,/customerVersion/)
  assert.doesNotMatch(pcCard,/Update ready|Update available|updateInstallWhenIdle|customerUpdateState/)
})
