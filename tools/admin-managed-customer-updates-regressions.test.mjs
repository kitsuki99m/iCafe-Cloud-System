import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')
const exists=(file)=>fs.existsSync(path.join(root,file))

test('Customer Electron contains no Admin-managed updater runtime or command handlers',()=>{
  const main=read('apps/customer/electron/main.cjs')
  assert.doesNotMatch(main,/managedByAdmin\s*:\s*true/)
  assert.doesNotMatch(main,/customer_update_(?:check|download|install_when_idle|install_now|cancel)/)
  assert.doesNotMatch(main,/checkCustomerUpdate|startCustomerUpdater|tryInstallPendingUpdate|resolveUpdateSource/)
  assert.match(main,/function publicSoftwareInfo\(\)\{return\{currentVersion:app\.getVersion\(\)\}\}/)
})

test('Customer preload exposes installed-version diagnostics but no updater IPC surface',()=>{
  const preload=read('apps/customer/electron/preload.cjs')
  assert.match(preload,/getSoftwareInfo/)
  assert.doesNotMatch(preload,/checkForUpdates|downloadUpdate|installUpdate|onUpdateState|customer:update-state/)
})

test('Customer heartbeats report software version only, not update deployment state',()=>{
  const socket=read('apps/customer/src/lib/socket.js')
  const cloud=read('apps/customer/src/lib/cloudStation.js')
  for(const text of[socket,cloud]){
    assert.match(text,/softwareVersion/)
    assert.doesNotMatch(text,/updateState|updateVersion|updateProgress|updateInstallWhenIdle/)
  }
})

test('local Cafe Edge exposes no Customer update cache or manifest routes',()=>{
  const operations=read('backend/src/routes/operationsRoutes.js')
  assert.doesNotMatch(operations,/customer-updates\/|customer_updates|UPDATE_CHECKSUM_FAILED|sha256UpdateFile/)
  assert.equal(exists('scripts/serve-customer-updates.mjs'),false)
})

test('Customer update commands are not accepted by Edge or Cloud command endpoints',()=>{
  const local=read('backend/src/routes/operationsRoutes.js')
  const cloud=read('supabase/functions/station-admin/index.ts')
  const edgeBridge=read('backend/src/cloud/commands.js')
  for(const text of[local,cloud,edgeBridge]){
    assert.doesNotMatch(text,/customer_update_(?:check|download|install_when_idle|install_now|cancel)/)
  }
})

test('removed updater cannot leave a special cancel/interrupt execution path behind',()=>{
  const local=read('backend/src/routes/operationsRoutes.js')
  const cloud=read('supabase/functions/station-admin/index.ts')
  assert.doesNotMatch(local,/cancelMayInterruptUpdate/)
  assert.doesNotMatch(cloud,/cancelMayInterruptUpdate/)
})

test('Admin Clients exposes no Software Updates center or dead updater component',()=>{
  const floor=read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.doesNotMatch(floor,/Software updates|CustomerUpdateCenter|updateCenterOpen/)
  assert.equal(exists('apps/admin/src/components/updates/CustomerUpdateCenter.jsx'),false)
})

test('historical updater migration stays immutable while live runtime no longer consumes it',()=>{
  const sql=read('supabase/migrations/20260914000019_admin_managed_customer_updates.sql')
  assert.match(sql,/customer_update_check/)
  assert.match(sql,/update_progress/)
  const live=[
    read('backend/src/routes/operationsRoutes.js'),
    read('supabase/functions/station-admin/index.ts'),
    read('apps/customer/electron/main.cjs'),
  ].join('\n')
  assert.doesNotMatch(live,/customer_update_(?:check|download|install_when_idle|install_now|cancel)/)
})
