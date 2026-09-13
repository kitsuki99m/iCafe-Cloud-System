import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8')

test('Admin switches from desktop sidebar to touch navigation below desktop width', () => {
  const layout = read('apps/admin/src/components/layout/MainLayout.jsx')
  assert.match(layout, /admin-sidebar[^"\n]*hidden[^"\n]*lg:flex/)
  assert.match(layout, /admin-mobile-header[^"\n]*lg:hidden/)
  assert.match(layout, /admin-mobile-drawer/)
  assert.match(layout, /mobileNavOpen/)
  assert.match(layout, /h-dvh/)
})

test('Admin responsive CSS explicitly covers tablets, iPhone-class phones, and 320px-class screens', () => {
  const css = read('apps/admin/src/index.css')
  assert.match(css, /@media \(max-width: 1023px\)/)
  assert.match(css, /@media \(max-width: 767px\)/)
  assert.match(css, /@media \(max-width: 479px\)/)
  assert.match(css, /@media \(max-width: 359px\)/)
  assert.match(css, /100dvh/)
})

test('Admin mobile overlays and data tables remain usable instead of shrinking desktop geometry', () => {
  const css = read('apps/admin/src/index.css')
  const members = read('apps/admin/src/pages/MembersPage.jsx')
  assert.match(css, /\.admin-side-panel\s*\{[\s\S]*?inset:\s*0\s*!important;/)
  assert.match(css, /\.admin-modal-shell\s*\{[\s\S]*?100dvh/)
  assert.match(css, /\.admin-table-shell[\s\S]*?overflow-x:\s*auto/)
  assert.match(members, /min-w-\[760px\]/)
})

test('Overview header and metrics have mobile-specific composition rather than fixed desktop layout', () => {
  const overview = read('apps/admin/src/pages/OverviewPage.jsx')
  const css = read('apps/admin/src/index.css')
  assert.match(overview, /overview-header-actions/)
  assert.match(css, /\.overview-header\s*\{[\s\S]*?flex-direction:\s*column/)
  assert.match(css, /\.admin-metric-grid,[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/)
})

test('developer lifecycle controls remain usable on phone widths',()=>{
  const page=read('apps/admin/src/pages/DeveloperConsolePage.jsx')
  assert.match(page,/grid-cols-2 gap-2 sm:grid-cols-4/)
  assert.match(page,/items-end justify-center[\s\S]*sm:items-center/)
  assert.match(page,/max-h-\[100dvh\]/)
  assert.match(page,/sm:grid-cols-2/)
  assert.match(page,/Type \{selected\.business_name\} to confirm/)
})


test('Cloud login, registration, and invite setup own a scrollable 100dvh viewport on phones and tablets', () => {
  const css=read('apps/admin/src/index.css')
  const login=read('apps/admin/src/components/auth/AdminLoginForm.jsx')
  const invite=read('apps/admin/src/components/cloud/CloudInviteSetup.jsx')
  assert.match(css, /@media \(max-width: 1023px\)[\s\S]*?\.admin-login-shell[\s\S]*?height: 100dvh[\s\S]*?overflow-y: scroll/)
  assert.match(css, /scrollbar-gutter: stable/)
  assert.match(css, /\.admin-login-card input,[\s\S]*?font-size: 16px/)
  assert.match(css, /\.admin-auth-single/)
  assert.match(login, /admin-login-feature-list/)
  assert.match(login, /admin-login-security-note/)
  assert.match(invite, /admin-auth-single/)
})
