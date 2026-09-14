import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read=(path)=>fs.readFileSync(path,'utf8')

test('Admin display name is configurable and drives the Overview identity',()=>{
  const settings=read('apps/admin/src/pages/SettingsPage.jsx')
  const overview=read('apps/admin/src/pages/OverviewPage.jsx')
  const layout=read('apps/admin/src/components/layout/MainLayout.jsx')
  const backend=read('backend/src/routes/apiRoutes.js')
  const cloud=read('supabase/functions/admin-api/index.ts')
  assert.match(settings,/Field label="Display name"/)
  assert.match(settings,/profile\.displayName/)
  assert.match(backend,/"displayName"/)
  assert.match(backend,/INVALID_DISPLAY_NAME/)
  assert.match(cloud,/INVALID_DISPLAY_NAME/)
  assert.match(overview,/settings\?\.displayName/)
  assert.match(overview,/Hi, \{displayName\}/)
  assert.match(layout,/adminDisplayName/)
})

test('Admin shell uses the full browser viewport instead of a floating desktop frame',()=>{
  const layout=read('apps/admin/src/components/layout/MainLayout.jsx')
  const css=read('apps/admin/src/index.css')
  assert.match(layout,/admin-app-canvas h-dvh min-h-0 w-full overflow-hidden/)
  assert.doesNotMatch(layout,/admin-app-canvas[^"\n]*lg:p-5/)
  assert.match(css,/\.admin-shell-frame\s*\{[\s\S]*?border:\s*0;[\s\S]*?border-radius:\s*0;[\s\S]*?box-shadow:\s*none;/)
})

test('Desktop sidebar compacts on short viewports and mobile navigation remains available',()=>{
  const layout=read('apps/admin/src/components/layout/MainLayout.jsx')
  const css=read('apps/admin/src/index.css')
  assert.match(layout,/admin-sidebar-nav/)
  assert.match(layout,/admin-mobile-drawer/)
  assert.match(css,/@media \(min-width: 1024px\) and \(max-height: 760px\)/)
  assert.match(css,/@media \(min-width: 1024px\) and \(max-height: 650px\)/)
  assert.match(css,/admin-sidebar-status-subtitle/)
})
