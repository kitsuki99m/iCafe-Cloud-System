process.env.AEZAKMI_DATABASE_BACKUP_ENABLED = 'false'
const { createDatabaseBackup } = await import('../src/services/databaseBackup.js')
const { db } = await import('../src/db/connection.js')
try {
  const file = await createDatabaseBackup({ reason:'manual' })
  console.log(file)
} finally {
  db.close()
}
