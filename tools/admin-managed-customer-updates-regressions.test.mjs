import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8')

test('Customer updater is Admin-managed instead of autonomous',()=>{
  const main=read('apps/customer/electron/main.cjs')
  assert.match(main,/managedByAdmin:true/)
  assert.match(main,/customer_update_check/)
  assert.match(main,/customer_update_download/)
  assert.match(main,/customer_update_install_when_idle/)
  assert.match(main,/customer_update_cancel/)
  assert.doesNotMatch(main,/setInterval\(\(\)=>void checkCustomerUpdate/)
  assert.match(main,/setInterval\(\(\)=>void tryInstallPendingUpdate\(\),3000\)/)
})

test('Customer installation remains blocked until session lifecycle is safe',()=>{
  const main=read('apps/customer/electron/main.cjs')
  const start=main.indexOf('function stationHasProtectedSession')
  const end=main.indexOf('function resolveUpdateSource',start)
  const block=main.slice(start,end)
  assert.match(block,/WINDOW_STATES\.LOCKED/)
  assert.match(block,/sessionStartTransitionPending/)
  assert.match(block,/readSessionLifecycleMarker/)
})

test('Customer reports software/update telemetry over local and cloud heartbeat paths',()=>{
  const socket=read('apps/customer/src/lib/socket.js')
  const cloud=read('apps/customer/src/lib/cloudStation.js')
  for(const text of[socket,cloud]){
    assert.match(text,/softwareVersion/)
    assert.match(text,/updateState/)
    assert.match(text,/updateVersion/)
    assert.match(text,/updateProgress/)
    assert.match(text,/updateInstallWhenIdle/)
  }
  assert.match(socket,/station:software/)
})

test('local Cafe Edge can cache and serve one verified Customer release to the LAN',()=>{
  const operations=read('backend/src/routes/operationsRoutes.js')
  assert.match(operations,/customer-updates\/cache/)
  assert.match(operations,/public\/customer-updates\/latest\.json/)
  assert.match(operations,/UPDATE_CHECKSUM_FAILED/)
  assert.match(operations,/sha256UpdateFile/)
  assert.match(operations,/Plain HTTP is allowed only on a private café LAN/)
})

test('Customer update commands can queue for offline stations for seven days',()=>{
  const local=read('backend/src/routes/operationsRoutes.js')
  const cloud=read('supabase/functions/station-admin/index.ts')
  const edgeBridge=read('backend/src/cloud/commands.js')
  for(const text of[local,cloud,edgeBridge]){
    assert.match(text,/customer_update_install_when_idle/)
    assert.match(text,/7\*24\*60\*60\*1000/)
  }
  assert.match(local,/pc\.status==='offline'&&!isCustomerUpdate/)
  assert.match(cloud,/!stationRecentlyOnline\(device\.cloud_last_seen_at\)&&!isCustomerUpdate/)
})

test('Admin update cancel can interrupt another in-flight update command',()=>{
  const local=read('backend/src/routes/operationsRoutes.js')
  const cloud=read('supabase/functions/station-admin/index.ts')
  assert.match(local,/cancelMayInterruptUpdate/)
  assert.match(cloud,/cancelMayInterruptUpdate/)
})

test('Admin Clients exposes Software Updates and bulk deployment controls',()=>{
  const floor=read('apps/admin/src/pages/FloorMatrix.jsx')
  const center=read('apps/admin/src/components/updates/CustomerUpdateCenter.jsx')
  assert.match(floor,/Software updates/)
  assert.match(floor,/CustomerUpdateCenter/)
  assert.match(center,/Check all/)
  assert.match(center,/Download outdated/)
  assert.match(center,/Update all when idle/)
  assert.match(center,/Cache on Edge/)
  assert.match(center,/Offline stations can keep a durable queued update/)
})

test('Supabase migration permits Admin-managed update command names and telemetry',()=>{
  const sql=read('supabase/migrations/20260914000018_admin_managed_customer_updates.sql')
  assert.match(sql,/update_progress/)
  assert.match(sql,/update_install_when_idle/)
  assert.match(sql,/customer_update_check/)
  assert.match(sql,/customer_update_download/)
  assert.match(sql,/customer_update_install_when_idle/)
  assert.match(sql,/customer_update_cancel/)
})
