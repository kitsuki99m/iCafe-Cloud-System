import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

const durationModuleUrl = pathToFileURL(path.join(root, 'apps/admin/src/lib/duration.js')).href
const duration = await import(`${durationModuleUrl}?split-duration-test=${Date.now()}`)

test('duration helpers split total minutes into hours and minutes', () => {
  assert.equal(typeof duration.splitMinutes, 'function')
  assert.deepEqual(duration.splitMinutes(0), { hours: 0, minutes: 0 })
  assert.deepEqual(duration.splitMinutes(4), { hours: 0, minutes: 4 })
  assert.deepEqual(duration.splitMinutes(90), { hours: 1, minutes: 30 })
  assert.deepEqual(duration.splitMinutes(1805), { hours: 30, minutes: 5 })
})

test('duration helpers combine parts and clamp minute component to 0-59', () => {
  assert.equal(typeof duration.combineDurationParts, 'function')
  assert.equal(duration.combineDurationParts(0, 4), 4)
  assert.equal(duration.combineDurationParts(1, 30), 90)
  assert.equal(duration.combineDurationParts('2', '05'), 125)
  assert.equal(duration.combineDurationParts(-2, -1), 0)
  assert.equal(duration.combineDurationParts(2, 99), 179)
})

test('shared DurationInput exposes distinct HH and MM controls', () => {
  const source = read('apps/admin/src/components/common/DurationInput.jsx')
  assert.match(source, /aria-label=\{`\$\{label\} hours`\}/)
  assert.match(source, /aria-label=\{`\$\{label\} minutes`\}/)
  assert.match(source, /max=\"59\"/)
  assert.match(source, />HH</)
  assert.match(source, />MM</)
  assert.match(source, /placeholder="5"/)
  assert.match(source, /placeholder="30"/)
  assert.doesNotMatch(source, /mb-1 block text-\[10px\].*>HH</)
  assert.doesNotMatch(source, /mb-1 block text-\[10px\].*>MM</)
})

test('tariff duration editors use split DurationInput and total-minute fields', () => {
  const source = read('apps/admin/src/pages/TariffsPage.jsx')
  assert.match(source, /import DurationInput/)
  assert.match(source, /valueMinutes=\{numberValue\(draft\.minutesPerUnit\)\}/)
  assert.match(source, /valueMinutes=\{numberValue\(draft\.minutes\)\}/)
  assert.doesNotMatch(source, /Duration per unit \(HH:MM\)/)
  assert.doesNotMatch(source, /Package duration \(HH:MM\)/)
  assert.doesNotMatch(source, /durationPerUnit|packageDuration/)
})

test('member session transfer uses split duration input and total minutes', () => {
  const source = read('apps/admin/src/pages/MembersPage.jsx')
  assert.match(source, /<DurationInput/)
  assert.match(source, /label=\"Transfer time\"/)
  assert.doesNotMatch(source, /Time \(HH:MM\)/)
  assert.doesNotMatch(source, /placeholder=\"00:00\"/)
})

test('floor session adjustment uses split duration input and no colon editor', () => {
  const source = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(source, /<DurationInput/)
  assert.match(source, /label=\"Session time\"/)
  assert.doesNotMatch(source, /Time \(HH:MM\)/)
  assert.doesNotMatch(source, /placeholder=\"00:00\"/)
})

test('admin source has no editable HH:MM labels or colon duration placeholders', () => {
  const files = [
    'apps/admin/src/pages/TariffsPage.jsx',
    'apps/admin/src/pages/MembersPage.jsx',
    'apps/admin/src/pages/FloorMatrix.jsx',
  ]
  const source = files.map(read).join('\n')
  assert.doesNotMatch(source, /HH:MM/i)
  assert.doesNotMatch(source, /placeholder=\"\d{2}:\d{2}\"/)
})

test('tariff validation reserves an error row so fields do not jump when errors appear', () => {
  const source = read('apps/admin/src/pages/TariffsPage.jsx')
  const start = source.indexOf('function FieldError')
  const end = source.indexOf('\nfunction ', start + 1)
  const block = source.slice(start, end > start ? end : start + 500)
  assert.match(block, /min-h-\[16px\]/)
  assert.doesNotMatch(block, /return children \?/) 
})
