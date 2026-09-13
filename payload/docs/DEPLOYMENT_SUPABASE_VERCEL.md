# Aezakmi — Deployment Guide (GitHub + Supabase + Vercel + Local Edge)

_Last updated: September 2026_

## Production topology

```text
Business owner / staff browser
        |
        v
Vercel — apps/admin (cloud mode)
        |
        v
Supabase
  - Auth (invitation-only for owners)
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

The local Edge remains authoritative for live café operations. Supabase is the cloud control plane and durable multi-tenant mirror. Customer Stations never connect directly to Supabase.

## 1. Release validation

From the repository root:

```powershell
npm install
npm test
npm run test:cloud
npm run check:release
npm run build:customer
npm --workspace apps/admin run build
```

Do not commit `.env`, databases, build output, `.vercel`, `.supabase`, or real secret keys.

## 2. Create / link the Supabase project

One Supabase project hosts the Aezakmi SaaS platform. Tenant separation is implemented through organizations, branches, memberships, RLS, and developer-approved registration.

Record only these browser-safe values:

```text
Project URL:      https://YOUR_PROJECT_REF.supabase.co
Publishable key:  sb_publishable_...
```

Never put a Supabase secret key in Vercel browser variables, Customer Electron, Emergency Admin Electron, or the distributed Edge server.

Link the CLI:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

## 3. Apply database migrations

```powershell
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

Expected migrations include:

```text
20260913000001  cloud base
20260913000002  cloud admin idempotency
20260913000003  pairing code security
20260913000004  developer-approved registration
```

Migration 4 creates `platform_developers`, `registration_requests`, `registration_audit_logs`, approval RPCs, and revokes authenticated self-service organization creation.

## 4. Configure approval-only Supabase Auth

In Supabase Dashboard:

1. Keep Email authentication enabled.
2. Set **Allow new users to sign up = OFF**.
3. Set Auth **Site URL** to the production Vercel Admin URL.
4. Add the production URL to allowed Redirect URLs.
5. Add Preview URLs only when intentionally testing Preview invitations.

Public Cloud Admin now exposes **Request access**, not Auth signup. A developer must approve a request before Supabase creates the invited owner.

See `docs/DEVELOPER_APPROVAL_SETUP.md` for the complete workflow.

## 5. Bootstrap the first platform developer

Use an existing Auth user and run this in Supabase SQL Editor:

```sql
insert into public.platform_developers(user_id,email,display_name,is_active)
select id,email,'Aezakmi Developer',true
from auth.users
where lower(email)=lower('YOUR_DEVELOPER_EMAIL@example.com')
on conflict(user_id) do update
set email=excluded.email,
    display_name=excluded.display_name,
    is_active=true;
```

If no developer Auth user exists, create one manually in Supabase Dashboard → Authentication → Users. Do not temporarily reopen public signup.

## 6. Deploy all Supabase Edge Functions

The functions are intentionally single-file for Docker-free API deployment:

```powershell
npx supabase functions deploy --use-api
npx supabase functions list
```

Functions in this release:

```text
pair-edge
edge-sync
edge-unpair
create-pairing-code
create-branch
revoke-edge
update-branch-config
issue-command
admin-action
admin-api
request-business-access
developer-registrations
activate-registration
```

Hosted Edge Functions receive Supabase server-side secret keys from the platform environment. Those keys never enter Vercel browser code or café machines.

Optional explicit invite redirect:

```powershell
npx supabase secrets set AEZAKMI_ADMIN_URL=https://YOUR-ADMIN-DOMAIN
```

Otherwise invitations use the Supabase Auth Site URL.

## 7. Deploy Admin to Vercel

This release follows the working monorepo deployment used by the current production setup.

In Vercel Project Settings:

```text
Root Directory:   apps/admin
Framework:        Vite
Install Command:  npm install
Build Command:    npm run build
Output Directory: dist
```

`apps/admin/vercel.json` contains the SPA rewrite and cache headers.

Set these Vercel **Config** variables for Production (and Preview/Development when needed):

```env
VITE_ADMIN_MODE=cloud
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

These are browser-safe public configuration values. Never add `sb_secret_...`, `SUPABASE_SECRET_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` to Vercel frontend variables.

Redeploy after changing Vite environment variables because they are embedded at build time.

## 8. Business onboarding

Public visitor:

```text
Cloud Admin login
→ New business? Request access
→ Submit application
→ wait for developer review
```

Developer:

```text
Developer Approvals
→ select application
→ Review / Needs info / Reject / Approve & invite
```

Approval creates the Auth invitation plus the approved Organization, owner membership, Starter subscription, Main Branch, and branch config.

Owner:

```text
Invitation email
→ Cloud Admin
→ set password
→ account activated
→ enter assigned organization
```

No public user can create an arbitrary organization.

## 9. Pair the local Edge

After the approved owner is activated:

```text
Settings → Aezakmi Cloud → Generate pairing code
```

On the local Edge configure `backend/.env`:

```env
NODE_ENV=production
HOST=0.0.0.0
PORT=3000
DATABASE_PATH=./data/aezakmi.sqlite

JWT_SECRET=GENERATE_A_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
JWT_EXPIRES_IN=8h
SESSION_IDLE_TIMEOUT_MINUTES=10
SESSION_HEARTBEAT_SECONDS=10

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

Start the Edge and pair it using the one-time code from Cloud Admin. The Edge receives its own revocable device credential; it never receives the Supabase platform secret.

## 10. Customer PCs

Customer Electron always connects to the local Edge. Add / Bulk Add PC remains an Edge-authoritative workflow. Cloud Admin commands are authorized in Supabase and executed through the existing local REST/business rules.

## 11. Offline behavior

If internet, Vercel, or Supabase is unavailable:

- Customer login continues locally.
- Session timers continue locally.
- Wallet/time ledgers continue locally.
- Station controls continue locally.
- Emergency Admin continues locally.
- SQLite remains authoritative.
- cloud-bound events remain in the durable outbox and retry later.

## 12. Live production checklist

After static tests, verify with real Supabase/Vercel/Windows infrastructure:

1. unapproved visitor can submit a request but cannot create an Auth user,
2. direct public Auth signup is disabled,
3. non-developer cannot invoke developer approvals,
4. developer can approve and send an invitation,
5. invitation lands on the Vercel Admin and requires password setup,
6. approved owner sees only the provisioned organization/branch,
7. Edge pairing succeeds,
8. initial baseline sync succeeds,
9. cloud remote action executes once and is acknowledged,
10. active local café sessions survive internet disconnection/reconnection.

## Upgrade: developer business lifecycle controls

For an installation that already has migrations `00001` through `00004`, the next database change should be only:

```text
20260913000005_business_lifecycle_controls.sql
```

Verify before applying:

```powershell
npx supabase db push --dry-run
```

Then apply and redeploy the Docker-free Edge Functions:

```powershell
npx supabase db push
npx supabase functions deploy --use-api
```

Migration `00005` makes Cloud RLS lifecycle-aware. Suspended/terminated businesses cannot read tenant business tables from the browser, and Cloud command/config functions reject them. Existing Edge synchronization remains service-role/device-authenticated and is intentionally not disabled by **Suspend Cloud** so the local café keeps operating independently.

`Terminate business` is stronger: it revokes Cloud Edge credentials and pending pairing codes, but still does not issue any local shutdown/lock command.

## Cloud-primary Customer Stations (migration 00006)

The Customer Electron application can now use Supabase as its primary transport with the Café Edge as LAN fallback. See [`docs/CLOUD_PRIMARY_CUSTOMER_STATIONS.md`](./CLOUD_PRIMARY_CUSTOMER_STATIONS.md).

After migrations 00001–00005 are already applied, verify that:

```powershell
npx supabase db push --dry-run
```

shows only `20260913000006_cloud_primary_customer_stations.sql`, then run:

```powershell
npx supabase db push
npx supabase functions deploy --use-api
```

The Customer installer must be built with the public `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`. Never place a Supabase secret/service-role key or the business owner's password in the Customer build.
