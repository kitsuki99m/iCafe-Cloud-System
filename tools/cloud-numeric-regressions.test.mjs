import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('Start Session currency formatter accepts Supabase numeric strings', () => {
  const source = read('apps/admin/src/components/floor/SessionModal.jsx')
  assert.match(source, /function peso\(value\)[\s\S]*const number = Number\(value\)[\s\S]*Number\.isFinite\(number\)[\s\S]*number : 0\)\.toFixed\(2\)/)
  assert.doesNotMatch(source, /\(n \?\? 0\)\.toFixed\(2\)/)
  assert.match(source, /\{peso\(walletApplied\)\}/)
  assert.match(source, /\{peso\(cashDue\)\}/)
})

test('Cloud rate plans are normalized to numeric fields before session UI consumes them', () => {
  const context = read('apps/admin/src/context/AppDataContext.jsx')
  const cloud = read('apps/admin/src/lib/cloudClient.js')
  for (const field of ['pesoUnit', 'minutesPerUnit', 'minAmount', 'amount', 'minutes']) {
    assert.match(context, new RegExp(`${field}: finiteOrNull\\(`), `AppDataContext should normalize ${field}`)
    assert.match(cloud, new RegExp(`${field}: optionalNumber\\(`), `cloudClient should normalize ${field}`)
  }
  assert.match(context, /sessionSecondsRemaining: finiteOr\(/)
  assert.match(context, /postpaidMinutesPerPeso: finiteOr\(/)
})

test('Cloud session numeric fields are normalized before manage-session calculations', () => {
  const context = read('apps/admin/src/context/AppDataContext.jsx')
  for (const field of ['amount', 'prepaidSeconds', 'pausedRemainingSeconds', 'remainingSeconds', 'accruedAmount', 'postpaidRatePerMinute']) {
    assert.match(context, new RegExp(`${field}: finiteOr`), `session ${field} should be normalized`)
  }
})
