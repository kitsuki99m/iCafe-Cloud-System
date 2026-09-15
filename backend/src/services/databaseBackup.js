import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import { db } from '../db/connection.js'
import { env } from '../config/env.js'
import { recordLocalError } from '../utils/observability.js'

let backupTimer = null
let startupBackupTimer = null
let running = null
let lastBackupStatus = { lastBackupAt:null, verified:false, lastError:null }

function backupDir() {
  return path.resolve(env.databaseBackupDir)
}

function backupName(now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  return `aezakmi-${stamp}.sqlite`
}

function verifyBackup(file) {
  const check = new Database(file, { readonly:true, fileMustExist:true })
  try {
    const result = check.pragma('quick_check', { simple:true })
    if (String(result).toLowerCase() !== 'ok') throw new Error(`SQLite quick_check failed: ${result}`)
    return true
  } finally {
    check.close()
  }
}

function pruneBackups() {
  const dir = backupDir()
  if (!fs.existsSync(dir)) return
  const keep = Math.max(3, Number(env.databaseBackupRetention || 28))
  const files = fs.readdirSync(dir)
    .filter((name) => /^aezakmi-.*\.sqlite$/.test(name))
    .map((name) => ({ name, full:path.join(dir,name), mtime:fs.statSync(path.join(dir,name)).mtimeMs }))
    .sort((a,b) => b.mtime - a.mtime)
  for (const item of files.slice(keep)) {
    try { fs.unlinkSync(item.full) } catch (error) { console.warn('Unable to prune database backup:', error?.message || error) }
  }
}

export async function createDatabaseBackup({ reason='scheduled' } = {}) {
  if (running) return running
  running = (async () => {
    const dir = backupDir()
    fs.mkdirSync(dir, { recursive:true })
    try { db.pragma('wal_checkpoint(PASSIVE)') } catch {}
    const finalPath = path.join(dir, backupName())
    const tempPath = `${finalPath}.tmp`
    try {
      await db.backup(tempPath)
      verifyBackup(tempPath)
      fs.renameSync(tempPath, finalPath)
      pruneBackups()
      lastBackupStatus = { lastBackupAt:new Date().toISOString(), verified:true, lastError:null }
      console.log(`[backup] SQLite backup verified (${reason}): ${finalPath}`)
      return finalPath
    } catch (error) {
      try { fs.unlinkSync(tempPath) } catch {}
      lastBackupStatus = { ...lastBackupStatus, verified:false, lastError:error?.message || String(error) }
      recordLocalError('database.backup', error, { reason })
      throw error
    }
  })().finally(() => { running = null })
  return running
}

export function startDatabaseBackupScheduler() {
  if (!env.databaseBackupEnabled || backupTimer) return
  const intervalMs = Math.max(1, Number(env.databaseBackupIntervalHours || 6)) * 60 * 60 * 1000
  startupBackupTimer = setTimeout(() => { startupBackupTimer=null; createDatabaseBackup({ reason:'startup' }).catch((error) => console.error('[backup] startup backup failed:', error)) }, 30_000)
  startupBackupTimer.unref?.()
  backupTimer = setInterval(() => createDatabaseBackup({ reason:'scheduled' }).catch((error) => console.error('[backup] scheduled backup failed:', error)), intervalMs)
  backupTimer.unref?.()
}

export function getDatabaseBackupStatus() { return { ...lastBackupStatus, enabled:env.databaseBackupEnabled, intervalHours:env.databaseBackupIntervalHours, retention:env.databaseBackupRetention } }

export function stopDatabaseBackupScheduler() {
  if (startupBackupTimer) clearTimeout(startupBackupTimer)
  if (backupTimer) clearInterval(backupTimer)
  startupBackupTimer = null
  backupTimer = null
}
