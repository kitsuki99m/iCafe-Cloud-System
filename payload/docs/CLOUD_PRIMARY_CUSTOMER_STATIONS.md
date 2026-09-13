# Aezakmi Cloud — Cloud-Primary Customer Stations

_Last updated: 2026-09-13_

## Target architecture

Aezakmi now treats Supabase as the normal Customer Station transport and the Café Edge as the LAN fallback.

```text
Business Owner / Cloud Admin (Vercel)
               |
               v
Supabase: Auth + Postgres + Realtime + Edge Functions
               |
        +------+------+------+
        |             |      |
     PC-01          PC-02  PC-03
  Customer Electron (cloud-primary)
        |             |      |
        +------+------+------+
               |
         standby LAN path
               v
       Café Edge on cashier/admin PC
       Node + Express + SQLite + Socket.IO
```

No dedicated server hardware is required. The Café Edge can run with the installed Admin application on the cashier/admin Windows PC.

## Identity and tenant isolation

The owner email is used only during first-time Customer Station enrollment. It is never the permanent authorization boundary and the Customer app never receives the owner's password or Auth session.

After a successful pairing, the station is bound to:

- `organization_id`
- `branch_id`
- `station_id`
- its own revocable station credential

This means changing the owner's email later does not detach the station, and RLS can prevent stations from another organization from appearing in the owner's dashboard.

## Customer Station pairing

1. The approved owner signs in to Cloud Admin.
2. Open **Clients** and add or bulk-add the logical PCs.
3. Select **Pair Customer PC**.
4. Select an unpaired logical PC and generate a pairing code.
5. On that Customer Station, open the Customer Electron application.
6. Enter the business owner email, pairing code, and confirm the PC identity.
7. The station exchanges the one-time code for its own station credential.
8. The station appears under the correct organization and branch in Cloud Admin.

Pairing codes expire and are one-time-use.

## Normal cloud operation

The Customer app uses Supabase first:

- station heartbeat and connection state use `station-runtime`;
- durable remote commands live in `station_commands`;
- Realtime is a wake-up mechanism, not the command source of truth;
- cloud-visible station state is mirrored to `branch_stations`;
- Customer reads that are safe in the cloud are served by `station-api` directly from Supabase;
- Customer mutations that still rely on the mature local billing/session rules are relayed by `station-api` to the paired Café Edge.

The Customer app does not connect Socket.IO to Vercel.

## Café Edge fallback

The Customer Electron app keeps the LAN Edge path as standby. When the Cloud path is unavailable, it switches to the configured Café Edge and continues using the local REST + Socket.IO stack.

The fallback flow is:

```text
Customer cannot reach Supabase
        |
        v
Cloud transport marked unavailable
        |
        v
Customer connects to Café Edge over LAN
        |
        v
Local SQLite/session rules continue
        |
Internet returns
        |
        v
Cloud heartbeat recovers and Edge sync/outbox reconciles
        |
        v
Customer returns to Cloud transport
```

A Cloud outage must not shut down an active café.

## Transitional authority rule

The current build is deliberately conservative around billing, member credentials, and session mutations:

- Supabase is the normal transport/control plane.
- Existing Café Edge business rules remain authoritative for sensitive member/session mutations while the cloud schema is being matured.
- The Customer app talks directly to the Edge only when Cloud transport is unavailable; otherwise `station-api` relays those calls through Cloud to the Edge.
- Remote station commands are Cloud-native and delivered directly to the station through the durable station command queue.

This prevents duplicating password hashes or creating a second billing implementation in Supabase.

## Deployment

### 1. Database

From the repository root:

```powershell
npx supabase db push --dry-run
```

If migrations `00001` through `00005` are already live, the dry run should show only:

```text
20260913000006_cloud_primary_customer_stations.sql
```

Then:

```powershell
npx supabase db push
```

### 2. Edge Functions

Deploy the Docker-free single-file functions:

```powershell
npx supabase functions deploy --use-api
npx supabase functions list
```

The station layer adds:

- `station-admin`
- `pair-station`
- `station-runtime`
- `station-api`

### 3. Cloud Admin

Vercel remains configured with:

```env
VITE_ADMIN_MODE=cloud
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Do not expose a secret or service-role key in Vercel.

### 4. Customer Station build

The Customer renderer needs only public Supabase configuration:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

No owner password, secret key, or service-role key belongs in the Customer installer.

Build and package on Windows:

```powershell
npm run build:customer
npm --workspace apps/customer run dist:win
```

### 5. Café Edge fallback

Install the Admin/Café Edge application on the cashier/admin PC. Configure the Customer Station's local Server Connection to that machine's LAN IP and port. The Customer app will use that LAN path only as fallback when Cloud transport is unavailable.

## Connection states

Customer UI/runtime can distinguish:

- **Cloud Online** — normal Supabase path.
- **Cloud reconnecting** — Cloud heartbeat temporarily unavailable.
- **Edge Fallback** — Customer is operating against the local Café Edge.
- **Sync Restored** — Cloud connectivity returned and reconciliation is occurring.
- **Revoked** — station credential has been reset/revoked and must be paired again.

## Security rules

- Owner email is enrollment metadata only.
- Pairing codes are hashed, short-lived and one-time-use.
- Station credentials are unique and revocable per PC.
- Electron stores the station credential using `safeStorage` where available.
- Customer Stations never receive Supabase service-role/secret credentials.
- Cloud Admin access is constrained by organization membership and RLS.
- Station APIs resolve organization + branch + station server-side rather than trusting IDs supplied by the renderer.
