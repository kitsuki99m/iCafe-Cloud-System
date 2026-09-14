import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('packaged Customer has no automatic per-PC member database authority', () => {
  const main=read('apps/customer/electron/main.cjs')
  const pkg=JSON.parse(read('apps/customer/package.json'))
  assert.doesNotMatch(main,/AEZAKMI_EMBEDDED_CUSTOMER_SERVER|ensureLocalBackend|backend-data/)
  assert.doesNotMatch(JSON.stringify(pkg.build),/\"to\":\"backend\"|afterPack/)
})

test('Cloud loss falls back only to configured LAN Cafe Edge and reports authority outages clearly', () => {
  const api=read('apps/customer/src/lib/api.js')
  const config=read('apps/customer/src/lib/serverConfig.js')
  assert.match(api,/setFallbackTransportActive\(true/)
  assert.match(api,/CAFE_EDGE_UNAVAILABLE/)
  assert.match(api,/Café Edge is unavailable on the LAN/)
  assert.match(config,/CAFE_EDGE_NOT_CONFIGURED/)
  assert.match(config,/cashier\/Admin PC LAN address/)
})

test('cached Customer branding survives missing server URL resolution instead of reverting identity', () => {
  const branding=read('apps/customer/src/hooks/useBranding.js')
  assert.match(branding,/Network resolution may be unavailable during startup/)
  assert.match(branding,/return normalizeBranding\(raw\)/)
  assert.match(branding,/try \{ return apiUrl/)
  assert.match(branding,/cafeName:'Aezakmi Cafe'/)
})

test('active prepaid checkpoint persists locally in Electron lifecycle marker', () => {
  const main=read('apps/customer/electron/main.cjs')
  assert.match(main,/remainingSeconds/)
  assert.match(main,/checkpointedAt/)
  assert.match(main,/balance/)
  assert.match(main,/client:update-widget[\s\S]*touchSessionLifecycle\(data/)
})

test('login kiosk explains cached offline state without claiming bad credentials', () => {
  const login=read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  assert.match(login,/Cloud and Café Edge are currently unavailable/)
  assert.match(login,/Connection required/)
  assert.doesNotMatch(login,/invalid credentials|wrong password/i)
})

test('optimistic Customer mutations cannot overwrite the persistent last-known-good cache', () => {
  const data=read('apps/customer/src/context/AppDataContext.jsx')
  const start=data.indexOf('function optimisticState')
  const end=data.indexOf('function endSession',start)
  const block=data.slice(start,end)
  assert.match(block,/Optimistic UI is memory-only/)
  assert.doesNotMatch(block,/writeSnapshot/)
})
