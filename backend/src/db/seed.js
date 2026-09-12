import { db } from './connection.js'
import { migrate } from './schema.js'
import { ensureBootstrapAdmin } from './bootstrapAdmin.js'

migrate()

// IMPORTANT:
// The seed contains ONLY the bootstrap admin account.
// It intentionally creates NO demo members, customer accounts,
// PC clients, sessions, wallets, transactions, or rate plans.
// Operational data must be created through the Admin application.

async function seed() {
  // Keep operational logs clean whenever the seed command is run.
  // Other operational data is intentionally left untouched.
  db.prepare(`DELETE FROM logs`).run()
  console.log('Operational logs cleared.')

  await ensureBootstrapAdmin()

  console.log('Aezakmi backend seed complete.')
  console.log('No demo members, PCs, sessions, or rate plans were seeded.')
  console.log('Operational logs are cleared on every seed run.')
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})

console.log('Rate plans are created by Admin; no rate plans are seeded.');
