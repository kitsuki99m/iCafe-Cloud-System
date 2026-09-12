import argon2 from 'argon2'
import { db, nowIso } from './connection.js'

// IMPORTANT:
// This creates ONLY the bootstrap admin account, and only if no admin
// user exists yet. It never touches existing users, members, PCs,
// sessions, wallets, transactions, rate plans, or logs.
export const bootstrapAdmin = {
  username: 'admin',
  password: 'admin123',
  pin: '1234',
}

/**
 * Ensures a bootstrap admin account exists so a fresh install always has
 * a working first login, without requiring anyone to run a seed command
 * by hand. Safe to call on every startup — it's a no-op once any admin
 * user exists.
 */
export async function ensureBootstrapAdmin() {
  const existing = db.prepare(
    `SELECT id FROM users WHERE username = ? AND role = 'admin'`
  ).get(bootstrapAdmin.username)

  if (existing) return false

  const now = nowIso()
  const passwordHash = await argon2.hash(bootstrapAdmin.password)
  const pinHash = await argon2.hash(bootstrapAdmin.pin)

  db.prepare(`
    INSERT INTO users
    (id, member_id, username, password_hash, pin_hash, role, is_active,
     must_change_credentials, auth_method, created_at, updated_at)
    VALUES (?, NULL, ?, ?, ?, 'admin', 1, 1, 'pin', ?, ?)
  `).run(
    'admin-1',
    bootstrapAdmin.username,
    passwordHash,
    pinHash,
    now,
    now
  )

  console.log('Bootstrap admin created: username=admin, temporary PIN=1234')
  return true
}
