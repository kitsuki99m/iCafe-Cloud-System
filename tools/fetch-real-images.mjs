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

// Flood fill to turn outer white / light / gray studio background into transparent
function removeLightBackground(rawBuffer, width, height, channels) {
  const output = Buffer.from(rawBuffer)
  const visited = new Uint8Array(width * height)
  const queue = []

  function isBgPixel(idx) {
    const r = output[idx]
    const g = output[idx + 1]
    const b = output[idx + 2]
    const a = channels === 4 ? output[idx + 3] : 255
    if (a < 50) return true // already transparent
    const min = Math.min(r, g, b)
    const max = Math.max(r, g, b)
    const diff = max - min
    // High brightness and low color saturation
    return (min > 230 && diff < 28) || min > 245
  }

  // Seed with all edge pixels (top, bottom, left, right)
  for (let x = 0; x < width; x++) {
    const topIdx = x * 4
    if (isBgPixel(topIdx) && !visited[x]) {
      visited[x] = 1
      queue.push(x, 0)
    }
    const btmPos = (height - 1) * width + x
    const btmIdx = btmPos * 4
    if (isBgPixel(btmIdx) && !visited[btmPos]) {
      visited[btmPos] = 1
      queue.push(x, height - 1)
    }
  }

  for (let y = 0; y < height; y++) {
    const leftPos = y * width
    const leftIdx = leftPos * 4
    if (isBgPixel(leftIdx) && !visited[leftPos]) {
      visited[leftPos] = 1
      queue.push(0, y)
    }
    const rightPos = y * width + (width - 1)
    const rightIdx = rightPos * 4
    if (isBgPixel(rightIdx) && !visited[rightPos]) {
      visited[rightPos] = 1
      queue.push(width - 1, y)
    }
  }

  let head = 0
  const dx = [1, -1, 0, 0]
  const dy = [0, 0, 1, -1]

  while (head < queue.length) {
    const cx = queue[head++]
    const cy = queue[head++]
    const pos = cy * width + cx
    const idx = pos * 4

    output[idx + 3] = 0 // Transparent

    for (let i = 0; i < 4; i++) {
      const nx = cx + dx[i]
      const ny = cy + dy[i]
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const npos = ny * width + nx
        if (!visited[npos]) {
          const nidx = npos * 4
          if (isBgPixel(nidx)) {
            visited[npos] = 1
            queue.push(nx, ny)
          }
        }
      }
    }
  }

  return output
}

async function searchBingImages(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&qft=+filterui:photo-photo&form=IRFLTR&first=1`
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
      results.push({ image: match[1] })
    }
    return results
  } catch (e) {
    return []
  }
}

async function searchDuckDuckGoImages(query) {
  try {
    const tokenUrl = 'https://duckduckgo.com/?q=' + encodeURIComponent(query)
    const tokenRes = await fetch(tokenUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })
    const html = await tokenRes.text()
    const vqdMatch = html.match(/vqd=['"]?([0-9-]+)['"]?/)
    if (!vqdMatch) return []

    const vqd = vqdMatch[1]
    const apiUrl = `https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&p=1`
    const imgRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/'
      }
    })
    const text = await imgRes.text()
    const data = JSON.parse(text)
    return (data.results || []).map((r) => ({ image: r.image }))
  } catch (e) {
    return []
  }
}

async function downloadAndProcessImage(candidates) {
  for (const c of candidates) {
    const url = c.image
    if (!url || !url.startsWith('http')) continue
    // Skip svgs or extremely slow domains
    if (url.includes('.svg') || url.includes('facebook.com') || url.includes('instagram.com')) continue

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 7000)
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
      })
      clearTimeout(timeout)
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 2500) continue

      const img = sharp(buf)
      const meta = await img.metadata()
      if (!meta.width || !meta.height || meta.width < 100 || meta.height < 100) continue

      let processed = img
      if (meta.width > 800 || meta.height > 800) {
        processed = processed.resize(800, 800, { fit: 'inside' })
      }

      const { data, info } = await processed.ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const cutBuffer = removeLightBackground(data, info.width, info.height, 4)

      const finalWebp = await sharp(cutBuffer, {
        raw: {
          width: info.width,
          height: info.height,
          channels: 4
        }
      })
        .trim({ threshold: 10 })
        .resize(320, 320, {
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .webp({ quality: 85 })
        .toBuffer()

      return { buffer: finalWebp, sourceUrl: url }
    } catch (e) {
      continue
    }
  }
  return null
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function processItem(item, idx, total) {
  const filename = path.basename(item.imageUrl)
  const destPath = path.join(targetDirs[0], filename)
  if (fs.existsSync(destPath) && fs.statSync(destPath).size > 5000) {
    console.log(`[${idx + 1}/${total}] Already exists: ${filename}`)
    return true
  }

  console.log(`[${idx + 1}/${total}] Processing ${item.name}...`)

  // Construct search query
  let searchQuery = `${item.name} product packaging isolated`
  if (item.category === 'Drinks') {
    searchQuery = `${item.name} bottle can isolated`
  } else if (item.subcategory === 'Rice Meals & Silog' || item.subcategory === 'Silog & Hot Snacks') {
    searchQuery = `${item.name} plate isolated`
  }

  let candidates = await searchBingImages(searchQuery)
  if (!candidates.length) {
    // Retry with simpler query
    candidates = await searchBingImages(`${item.name} product`)
  }
  if (!candidates.length) {
    candidates = await searchDuckDuckGoImages(`${item.name} product`)
  }

  const processed = await downloadAndProcessImage(candidates)
  if (processed) {
    for (const dir of targetDirs) {
      fs.writeFileSync(path.join(dir, filename), processed.buffer)
    }
    console.log(`  ✓ Saved ${filename} (${processed.buffer.length} bytes)`)
    return true
  } else {
    console.warn(`  ✗ Could not process internet photo for: ${item.name}`)
    return false
  }
}

async function main() {
  console.log(`Starting real product image fetch for ${PHILIPPINE_MENU_CATALOG.length} items...`)
  let successCount = 0
  let failedCount = 0
  const failedItems = []

  for (let i = 0; i < PHILIPPINE_MENU_CATALOG.length; i++) {
    const item = PHILIPPINE_MENU_CATALOG[i]
    const ok = await processItem(item, i, PHILIPPINE_MENU_CATALOG.length)
    if (ok) {
      successCount++
    } else {
      failedCount++
      failedItems.push(item)
    }
    // Small polite delay between searches to prevent rate limiting
    await delay(600)
  }

  // Retry failed items with alternative keywords if any
  if (failedItems.length > 0) {
    console.log(`\nRetrying ${failedItems.length} failed items with simplified queries...`)
    for (let j = 0; j < failedItems.length; j++) {
      const item = failedItems[j]
      const filename = path.basename(item.imageUrl)
      console.log(`[Retry ${j + 1}/${failedItems.length}] ${item.name}...`)
      const simplifiedQuery = item.name.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      let candidates = await searchBingImages(simplifiedQuery)
      if (!candidates.length) {
        candidates = await searchDuckDuckGoImages(simplifiedQuery)
      }
      const processed = await downloadAndProcessImage(candidates)
      if (processed) {
        for (const dir of targetDirs) {
          fs.writeFileSync(path.join(dir, filename), processed.buffer)
        }
        console.log(`  ✓ Retry saved ${filename} (${processed.buffer.length} bytes)`)
        successCount++
        failedCount--
      }
      await delay(600)
    }
  }

  // Remove temporary test files
  const testFiles = ['test-kalamansi.webp', 'test-piattos.webp', 'test-chippy.webp', 'test-c2.webp', 'test-cobra.webp', 'test-siomai.webp']
  for (const dir of targetDirs) {
    for (const tf of testFiles) {
      const p = path.join(dir, tf)
      if (fs.existsSync(p)) fs.unlinkSync(p)
    }
  }

  // Inject/Sync all items into backend SQLite database
  const { createRequire } = await import('node:module')
  const requireBackend = createRequire(path.join(repoRoot, 'backend', 'package.json'))
  const Database = requireBackend('better-sqlite3')
  const dbFile = path.join(repoRoot, 'backend', 'data', 'aezakmi.sqlite')
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  const now = new Date().toISOString()
  const insertStmt = db.prepare(`
    INSERT INTO menu_items (id, name, category, description, price, image_url, stock_quantity, is_available, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name,
      category=excluded.category,
      description=excluded.description,
      price=excluded.price,
      image_url=excluded.image_url,
      stock_quantity=COALESCE(menu_items.stock_quantity, excluded.stock_quantity),
      is_available=1,
      is_active=1,
      updated_at=excluded.updated_at
  `)

  const tx = db.transaction(() => {
    for (const item of PHILIPPINE_MENU_CATALOG) {
      insertStmt.run(
        item.id,
        item.name,
        item.category,
        item.description,
        item.price,
        item.imageUrl,
        item.stockQuantity,
        now,
        now
      )
    }
  })
  tx()
  console.log(`Synced ${PHILIPPINE_MENU_CATALOG.length} items into SQLite database (${dbFile}).`)

  console.log(`\n========================================`)
  console.log(`Done! Successfully verified: ${successCount} / ${PHILIPPINE_MENU_CATALOG.length}`)
  if (failedCount > 0) {
    console.log(`Failed: ${failedCount}`)
  }
  console.log(`========================================`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})

