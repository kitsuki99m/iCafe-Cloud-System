# Production Lifecycle Hardening — 2026-09-13

This pass hardens Customer Station, Café Edge, Cloud/Supabase, and Admin station state as one lifecycle.

## Session invariants

- A paid member or guest session must never continue billing through a real interruption that prevents use of the PC.
- Shutdown/restart/offline/unpair/pairing reset checkpoint or release the current session before the station becomes unavailable.
- Prepaid remaining time is preserved; postpaid accrued usage is preserved for settlement.
- Guest sessions use the live station session and never a stale generic guest cache.
- Guest prepaid expiry can defer finalization while transport is unavailable instead of discarding recoverable paid time.
- Guest postpaid cannot use a normal customer logout to bypass staff checkout/settlement.
- Customer auth is cleared when the active station lifecycle is released.

## Transport and Customer UI

- Customer has a 3-second total-transport outage watchdog covering Cloud and local Café Edge.
- A Cloud failure alone does not log out a working local Edge session; both paths must be unavailable for the outage boundary.
- Duplicate `/auth/logout` is skipped when the station lifecycle endpoint already revoked the active auth token.
- Active guest prepaid/postpaid sessions enter Guest Session UI automatically.

## Remote commands

- Lock checkpoints the active session before dispatch.
- Failed/expired Lock rolls back only the pause owned by that command and resumes billing from the correct point.
- Shutdown/restart keeps the station Offline while a non-expired power command is queued/running, even if heartbeat traffic continues during the warning window.
- Failed local power commands restore availability only when there is no active session.
- Cloud runtime expiry/ack paths mirror the same lock rollback and power availability behavior.

## PC availability

- Cloud paid session start and interrupted-guest restore require a genuinely Available station and a fresh paired-station heartbeat.
- A stale/offline station cannot start or restore paid time through a stale Admin UI.
- Cloud Admin cannot manually force `available`/`occupied` into a state that contradicts presence or active-session truth.
- Newly created Cloud PCs begin Offline until a paired Customer Station connects.
- PC deletion and pairing reset refuse or release active lifecycle state safely instead of orphaning sessions.

## Revenue integrity

Migration `20260913000012_production_session_lifecycle_hardening.sql` adds Cloud wallet-funded service revenue capture for session start, extension, and postpaid settlement with deterministic deduplication, plus a postpaid revenue backstop that does not double-count linked wallet revenue.

## Deployment

Deploy the new Supabase migration, then redeploy these Edge Functions:

- `station-runtime`
- `station-admin`
- `admin-api`

Also redeploy/rebuild:

- Admin web app (Cloud station presence mapping changed)
- Customer Electron app (Customer lifecycle/UI changes)
- Café Edge/backend runtime (local command rollback, pairing reset, presence handling)

If migration `20260913000011_admin_session_interruptions.sql` from the previous lifecycle build has not been deployed yet, deploy migrations in order before `00012`.

## Validation

- `npm test`: 410/410 passing
- `npm run check:release`: passed
- Node syntax checks: passed for modified backend routes/server
- TypeScript/JSX syntax transpilation: passed for modified Supabase functions and renderer files
- Migration structural sanity checks: passed
