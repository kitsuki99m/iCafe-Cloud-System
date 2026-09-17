import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const cssPath = path.join(root, 'apps/customer/src/index.css')
const distAssetsDir = path.join(root, 'apps/customer/dist/assets')
const distCssFileName = fs.existsSync(distAssetsDir) ? fs.readdirSync(distAssetsDir).find(f => f.endsWith('.css')) : null
const distCssPath = distCssFileName ? path.join(distAssetsDir, distCssFileName) : null
const css = fs.readFileSync(cssPath, 'utf8')
const distCss = distCssPath && fs.existsSync(distCssPath) ? fs.readFileSync(distCssPath, 'utf8') : ''

test('compact customer kiosk clips the transparent page canvas to rounded corners', () => {
  const compactMedia = css.match(/@media \(max-width: 420px\) and \(max-height: 180px\) \{[\s\S]*?\n\}/)?.[0] || ''
  assert.match(compactMedia, /html,\s*\n\s*body,\s*\n\s*#root\s*\{/, 'compact media query should target the root page canvas')
  assert.match(compactMedia, /border-radius:\s*9px\s*!important;/, 'compact root canvas must have rounded corners')
  assert.match(compactMedia, /overflow:\s*hidden\s*!important;/, 'compact root canvas must clip its transparent corners')
  assert.match(distCss, /@media \((?:max-width:420px|width<=420px)\) and \((?:max-height:180px|height<=180px)\)\{html,body,#root\{background:(?:0 0|transparent)!important;border-radius:9px!important;overflow:hidden!important\}\}/, 'bundled customer CSS must preserve the compact rounded-corner fix')
})
