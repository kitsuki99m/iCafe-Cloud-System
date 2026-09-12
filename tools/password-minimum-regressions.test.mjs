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

test('customer and admin credential changes require only a non-empty password, not a minimum length', () => {
  const source = read('backend/src/routes/authRoutes.js')
  const validator = sliceBetween(source, 'function passwordError', "router.post('/login'")
  assert.doesNotMatch(validator, /<\s*8|>=\s*8|at least 8/i)
  assert.match(validator, /length\s*===\s*0|!password\.length/)

  const customerSetup = sliceBetween(source, "router.post('/complete-customer-password-setup'", "router.post('/setup-credentials'")
  assert.match(customerSetup, /passwordError\(String\(newPassword\)\)/)
  assert.match(customerSetup, /PASSWORD_REQUIRED/)
  assert.doesNotMatch(customerSetup, /PASSWORD_TOO_SHORT/)

  const adminSetup = sliceBetween(source, "router.post('/setup-credentials'", "router.post('/logout'")
  assert.match(adminSetup, /passwordError\(String\(password\)\)/)
  assert.match(adminSetup, /PASSWORD_REQUIRED/)
  assert.doesNotMatch(adminSetup, /PASSWORD_TOO_SHORT/)
})

test('customer password modal accepts any non-empty matching password', () => {
  const source = read('apps/customer/src/components/auth/CustomerPasswordSetupModal.jsx')
  assert.doesNotMatch(source, /length\s*[<>]=?\s*8|at least 8 characters/i)
  assert.match(source, /newPassword\.length\s*>\s*0/)
  assert.match(source, /newPassword\s*===\s*confirmPassword/)
})

test('admin member password edit has no minimum-length guard in UI or backend', () => {
  const page = read('apps/admin/src/pages/MembersPage.jsx')
  const saveEdit = sliceBetween(page, 'const saveEdit=async()=>', 'const handleDelete=')
  assert.doesNotMatch(saveEdit, /password[^\n]*length\s*<\s*8|at least 8 characters/i)
  assert.doesNotMatch(page, /A new password must be at least 8 characters/i)

  const api = read('backend/src/routes/apiRoutes.js')
  const memberPatch = sliceBetween(api, `router.patch(\n  "/members/:id"`, 'router.delete("/members/:id"')
  assert.doesNotMatch(memberPatch, /password[^\n]*length\s*<\s*8|PASSWORD_TOO_SHORT|at least 8 characters/i)
})
