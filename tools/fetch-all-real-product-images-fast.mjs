import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import { PHILIPPINE_MENU_CATALOG } from '../apps/admin/src/data/philippineMenuPresets.js'

const repoRoot = path.resolve(import.meta.dirname, '..')

const targetDirs = [
  path.join(repoRoot, 'apps', 'admin', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'apps', 'customer', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'backend', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'apps', 'admin', 'dist', 'assets', 'menu'),
  path.join(repoRoot, 'apps', 'customer', 'dist', 'assets', 'menu'),
]

for (const dir of targetDirs) {
  fs.mkdirSync(dir, { recursive: true })
}

async function searchBing(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=IRFLTR&first=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return []
    const html = await res.text()
    const matches = [...html.matchAll(/murl&quot;:&quot;(http[^&]+)&quot;/g)].map((m) => m[1])
    return matches
  } catch (e) {
    return []
  }
}

async function searchDuckDuckGo(query) {
  try {
    const tokenUrl = `https://duckduckgo.com/?q=${encodeURIComponent(query)}`
    const tokenRes = await fetch(tokenUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
    })
    if (!tokenRes.ok) return []
    const tokenHtml = await tokenRes.text()
    const vqdMatch = tokenHtml.match(/vqd=['"]?([0-9-]+)['"]?/)
    if (!vqdMatch) return []
    const vqd = vqdMatch[1]

    const apiUrl = `https://duckduckgo.com/i.js?l=us-en&o=json&q=${encodeURIComponent(query)}&vqd=${vqd}&f=,,,`
    const apiRes = await fetch(apiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Referer': 'https://duckduckgo.com/',
      },
    })
    if (!apiRes.ok) return []
    const data = await apiRes.json()
    return (data.results || []).map((r) => r.image).filter(Boolean)
  } catch (e) {
    return []
  }
}

async function downloadAndProcessWhiteBg(urls) {
  for (const url of urls) {
    if (!url || !url.startsWith('http')) continue
    if (url.includes('.svg') || url.includes('facebook') || url.includes('instagram') || url.includes('tiktok')) continue

    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 6000)
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/*,*/*;q=0.8',
        },
      })
      clearTimeout(timeout)
      if (!res.ok) continue

      const rawBuffer = Buffer.from(await res.arrayBuffer())
      if (rawBuffer.length < 3000) continue

      const img = sharp(rawBuffer)
      const meta = await img.metadata()
      if (!meta.width || !meta.height || meta.width < 80 || meta.height < 80) continue

      // Flatten on pure solid white background and contain into 320x320 canvas
      const processedBuffer = await img
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .resize(320, 320, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 },
        })
        .webp({ quality: 88 })
        .toBuffer()

      return { buffer: processedBuffer, sourceUrl: url }
    } catch (e) {
      continue
    }
  }
  return null
}

function cleanQueryTerms(name) {
  return name.split('(')[0].replace(/[\/\—\-]/g, ' ').replace(/\s+/g, ' ').trim()
}

async function processItem(item, idx, total) {
  const filename = path.basename(item.imageUrl)
  const cleanName = cleanQueryTerms(item.name)

  const queries = [
    `${item.name} packaging white background`,
    `${cleanName} Philippines grocery product`,
    `${cleanName} snack white background`,
    `${cleanName} food product`,
  ]

  let found = null
  for (const q of queries) {
    let urls = await searchBing(q)
    if (!urls || urls.length === 0) {
      urls = await searchDuckDuckGo(q)
    }

    if (urls && urls.length > 0) {
      found = await downloadAndProcessWhiteBg(urls.slice(0, 6))
      if (found) break
    }
  }

  if (found) {
    for (const dir of targetDirs) {
      fs.writeFileSync(path.join(dir, filename), found.buffer)
    }
    console.log(`[${idx + 1}/${total}] ✓ ${item.name} (${found.buffer.length} B)`)
    return true
  } else {
    console.warn(`[${idx + 1}/${total}] ✗ No image found for ${item.name}`)
    return false
  }
}

// Concurrency pool helper
async function mapConcurrent(items, limit, fn) {
  let index = 0
  const results = new Array(items.length)
  const workers = new Array(limit).fill(0).map(async () => {
    while (index < items.length) {
      const i = index++
      results[i] = await fn(items[i], i, items.length)
    }
  })
  await Promise.all(workers)
  return results
}

async function main() {
  console.log(`Fetching internet pictures for ${PHILIPPINE_MENU_CATALOG.length} items (concurrency = 8)...`)
  const startTime = Date.now()

  const results = await mapConcurrent(PHILIPPINE_MENU_CATALOG, 8, processItem)
  const successCount = results.filter(Boolean).length
  const failedCount = results.length - successCount

  console.log(`\n========================================`)
  console.log(`Done in ${((Date.now() - startTime) / 1000).toFixed(1)}s`)
  console.log(`Success: ${successCount} / ${PHILIPPINE_MENU_CATALOG.length}`)
  console.log(`Failed: ${failedCount}`)
  console.log(`========================================`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
