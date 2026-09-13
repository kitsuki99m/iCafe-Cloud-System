import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('customer light theme uses true gold accents and slate tertiary copy', () => {
  const css = read('apps/customer/src/index.css')
  const light = css.slice(css.indexOf('@theme {'), css.indexOf('@keyframes pulseLed'))
  assert.match(light, /--color-gold:\s*#C9A85D;/)
  assert.match(light, /--color-gold-dim:\s*#8B6B25;/)
  assert.match(light, /--color-slate-soft:\s*#5F6F82;/)
})

test('customer dark theme keeps gold accent distinct from slate tertiary copy', () => {
  const css = read('apps/customer/src/index.css')
  const darkStart = css.indexOf('html[data-theme="dark"] {')
  const darkEnd = css.indexOf('html[data-theme="dark"] body', darkStart)
  const dark = css.slice(darkStart, darkEnd)
  assert.match(dark, /--color-gold:\s*#D6B76A;/)
  assert.match(dark, /--color-gold-dim:\s*#E8CD85;/)
  assert.match(dark, /--color-slate-soft:\s*#94A3B8;/)
  assert.doesNotMatch(dark, /--color-slate-soft:\s*#C9B27A;/)
})

test('customer forced-dark login surface uses the same gold and slate semantics', () => {
  const css = read('apps/customer/src/index.css')
  const start = css.indexOf('.customer-login-dark {')
  const end = css.indexOf('\n  }', start)
  const section = css.slice(start, end)
  assert.match(section, /--color-gold:\s*#D6B76A;/)
  assert.match(section, /--color-gold-dim:\s*#E8CD85;/)
  assert.match(section, /--color-slate-soft:\s*#94A3B8;/)
})

test('customer text selection is opaque gold with readable dark foreground', () => {
  const css = read('apps/customer/src/index.css')
  assert.match(css, /::selection\s*\{[\s\S]*?background(?:-color)?:\s*var\(--color-gold\);[\s\S]*?color:\s*#202937;/)
  assert.match(css, /::-moz-selection\s*\{[\s\S]*?background(?:-color)?:\s*var\(--color-gold\);[\s\S]*?color:\s*#202937;/)
  assert.doesNotMatch(css, /::selection\s*\{[\s\S]*?bg-gold\/30/)
})

test('customer selection controls use gold instead of teal or midnight as a generic active color', () => {
  const topup = read('apps/customer/src/components/customer/TopUpModal.jsx')
  const extend = read('apps/customer/src/components/customer/ExtendSessionModal.jsx')
  const loginTopup = read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  assert.doesNotMatch(topup, /method === 'gcash'[\s\S]{0,180}border-teal/)
  assert.doesNotMatch(extend, /method === id[\s\S]{0,220}border-teal/)
  assert.match(loginTopup, /method === "cash" \? "border-gold\/50 bg-gold\/10 text-gold-dim"/)
  assert.match(loginTopup, /method === "gcash" \? "border-gold\/50 bg-gold\/10 text-gold-dim"/)
})

test('shared customer modal uses semantic text and surfaces rather than hardcoded midnight/dance colors', () => {
  const modal = read('apps/customer/src/components/common/Modal.jsx')
  assert.match(modal, /eyebrow mb-1\.5 text-gold-dim/)
  assert.match(modal, /tracking-tight text-ink-900/)
  assert.match(modal, /overflow-y-auto[^"']*text-ink-900/)
  assert.match(modal, /hover:bg-surface-raised/)
  assert.match(modal, /border-t border-surface-line bg-surface-raised\/60/)
  assert.doesNotMatch(modal, /text-midnight/)
  assert.doesNotMatch(modal, /bg-dance/)
  assert.doesNotMatch(modal, /text-grape/)
})
