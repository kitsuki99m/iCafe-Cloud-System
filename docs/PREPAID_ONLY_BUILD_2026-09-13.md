# Prepaid-Only Production Build — 2026-09-13

## Decision

Postpaid billing is disabled for this production build. New member, Guest, Admin-started, reservation check-in, Customer self-start, and Cloud-command session creation paths accept **prepaid only**.

## UI scope

- Admin Start Session exposes prepaid only.
- Reservation check-in requires prepaid rate/amount and starts prepaid.
- Admin Settings and Rates no longer expose Postpaid defaults or rates.
- Customer Guest/member UI no longer offers a Postpaid mode.
- Historical non-prepaid sessions are shown only as legacy/staff-checkout state so they can be closed safely.

## Backend authority

- Café Edge rejects any new non-prepaid session start with `POSTPAID_DISABLED`.
- Café Edge rejects attempts to configure Postpaid billing/rates.
- Local settings responses are normalized to `defaultBilling: prepaid` and `postpaidMinutesPerPeso: 0`, preventing stale DB configuration from reviving the mode.
- Cloud Admin APIs reject non-prepaid starts and Postpaid configuration.
- Cloud Customer self-start is forced to prepaid.
- `admin-action` rejects stale/legacy queued commands that try to enable or start Postpaid.
- `station-api` settings responses are normalized to prepaid-only so an old Cloud config cannot expose Postpaid to Customer.

## Historical compatibility

Database columns and prior migrations are intentionally retained. Existing historical/interrupted Postpaid records can still be read and settled/closed by the legacy settlement paths. No new Postpaid session can be created. This avoids destructive schema changes or stranded unsettled sessions.

## Deployment

No SQL migration is added by this change. Redeploy these Supabase Edge Functions:

- `admin-api`
- `admin-action`
- `station-api`

Also rebuild/redeploy:

- Admin frontend
- Customer Electron
- Café Edge/backend

## Validation

The prepaid-only production guards are covered by the regression suite and release-readiness static checks.
