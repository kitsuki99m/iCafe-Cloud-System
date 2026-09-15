import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(new URL('..', import.meta.url).pathname)
const cssPath = path.join(root, 'apps/customer/src/index.css')
const distCssPath = path.join(root, 'apps/customer/dist/assets/index-BfDRE8wz.css')
const css = fs.readFileSync(cssPath, 'utf8')
const distCss = fs.readFileSync(distCssPath, 'utf8')

test('compact customer kiosk clips the transparent page canvas to rounded corners', () => {
  const compactMedia = css.match(/@media \(max-width: 420px\) and \(max-height: 180px\) \{[\s\S]*?\n\}/)?.[0] || ''
  assert.match(compactMedia, /html,\s*\n\s*body,\s*\n\s*#root\s*\{/, 'compact media query should target the root page canvas')
  assert.match(compactMedia, /border-radius:\s*9px\s*!important;/, 'compact root canvas must have rounded corners')
  assert.match(compactMedia, /overflow:\s*hidden\s*!important;/, 'compact root canvas must clip its transparent corners')
  assert.match(distCss, /@media \(max-width:420px\) and \(max-height:180px\)\{html,body,#root\{border-radius:9px!important;overflow:hidden!important\}\}/, 'bundled customer CSS must preserve the compact rounded-corner fix')
})
