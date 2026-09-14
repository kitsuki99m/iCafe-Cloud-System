# Subscription Packages + Branded Owner Invitations

> Updated 2026-09-14: the former six fixed station tiers were replaced by an editable four-tier commercial catalog.

## Current packages

| Package | Default maximum stations | Default monthly price |
| --- | ---: | ---: |
| Bronze | 10 | ₱499/month |
| Silver | 25 | ₱799/month |
| Gold | 50 | ₱1,299/month |
| Ultra | Custom | ₱1,999+ / month |

Ultra is intended for larger/custom or multi-branch deployments. Bronze, Silver, and Gold limits and all monthly prices are editable by the platform developer in **Developer Approvals → Pricing**. The deployment recommendation defaults to **₱2,500–₱5,000 per branch**.

The organization-wide station limit is still enforced by the existing PostgreSQL station-cap trigger. Existing organizations retain their assigned cap until a developer explicitly changes their package.

## Business owner view

Cloud Settings shows the current package, subscription status, stations used / maximum stations, active branch count, usage bar, and the live platform package catalog. Package changes remain platform-developer controlled.

## Branded owner invitation email

`supabase/templates/invite.html` and `supabase/templates/recovery.html` remain the Aezakmi-branded Auth templates for business-owner onboarding.

For hosted Supabase, apply them from **Authentication → Email Templates**, or run:

```bash
SUPABASE_ACCESS_TOKEN=... SUPABASE_PROJECT_REF=... npm run deploy:auth-templates
```

## Branded quotations

Developer Approvals now includes **Send quotation** for a registration/prospect. Quotation emails use the Aezakmi transactional template implemented in `developer-registrations` and are stored as immutable snapshots in `platform_quotations`.

See `CUSTOMER_AUTO_UPDATE_PRICING_AND_QUOTATIONS_2026-09-14.md` for Brevo secrets and the complete deployment/update guide.

## Deployment

1. Apply migrations through `20260914000018_platform_pricing_quotes_and_customer_updates.sql`.
2. Redeploy `developer-registrations`, `station-runtime`, and any already-required station/admin Edge Functions.
3. Rebuild/redeploy the Admin frontend.
4. Configure quotation email secrets if quotation sending will be used.
5. Apply the hosted Auth Invite + Recovery templates for owner onboarding.
