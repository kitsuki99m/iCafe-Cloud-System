import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { PHILIPPINE_MENU_CATALOG } from '../apps/admin/src/data/philippineMenuPresets.js'

const repoRoot = path.resolve(import.meta.dirname, '..')

const targetDirs = [
  path.join(repoRoot, 'apps', 'admin', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'apps', 'customer', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'backend', 'public', 'assets', 'menu')
]

// Delay helper
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function searchTransparentPngs(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query + ' transparent png')}&qft=+filterui:photo-transparent&form=IRFLTR&first=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    if (!res.ok) return []
    const html = await res.text()
    const results = []
    const murlMatches = html.matchAll(/murl&quot;:&quot;(http[^&]+)&quot;/g)
    for (const match of murlMatches) {
      results.push(match[1])
    }
    return results
  } catch (e) {
    return []
  }
}

// Download candidate and verify it has genuine transparency
async function downloadAndVerifyTransparentPng(urls) {
  for (const url of urls) {
    if (!url || !url.startsWith('http')) continue
    // Skip svgs, vector preview badges, or bad domains
    if (url.includes('.svg') || url.includes('facebook.com') || url.includes('instagram.com')) continue

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/png,image/*,*/*;q=0.8'
        }
      })
      clearTimeout(timeout)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 3000) continue

      const img = sharp(buf)
      const meta = await img.metadata()
      if (!meta.hasAlpha || !meta.width || !meta.height) continue
      if (meta.width < 120 || meta.height < 120) continue

      // Check pixel data for genuine transparency
      const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
      let transparentPixels = 0
      for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 20) transparentPixels++
      }
      const transRatio = transparentPixels / (info.width * info.height)
      // Must have at least 15% transparent pixels natively
      if (transRatio < 0.15) continue

      // Verify corners are transparent (not a solid rectangle with fake checkerboard)
      const corners = [
        (2 * info.width + 2) * 4 + 3,
        (2 * info.width + (info.width - 3)) * 4 + 3,
        ((info.height - 3) * info.width + 2) * 4 + 3,
        ((info.height - 3) * info.width + (info.width - 3)) * 4 + 3
      ]
      const cornersTransparent = corners.filter((c) => data[c] < 20).length
      if (cornersTransparent < 3) continue // At least 3 corners must be transparent

      // Resize down if giant
      let processed = sharp(buf)
      if (info.width > 800 || info.height > 800) {
        processed = processed.resize(800, 800, { fit: 'inside' })
      }

      const finalWebp = await processed
        .trim()
        .resize(320, 320, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 85 })
        .toBuffer()

      return { buffer: finalWebp, sourceUrl: url, ratio: transRatio }
    } catch (e) {
      continue
    }
  }
  return null
}

async function main() {
  console.log('Auditing existing assets and upgrading to genuine transparent PNGs...')

  let replacedCount = 0
  let skippedCount = 0

  for (let i = 0; i < PHILIPPINE_MENU_CATALOG.length; i++) {
    const item = PHILIPPINE_MENU_CATALOG[i]
    const filename = path.basename(item.imageUrl)
    const existingPath = path.join(targetDirs[0], filename)

    // Check existing file
    let needsUpgrade = false
    if (!fs.existsSync(existingPath)) {
      needsUpgrade = true
    } else {
      const fileBuffer = fs.readFileSync(existingPath)
      const { data, info } = await sharp(fileBuffer).raw().toBuffer({ resolveWithObject: true })
      let transparentCount = 0
      for (let p = 3; p < data.length; p += 4) {
        if (data[p] < 20) transparentCount++
      }
      const ratio = transparentCount / (info.width * info.height)
      // Check if corners have alpha
      const corners = [
        (2 * info.width + 2) * 4 + 3,
        (2 * info.width + (info.width - 3)) * 4 + 3,
        ((info.height - 3) * info.width + 2) * 4 + 3,
        ((info.height - 3) * info.width + (info.width - 3)) * 4 + 3
      ]
      const opaqueCorners = corners.filter((c) => data[c] > 20).length

      // If opaque corners or low ratio or known items that need better cutouts
      if (opaqueCorners > 0 || ratio < 0.22 || filename === 'coca-cola-original.webp' || filename === 'hotsilog.webp') {
        needsUpgrade = true
      }
    }

    if (!needsUpgrade) {
      skippedCount++
      continue
    }

    console.log(`[${i + 1}/${PHILIPPINE_MENU_CATALOG.length}] Upgrading ${item.name} (${filename})...`)
    const candidates = await searchTransparentPngs(item.name)
    const result = await downloadAndVerifyTransparentPng(candidates)

    if (result) {
      for (const dir of targetDirs) {
        fs.writeFileSync(path.join(dir, filename), result.buffer)
      }
      console.log(`  ✓ Successfully replaced with transparent PNG (${result.buffer.length} bytes, ratio ${(result.ratio * 100).toFixed(1)}%) from ${result.sourceUrl}`)
      replacedCount++
    } else {
      console.log(`  - No native transparent PNG found for ${item.name}, keeping existing`)
    }

    await delay(500)
  }

  // Clean test files
  const testFiles = fs.readdirSync(targetDirs[0]).filter((f) => f.startsWith('test-'))
  for (const dir of targetDirs) {
    for (const tf of testFiles) {
      const p = path.join(dir, tf)
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
  }

  console.log('\n========================================')
  console.log(`Transparent PNG Upgrade Complete!`)
  console.log(`Upgraded: ${replacedCount}`)
  console.log(`Already Clean & Transparent: ${skippedCount}`)
  console.log('========================================')
}

main().catch(console.error)
