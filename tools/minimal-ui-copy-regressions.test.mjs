import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root=process.cwd()
const read=p=>fs.readFileSync(path.join(root,p),'utf8')

test('Admin section cards keep headings and metrics compact',()=>{
  const shared=read('apps/admin/src/components/layout/AdminPageWorkspace.jsx')
  const overview=read('apps/admin/src/pages/OverviewPage.jsx')
  const settings=read('apps/admin/src/pages/SettingsPage.jsx')
  assert.doesNotMatch(shared,/\{subtitle \? <p/)
  assert.doesNotMatch(shared,/\{hint \? <p/)
  assert.doesNotMatch(overview,/\{subtitle&&<p/)
  assert.match(settings,/<h2[^>]*>\{title\}<\/h2>/)
  assert.doesNotMatch(settings,/<h2[^>]*>\{title\}<\/h2><p[^>]*>\{description\}<\/p>/)
})

test('Primary dashboards avoid redundant explanatory section prose',()=>{
  const overview=read('apps/admin/src/pages/OverviewPage.jsx')
  const analytics=read('apps/admin/src/pages/AnalyticsPage.jsx')
  const earnings=read('apps/admin/src/pages/EarningsPage.jsx')
  assert.doesNotMatch(overview,/A quick look at the stations that need attention\.<\/p>/)
  assert.doesNotMatch(analytics,/Revenue, traffic, and rate-plan usage for the selected window\.<\/p>/)
  assert.doesNotMatch(earnings,/Display only — earnings use paid receipt records, not this activity list\.<\/p>/)
})
