import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8')

test('Add PC is confirmation-first and cannot create an optimistic self-duplicate',()=>{
  const data=read('apps/admin/src/context/AppDataContext.jsx')
  const start=data.indexOf('function addPc')
  const end=data.indexOf('function updatePcMeta',start)
  const block=data.slice(start,end)
  assert.match(block,/confirmation-first/)
  assert.match(block,/apiPost\('\/pcs'/)
  assert.doesNotMatch(block,/optimisticState/)
  assert.doesNotMatch(block,/pending:true/)
})

test('Add PC modal blocks same-tick duplicate submits and ignores legacy ghost rows',()=>{
  const form=read('apps/admin/src/components/floor/PcFormModal.jsx')
  assert.match(form,/const saveInFlightRef = useRef\(false\)/)
  assert.match(form,/saving \|\| saveInFlightRef\.current/)
  assert.match(form,/function isTransientCreateGhost/)
  assert.match(form,/confirmedPcs = existingPcs\.filter/)
})

test('Admin persistent app cache stores confirmed state rather than optimistic mutations',()=>{
  const data=read('apps/admin/src/context/AppDataContext.jsx')
  const start=data.indexOf('function optimisticState')
  const end=data.indexOf('function startSession',start)
  const block=data.slice(start,end)
  assert.match(block,/last confirmed server/)
  assert.doesNotMatch(block,/writeSnapshot/)
  assert.match(data,/sanitizeCachedSnapshot/)
})

test('Cloud station create forwards and records an operation key for replay safety',()=>{
  const client=read('apps/admin/src/lib/cloudClient.js')
  const fn=read('supabase/functions/station-admin/index.ts')
  assert.match(client,/station: body \|\| \{\}, operationKey: operationKey \|\| null/)
  assert.match(fn,/cloud_operation_receipts/)
  assert.match(fn,/action:'station\.create'/)
  assert.match(fn,/duplicate:true/)
})
