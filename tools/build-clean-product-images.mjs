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

for (const dir of targetDirs) {
  fs.mkdirSync(dir, { recursive: true })
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function searchProductPhoto(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=IRFLTR&first=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    if (!res.ok) return []
    const html = await res.text()
    const matches = [...html.matchAll(/murl&quot;:&quot;(http[^&]+)&quot;/g)].map((m) => m[1])
    return matches
  } catch (e) {
    return []
  }
}

async function downloadAndMakeWhite(urls) {
  for (const url of urls) {
    if (!url || !url.startsWith('http')) continue
    if (url.includes('.svg') || url.includes('facebook') || url.includes('instagram')) continue

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 7000)
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/*,*/*;q=0.8'
        }
      })
      clearTimeout(timeout)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 3000) continue

      const img = sharp(buf)
      const meta = await img.metadata()
      if (!meta.width || !meta.height || meta.width < 100 || meta.height < 100) continue

      // Clean white background canvas with aspect-ratio contain and quality 85 WebP
      const processedBuffer = await img
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .resize(320, 320, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 }
        })
        .webp({ quality: 85 })
        .toBuffer()

      return { buffer: processedBuffer, sourceUrl: url }
    } catch (e) {
      continue
    }
  }
  return null
}

async function main() {
  console.log(`Starting clean white-background product image generation for ${PHILIPPINE_MENU_CATALOG.length} items...`)

  let successCount = 0
  let failedCount = 0
  const failedItems = []

  for (let i = 0; i < PHILIPPINE_MENU_CATALOG.length; i++) {
    const item = PHILIPPINE_MENU_CATALOG[i]
    const filename = path.basename(item.imageUrl)
    console.log(`[${i + 1}/${PHILIPPINE_MENU_CATALOG.length}] Processing ${item.name}...`)

    let query = `${item.name} packaging product`
    if (item.category === 'Drinks') {
      query = `${item.name} bottle can`
    } else if (item.subcategory === 'Rice Meals & Silog') {
      query = `${item.name} plate meal`
    }

    let urls = await searchProductPhoto(query)
    if (!urls.length) {
      urls = await searchProductPhoto(`${item.name} food`)
    }

    const result = await downloadAndMakeWhite(urls)
    if (result) {
      for (const dir of targetDirs) {
        fs.writeFileSync(path.join(dir, filename), result.buffer)
      }
      console.log(`  ✓ Saved ${filename} (${result.buffer.length} bytes)`)
      successCount++
    } else {
      console.warn(`  ✗ Could not fetch image for: ${item.name}`)
      failedCount++
      failedItems.push(item)
    }

    await delay(400)
  }

  // Retry failed items if any
  if (failedItems.length > 0) {
    console.log(`\nRetrying ${failedItems.length} failed items...`)
    for (let j = 0; j < failedItems.length; j++) {
      const item = failedItems[j]
      const filename = path.basename(item.imageUrl)
      const simplifiedQuery = item.name.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      console.log(`[Retry ${j + 1}/${failedItems.length}] ${simplifiedQuery}...`)
      const urls = await searchProductPhoto(simplifiedQuery)
      const result = await downloadAndMakeWhite(urls)
      if (result) {
        for (const dir of targetDirs) {
          fs.writeFileSync(path.join(dir, filename), result.buffer)
        }
        console.log(`  ✓ Retry saved ${filename} (${result.buffer.length} bytes)`)
        successCount++
        failedCount--
      }
      await delay(400)
    }
  }

  // Sync to SQLite database
  const { createRequire } = await import('node:module')
  const requireBackend = createRequire(path.join(repoRoot, 'backend', 'package.json'))
  const Database = requireBackend('better-sqlite3')
  const dbFile = path.join(repoRoot, 'backend', 'data', 'aezakmi.sqlite')
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const updateStmt = db.prepare('UPDATE menu_items SET image_url = ? WHERE id = ?')
  const tx = db.transaction(() => {
    for (const item of PHILIPPINE_MENU_CATALOG) {
      const filename = path.basename(item.imageUrl)
      const localFile = path.join(targetDirs[0], filename)
      if (fs.existsSync(localFile) && fs.statSync(localFile).size > 2000) {
        updateStmt.run(`/assets/menu/${filename}`, item.id)
      }
    }
  })
  tx()
  console.log(`Updated database image_url references in ${dbFile}`)

  // Clean test files
  const testFiles = fs.readdirSync(targetDirs[0]).filter((f) => f.startsWith('test-'))
  for (const dir of targetDirs) {
    for (const tf of testFiles) {
      const p = path.join(dir, tf)
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
  }

  console.log('\n========================================')
  console.log(`All Products Processed!`)
  console.log(`Success: ${successCount} / ${PHILIPPINE_MENU_CATALOG.length}`)
  if (failedCount > 0) {
    console.log(`Failed: ${failedCount}`)
  }
  console.log('========================================')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
