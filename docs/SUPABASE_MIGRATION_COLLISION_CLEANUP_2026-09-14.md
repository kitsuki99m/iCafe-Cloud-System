# Supabase migration collision cleanup — 2026-09-14

## Why the previous push still failed

The corrected archive contained the right final migration names, but extracting it over an existing project does not delete files that were present in an older build. Two obsolete files could therefore remain in `supabase/migrations`:

- `20260914000017_platform_pricing_quotes_and_customer_updates.sql`
- `20260914000018_admin_managed_customer_updates.sql`

That creates duplicate local migration versions. Supabase then sees both `00017` files and executes the stale pricing migration, which still attempts to map a 50-PC subscription to `gold` while the old fixed-cap check constraint is active.

## Correct final migration sequence

Only these three migrations should exist for this change set:

- `20260914000017_close_session_pause_on_end.sql`
- `20260914000018_platform_pricing_quotes_and_customer_updates.sql`
- `20260914000019_admin_managed_customer_updates.sql`

The corrected `00018_platform...` migration drops the old `subscriptions_package_station_limit_check` **before** remapping subscription plans.

## Automatic cleanup

From the repository root in PowerShell:

```powershell
.\scripts\fix-supabase-migration-collisions.ps1
npx supabase migration list
npx supabase db push
```

The cleanup script removes only the two known obsolete filenames, verifies all three corrected migrations exist, and refuses to continue if any duplicate migration version remains.

## Manual cleanup equivalent

```powershell
Remove-Item ".\supabase\migrations\20260914000017_platform_pricing_quotes_and_customer_updates.sql" -Force -ErrorAction SilentlyContinue
Remove-Item ".\supabase\migrations\20260914000018_admin_managed_customer_updates.sql" -Force -ErrorAction SilentlyContinue
```

Then verify:

```powershell
Get-ChildItem .\supabase\migrations\202609140000*.sql | Sort-Object Name | Select-Object -ExpandProperty Name
```

There should be one file per migration version, with `00017`, `00018`, and `00019` exactly as listed above.

No `supabase migration repair` is needed for the state shown in the reported migration list: remote `00017` is already the successfully applied pause-closing migration, while corrected `00018` and `00019` are still pending.
