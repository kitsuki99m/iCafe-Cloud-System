import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const html = fs.readFileSync('apps/admin/index.html', 'utf8')
const main = fs.readFileSync('apps/admin/src/main.jsx', 'utf8')
const pwa = fs.readFileSync('apps/admin/src/lib/pwa.js', 'utf8')
const installButton = fs.readFileSync('apps/admin/src/components/common/PwaInstallButton.jsx', 'utf8')
const layout = fs.readFileSync('apps/admin/src/components/layout/MainLayout.jsx', 'utf8')
const sw = fs.readFileSync('apps/admin/public/sw.js', 'utf8')
const manifest = JSON.parse(fs.readFileSync('apps/admin/public/manifest.webmanifest', 'utf8'))
const vercel = JSON.parse(fs.readFileSync('apps/admin/vercel.json', 'utf8'))

test('Admin web bundle exposes installable mobile PWA metadata without changing Customer Station', () => {
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/)
  assert.match(html, /apple-mobile-web-app-capable/)
  assert.match(html, /viewport-fit=cover/)
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.start_url, '/#/')
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && String(icon.purpose).includes('maskable')))
})

test('Admin PWA service worker is web-only and never intercepts API or Socket.IO requests', () => {
  assert.match(main, /registerAdminPwa\(\)/)
  assert.match(pwa, /if \(window\.aezakmiAdmin\) return false/)
  assert.match(pwa, /navigator\.serviceWorker\.register\('\/sw\.js'/)
  assert.match(sw, /url\.pathname\.startsWith\('\/api\/'\)/)
  assert.match(sw, /url\.pathname\.startsWith\('\/socket\.io\/'\)/)
  assert.match(sw, /request\.mode === 'navigate'/)
  assert.match(sw, /networkFirst\(request, '\/index\.html'\)/)
})

test('mobile Admin drawer exposes native install prompt and iOS home-screen guidance', () => {
  assert.match(layout, /<PwaInstallButton \/>/)
  assert.match(installButton, /beforeinstallprompt|promptAdminPwaInstall/)
  assert.match(installButton, /Install Admin App/)
  assert.match(installButton, /Add to Home Screen/)
})

test('Vercel keeps the service worker fresh enough to discover Admin updates', () => {
  const swHeader = vercel.headers.find((entry) => entry.source === '/sw.js')
  assert.ok(swHeader)
  const cacheControl = swHeader.headers.find((entry) => entry.key.toLowerCase() === 'cache-control')
  assert.match(cacheControl?.value || '', /no-cache|no-store/)
})
