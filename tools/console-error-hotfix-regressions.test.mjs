import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('Members session top-up modal uses the canonical remaining-session formatter', () => {
  const source = read('apps/admin/src/pages/MembersPage.jsx')
  assert.match(source, /formatRemainingSession\(member\?\.activeSession\)/)
  assert.doesNotMatch(source, /\bformatRemaining\(/)
})

test('public branding logo explicitly permits cross-origin embedding', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  const start = source.indexOf('router.get("/public/branding/logo"')
  const end = source.indexOf('router.get("/public/rate-plans"', start)
  assert.ok(start >= 0 && end > start, 'branding logo route must exist')
  const route = source.slice(start, end)
  assert.match(route, /Cross-Origin-Resource-Policy["'],\s*["']cross-origin/)
})

test('admin Vite source includes a favicon public asset', () => {
  assert.equal(fs.existsSync(path.join(root, 'apps/admin/public/favicon.ico')), true)
})
