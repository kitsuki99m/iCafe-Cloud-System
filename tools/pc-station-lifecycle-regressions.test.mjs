import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')

test('Remove PC waits for authoritative delete instead of flickering the edit modal through optimistic state',()=>{
  const data=read('apps/admin/src/context/AppDataContext.jsx')
  const start=data.indexOf('function removePc')
  const end=data.indexOf('function getMemberWallet',start)
  const block=data.slice(start,end)
  assert.match(block,/confirmation-first/)
  assert.match(block,/apiDelete\(`\/pcs\/\$\{id\}`\)/)
  assert.match(block,/await refresh\(\)/)
  assert.doesNotMatch(block,/optimisticState/)
})

test('Cloud station deletion has a tombstone guard against stale Edge resurrection',()=>{
  const sql=read('supabase/migrations/20260915000026_station_delete_tombstones.sql')
  assert.match(sql,/branch_station_tombstones/)
  assert.match(sql,/after delete on public\.branch_stations/i)
  assert.match(sql,/before insert on public\.branch_stations/i)
  assert.match(sql,/new\.edge_id is not null/i)
  assert.match(sql,/return null/i)
  assert.match(sql,/new\.edge_id is null/i)
})

test('Café Edge full station snapshots prune Cloud-deleted PCs without deleting unsynced bootstrap PCs or active sessions',()=>{
  const apply=read('backend/src/cloud/configApply.js')
  assert.match(apply,/runtime\.fullStations===true/)
  assert.match(apply,/pendingStation/)
  assert.match(apply,/entity_type='station'/)
  assert.match(apply,/activeSession/)
  assert.match(apply,/DELETE FROM pcs WHERE id=\?/)
  assert.match(apply,/stationsRemoved/)
})

test('Add PC retries reuse one operation key and recover an already-committed deterministic station id',()=>{
  const form=read('apps/admin/src/components/floor/PcFormModal.jsx')
  const data=read('apps/admin/src/context/AppDataContext.jsx')
  const cloud=read('supabase/functions/station-admin/index.ts')
  assert.match(form,/createOperationKeyRef/)
  assert.match(form,/onCreate\([\s\S]*\{ operationKey \}\)/)
  assert.match(data,/apiPost\('\/pcs', pc, \{ operationKey:options\.operationKey \}\)/)
  const existing=cloud.indexOf("const{data:existingId")
  const capacity=cloud.indexOf('await requireStationCapacity',existing)
  assert.ok(existing>=0 && capacity>existing,'retry recovery must run before station capacity enforcement')
  assert.match(cloud,/duplicate:true,recovered:true/)
})

test('Local station delete revokes station auth, disconnects the Customer Station, and local create retry is idempotent',()=>{
  const api=read('backend/src/routes/apiRoutes.js')
  assert.match(api,/duplicate: true,[\s\S]*recovered: true,[\s\S]*pc: pcView\(duplicateId\)/)
  assert.match(api,/end_reason='station_removed'/)
  assert.match(api,/emit\('auth:revoked', \{ reason:'station_removed'/)
  assert.match(api,/disconnectSockets\(true\)/)
})
