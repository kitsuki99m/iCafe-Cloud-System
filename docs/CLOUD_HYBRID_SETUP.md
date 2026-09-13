# Aezakmi Hybrid Cloud + Local Edge Setup

Aezakmi remains hybrid:

```text
Vercel Admin → Supabase → local Edge → Customer Electron
                         ↘ SQLite
```

The Edge is the branch runtime and operational authority. Supabase provides the multi-tenant cloud control plane.

## Approval-only Cloud owner workflow

```text
Business owner requests access
→ Aezakmi developer reviews
→ developer approves + Supabase sends invitation
→ organization / Main Branch are provisioned
→ owner opens invite and sets password
→ owner pairs local Edge
```

Public users never self-create organizations.

See `DEVELOPER_APPROVAL_SETUP.md` for developer bootstrap and review details.

## Local Edge configuration

```env
AEZAKMI_CLOUD_ENABLED=true
AEZAKMI_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
AEZAKMI_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

The Edge never receives a Supabase secret/service-role key.

## Vercel Admin configuration

Vercel project:

```text
Root Directory: apps/admin
Build Command: npm run build
Output Directory: dist
```

Browser-safe variables:

```env
VITE_ADMIN_MODE=cloud
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

## Supabase deployment

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy --use-api
```

Then disable public Auth signup and bootstrap the platform developer as documented in `DEVELOPER_APPROVAL_SETUP.md`.

## Customer Station rule

Customer Electron never falls back directly to Supabase. If the local Edge is unavailable, Customer stays disconnected/recovery-mode until the Edge returns. This prevents split-brain sessions, balances, station identity, or timers.

## Offline operation

Cloud unavailable:

- local Customer sessions: available
- local station controls: available
- local wallets/time ledgers: available
- local Emergency Admin: available
- cloud reporting/remote control: temporarily unavailable
- sync events: queued for retry
