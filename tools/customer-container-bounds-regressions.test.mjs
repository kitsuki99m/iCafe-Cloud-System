import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

test('customer desktop shells support full-screen dashboard with bounded login shell', () => {
  const css = read('apps/customer/src/index.css')
  assert.match(css, /\.customer-topbar[\s\S]*?max-width:\s*none/)
  assert.match(css, /\.customer-content-grid[\s\S]*?width:\s*100%/)
  assert.match(css, /\.customer-login-header[\s\S]*?max-width:\s*1120px/)
  assert.match(css, /\.customer-login-grid[\s\S]*?max-width:\s*1120px[\s\S]*?max-height:\s*720px/)
})

test('customer compact windows remove desktop height caps and remain scrollable', () => {
  const css = read('apps/customer/src/index.css')
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*?\.customer-dashboard-shell,[\s\S]*?overflow-y:\s*auto/)
  assert.match(css, /@media \(max-width:\s*820px\)[\s\S]*?\.customer-content-grid, \.customer-login-grid[\s\S]*?max-height:\s*none/)
})
