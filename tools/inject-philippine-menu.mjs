process.env.NODE_ENV = process.env.NODE_ENV || 'development'

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'
import Database from 'better-sqlite3'
import { PHILIPPINE_MENU_CATALOG } from '../apps/admin/src/data/philippineMenuPresets.js'

const repoRoot = path.resolve(import.meta.dirname, '..')

const targetDirs = [
  path.join(repoRoot, 'apps', 'admin', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'apps', 'customer', 'public', 'assets', 'menu'),
  path.join(repoRoot, 'backend', 'public', 'assets', 'menu'),
]

for (const dir of targetDirs) {
  fs.mkdirSync(dir, { recursive: true })
}

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function generateSvgArtwork(item) {
  const brandColor = item.color || '#d97706'
  const icon = item.icon || '🍜'
  const badgeRaw = String(item.badgeText || item.subcategory || 'Snack').toUpperCase()
  const badgeText = escapeXml(badgeRaw)
  const itemName = escapeXml(item.name.length > 24 ? item.name.substring(0, 22) + '…' : item.name)

  return `
<svg width="320" height="320" viewBox="0 0 320 320" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background glow -->
    <radialGradient id="glow-${item.id}" cx="50%" cy="45%" r="48%">
      <stop offset="0%" stop-color="${brandColor}" stop-opacity="0.32" />
      <stop offset="60%" stop-color="${brandColor}" stop-opacity="0.10" />
      <stop offset="100%" stop-color="${brandColor}" stop-opacity="0" />
    </radialGradient>

    <!-- Card pedestal plate -->
    <linearGradient id="plate-${item.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#2a2e39" stop-opacity="0.95" />
      <stop offset="100%" stop-color="#181a20" stop-opacity="0.98" />
    </linearGradient>

    <!-- Border highlight -->
    <linearGradient id="border-${item.id}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${brandColor}" stop-opacity="0.8" />
      <stop offset="50%" stop-color="#555d6e" stop-opacity="0.4" />
      <stop offset="100%" stop-color="${brandColor}" stop-opacity="0.9" />
    </linearGradient>

    <!-- Banner gradient -->
    <linearGradient id="banner-${item.id}" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="${brandColor}" />
      <stop offset="100%" stop-color="${brandColor}" stop-opacity="0.75" />
    </linearGradient>

    <filter id="shadow-${item.id}" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.6" />
    </filter>
  </defs>

  <!-- Fully Transparent Base Canvas -->
  <rect width="320" height="320" fill="none" />

  <!-- Ambient Glow -->
  <circle cx="160" cy="140" r="130" fill="url(#glow-${item.id})" />

  <!-- Main Floating Product Container -->
  <g filter="url(#shadow-${item.id})">
    <!-- Rounded Hex/Shield Base -->
    <rect x="36" y="32" width="248" height="256" rx="36" fill="url(#plate-${item.id})" stroke="url(#border-${item.id})" stroke-width="2.5" />

    <!-- Top Gloss Highlight -->
    <path d="M 46 64 C 46 44, 60 36, 80 36 L 240 36 C 260 36, 274 44, 274 64 C 274 72, 190 84, 160 84 C 130 84, 46 72, 46 64 Z" fill="#ffffff" fill-opacity="0.06" />

    <!-- Center Icon Orb Plate -->
    <circle cx="160" cy="130" r="62" fill="#121316" stroke="${brandColor}" stroke-width="2" stroke-dasharray="8 4" stroke-opacity="0.5" />
    <circle cx="160" cy="130" r="54" fill="${brandColor}" fill-opacity="0.15" />

    <!-- Primary Icon / Illustration -->
    <text x="160" y="152" font-size="64" text-anchor="middle" font-family="'Segoe UI Emoji', 'Apple Color Emoji', 'Noto Color Emoji', sans-serif">
      ${icon}
    </text>

    <!-- Top Variant Ribbon -->
    <g transform="translate(160, 48)">
      <rect x="-60" y="-12" width="120" height="24" rx="12" fill="${brandColor}" fill-opacity="0.9" />
      <text x="0" y="4" font-size="11" font-weight="bold" fill="#ffffff" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" letter-spacing="0.5">
        ${badgeText}
      </text>
    </g>

    <!-- Bottom Product Name Banner -->
    <g transform="translate(46, 218)">
      <rect x="0" y="0" width="228" height="54" rx="20" fill="#0f1115" stroke="url(#border-${item.id})" stroke-width="1.5" />
      <text x="114" y="24" font-size="12" font-weight="700" fill="#ffffff" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">
        ${itemName}
      </text>
      <text x="114" y="42" font-size="11" font-weight="bold" fill="#fbbf24" text-anchor="middle" font-family="monospace">
        ₱${Number(item.price).toFixed(2)}
      </text>
    </g>
  </g>
</svg>
`.trim()
}

async function main() {
  console.log('Generating physical transparent WebP images for Philippine menu catalog...')

  let generatedCount = 0
  for (const item of PHILIPPINE_MENU_CATALOG) {
    const filename = path.basename(item.imageUrl)
    const svgContent = generateSvgArtwork(item)
    const svgBuffer = Buffer.from(svgContent)

    const webpBuffer = await sharp(svgBuffer)
      .resize(280, 280)
      .webp({ quality: 90, alphaQuality: 100, lossless: false })
      .toBuffer()

    for (const dir of targetDirs) {
      const destPath = path.join(dir, filename)
      fs.writeFileSync(destPath, webpBuffer)
    }

    generatedCount++
  }

  console.log(`Successfully generated ${generatedCount} transparent WebP images in:`)
  targetDirs.forEach((d) => console.log(`  - ${d}`))

  // Connect to authoritative local SQLite database and inject items
  const { createRequire } = await import('node:module')
  const requireBackend = createRequire(path.join(repoRoot, 'backend', 'package.json'))
  const Database = requireBackend('better-sqlite3')

  const dbDir = path.join(repoRoot, 'backend', 'data')
  fs.mkdirSync(dbDir, { recursive: true })
  const dbFile = path.join(dbDir, 'aezakmi.sqlite')
  const db = new Database(dbFile)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Ensure menu_items table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS menu_items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'snacks',
      description TEXT,
      price REAL NOT NULL CHECK(price >= 0),
      image_url TEXT,
      stock_quantity INTEGER,
      is_available INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_menu_items_cat ON menu_items(category, is_active);
  `)

  console.log('Injecting catalog into backend SQLite database...')
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
  console.log(`Successfully injected ${PHILIPPINE_MENU_CATALOG.length} Philippine items into backend database.`)
  console.log('Philippine Menu Catalog & WebP Physical Assets successfully deployed!')
}

main().catch((err) => {
  console.error('Failed to inject menu catalog:', err)
  process.exit(1)
})
