# Aezakmi Cloud Base — Final Architecture

## Components

### `apps/admin`
One Admin codebase with two modes:

- **Cloud mode** — built by `npm run build:admin` and deployed to Vercel. Uses Supabase Auth, tenant access, and the authenticated cloud-to-Edge Admin bridge.
- **Local mode** — the Emergency Admin Electron application. Talks directly to the local Edge and remains usable without internet.

Cloud mode is selected at build time with `VITE_ADMIN_MODE=cloud` by `scripts/cloud-admin.mjs`.

### `apps/customer`
Customer Station Electron application. It communicates only with the local Edge over the café LAN and never contains Supabase credentials or a Supabase connection.

### `backend`
The Aezakmi Edge server:

- Node + Express
- Socket.IO
- SQLite / `better-sqlite3`
- local auth/session authority
- station pairing and credentials
- durable Supabase sync outbox
- cloud command execution through existing local API/business logic
- cloud config and heartbeat sync

### `supabase`
The multi-tenant cloud control plane:

- PostgreSQL schema and RLS
- organizations and organization memberships
- branches
- Edge identities/pairing
- cloud event ingestion/mirrors
- durable commands and acknowledgements
- subscription/license metadata
- audit logs
- Edge Functions for privileged operations

## Authority rules

| Domain | Authority |
|---|---|
| Active Customer session/timer | Edge / SQLite |
| Station authentication/presence | Edge |
| Wallet and time ledger mutation | Edge |
| Local rates used for active billing | Edge |
| Cloud user authentication | Supabase Auth |
| Organization/branch membership | Supabase |
| Cloud subscription metadata | Supabase |
| Historical cloud reporting mirror | Supabase |
| Remote Admin request authorization | Supabase + tenant role |
| Execution of remote café mutation | Edge |

## Optimistic UI

Both Admin and Customer use local snapshots/cached state so screens render immediately. Safe metadata changes may update optimistically and roll back on rejection. Money/time/session-destructive actions show an immediate pending state, then reconcile with the Edge instead of fabricating a committed financial result.

Cloud mutations carry idempotency keys through Vercel Admin → Supabase command → Edge local API so browser retries/timeouts do not duplicate financial/session operations.

## Sync design

The Edge keeps a durable SQLite `sync_outbox`. Pairing queues a sanitized baseline; SQLite triggers then capture later core changes. The Edge retries failed batches and acknowledges cloud commands. Realtime is only a wake-up optimization; periodic sync is the correctness fallback.

Secrets and credential hashes are excluded from replication.

## Failure model

Cloud failure must never become café failure. If Vercel/Supabase/the ISP goes down, Customer Electron + Edge + SQLite + Emergency Admin continue operating locally. Once connectivity returns, the outbox catches the cloud mirror up.
