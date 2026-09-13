# Aezakmi Customer Auto-Update, Pricing, and Quotation Guide

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
supabase/migrations/20260914000017_platform_pricing_quotes_and_customer_updates.sql
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

`developer-registrations` now owns pricing edits and quotation sending. `station-runtime` receives the Customer Electron version/update state through the normal heartbeat.

## 4. Configure quotation email

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

If `AEZAKMI_BRAND_LOGO_URL` is omitted, the email uses an Aezakmi gold "A" fallback mark. The email contains the business name, quotation number, selected package, PC count, branch count, monthly price, initial deployment pricing, validity date, and an optional developer message.

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

## 7. How the production updater works

A packaged Customer Station now reads:

```text
<customer install folder>/.aezakmi-customer/update-config.json
```

It checks a small `latest.json` manifest. If a newer version exists, it:

1. downloads the complete NSIS installer;
2. verifies its SHA-256 checksum from the manifest;
3. stores the installer under `.aezakmi-customer/updates/<version>/`;
4. waits until the station is on the locked/login screen and **no session lifecycle marker is active**;
5. starts the NSIS update silently;
6. quits the old Customer Electron process; and
7. relaunches the installed Customer Station after a successful install.

It intentionally **will not install over an active, paused, locked paid/guest session, or a session-start transition**. This protects remaining time and session state.

The existing `.aezakmi-customer` folder is not part of the Electron package payload and remains the station-local identity/cache location across application updates.

## 8. Create the update configuration on each Customer PC

Create:

```text
<install folder>/.aezakmi-customer/update-config.json
```

Recommended internet/production configuration:

```json
{
  "manifestUrl": "https://updates.your-domain.com/customer/stable/latest.json",
  "checkIntervalMinutes": 5,
  "autoDownload": true,
  "allowInsecure": false
}
```

A sample is included at:

```text
docs/customer-update-config.example.json
```

Environment variables may override the file:

```text
AEZAKMI_CUSTOMER_UPDATE_MANIFEST_URL
AEZAKMI_CUSTOMER_UPDATE_INTERVAL_MINUTES
AEZAKMI_CUSTOMER_UPDATE_AUTO_DOWNLOAD
AEZAKMI_ALLOW_INSECURE_UPDATE_URL
```

HTTPS is required by default. HTTP only works when `allowInsecure` is explicitly enabled.

## 9. Build and publish a Customer patch

Every production release must have a version greater than the installed version.

Example: bump Customer from `0.1.0` to `0.1.1` in:

```text
apps/customer/package.json
```

You can also use npm:

```bash
npm version patch --workspace apps/customer --no-git-tag-version
```

Then build the Windows Customer installer:

```bash
npm --workspace apps/customer run dist:win
```

The builder now writes both files into:

```text
apps/customer/installer/
```

You will see approximately:

```text
iCafe Customer Station Setup 0.1.1-x64.exe
latest.json
```

`latest.json` contains the version, installer filename, SHA-256, file size, release date, and optional release notes.

Optional release notes before building:

### Windows CMD

```cmd
set AEZAKMI_RELEASE_NOTES=Fixed guest forfeit lifecycle and Customer reconnect behavior
npm --workspace apps/customer run dist:win
```

### PowerShell

```powershell
$env:AEZAKMI_RELEASE_NOTES="Fixed guest forfeit lifecycle and Customer reconnect behavior"
npm --workspace apps/customer run dist:win
```

Upload **both `latest.json` and the generated EXE to the same folder** on your HTTPS static/object host. The updater resolves the installer relative to the manifest URL.

For example:

```text
https://updates.your-domain.com/customer/stable/latest.json
https://updates.your-domain.com/customer/stable/iCafe%20Customer%20Station%20Setup%200.1.1-x64.exe
```

Do not hand-edit the SHA-256. Rebuild the installer so the manifest is generated from the exact binary being published.

## 10. Quick LAN update server from your VS Code PC

For a trusted local test/café LAN, this patch includes:

```bash
npm run serve:customer-updates
```

It serves the contents of `apps/customer/installer` on port `8787` by default.

If your VS Code/developer PC is `192.168.1.10`, a test Customer can use:

```json
{
  "manifestUrl": "http://192.168.1.10:8787/latest.json",
  "checkIntervalMinutes": 1,
  "autoDownload": true,
  "allowInsecure": true
}
```

Allow TCP `8787` through Windows Firewall on the developer/update-server PC.

**Security note:** LAN HTTP is intentionally opt-in and is best treated as a trusted-network/test deployment method. The SHA-256 prevents a corrupted installer from being accepted, but HTTPS should be used for an internet-facing/stable release channel.

## 11. Developer live-patch mode from VS Code

When you are actively coding and want a dedicated test Customer Electron to reflect React/Vite changes immediately, do **not** rebuild an installer each save.

On the VS Code PC:

```bash
npm run dev:customer
```

Vite already listens on `0.0.0.0:5173`.

On a development Customer Electron process, set the development URL to the VS Code PC:

### Windows CMD

```cmd
set AEZAKMI_CUSTOMER_DEV_URL=http://192.168.1.10:5173
npm --workspace apps/customer run electron
```

This gives you Vite HMR:

```text
VS Code save -> Vite HMR -> test Customer Electron updates immediately
```

Use this only on development/test stations. A production kiosk should continue to use the versioned installer updater so a bad Ctrl+S cannot instantly break every active café PC.

## 12. Update status in Admin

Customer heartbeat now reports:

- installed Customer version;
- updater state (`disabled`, `checking`, `current`, `available`, `downloading`, `ready`, `installing`, or `error`); and
- available/downloaded target version.

The Admin PC card shows the installed `vX.Y.Z` and a compact update badge when an update is available/downloading/ready/installing or has errored.

## 13. Safe release workflow

Recommended stable release flow:

```text
1. Edit in VS Code
2. Test with Vite/HMR on one development PC
3. Bump Customer package version
4. Build NSIS installer
5. Test the generated installer on one beta Customer PC
6. Publish latest.json + EXE to beta URL
7. Verify update waits until no session is active
8. Publish the same verified build to stable URL
9. Watch Customer versions/update states in Admin
```

You can create stable/beta/developer channels simply by using different manifest folders/URLs, for example:

```text
/customer/developer/latest.json
/customer/beta/latest.json
/customer/stable/latest.json
```

Each station's `update-config.json` chooses its channel by selecting the corresponding manifest URL.

## 14. Rollback strategy

The updater intentionally installs only versions greater than the currently installed version. For a bad release, the safest automated rollback is to make a **new higher patch version containing the reverted/fixed code**.

Example:

```text
0.1.7 bad release
0.1.8 emergency release containing the reverted 0.1.6 behavior
```

For an emergency manual rollback, uninstall/reinstall the previous installer only after confirming `.aezakmi-customer` station data is retained/backed up.

## 15. Troubleshooting

### Customer says updater is `disabled`

Check that this file exists:

```text
<install folder>/.aezakmi-customer/update-config.json
```

and contains `manifestUrl`.

### Update does not install after download

A `ready` update waits for the station to be safe. It will not install while a member/guest session lifecycle marker exists or while the Customer is in an active desktop/session state. Log out/end the session normally; the updater retries every 5 seconds.

### Customer cannot reach the VS Code LAN update server

Check:

- same LAN/subnet;
- developer PC firewall permits TCP 8787;
- `npm run serve:customer-updates` is still running;
- `http://<developer-ip>:8787/health` opens from the Customer PC; and
- `allowInsecure:true` is present only for the HTTP LAN setup.

### Manifest is found but checksum fails

The EXE and `latest.json` do not belong to the same build. Re-run `dist:win` and publish both generated files together.

### Quote button says email is not configured

Set `RESEND_API_KEY` and `AEZAKMI_EMAIL_FROM`, then redeploy/restart the `developer-registrations` Edge Function environment.
