# Aezakmi Customer Auto-Update, Pricing, and Quotation Guide

> **ARCHIVED / SUPERSEDED:** The in-app Customer software update workflow described here was removed on 2026-09-14. Keep this document only as implementation history; do not use it as a production deployment runbook.


This patch adds three related platform capabilities:

1. **Customer Electron update listener** for packaged Customer Stations.
2. **Developer-managed Bronze → Ultra pricing and PC limits.**
3. **Aezakmi-branded quotation email** from Developer Approvals.

## 1. Commercial package defaults

The new catalog starts with:

| Tier | Default monthly price | Default PC allowance |
| --- | ---: | ---: |
| Bronze | ₱499 / month | Up to 10 PCs |
| Silver | ₱799 / month | Up to 25 PCs |
| Gold | ₱1,299 / month | Up to 50 PCs |
| Ultra | ₱1,999+ / month | 50+ PCs / custom cap or multiple branches |

Initial deployment defaults to **₱2,500–₱5,000 per branch**.

The values above are defaults, not hard-coded commercial rules. A platform developer can open **Developer Approvals → Pricing** and change:

- Bronze, Silver, and Gold PC limits;
- monthly price for Bronze, Silver, Gold, and Ultra;
- package descriptions;
- minimum and maximum recommended deployment fee per branch; and
- quotation validity period.

Bronze, Silver, and Gold PC limits must remain strictly increasing. Ultra remains the highest/custom tier. Existing organizations keep their assigned `subscriptions.max_stations` until a developer explicitly changes that organization's package.

## 2. Apply the database migration

Apply the new migration:

```text
supabase/migrations/20260914000018_platform_pricing_quotes_and_customer_updates.sql
```

Using the Supabase CLI from the repository:

```bash
supabase db push
```

The migration creates the editable package catalog, platform pricing settings, quotation history, and Customer software/update telemetry columns. It also migrates the old six-tier package names into Bronze/Silver/Gold/Ultra while retaining the assigned cap for organizations that are already above 50 PCs.

## 3. Deploy the changed Supabase Edge Functions

Redeploy:

```bash
supabase functions deploy developer-registrations
supabase functions deploy station-runtime
```

`developer-registrations` now owns pricing edits plus Resend delivery for quotations and owner invitation/activation links. `station-runtime` receives the Customer Electron version/update state through the normal heartbeat.

## 4. Configure transactional email

Quotation email is sent server-side through Resend. Do not put the provider API key in the Admin frontend.

Create/verify the sender domain in Resend, then configure Supabase Edge Function secrets:

```bash
supabase secrets set RESEND_API_KEY="re_xxxxxxxxx"
supabase secrets set AEZAKMI_EMAIL_FROM="Aezakmi Café <quotes@your-domain.com>"
```

Optional branded settings:

```bash
supabase secrets set AEZAKMI_REPLY_TO="sales@your-domain.com"
supabase secrets set AEZAKMI_BRAND_LOGO_URL="https://your-domain.com/aezakmi-logo.png"
```

If `AEZAKMI_BRAND_LOGO_URL` is omitted, the email uses an Aezakmi gold "A" fallback mark. Resend is also used for owner invitation and activation-link resends, while Supabase Auth remains responsible for generating the secure one-time link. The quotation email contains the business name, quotation number, selected package, PC count, branch count, monthly price, initial deployment pricing, validity date, and an optional developer message.

## 5. Send a quotation

In **Developer Approvals**:

1. Select a business/application.
2. Click **Send quotation**.
3. Choose Bronze, Silver, Gold, or Ultra.
4. Confirm the PC count and number of branches.
5. Adjust the suggested monthly amount or deployment amount if this prospect needs a custom quote.
6. Add an optional message.
7. Click **Send branded quotation**.

The email is sent to the registration email address and a snapshot is stored in `platform_quotations`, so later pricing edits do not rewrite historical quotes.

## 6. Edit pricing later

Open **Developer Approvals → Pricing**. Save the desired catalog values. New package suggestions and new quotations immediately use the updated catalog.

Changing the catalog does **not** silently resize already-provisioned organizations. Use that organization's package controls if you intentionally want to change its station allowance.

---

# Customer Electron updates

Customer Station updates are now **Admin-managed** rather than autonomous. The Customer Electron app does not periodically decide to fetch/install releases by itself. Admin selects the approved release source and sends Check, Download, Install When Idle, or Cancel commands. Local Café Edge can cache the installer once and serve all Customer PCs over LAN.

See the focused manual:

```text
docs/ADMIN_MANAGED_CUSTOMER_UPDATES_2026-09-14.md
```

The production release flow remains versioned: bump `apps/customer/package.json`, run `npm --workspace apps/customer run dist:win`, and publish the generated `latest.json` together with its matching NSIS EXE. Admin then deploys that approved version. Active/paused paid sessions and session-start transitions block installation until the station reaches a safe idle/login-screen boundary.
