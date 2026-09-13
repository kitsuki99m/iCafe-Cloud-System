import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('Settings no longer exposes or persists a global network prefix', () => {
  const settings = read('apps/admin/src/pages/SettingsPage.jsx')
  assert.doesNotMatch(settings, /settings-network|Customer LAN IP prefix|\bipPrefix\b|\bWifi\b/)
  const backend = read('backend/src/routes/apiRoutes.js')
  assert.doesNotMatch(backend, /configuredIpPrefix|incoming\.ipPrefix|ipPrefix:\s*configuredIpPrefix/)
})

test('Admin Add PC no longer exposes IP Prefix and Cloud stations map IP after pairing', () => {
  const source = read('apps/admin/src/components/floor/PcFormModal.jsx')
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.doesNotMatch(source, /IP Prefix|Last Octet|createPrefix|composeCreateIp/)
  assert.match(source, /cloudManaged/)
  assert.match(source, /IP address is automatic/)
  assert.match(source, /paired Customer Station/)
  assert.match(source, /Local-only Café Edge[\s\S]*IP Address/)
  assert.match(floor, /cloudManaged=\{isCloudAdmin\(\)\}/)
})

test('Bulk Add no longer exposes IP Prefix; Cloud maps addresses and local mode uses one full starting IP', () => {
  const source = read('apps/admin/src/components/bulk/BulkAddPcModal.jsx')
  assert.doesNotMatch(source, /IP Prefix|const \[prefix, setPrefix\]/)
  assert.match(source, /cloudManaged/)
  assert.match(source, /IP after pairing/)
  assert.match(source, /Starting IP Address/)
  assert.match(source, /There is no shared IP-prefix setting/)
})

test('PC create and update validate complete IPv4 addresses without a global subnet restriction', () => {
  const routes = read('backend/src/routes/apiRoutes.js')
  assert.match(routes, /validateStationIp\(cleanIp\)/)
  assert.match(routes, /validateStationIp\(next\.ipAddress\)/)
  assert.doesNotMatch(routes, /validateStationIp\([^,]+,\s*configuredIpPrefix\(\)\)/)
  const validation = read('backend/src/utils/validation.js')
  assert.match(validation, /export function validateStationIp\(value\)/)
  assert.doesNotMatch(validation, /INVALID_IP_PREFIX|configured cafe network prefix/)
})

test('Customer station identity no longer receives a global prefix from settings or IPC', () => {
  const auth = read('apps/customer/src/context/AuthContext.jsx')
  const appData = read('apps/customer/src/context/AppDataContext.jsx')
  const preload = read('apps/customer/electron/preload.cjs')
  const main = read('apps/customer/electron/main.cjs')
  assert.doesNotMatch(auth, /setIpPrefix|settings\?\.ipPrefix/)
  assert.doesNotMatch(appData, /\bipPrefix\b/)
  assert.doesNotMatch(preload, /setIpPrefix|client:set-ip-prefix/)
  assert.doesNotMatch(main, /runtimeIpPrefix|setRuntimeIpPrefix|client:set-ip-prefix|AEZAKMI_IP_PREFIX/)
  assert.match(main, /function getLocalIPv4\(\)/)
})

test('backend environment no longer documents or logs a global IP prefix', () => {
  const env = read('backend/src/config/env.js')
  const example = read('backend/.env.example')
  const server = read('backend/src/server.js')
  assert.doesNotMatch(env, /ipPrefix|IP_PREFIX/)
  assert.doesNotMatch(example, /IP_PREFIX/)
  assert.doesNotMatch(server, /Configured client IP prefix|env\.ipPrefix/)
})
