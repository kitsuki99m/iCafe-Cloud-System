import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8')

function sliceBetween(source, start, end) {
  const startIndex = source.indexOf(start)
  assert.notEqual(startIndex, -1, `Missing start marker: ${start}`)
  const endIndex = source.indexOf(end, startIndex + start.length)
  assert.notEqual(endIndex, -1, `Missing end marker: ${end}`)
  return source.slice(startIndex, endIndex)
}

test('new member creation uses fixed temporary password 1234 and marks password setup pending', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  const block = sliceBetween(source, 'router.post("/members"', `router.patch(\n  "/members/:id"`)
  assert.match(source, /TEMPORARY_CUSTOMER_PASSWORD\s*=\s*["']1234["']/)
  assert.doesNotMatch(block, /password,\s*\n\s*tier/)
  assert.match(block, /argon2\.hash\(TEMPORARY_CUSTOMER_PASSWORD\)/)
  assert.match(block, /must_change_credentials/)
  assert.match(block, /'customer',1,1/)
})

test('admin add-member form does not ask for a custom initial password', () => {
  const source = read('apps/admin/src/pages/MembersPage.jsx')
  const fields = sliceBetween(source, 'function MemberFields', 'function useModalMutation')
  assert.match(fields, /Temporary password/)
  assert.match(fields, />1234</)
  assert.match(fields, /Customer.*prompted.*new password/i)
  assert.match(fields, /isCreate\s*\?[^]*Temporary password[^]*PasswordInput/)
  const saveCreate = sliceBetween(source, 'const saveCreate=async()=>', 'const saveEdit=async()=>')
  assert.doesNotMatch(saveCreate, /password\.length/)
  assert.doesNotMatch(saveCreate, /password,/)
})

test('customer password completion endpoint is customer-only and clears pending setup atomically', () => {
  const source = read('backend/src/routes/authRoutes.js')
  const block = sliceBetween(source, "router.post('/complete-customer-password-setup'", "router.post('/setup-credentials'")
  assert.match(block, /authenticate/)
  assert.match(block, /req\.auth\.role\s*!==\s*'customer'/)
  assert.match(block, /req\.auth\.mustChangeCredentials/)
  assert.match(block, /passwordError\(String\(newPassword\)\)/)
  assert.match(block, /transaction\(\(\)\s*=>/)
  assert.match(block, /must_change_credentials=0/)
  assert.match(block, /UPDATE members SET password_hash=/)
  assert.match(block, /UPDATE auth_sessions SET revoked_at=.*id<>/s)
})

test('admin manual member password edit clears pending first-login flag', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  const block = sliceBetween(source, `router.patch(\n  "/members/:id"`, 'router.delete("/members/:id"')
  assert.match(block, /must_change_credentials=0/)
})

test('customer auth context defers password setup only for the current auth token', () => {
  const source = read('apps/customer/src/context/AuthContext.jsx')
  assert.match(source, /CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN/)
  assert.match(source, /sessionStorage\.setItem\(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN,\s*token\)/)
  assert.match(source, /sessionStorage\.getItem\(CUSTOMER_PASSWORD_SETUP_DEFERRED_TOKEN\)\s*===\s*token/)
  assert.match(source, /completeCustomerPasswordSetup/)
  assert.match(source, /apiPost\("\/auth\/complete-customer-password-setup"/)
  assert.match(source, /deferCustomerPasswordSetup/)
  assert.match(source, /showCustomerPasswordSetup/)
  assert.match(source, /mustChangeCredentials/)
})

test('customer password setup modal has only explicit Submit and Set Later dismissal paths', () => {
  const source = read('apps/customer/src/components/auth/CustomerPasswordSetupModal.jsx')
  assert.match(source, /New Password/)
  assert.match(source, /Confirm New Password/)
  assert.match(source, />Set Later</)
  assert.match(source, /Submit/)
  assert.match(source, /showCloseButton=\{false\}/)
  assert.match(source, /closeOnBackdrop=\{false\}/)
  assert.match(source, /closeOnEscape=\{false\}/)
  assert.match(source, /newPassword\.length\s*>\s*0/)
  assert.match(source, /newPassword\s*===\s*confirmPassword/)
})

test('shared customer modal supports non-dismissible password setup without changing defaults', () => {
  const source = read('apps/customer/src/components/common/Modal.jsx')
  assert.match(source, /showCloseButton\s*=\s*true/)
  assert.match(source, /closeOnBackdrop\s*=\s*true/)
  assert.match(source, /closeOnEscape\s*=\s*true/)
  assert.match(source, /\{showCloseButton\s*&&/)
})

test('authenticated customer app mounts the first-login password setup modal', () => {
  const source = read('apps/customer/src/App.jsx')
  assert.match(source, /CustomerPasswordSetupModal/)
  assert.match(source, /<CustomerPasswordSetupModal\s*\/>/)
})
