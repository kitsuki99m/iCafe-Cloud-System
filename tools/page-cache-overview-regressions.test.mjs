import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('all Admin pages with independent remote data use IndexedDB snapshots', () => {
  const pages = [
    'apps/admin/src/pages/OverviewPage.jsx',
    'apps/admin/src/pages/EarningsPage.jsx',
    'apps/admin/src/pages/AnalyticsPage.jsx',
    'apps/admin/src/pages/LogsPage.jsx',
    'apps/admin/src/pages/SettingsPage.jsx',
    'apps/admin/src/pages/DeveloperConsolePage.jsx',
  ]
  for (const page of pages) {
    const source = read(page)
    assert.match(source, /readSnapshot/)
    assert.match(source, /writeSnapshot/)
  }
  const appData = read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(appData, /readSnapshot/)
  assert.match(appData, /writeSnapshot/)
})

test('page cache keys isolate Cloud branches and local users', () => {
  const source = read('apps/admin/src/lib/pageCache.js')
  assert.match(source, /isCloudAdmin\(\)/)
  assert.match(source, /cloudBranchId\(\)/)
  assert.match(source, /cloud:\$\{user\.id\}/)
  assert.match(source, /local:\$\{user\.id\}:\$\{user\.role/)
})

test('Overview revalidates cached dashboard data and does not trust stale dashboard status totals', () => {
  const source = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(source, /scopedPageCacheKey\('overview',user\)/)
  assert.match(source, /readSnapshot\(key\)/)
  assert.match(source, /writeSnapshot\(requestCacheKey,next\)/)
  assert.match(source, /setInterval\(\(\)=>\{if\(document\.visibilityState==='visible'\)void load\(\)\},60000\)/)
  assert.match(source, /socket\.on\('data:changed',onChanged\)/)
  assert.match(source, /const statusCounts=useMemo/)
  assert.match(source, /for\(const pc of pcs\|\|\[\]\)/)
  assert.doesNotMatch(source, /\['Available',summary\.available/)
})

test('Overview treats offline and reserved PCs correctly and removes expired prepaid sessions', () => {
  const source = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(source, /offline: \{ label:'Offline'/)
  assert.match(source, /reserved: \{ label:'Reserved'/)
  assert.match(source, /STATUS_META\[effectivePcStatus\(pc\)\]\|\|STATUS_META\.offline/)
  assert.match(source, /const liveSessions=useMemo/)
  assert.match(source, /const currentSessions=useMemo/)
  assert.match(source, /expires>nowMs/)
  assert.match(source, /manilaWeek\(new Date\(nowMs\)\)/)
  assert.match(source, /formatRelativeTime\(item\.at,nowMs\)/)
})

test('Overview and Analytics revenue use the same paid-receipt gross semantics as Earnings', () => {
  const backend = read('backend/src/routes/apiRoutes.js')
  const cloud = read('apps/admin/src/lib/cloudClient.js')
  assert.match(backend, /event_type!='session_refund'/)
  assert.match(backend, /CASE WHEN amount_centavos>0 THEN amount_centavos ELSE 0 END/)
  assert.doesNotMatch(backend.slice(backend.indexOf('router.get(\"/analytics\"'), backend.indexOf('router.get(\n  \"/billing-policy\"')), /event_type NOT IN \('wallet_top_up','member_initial_wallet'\)/)
  assert.match(cloud, /const grossRevenue = \(revenue \|\| \[\]\)\.filter/)
  assert.match(cloud, /String\(item\.event_type \|\| \"\"\) !== \"session_refund\"/)
})
