# Session Lock Billing Freeze Fix — 2026-09-13

## Production invariant

When Admin locks a station, paid usage stops at the lock checkpoint for every active session type:

- Prepaid: remaining seconds do not decrease while locked.
- Postpaid: billable seconds and running amount do not increase while locked.
- Unlock resumes from the checkpoint; the locked duration is never billed later.
- Failed/expired locks still use the existing command-owned rollback behavior.

## Fixes in this build

- Cloud Customer session mapping now honors `isLocked`, `pausedAt`, `pausedRemainingSeconds`, `elapsedBillableSeconds`, and cumulative `paused_seconds` instead of recalculating from wall-clock time.
- Cloud Admin session mapping uses the same authoritative pause checkpoint and exposes stable `remainingSeconds` / `billableSeconds` snapshots.
- Admin Manage Session no longer computes time from `Date.now() - startedAt`; it uses the shared pause-aware timer helpers and treats `isLocked` as frozen.
- Admin optimistic Lock freezes the timer snapshot at command dispatch time.
- Customer and Admin timer fallbacks subtract historical completed pause seconds for postpaid sessions.
- Migration `20260913000013_lock_billing_freeze_consistency.sql` persists completed postpaid pause duration after unlock and backfills prior resumed postpaid pauses. Prepaid is intentionally excluded from the trigger increment because its existing resume transaction already updates `paused_seconds` while extending `expires_at`.

## Deployment

1. Apply `supabase/migrations/20260913000013_lock_billing_freeze_consistency.sql`.
2. Redeploy Supabase Edge Function `station-api`.
3. Rebuild/redeploy Customer Electron/web assets.
4. Rebuild/redeploy Admin frontend.

No Café Edge backend source change is required for this fix; its billing authority was already pause-aware.

## Validation

- 438/438 Node regression tests passed.
- Release-readiness static checks passed.
