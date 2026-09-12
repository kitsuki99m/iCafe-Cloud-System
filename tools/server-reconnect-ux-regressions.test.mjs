import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')
const exists = (p) => fs.existsSync(path.join(root, p))

test('manual backend npm start defaults to LAN development without weakening packaged production startup', () => {
  const pkg = JSON.parse(read('backend/package.json'))
  const adminMain = read('apps/admin/electron/main.cjs')
  assert.equal(pkg.scripts.start, 'node scripts/start.mjs')
  assert.equal(exists('backend/scripts/start.mjs'), true)
  const start = read('backend/scripts/start.mjs')
  assert.match(start, /if \(!process\.env\.NODE_ENV\)/)
  assert.match(start, /process\.env\.NODE_ENV\s*=\s*['"]development['"]/)
  assert.match(start, /import\(['"]\.\.\/src\/server\.js['"]\)/)
  assert.match(adminMain, /NODE_ENV:\s*["']production["']/)
  assert.match(adminMain, /JWT_SECRET:\s*jwtSecret/)
})

test('server connection probes fail fast within four seconds and support cancellation', () => {
  for (const appName of ['admin', 'customer']) {
    const config = read(`apps/${appName}/src/lib/serverConfig.js`)
    assert.match(config, /SERVER_TEST_TIMEOUT_MS\s*=\s*4000/)
    assert.match(config, /signal/)
    assert.match(config, /controller\.abort\(\)/)
    assert.match(config, /testCurrentServerConfig/)
  }
})

test('server connection modals remain closable while testing and expose retry after failure', () => {
  for (const appName of ['admin', 'customer']) {
    const modal = read(`apps/${appName}/src/components/common/ServerConnectionModal.jsx`)
    assert.match(modal, /AbortController/)
    assert.match(modal, /abortRef/)
    assert.match(modal, /isTesting/)
    assert.match(modal, /isSaving/)
    assert.match(modal, /busy=\{isSaving\}/)
    assert.match(modal, /Try Again/)
    assert.match(modal, />Close<\/Button>/)
  }
})

test('admin health status uses the bounded server probe instead of an unbounded normal API request', () => {
  const hook = read('apps/admin/src/hooks/useBackendStatus.js')
  assert.match(hook, /testCurrentServerConfig/)
  assert.doesNotMatch(hook, /apiGet\(["']\/health["']\)/)
  assert.match(hook, /setStatus\("connecting"\)/)
})

test('admin login does not send auth requests while backend status is still connecting', () => {
  const login = read('apps/admin/src/components/auth/AdminLoginForm.jsx')
  assert.match(login, /backendReady\s*=\s*backendStatus === ["']online["']/)
  assert.match(login, /!backendReady/)
  assert.match(login, /Connecting…/)
})


test('packaged admin backend readiness wait and Socket.IO connect timeout are bounded to four seconds', () => {
  const main = read('apps/admin/electron/main.cjs')
  assert.match(main, /function waitForBackend\(port = 3000, host = \"127\.0\.0\.1\", timeout = 4000\)/)
  assert.match(main, /await waitForBackend\(3000, \"127\.0\.0\.1\", 4000\)/)
  for (const appName of ['admin', 'customer']) {
    const socket = read(`apps/${appName}/src/lib/socket.js`)
    assert.match(socket, /timeout:\s*4000/)
  }
})
