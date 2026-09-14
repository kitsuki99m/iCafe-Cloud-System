# station-admin 500 on Pause & Save / Forfeit — 2026-09-14

## Symptom

Cloud Admin reaches `.../functions/v1/station-admin`, but pressing **Pause & Save**, **Forfeit**, or **Refund** returns HTTP 500.

## Root cause

Those actions now commit through the database RPC `public.aezakmi_admin_close_session(...)`. Deploying the updated `station-admin` Edge Function before applying migration `20260914000020_admin_atomic_session_close.sql` leaves the Edge Function ahead of the database schema. PostgREST then reports a missing RPC/schema-cache error, which the previous handler collapsed into a generic 500.

## Fix in this build

- `station-admin` recognizes missing-RPC / stale-schema errors and returns `503 CLOUD_SCHEMA_OUTDATED` with the exact required migration instead of a blind 500.
- Supabase Edge logs now include the original database error code/details/hint for server-side diagnosis.
- Migration `20260914000021_admin_close_session_rpc_guard.sql` re-installs the atomic close RPC as a deployment guard. This also repairs projects whose migration history was manually advanced while the function itself was absent.
- `scripts/fix-supabase-migration-collisions.ps1` now refuses to pass unless migrations `00020` and `00021` are present, and reminds the deployer to redeploy `station-admin` after `db push`.

## Required deployment order

From the repository root:

```powershell
.\scripts\fix-supabase-migration-collisions.ps1
npx supabase migration list
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy station-admin --use-api
```

Then rebuild/redeploy Cloud Admin if its frontend bundle has not already been deployed.

Do **not** test Pause & Save / Forfeit between the database push and the `station-admin` deployment. The database and Edge Function should be deployed as one release.
