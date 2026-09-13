import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const manual = fs.readFileSync('apps/admin/src/components/admin/AdminSectionManual.jsx','utf8')
const layout = fs.readFileSync('apps/admin/src/components/layout/MainLayout.jsx','utf8')
const overview = fs.readFileSync('apps/admin/src/pages/OverviewPage.jsx','utf8')

for (const section of ['Overview','Clients','Rates','Members','Earnings','Analytics','Logs','Settings']) {
  test(`owner manual includes ${section}`, () => {
    assert.match(manual, new RegExp(`\\b${section}:\\s*\\{`))
  })
}

test('manual explains the high-risk owner workflows', () => {
  for (const phrase of ['wallet balance', 'saved session time', 'prepaid', 'GCash', 'Management PIN', 'audit trail']) {
    assert.ok(manual.toLowerCase().includes(phrase.toLowerCase()), `missing manual phrase: ${phrase}`)
  }
})

test('main layout exposes section manual on desktop and mobile', () => {
  assert.match(layout, /AdminSectionManual/)
  assert.match(layout, /setManualOpen\(true\)/)
  assert.match(layout, /Open \$\{currentLabel\} owner manual/)
})

test('overview exposes its own owner-manual control', () => {
  assert.match(overview, /Open Overview owner manual/)
  assert.match(overview, /section="Overview"/)
})
