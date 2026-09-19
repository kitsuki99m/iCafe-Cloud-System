import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('cloudClient exposes cloudRequestPasswordReset calling recover endpoint', () => {
  const client = read('apps/admin/src/lib/cloudClient.js')
  assert.match(client, /export\s+async\s+function\s+cloudRequestPasswordReset/)
  assert.match(client, /\/auth\/v1\/recover/)
})

test('backend auth routes exposes /forgot-password for staff and sets must_change_credentials', () => {
  const auth = read('backend/src/routes/authRoutes.js')
  assert.match(auth, /router\.post\(["']\/forgot-password["']/)
  assert.match(auth, /role IN \(['"]admin['"],\s*['"]cashier['"]\)/)
  assert.match(auth, /must_change_credentials\s*=\s*1/)
  assert.match(auth, /temporaryPassword/)
})

test('admin login form integrates forgot password mode and trigger links for cloud and local staff', () => {
  const login = read('apps/admin/src/components/auth/AdminLoginForm.jsx')
  assert.match(login, /cloudRequestPasswordReset/)
  assert.match(login, /handleForgotPassword/)
  assert.match(login, /Forgot password\?/)
  assert.match(login, /Forgot PIN\?/)
  assert.match(login, /Send recovery instructions/)
})
