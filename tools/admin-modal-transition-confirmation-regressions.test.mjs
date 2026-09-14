import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

const floor = () => read('apps/admin/src/pages/FloorMatrix.jsx')
const session = () => read('apps/admin/src/components/floor/SessionModal.jsx')

test('Floor Matrix closes the selected session modal before terminal/start state mutations and restores it on failure', () => {
  const source = floor()
  for (const [name, nextName] of [
    ['handleStart', 'handleEnd'],
    ['handleEnd', 'handleSetMaintenance'],
    ['handleSetMaintenance', 'handleRefund'],
  ]) {
    const start = source.indexOf(`async function ${name}`)
    const end = source.indexOf(`async function ${nextName}`, start + 1)
    const section = source.slice(start, end)
    assert.match(section, /isSelectedSessionPc/)
    assert.match(section, /setSelectedId\(null\)/)
    assert.match(section, /catch \(error\)[\s\S]*setSelectedId\(String\(pc\.id\)\)/)
  }

  const refundStart = source.indexOf('async function handleRefund')
  const refundEnd = source.indexOf('\n  async function ', refundStart + 1)
  const refundSection = source.slice(refundStart, refundEnd === -1 ? source.length : refundEnd)
  assert.match(refundSection, /isSelectedSessionPc/)
  assert.match(refundSection, /setSelectedId\(null\)/)
  assert.match(refundSection, /catch \(error\)[\s\S]*setSelectedId\(String\(pc\.id\)\)/)
})

test('Session modal never morphs from Manage Session back to Start Session while it is open', () => {
  const source = session()
  assert.match(source, /openedModeRef\s*=\s*useRef/)
  assert.match(source, /const modalModeChanged\s*=/)
  assert.match(source, /if \(!pc \|\| modalModeChanged\) return null/)
  assert.match(source, /if \(current\.mode !== sessionActionMode\) onClose\?\.\(\)/)
})

test('Pause & Save requires confirmation from both session management and station quick actions', () => {
  const sessionSource = session()
  const floorSource = floor()
  assert.match(sessionSource, /pauseSaveConfirmOpen/)
  assert.match(sessionSource, /setPauseSaveConfirmOpen\(true\)/)
  assert.match(sessionSource, /if \(pauseSaveConfirmOpen\)[\s\S]*<ConfirmModal[\s\S]*title="Pause & save this session\?"[\s\S]*runSessionAction\(['"]save['"]\)/)
  assert.match(floorSource, /setPauseSaveTarget\(pc\)/)
  assert.match(floorSource, /<ConfirmModal[\s\S]*open=\{Boolean\(pauseSaveTarget\)\}[\s\S]*pauseAndSaveTime\(pauseSaveTarget\)/)
})

test('Restore saved guest session and interrupted settlement use modal confirmation, never native confirm', () => {
  const source = read('apps/admin/src/pages/LogsPage.jsx')
  assert.match(source, /restoreTarget/)
  assert.match(source, /settlementTarget/)
  assert.match(source, /<ConfirmModal[\s\S]*open=\{Boolean\(restoreTarget\)\}[\s\S]*onConfirm=\{restoreGuest\}/)
  assert.match(source, /<ConfirmModal[\s\S]*open=\{Boolean\(settlementTarget\)\}[\s\S]*onConfirm=\{settleInterrupted\}/)
  assert.doesNotMatch(source, /window\.confirm|\bconfirm\s*\(/)
})

test('Restart and shutdown are guarded by confirmation modals in session and quick-station controls', () => {
  const sessionSource = session()
  const floorSource = floor()
  assert.match(sessionSource, /confirmCommand/)
  assert.match(sessionSource, /<ConfirmModal[\s\S]*open=\{Boolean\(confirmCommand\)\}/)
  assert.match(floorSource, /commandConfirmTarget/)
  assert.match(floorSource, /command==='restart'\|\|command==='shutdown'/)
  assert.match(floorSource, /<ConfirmModal[\s\S]*open=\{Boolean\(commandConfirmTarget\)\}/)
})

test('Refund, PC removal, cloud unpair, notification clear, and expense void all use confirmation modals', () => {
  const sessionSource = session()
  const pcForm = read('apps/admin/src/components/floor/PcFormModal.jsx')
  const settings = read('apps/admin/src/pages/SettingsPage.jsx')
  const notifications = read('apps/admin/src/components/admin/AdminNotificationCenter.jsx')
  const earnings = read('apps/admin/src/pages/EarningsPage.jsx')

  assert.match(sessionSource, /const \[confirmOpen, setConfirmOpen\] = useState\(false\)/)
  assert.match(sessionSource, /<ConfirmModal[\s\S]*open=\{confirmOpen\}[\s\S]*onConfirm=\{confirmRefund\}/)
  assert.match(pcForm, /<ConfirmModal[\s\S]*open=\{removeConfirmOpen\}/)
  assert.match(settings, /<ConfirmModal[\s\S]*open=\{cloudUnpairConfirmOpen\}/)
  assert.match(notifications, /<ConfirmModal[\s\S]*open=\{clearConfirmOpen\}/)
  assert.match(earnings, /<ConfirmModal[\s\S]*open=\{Boolean\(voidTarget\)\}/)
})

test('Admin source has no browser-native confirm or click-twice armed destructive confirmation patterns', () => {
  const files = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (/\.(?:js|jsx|mjs|ts|tsx)$/.test(entry.name)) files.push(full)
    }
  }
  const adminRoot = path.join(root, 'apps/admin/src')
  walk(adminRoot)
  const source = files.map((file) => fs.readFileSync(file, 'utf8')).join('\n')
  assert.doesNotMatch(source, /window\.confirm\s*\(/)
  assert.doesNotMatch(source, /\b(?:remove|clear|refund|power)Armed\b/)
  assert.doesNotMatch(source, /click again to confirm/i)
})

test('Nested modal keyboard shortcuts only act on the top-most modal', () => {
  const source = read('apps/admin/src/components/common/Modal.jsx')
  assert.match(source, /const modalStack\s*=\s*\[\]/)
  assert.match(source, /function pushModal\(/)
  assert.match(source, /function popModal\(/)
  assert.match(source, /function isTopModal\(/)
  assert.match(source, /if \(!isTopModal\(stackToken\)\) return/)
})


test('Side panels and mobile navigation yield keyboard ownership to a newly opened modal', () => {
  const modal = read('apps/admin/src/components/common/Modal.jsx')
  const sidePanel = read('apps/admin/src/components/common/SidePanel.jsx')
  const layout = read('apps/admin/src/components/layout/MainLayout.jsx')
  assert.match(modal, /data-admin-modal-root="true"/)
  assert.match(sidePanel, /querySelector\('\[data-admin-modal-root=/)
  assert.match(sidePanel, /aezakmi:overlay-open/)
  assert.match(sidePanel, /closeForNewOverlay/)
  assert.match(layout, /aezakmi:overlay-open/)
  assert.match(layout, /setMobileNavOpen\(false\)/)
})
