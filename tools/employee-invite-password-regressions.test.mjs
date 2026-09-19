import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('backend team invite generates temporary password and provisions user with must_change_credentials', () => {
  const api = read('backend/src/routes/apiRoutes.js')
  assert.match(api, /router\.post\(["']\/team\/invite["']/)
  assert.match(api, /temporaryPassword/)
  assert.match(api, /must_change_credentials\s*=\s*1/)
  assert.match(api, /Temporary Password/)
  assert.match(api, /On your first login, you will be required to set a new password/)
  assert.match(api, /temporaryPassword,/)
})

test('backend team resend invite updates temporary password and preserves must_change_credentials', () => {
  const api = read('backend/src/routes/apiRoutes.js')
  assert.match(api, /router\.post\(["']\/team\/resend-invite["']/)
  assert.match(api, /temporaryPassword/)
  assert.match(api, /must_change_credentials\s*=\s*1/)
})

test('auth setup credentials allows staff with must_change_credentials to set permanent password', () => {
  const auth = read('backend/src/routes/authRoutes.js')
  assert.match(auth, /router\.post\(["']\/setup-credentials["']/)
  assert.match(auth, /req\.auth\.role !== 'admin' && req\.auth\.role !== 'cashier'/)
  assert.match(auth, /must_change_credentials=0/)
})

test('cloud admin edge function includes temporary password in invite and resend templates', () => {
  const cloudAdmin = read('supabase/functions/admin-api/index.ts')
  assert.match(cloudAdmin, /route==='\/team\/invite'/)
  assert.match(cloudAdmin, /temporaryPassword/)
  assert.match(cloudAdmin, /Temporary Password/)
  assert.match(cloudAdmin, /On your first login, you will be required to set a new password/)
})

test('admin settings page captures temporary password and displays in UI and roster', () => {
  const settings = read('apps/admin/src/pages/SettingsPage.jsx')
  assert.match(settings, /temporaryPassword:\s*response\?\.temporaryPassword/)
  assert.match(settings, /Temporary password:/)
  assert.match(settings, /member\.temporaryPassword/)
})
