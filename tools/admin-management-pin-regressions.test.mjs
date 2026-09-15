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

test('Customer Server settings use an offline-safe master setup PIN instead of contacting the saved server', () => {
  const gate = read('apps/customer/src/components/common/AdminPinGateModal.jsx')
  const config = read('apps/customer/src/lib/serverConfig.js')
  const main = read('apps/customer/electron/main.cjs')
  const preload = read('apps/customer/electron/preload.cjs')
  assert.match(gate, /verifyStationSetupMasterPin/)
  assert.doesNotMatch(gate, /recoveryMode|verifyAdminPinAtServer|Server IP \/ Hostname/)
  assert.match(config, /verifyStationSetupMasterPin/)
  assert.match(preload, /verifyStationSetupMasterPin/)
  assert.match(main, /STATION_SETUP_MASTER_PIN/)
  assert.match(main, /062321/)
  assert.match(main, /client:verify-setup-master-pin/)
})



test('Quit, Lock, and Unlock Customer Station use the Station Setup Master PIN instead of the Admin PIN', () => {
  const guard = read('apps/customer/src/components/common/EmergencyControlGuard.jsx')
  const api = read('backend/src/routes/apiRoutes.js')
  const env = read('backend/src/config/env.js')
  assert.match(guard, /verifyStationSetupMasterPin/)
  assert.match(guard, /Confirm with Master PIN/)
  assert.match(guard, /Admin login and management PINs are not accepted here/)
  assert.match(guard, /completed locally; Café Edge checkpoint unavailable/)
  assert.match(guard, /await executeLocally\(\)/)
  assert.match(guard, /executeEmergencyCommand/)
  assert.match(api, /STATION_SETUP_MASTER_PIN_INVALID/)
  assert.match(api, /env\.stationSetupMasterPin/)
  assert.match(api, /authorization: \"station_setup_master_pin\"/)
  assert.match(env, /AEZAKMI_STATION_SETUP_MASTER_PIN/)
})

test('Customer master setup PIN is not persisted in renderer storage', () => {
  const gate = read('apps/customer/src/components/common/AdminPinGateModal.jsx')
  const config = read('apps/customer/src/lib/serverConfig.js')
  const api = read('apps/customer/src/lib/api.js')
  assert.doesNotMatch(gate, /localStorage|sessionStorage|062321/)
  assert.doesNotMatch(config, /localStorage.*062321|sessionStorage.*062321/)
  assert.doesNotMatch(api, /062321/)
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
