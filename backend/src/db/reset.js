import 'dotenv/config'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const backendRoot = path.resolve(__dirname, '..', '..')

// DATABASE_PATH is resolved relative to the backend workspace, matching
// normal local development regardless of whether npm is invoked from root
// or through npm workspaces.
const configuredPath = process.env.DATABASE_PATH || './data/aezakmi.sqlite'
const dbFile = path.resolve(backendRoot, configuredPath)
const dataDir = path.dirname(dbFile)

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true })
}

const files = [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]
let removed = 0

for (const file of files) {
  if (fs.existsSync(file)) {
    fs.rmSync(file, { force: true })
    removed += 1
  }
}

console.log('Aezakmi Cafe database reset complete.')
console.log(`Database removed: ${dbFile}`)
console.log(`SQLite files removed: ${removed}`)
console.log('All users, members, PCs, sessions, wallets, rate plans, logs, settings, and transactions are cleared.')
console.log('Run "npm run seed" to create ONLY the bootstrap admin account.')
