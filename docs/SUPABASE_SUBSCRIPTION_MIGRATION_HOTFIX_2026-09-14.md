# Supabase subscription migration hotfix — 2026-09-14

## Failure fixed

`20260914000017_platform_pricing_quotes_and_customer_updates.sql` attempted to change subscription plans while the legacy `subscriptions_package_station_limit_check` was still active.

The legacy invariant required fixed values such as Bronze=50, Silver=100, Gold=200, Platinum=350 and Diamond=500. A legacy Bronze row with `max_stations=50` is mapped to the new Gold tier, but `gold + 50` violated the old `gold + 200` check before the migration had a chance to replace that check.

## Corrected migration order

The corrected migration now:

1. Drops `subscriptions_package_station_limit_check` first.
2. Normalizes every existing subscription into the four-tier model while preserving its current station entitlement (1..10000).
3. Maps <=10 to Bronze, <=25 to Silver, <=50 to Gold, and >50 to Ultra.
4. Adds the new flexible four-tier constraint after the data is valid.
5. Leaves new organizations at the current editable Bronze catalog limit (default 10).

The migration files now also have unique ordered versions:

- `20260914000017_close_session_pause_on_end.sql`
- `20260914000018_platform_pricing_quotes_and_customer_updates.sql`
- `20260914000019_admin_managed_customer_updates.sql`

## What to run

From the corrected project root:

```powershell
npx supabase migration list
npx supabase db push
```

If the first `000017` migration committed before the prior failure, Supabase should only offer `000018` and `000019`. If the previous push was rolled back as a batch, it may offer all three. Both cases are safe with this corrected source.

Do not use `supabase migration repair` unless `migration list` explicitly reports a remote/local history mismatch.
