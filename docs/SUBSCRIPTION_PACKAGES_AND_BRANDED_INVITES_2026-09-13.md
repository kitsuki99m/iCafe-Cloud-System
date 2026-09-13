# Subscription Packages + Branded Owner Invitations

## Packages

Aezakmi Cloud now supports organization-wide station packages:

| Package | Maximum stations |
| --- | ---: |
| Bronze | 50 |
| Silver | 100 |
| Gold | 200 |
| Platinum | 350 |
| Diamond | 500 |
| Ultra | Custom (1–10,000) |

The limit applies across all active branches belonging to the organization. Developer approvals can choose the package before sending the owner invitation, and provisioned businesses can be upgraded/downgraded from Developer Approvals. Downgrades below current station usage are rejected.

Station creation is guarded in `station-admin` for a friendly error and in PostgreSQL with a serialized trigger for race-safe enforcement. Existing station upserts do not consume a second seat.

## Business owner view

Cloud Settings shows the current package, subscription status, stations used / maximum stations, active branch count, a usage bar, and the available package catalog. Package changes remain platform-developer controlled.

## Branded invitation email

`supabase/templates/invite.html` and `supabase/templates/recovery.html` use Aezakmi Café branding and owner/business/package metadata. Both templates are required because the first approval uses Supabase Invite User while an invitation resend uses the recovery/password flow for the already-created owner Auth account.

For local Supabase, `supabase/config.toml` references the templates directly.

For hosted Supabase, Auth templates are project settings. Apply them in **Authentication → Email Templates**, or run:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run deploy:auth-templates
```

The deployment script uses the Supabase Management API and never stores the access token in the repository.

For production email delivery, configure custom SMTP in Supabase Auth. Supabase's built-in SMTP is intended for testing and has recipient restrictions.

## Deployment

1. Apply `20260913000014_subscription_packages_station_caps.sql`.
2. Redeploy `developer-registrations` and `station-admin` Edge Functions.
3. Rebuild/redeploy the Admin frontend.
4. Apply the hosted Auth Invite + Recovery templates (Dashboard or `npm run deploy:auth-templates`).
