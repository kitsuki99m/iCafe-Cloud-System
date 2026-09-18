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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function searchBing(query) {
  try {
    const url = `https://www.bing.com/images/search?q=${encodeURIComponent(query)}&form=IRFLTR&first=1`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
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
      const timeout = setTimeout(() => controller.abort(), 8000)
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'image/avif,image/webp,image/apng,image/png,image/jpeg,image/*,*/*;q=0.8',
        },
      })
      clearTimeout(timeout)
      if (!res.ok) continue

      const rawBuffer = Buffer.from(await res.arrayBuffer())
      if (rawBuffer.length < 3000) continue

      const img = sharp(rawBuffer)
      const meta = await img.metadata()
      if (!meta.width || !meta.height || meta.width < 100 || meta.height < 100) continue

      // Flatten on solid pure white background and resize to fit within 320x320
      const processedBuffer = await img
        .flatten({ background: { r: 255, g: 255, b: 255 } })
        .resize(320, 320, {
          fit: 'contain',
          background: { r: 255, g: 255, b: 255 },
        })
        .webp({ quality: 90 })
        .toBuffer()

      return { buffer: processedBuffer, sourceUrl: url }
    } catch (e) {
      continue
    }
  }
  return null
}

function cleanQueryTerms(name) {
  // Extract primary name before parenthesis
  const base = name.split('(')[0].replace(/\//g, ' ').replace(/—/g, ' ').replace(/-/g, ' ').trim()
  return base
}

async function main() {
  console.log(`Starting real Internet product image download for ${PHILIPPINE_MENU_CATALOG.length} items...`)

  let successCount = 0
  let failedCount = 0
  const failedItems = []

  for (let i = 0; i < PHILIPPINE_MENU_CATALOG.length; i++) {
    const item = PHILIPPINE_MENU_CATALOG[i]
    const filename = path.basename(item.imageUrl)
    const cleanName = cleanQueryTerms(item.name)
    console.log(`[${i + 1}/${PHILIPPINE_MENU_CATALOG.length}] Searching internet for: ${cleanName}...`)

    const queries = [
      `${item.name} product white background`,
      `${cleanName} packaging Philippines white background`,
      `${cleanName} Philippines grocery`,
      `${cleanName} supermarket product`,
    ]

    let foundResult = null

    for (const q of queries) {
      let urls = await searchBing(q)
      if (!urls || urls.length === 0) {
        urls = await searchDuckDuckGo(q)
      }

      if (urls && urls.length > 0) {
        foundResult = await downloadAndProcessWhiteBg(urls.slice(0, 8))
        if (foundResult) break
      }
      await delay(200)
    }

    if (foundResult) {
      for (const dir of targetDirs) {
        fs.writeFileSync(path.join(dir, filename), foundResult.buffer)
      }
      console.log(`  ✓ Successfully downloaded & processed: ${filename} (${foundResult.buffer.length} bytes)`)
      successCount++
    } else {
      console.warn(`  ✗ Failed to find real photo for: ${item.name}`)
      failedCount++
      failedItems.push(item)
    }

    await delay(350)
  }

  // Retry any failed items with broadened search
  if (failedItems.length > 0) {
    console.log(`\nRetrying ${failedItems.length} failed items with simplified queries...`)
    for (let j = 0; j < failedItems.length; j++) {
      const item = failedItems[j]
      const filename = path.basename(item.imageUrl)
      const simplified = item.name.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
      console.log(`[Retry ${j + 1}/${failedItems.length}] ${simplified}...`)

      const urls = await searchBing(`${simplified} food item`)
      const res = await downloadAndProcessWhiteBg(urls.slice(0, 10))
      if (res) {
        for (const dir of targetDirs) {
          fs.writeFileSync(path.join(dir, filename), res.buffer)
        }
        console.log(`  ✓ Retry successful for ${filename}`)
        successCount++
        failedCount--
      }
      await delay(300)
    }
  }

  console.log('\n========================================')
  console.log(`Done processing Internet product pictures!`)
  console.log(`Total Success: ${successCount} / ${PHILIPPINE_MENU_CATALOG.length}`)
  console.log(`Total Failed: ${failedCount}`)
  console.log('========================================')
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
