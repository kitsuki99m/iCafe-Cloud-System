import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('Customer quick amount presets are standardized to 5, 10, 15, and 20 pesos', () => {
  const start = read('apps/customer/src/components/customer/StartSessionModal.jsx')
  const topup = read('apps/customer/src/components/customer/TopUpModal.jsx')
  const extend = read('apps/customer/src/components/customer/ExtendSessionModal.jsx')

  assert.match(start, /const candidates = \[5, 10, 15, 20\]/)
  assert.match(topup, /const PRESETS = \[5, 10, 15, 20\]/)
  assert.match(extend, /const PRESETS = \[5, 10, 15, 20\];/)
  assert.match(topup, /useState\(PRESETS\[0\]\)/)
  assert.match(topup, /grid grid-cols-4 gap-2/)
  assert.doesNotMatch(`${start}\n${topup}\n${extend}`, /\[50,\s*100,\s*200\]/)
})

test('Customer keeps custom amounts available alongside the small presets', () => {
  const start = read('apps/customer/src/components/customer/StartSessionModal.jsx')
  const topup = read('apps/customer/src/components/customer/TopUpModal.jsx')
  const extend = read('apps/customer/src/components/customer/ExtendSessionModal.jsx')
  assert.match(start, /Custom amount/)
  assert.match(topup, /placeholder="Custom amount"/)
  assert.match(extend, /customAmount/)
})

test('Admin uses a centralized browser sound manager with browser-local preferences and dedupe', () => {
  const sound = read('apps/admin/src/lib/sound.js')
  assert.match(sound, /aezakmi\.admin\.sound\.v1/)
  assert.match(sound, /enabled:\s*true/)
  assert.match(sound, /payments:\s*true/)
  assert.match(sound, /help:\s*true/)
  assert.match(sound, /sessions:\s*true/)
  assert.match(sound, /stations:\s*true/)
  assert.match(sound, /window\.AudioContext \|\| window\.webkitAudioContext/)
  assert.match(sound, /recent = new Map\(\)/)
  assert.match(sound, /dedupeMs = 4000/)
  assert.match(sound, /pointerdown/)
  assert.match(sound, /keydown/)
})

test('Admin settings exposes sound enable, volume, categories, and test control', () => {
  const settings = read('apps/admin/src/pages/SettingsPage.jsx')
  assert.match(settings, /settings-sounds/)
  assert.match(settings, /title="Notification Sounds"/)
  assert.match(settings, /type="range" min="0" max="100"/)
  assert.match(settings, /\['payments','Payments'\]/)
  assert.match(settings, /\['help','Help requests'\]/)
  assert.match(settings, /\['sessions','Sessions'\]/)
  assert.match(settings, /\['stations','PC \/ network'\]/)
  assert.match(settings, /Test sound/)
})

test('Admin notification center plays sounds for topups, support, extensions and broadcasts in cloud/local flows', () => {
  const center = read('apps/admin/src/components/admin/AdminNotificationCenter.jsx')
  assert.match(center, /playAdminSound\('payment', \{ dedupeKey:`topup:/)
  assert.match(center, /playAdminSound\('help', \{ dedupeKey:`support:/)
  assert.match(center, /playAdminSound\('payment', \{ dedupeKey:`extension:/)
  assert.match(center, /playAdminSound\('broadcast'/)
})

test('Admin station presence and command failures use station warning sounds', () => {
  const data = read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(data, /playAdminSound\('station-warning', \{ dedupeKey:`offline:/)
  assert.match(data, /playAdminSound\('station-warning', \{ dedupeKey:`command:/)
  assert.match(data, /playAdminSound\('success', \{ dedupeKey:`command:/)
})
