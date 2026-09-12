import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))

test('both Electron apps persist runtime server host and port under userData through trusted IPC', () => {
  for (const appName of ['admin', 'customer']) {
    const main = read(`apps/${appName}/electron/main.cjs`)
    const preload = read(`apps/${appName}/electron/preload.cjs`)
    assert.match(main, /server-config\.json/)
    assert.match(main, /app\.getPath\(['"]userData['"]\)/)
    assert.match(main, /isTrustedRenderer\(event\)/)
    assert.match(main, /server-config:get/)
    assert.match(main, /server-config:set/)
    assert.match(preload, /getServerConfig/)
    assert.match(preload, /setServerConfig/)
  }
})

test('runtime server config takes precedence while preserving development fallbacks', () => {
  for (const appName of ['admin', 'customer']) {
    const config = read(`apps/${appName}/src/lib/serverConfig.js`)
    const api = read(`apps/${appName}/src/lib/api.js`)
    assert.match(config, /getRuntimeServerConfig/)
    assert.match(config, /VITE_API_BASE_URL/)
    if (appName === 'admin') assert.match(config, /configured !== false/)
    assert.match(config, /window\.location\.protocol === ['"]file:['"]/)
    assert.match(api, /getApiBase/)
    assert.doesNotMatch(api, /const API_BASE\s*=/)
  }
})

test('Socket.IO derives its origin from the same resolved API base instead of its own env path', () => {
  for (const appName of ['admin', 'customer']) {
    const socket = read(`apps/${appName}/src/lib/socket.js`)
    assert.match(socket, /apiUrl\(['"]\/['"]\)/)
    assert.doesNotMatch(socket, /import\.meta\.env\.VITE_API_BASE_URL/)
  }
})

test('customer production build no longer requires a build-time backend IP', () => {
  const vite = read('apps/customer/vite.config.js')
  assert.doesNotMatch(vite, /production build requires VITE_API_BASE_URL/i)
  assert.doesNotMatch(vite, /command === ['"]build['"]/)
})

test('admin and customer login screens expose runtime Server Connection controls', () => {
  for (const appName of ['admin', 'customer']) {
    assert.equal(exists(`apps/${appName}/src/components/common/ServerConnectionModal.jsx`), true)
    const modal = read(`apps/${appName}/src/components/common/ServerConnectionModal.jsx`)
    const login = read(`apps/${appName}/src/components/auth/${appName === 'admin' ? 'AdminLoginForm' : 'CustomerLoginForm'}.jsx`)
    assert.match(modal, /Server Connection/)
    assert.match(modal, /Test Connection/)
    assert.match(read(`apps/${appName}/src/lib/serverConfig.js`), /\/health/)
    assert.match(modal, /window\.location\.reload\(\)/)
    assert.match(login, /ServerConnectionModal/)
    if (appName === 'customer') assert.match(login, /source === ["']not configured["']/)
  }
})
