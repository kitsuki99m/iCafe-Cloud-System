import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('Add PC treats the entered value as a station number and formats the visible label', () => {
  const form = read('apps/admin/src/components/floor/PcFormModal.jsx')
  assert.match(form, /PC number/)
  assert.match(form, /const pcLabel = \(number\) => `PC - \$\{number\}`/)
  assert.match(form, /const pcId = \(number\) => `pc-\$\{number\}`/)
  assert.match(form, /pcNumber: String\(createNumber\)/)
  assert.match(form, /label: pcLabel\(createNumber\)/)
  assert.match(form, /nextStationNumber\(existingPcs\)/)
})

test('Bulk Add PCs uses the same PC - N display label and explicit pcNumber', () => {
  const bulk = read('apps/admin/src/components/bulk/BulkAddPcModal.jsx')
  assert.match(bulk, /const label = `PC - \$\{number\}`/)
  assert.match(bulk, /pcNumber:String\(row\.number\)/)
  assert.match(bulk, /id:`pc-\$\{row\.number\}`/)
})

test('local and cloud create paths persist pc_number independently from the display label', () => {
  const local = read('backend/src/routes/apiRoutes.js')
  const cloud = read('supabase/functions/station-admin/index.ts')
  assert.match(local, /pcNumber: requestedPcNumber/)
  assert.match(local, /PC_NUMBER_EXISTS/)
  assert.match(local, /cleanPcNumber \|\| String\(pcId\)/)
  assert.match(cloud, /pcNumber=Number\.isSafeInteger\(parsedPcNumber\)/)
  assert.match(cloud, /PC_NUMBER_EXISTS/)
  assert.match(cloud, /pc_number:pcNumber\|\|/)
})
