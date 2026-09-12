import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))

test('paired Customer Station can verify the existing Admin management PIN without executing a station command', () => {
  const api = read('backend/src/routes/apiRoutes.js')
  assert.match(api, /router\.post\(\s*["']\/public\/verify-admin-pin["'][\s\S]{0,220}requirePairedStation[\s\S]{0,220}stationControlLimiter/)
  assert.match(api, /ADMIN_PIN_NOT_CONFIGURED/)
  assert.match(api, /ADMIN_PIN_INVALID/)
  assert.match(api, /management PIN/i)
})

test('Customer Server button is PIN gated and saved server details are not mounted before verification', () => {
  assert.equal(exists('apps/customer/src/components/common/AdminPinGateModal.jsx'), true)
  const login = read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  assert.match(login, /AdminPinGateModal/)
  assert.match(login, /serverPinGateOpen/)
  assert.match(login, /setServerPinGateOpen\(true\)/)
  assert.match(login, /serverConnectionUnlocked/)
  assert.match(login, /serverConnectionUnlocked\s*&&\s*<ServerConnectionModal/)
  assert.doesNotMatch(login, /onClick=\{\(\) => setServerConnectionOpen\(true\)\}/)
})

test('Customer recovery verifies the same Admin PIN against a candidate server before opening or saving server config', () => {
  const gate = read('apps/customer/src/components/common/AdminPinGateModal.jsx')
  const config = read('apps/customer/src/lib/serverConfig.js')
  assert.match(gate, /recoveryMode/)
  assert.match(gate, /Server IP \/ Hostname/)
  assert.match(gate, /verifyAdminPinAtServer/)
  assert.match(gate, /onVerified/)
  assert.match(config, /export async function verifyAdminPinAtServer/)
  assert.match(config, /\/public\/verify-admin-pin/)
  assert.match(config, /X-Aezakmi-Station-Token/)
  assert.match(config, /SERVER_TEST_TIMEOUT_MS/)
})

test('Customer PIN gate does not create or persist a second local PIN', () => {
  const gate = read('apps/customer/src/components/common/AdminPinGateModal.jsx')
  const config = read('apps/customer/src/lib/serverConfig.js')
  assert.doesNotMatch(gate, /localStorage|sessionStorage/)
  assert.doesNotMatch(config, /management.*pin.*localStorage|admin.*pin.*localStorage/i)
})

test('Admin exposes authenticated credential management for PIN, password, and login method', () => {
  const auth = read('backend/src/routes/authRoutes.js')
  const settings = read('apps/admin/src/pages/SettingsPage.jsx')
  const ctx = read('apps/admin/src/context/AuthContext.jsx')
  assert.match(auth, /router\.post\(["']\/update-credentials["']/)
  assert.match(auth, /newPin/)
  assert.match(auth, /newPassword/)
  assert.match(auth, /authMethod/)
  assert.match(settings, /Management PIN/)
  assert.match(settings, /New password/)
  assert.match(settings, /PIN \+ Password/)
  assert.match(settings, /Current Admin credentials/)
  assert.match(ctx, /updateCredentials/)
})

test('password-only Admin login preserves the management PIN and credential changes revoke other sessions', () => {
  const auth = read('backend/src/routes/authRoutes.js')
  assert.doesNotMatch(auth, /pinHash\s*=\s*method===['"]password['"]\?null/)
  assert.match(auth, /nextPinHash[\s\S]{0,500}current\.pin_hash/)
  assert.match(auth, /UPDATE auth_sessions SET revoked_at=.*id<>\?/s)
  assert.match(auth, /credentials_changed/)
})
