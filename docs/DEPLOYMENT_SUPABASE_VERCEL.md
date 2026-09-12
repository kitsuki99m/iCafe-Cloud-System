# Aezakmi — Deployment Guide (GitHub + Supabase + Vercel + Local Edge)

_Last updated: September 2026_

## Production topology

```text
Owner / staff browser
        |
        v
Vercel — apps/admin (cloud mode)
        |
        v
Supabase
  - Auth
  - PostgreSQL + RLS
  - Edge Functions
  - Realtime wake-ups
        |
        | outbound HTTPS / WSS
        v
Cafe Edge — backend/
  Node + Express + SQLite + Socket.IO
        |
        +---- Customer Electron PCs
        |
        +---- Emergency Admin Electron (local mode)
```

The local Edge is the operational authority for live sessions, station identity, wallets, time, rates, and customer login. Supabase is the cloud control plane and durable multi-tenant mirror. Customer Stations never connect directly to Supabase.

## 1. Before pushing to GitHub

From the repository root:

```powershell
npm install
npm test
npm run check:release
npm run build:admin
npm run build:customer
```

Do not commit these files/directories:

- `.env` or `.env.*` containing real values
- `node_modules/`
- `dist/`
- `installer/`
- `.vercel/`
- `.supabase/` / `supabase/.temp/`
- `*.sqlite`, `*.db`, WAL/SHM/journal files

The included `.gitignore` already excludes them.

## 2. Create the Supabase project

Create one Supabase project for the Aezakmi SaaS platform. Do **not** create one project per café. Tenant separation is implemented with organizations, branches, memberships, and PostgreSQL RLS.

Record these public values for later:

```text
Project URL:      https://YOUR_PROJECT_REF.supabase.co
Publishable key:  sb_publishable_...
```

Never put a Supabase secret key in Vercel browser variables, Customer Electron, Emergency Admin Electron, or the distributed Edge server.

## 3. Link the Supabase CLI and apply migrations

Install/authenticate the Supabase CLI, then from the repository root:

```powershell
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

`db push` applies the migrations under `supabase/migrations/`, including the multi-tenant cloud schema and cloud-command idempotency migration.

## 4. Deploy all Supabase Edge Functions

From the repository root:

```powershell
supabase functions deploy
```

Functions in this release include:

- `pair-edge`
- `edge-sync`
- `edge-unpair`
- `create-pairing-code`
- `create-branch`
- `revoke-edge`
- `update-branch-config`
- `issue-command`
- `admin-action`
- `admin-api`

Hosted Supabase Edge Functions provide the project URL and platform API keys in their environment. The shared server helper supports current `SUPABASE_PUBLISHABLE_KEYS` / `SUPABASE_SECRET_KEYS`, local single-key variables, and the legacy anon/service-role variables.

Do not add a secret key to the repository.

## 5. Configure Supabase Auth

In **Supabase Dashboard → Authentication**:

1. Enable Email authentication.
2. Decide whether email confirmation is required.
3. Set the production Site URL to the Vercel Admin URL once Vercel assigns it, for example:
   `https://admin.example.com`.
4. Add any Vercel Preview URL patterns you intentionally want to use for authentication testing.

The Vercel Admin supports creating the first cloud account. After sign-in, a new user with no organization is shown the Aezakmi Cloud setup screen to create their first organization and branch.

## 6. Deploy the Admin to Vercel

Connect the GitHub repository to a Vercel project.

Use the **repository root** as the Vercel Root Directory. The root `vercel.json` already specifies:

- build command: `npm run build:admin`
- output directory: `apps/admin/dist`
- SPA fallback to `index.html`

Add these Vercel Environment Variables for Production (and Preview/Development if desired):

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

`npm run build:admin` forces `VITE_ADMIN_MODE=cloud` during the Vite build, so the deployed Admin never attempts to use a café LAN address directly.

Do **not** add any of these to Vercel frontend variables:

```text
SUPABASE_SECRET_KEY
SUPABASE_SERVICE_ROLE_KEY
sb_secret_...
```

## 7. First cloud onboarding

Open the deployed Vercel Admin.

1. Create/sign in to the owner account.
2. If this is the first account, create the first organization and branch.
3. Open **Settings → Aezakmi Cloud**.
4. Generate a one-time Edge pairing code.
5. Keep the page open or copy the code. It expires automatically.

Additional branches can be created from the same Cloud settings section. The current subscription's branch limit is enforced server-side.

## 8. Configure the local Edge server

Copy:

```text
backend/.env.example
```

to:

```text
backend/.env
```

Use strong local production values. Example:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DATABASE_PATH=./data/aezakmi.sqlite

JWT_SECRET=GENERATE_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
JWT_EXPIRES_IN=8h
SESSION_IDLE_TIMEOUT_MINUTES=10
SESSION_HEARTBEAT_SECONDS=10

# Electron production pages use a null origin; dev Vite ports are included for local testing.
CORS_ORIGIN=null,http://localhost:5173,http://localhost:5174
TRUST_PROXY=false
DISKLESS_PROVIDER=icafe8
SERVER_NAME=Main Branch Edge

AEZAKMI_CLOUD_ENABLED=true
AEZAKMI_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
AEZAKMI_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
AEZAKMI_CLOUD_SYNC_INTERVAL_SECONDS=5
AEZAKMI_CLOUD_SYNC_BATCH_SIZE=100
AEZAKMI_CLOUD_REQUEST_TIMEOUT_MS=8000
AEZAKMI_EDGE_VERSION=1.0.0
```

The Edge receives only the public Supabase project URL/key. Pairing returns a revocable Edge-specific credential. The Supabase privileged key is never distributed to the café.

Start the Edge:

```powershell
npm run start:backend
```

For development:

```powershell
npm run dev:backend
```

## 9. Pair the Edge to the branch

Open the **Emergency Admin** locally and go to:

```text
Settings → Aezakmi Cloud
```

Enter the one-time pairing code generated by the Vercel Admin.

After successful pairing, the Edge:

1. stores its Edge-specific identity/credential locally,
2. queues a sanitized baseline snapshot of existing café data,
3. synchronizes subsequent core SQLite mutations through the durable outbox,
4. sends heartbeat/status summaries,
5. receives authenticated cloud commands/config changes,
6. remains fully operational if internet/cloud access disappears.

Credential hashes, Admin PIN/password hashes, and Customer station token hashes are never mirrored to cloud.

## 10. Add Customer PCs

Customer Electron always registers against the local Edge.

You may use the existing Admin flows to:

- Add PC
- Bulk Add PCs
- assign IP/name/zone
- re-pair/reset a station device

When Vercel Admin performs those actions, Supabase sends an authenticated `admin_api` command to the Edge; the Edge executes the **same existing local REST/business rules** used by Emergency Admin. This prevents cloud and local billing/session logic from drifting apart.

Customer Electron stores/uses its station credential and talks only to the local Edge over the LAN. The Edge mirrors station status/data to Supabase.

## 11. Offline behavior

If the internet, Vercel, or Supabase is unavailable:

- Customer login continues locally.
- Session timers continue locally.
- Wallet/time ledger operations continue locally.
- PC controls continue locally.
- Emergency Admin continues locally.
- SQLite remains authoritative.
- cloud-bound events remain in `sync_outbox` and retry later.

The Vercel Admin will be temporarily unable to issue new remote actions. It can still render its cached browser snapshot where available, but it cannot make Edge-authoritative changes until the branch reconnects.

Cloud subscription/license state is advisory to the Edge and does not immediately shut down an offline café.

## 12. Release validation

Before each tagged release run:

```powershell
npm test
npm run test:cloud
npm run check:release
npm run build:admin
npm run build:customer
```

Also perform live integration testing with the actual Supabase/Vercel/Windows environment:

1. cloud owner sign-up/sign-in,
2. organization/branch creation,
3. Edge pairing,
4. initial baseline sync,
5. new member + rate + session + wallet transaction,
6. Vercel remote action and Edge acknowledgement,
7. duplicate/retry of a mutation (must execute once),
8. internet disconnect while a session is active,
9. reconnect and outbox catch-up,
10. Customer Electron station re-pair/replacement,
11. Edge revocation and re-pair,
12. Emergency Admin operation while cloud is unavailable.

A local/static green test suite does not replace these live deployment checks.
