import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8')

test('Admin Clients no longer exposes Customer software updates',()=>{
  const floor=read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.doesNotMatch(floor,/Software updates|CustomerUpdateCenter|updateCenterOpen/)
})

test('Customer Electron no longer contains updater commands or install runtime',()=>{
  const main=read('apps/customer/electron/main.cjs')
  const preload=read('apps/customer/electron/preload.cjs')
  assert.doesNotMatch(main,/customer_update_|checkCustomerUpdate|startCustomerUpdater|tryInstallPendingUpdate/)
  assert.doesNotMatch(preload,/checkForUpdates|onUpdateState|customer:update-state/)
  assert.match(main,/publicSoftwareInfo\(\).*currentVersion:app\.getVersion\(\)/)
})

test('Edge and Cloud command endpoints reject removed update command family',()=>{
  const edge=read('backend/src/routes/operationsRoutes.js')
  const cloud=read('supabase/functions/station-admin/index.ts')
  assert.doesNotMatch(edge,/CUSTOMER_UPDATE_COMMANDS|customer-updates\//)
  assert.doesNotMatch(cloud,/CUSTOMER_UPDATE_COMMANDS|customer_update_/)
})
