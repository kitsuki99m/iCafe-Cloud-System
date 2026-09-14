# Production forfeit + Developer pricing fix — 2026-09-14

## Admin Forfeit Time

Forfeit is now a forced logout action, not a Lock Session action.

1. Admin sends the session-close transport command.
2. Customer Station immediately returns Member or Guest to the login kiosk and clears local auth/lifecycle state without saving remaining time.
3. Customer Station ACKs the logout boundary.
4. Admin closes the authoritative session with `forfeit`, zeroing remaining time.
5. Local Edge / Cloud revoke Customer auth and emit the terminal `session_forfeited` signal as a backstop.

Pause & Save and Refund keep their existing accounting semantics.

## Developer pricing

Pricing catalog saves are now atomic through migration:

`20260914000025_atomic_platform_pricing_catalog.sql`

The Developer Console submits Bronze, Silver, Gold, Ultra prices/caps and quotation defaults in one request. This removes partial tier saves and intermediate Bronze/Silver/Gold ordering failures.

Additional Developer fixes:
- selected application refresh no longer keeps stale data,
- Ultra custom limits must be greater than the Gold cap,
- Approve validates Ultra limits too,
- quotation fields are validated in both UI and Edge Function instead of silently clamped,
- schema-lag errors identify the missing pricing migration.

## Production deployment

```powershell
npx supabase db push
npx supabase functions deploy station-admin --use-api
npx supabase functions deploy developer-registrations --use-api
```

Then rebuild/redeploy the Admin frontend, rebuild/repackage Customer Electron, and restart/redeploy the local Café Edge backend where applicable.
