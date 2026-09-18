import path from 'node:path'
import Database from 'better-sqlite3'
import { PHILIPPINE_MENU_CATALOG } from '../apps/admin/src/data/philippineMenuPresets.js'

const repoRoot = path.resolve(import.meta.dirname, '..')
const dbFile = path.join(repoRoot, 'backend', 'data', 'aezakmi.sqlite')

const db = new Database(dbFile)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

console.log('Columns in menu_items:', db.prepare('PRAGMA table_info(menu_items)').all().map(c => `${c.name} (${c.type}, notnull=${c.notnull})`))

// Clear descriptions for all menu items
db.prepare("UPDATE menu_items SET description = ''").run()

const now = new Date().toISOString()

// Upsert all preset items into SQLite menu_items
const upsertStmt = db.prepare(`
  INSERT INTO menu_items (id, name, category, price, stock_quantity, image_url, description, is_available, created_at, updated_at)
  VALUES (@id, @name, @category, @price, @stockQuantity, @imageUrl, '', 1, @now, @now)
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    category = excluded.category,
    price = excluded.price,
    image_url = excluded.image_url,
    description = '',
    updated_at = @now
`)

const tx = db.transaction(() => {
  for (const item of PHILIPPINE_MENU_CATALOG) {
    upsertStmt.run({
      id: item.id,
      name: item.name,
      category: item.category,
      price: item.price,
      stockQuantity: item.stockQuantity || null,
      imageUrl: item.imageUrl,
      now,
    })
  }
})
tx()

const count = db.prepare('SELECT count(*) as total FROM menu_items').get().total
console.log(`Successfully synced ${count} items to SQLite database at ${dbFile} with empty descriptions!`)
