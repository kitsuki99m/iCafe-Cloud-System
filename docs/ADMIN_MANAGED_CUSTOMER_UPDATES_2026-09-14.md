# Aezakmi Admin-Managed Customer Station Updates

This build changes Customer Station updates from an autonomous client updater into an **Admin-controlled deployment system**.

The Customer Electron app still performs the sensitive local work (download, SHA-256 verification, safe install and relaunch), but it no longer periodically decides by itself to fetch or install a release. Admin is the authority.

## Architecture

```text
Developer / VS Code
       |
       | build versioned Customer release
       v
latest.json + NSIS installer
       |
       +-------------------------------+
       |                               |
       v                               v
Public HTTPS release feed         Local Café Edge Admin
(cloud deployments)               downloads/verifies once
       |                               |
       |                               +--- LAN ---> PC-01
       |                               +--- LAN ---> PC-02
       |                               +--- LAN ---> PC-03
       v
Cloud Admin -> Customer Stations
```

Every Customer heartbeat reports its installed version and update state. Admin sends durable update commands. An offline Customer Station can receive an approved update command after it reconnects.

## Admin controls

Open **Admin -> Clients -> Software updates**.

Available per-station actions:

- **Check** - ask that station to compare itself with the approved manifest.
- **Download** - download and SHA-256 verify the approved installer, but do not install it yet.
- **When idle** - download if necessary, then install only at a safe idle/login-screen boundary.
- **Cancel** - cancel a queued update intent and abort an active Customer download when possible.

Bulk actions:

- **Check all**
- **Download outdated**
- **Update all when idle**

There is deliberately no normal "force over an active paid session" action in the Admin UI.

## Session safety

Installation is blocked while any protected Customer lifecycle is active, including:

- member session;
- guest prepaid/postpaid session;
- paused paid session;
- a station lock associated with a paid session;
- a session-start transition; or
- a persisted session lifecycle marker that has not been safely cleared.

`Update all when idle` is therefore the recommended deployment action during normal café operation.

## Local Café Edge cache

When Admin is running against the local Café Edge backend, the Software Updates panel can cache a release locally.

1. Enter the upstream `latest.json` URL.
2. Click **Save source**.
3. Click **Cache on Edge**.
4. Edge downloads the installer once, verifies its SHA-256, and stores it beside the local database under `customer-updates/`.
5. Customer Stations receive the LAN manifest URL and download the installer from Edge instead of each PC downloading it from the internet.

This is the recommended mode for cafés with many PCs.

Plain HTTP is accepted only for localhost/private LAN addresses (`127.0.0.1`, `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`). Public update feeds must use HTTPS.

## Cloud Admin release source

Cloud Admin uses a public release feed. Optionally set the default in:

```text
apps/admin/.env.cloud.example
```

as:

```text
VITE_AEZAKMI_CUSTOMER_UPDATE_MANIFEST_URL=https://updates.example.com/customer/stable/latest.json
```

The feed must be reachable by Customer Stations. If Cloud Admin itself fetches the manifest in the browser, the host must also permit CORS for the Admin origin. The included development update server now sends permissive CORS headers.

## Apply the cloud migration

This patch adds update progress/intent telemetry and expands the station command constraint.

```text
supabase/migrations/20260914000018_admin_managed_customer_updates.sql
```

Apply migrations:

```bash
supabase db push
```

Then redeploy the changed functions:

```bash
supabase functions deploy station-admin
supabase functions deploy station-runtime
```

`station-admin` stores update commands in `station_commands` with a seven-day TTL, so an offline station can receive them after reconnecting. `station-runtime` receives update progress and install-when-idle telemetry.

## Build a Customer release

Every production release must have a version higher than the installed version.

Example:

```bash
npm version patch --workspace apps/customer --no-git-tag-version
```

Then build:

```bash
npm --workspace apps/customer run dist:win
```

The release is generated in:

```text
apps/customer/installer/
```

with approximately:

```text
iCafe Customer Station Setup 0.1.1-x64.exe
latest.json
```

The manifest is generated from the exact installer and contains its SHA-256 checksum.

Optional release notes:

```powershell
$env:AEZAKMI_RELEASE_NOTES="Fixed session lifecycle and Customer reconnect behavior"
npm --workspace apps/customer run dist:win
```

Upload `latest.json` and its matching EXE to the same release folder.

## Developer / LAN feed from VS Code

After building the Customer installer, run:

```bash
npm run serve:customer-updates
```

Default manifest URL:

```text
http://<YOUR-VSCODE-PC-LAN-IP>:8787/latest.json
```

The development server serves only the generated manifest and matching installer. Allow TCP 8787 through Windows Firewall when another PC needs to reach it.

In a local Admin build, paste that LAN URL into **Clients -> Software updates**, click **Cache on Edge**, then deploy through Admin.

## Live coding is separate from production updates

For a dedicated development Customer PC, Vite HMR can still be used:

```bash
npm run dev:customer
```

and launch the development Electron process with:

```text
AEZAKMI_CUSTOMER_DEV_URL=http://<VS-CODE-PC>:5173
```

That is for development only. Real café stations should use the versioned Admin-managed updater.

## Update states shown in Admin

Typical states are:

- `managed` - Customer is connected and waiting for Admin instructions;
- `checking` - reading the approved manifest;
- `current` - already on the approved version;
- `available` - newer release found;
- `downloading` - installer download in progress (percentage is reported);
- `ready` - verified installer is present;
- `waiting_idle` - Admin requested installation but a protected session/state exists;
- `installing` - Customer is handing off to the NSIS installer;
- `cancelled` - Admin cancelled the current update intent;
- `error` - check, download, checksum, or install preparation failed.

## Offline stations

Admin may queue Customer update commands while a station is offline. Update commands have a seven-day expiry. When the station reconnects, the queued command is delivered through the existing station command path.

Normal power/session commands still reject offline stations; the durable-offline behavior is limited to Customer software update commands.

## Recommended release workflow

```text
1. Fix/test in VS Code.
2. Test React changes with Vite HMR on a development station.
3. Bump apps/customer/package.json version.
4. Build the Customer NSIS installer + latest.json.
5. Test the installer/update on one beta station.
6. Publish the exact EXE + latest.json to the chosen channel.
7. Open Admin -> Clients -> Software updates.
8. Local café: Cache on Edge.
9. Check all.
10. Download outdated or choose Update all when idle.
11. Watch version/progress/status from Admin.
```

Use separate folders/feeds for release channels if desired:

```text
/customer/developer/latest.json
/customer/beta/latest.json
/customer/stable/latest.json
```

Admin chooses which feed is approved for that deployment.

## Rollback

The updater accepts a newer version. For a bad release, publish a new higher patch version containing the rollback/fix rather than attempting to downgrade every station in place.

Example:

```text
1.4.7 bad
1.4.8 emergency release containing the reverted/fixed code
```

## Troubleshooting

### Admin says Café Edge cache is empty

Enter the upstream manifest URL and click **Cache on Edge**. The EXE and `latest.json` must belong to the same build.

### Checksum verification fails

Rebuild and republish both files together. Do not manually edit `sha256` in `latest.json`.

### Station stays on Waiting for idle

A protected session/lifecycle marker still exists. End/log out the session normally. The Customer process retries the safe-install boundary every few seconds.

### Offline station has not updated yet

It must reconnect before the queued command can execute. The update command expires after seven days; queue it again if necessary.

### Cloud Admin cannot load the manifest

Use HTTPS and make sure the release host allows CORS for the Admin web origin. Customer Stations themselves must also be able to reach the same feed.
