import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { env } from '../config/env.js'

const dbPath = resolve(env.databasePath)
mkdirSync(dirname(dbPath), { recursive: true })

export const db = new Database(dbPath)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
db.pragma('busy_timeout = 5000')

export function nowIso() {
  return new Date().toISOString()
}

export function transaction(fn) {
  const tx = db.transaction(fn)
  return tx.immediate()
}


// Idempotent credential-setup columns for first admin login.
// Existing installations receive these columns without losing data.
export function ensureCredentialSetupColumns(db) {
  const cols = db.prepare(`PRAGMA table_info(users)`).all().map(c => c.name);
  if (!cols.includes('must_change_credentials')) {
    db.exec(`ALTER TABLE users ADD COLUMN must_change_credentials INTEGER NOT NULL DEFAULT 0`);
  }
  if (!cols.includes('auth_method')) {
    db.exec(`ALTER TABLE users ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'pin'`);
  }
}
