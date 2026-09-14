import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(file)=>fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8')

test('station-admin reports an explicit schema mismatch instead of a generic 500',()=>{
  const fn=read('supabase/functions/station-admin/index.ts')
  assert.match(fn,/function isMissingAtomicCloseRpc/)
  assert.match(fn,/PGRST202/)
  assert.match(fn,/42883/)
  assert.match(fn,/CLOUD_SCHEMA_OUTDATED/)
  assert.match(fn,/20260914000020_admin_atomic_session_close\.sql/)
  assert.match(fn,/throw atomicCloseSchemaError\(error\)/)
  assert.match(fn,/console\.error\('\[station-admin\]'/)
})

test('release gate requires the atomic close RPC and repair guard migrations',()=>{
  const readiness=read('tools/release-readiness.mjs')
  const cleanup=read('scripts/fix-supabase-migration-collisions.ps1')
  for(const file of [
    '20260914000020_admin_atomic_session_close.sql',
    '20260914000021_admin_close_session_rpc_guard.sql',
  ]){
    assert.match(readiness,new RegExp(file.replaceAll('.','\\.')))
    assert.match(cleanup,new RegExp(file.replaceAll('.','\\.')))
  }
  assert.match(cleanup,/functions deploy station-admin --use-api/)
})

test('guard migration reinstalls the exact atomic close RPC',()=>{
  const migration=read('supabase/migrations/20260914000021_admin_close_session_rpc_guard.sql')
  assert.match(migration,/create or replace function public\.aezakmi_admin_close_session/)
  assert.match(migration,/savedRemainingSeconds/)
  assert.match(migration,/disposition not in\('save','forfeit','refund'\)/)
  assert.match(migration,/grant execute on function public\.aezakmi_admin_close_session/)
})
