# Aezakmi Hybrid Cloud + Local Edge Setup

Aezakmi is intentionally **hybrid** rather than cloud-only.

```text
Vercel Admin → Supabase → local Edge → Customer Electron
                         ↘ SQLite
```

The Edge is not replaced by Supabase. It is the branch runtime that keeps the café operational during internet outages.

## Cloud owner workflow

1. Sign in to the Vercel Admin using Supabase Auth.
2. Create the organization and first branch.
3. Add more branches if the subscription permits it.
4. For each branch, generate a one-time Edge pairing code.
5. Enter that code in the branch's local Emergency Admin.
6. Add/bulk-add Customer PCs through Admin and pair each physical Customer installation to the local Edge.

## Local Edge configuration

Required cloud values:

```env
AEZAKMI_CLOUD_ENABLED=true
AEZAKMI_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
AEZAKMI_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

The Edge does not receive a Supabase secret/service-role key. After pairing it receives a revocable device credential scoped to that Edge installation.

## Vercel Admin configuration

Public browser variables only:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

Build with:

```powershell
npm run build:admin
```

## Supabase deployment

```powershell
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
npx supabase functions deploy --use-api
```

See `DEPLOYMENT_SUPABASE_VERCEL.md` for the complete production checklist.

## Customer Station rule

Customer Electron **never** falls back directly to Supabase. If it cannot reach the local Edge, it remains disconnected/recovery-mode until the Edge is restored. This prevents split-brain sessions, balances, station identity, or timers.

## Admin remote actions

Vercel Admin actions are authorized in Supabase and queued as durable commands. The Edge receives the command and executes the existing local API/business rule. Results are acknowledged back to Supabase and reconciled into the browser UI.

## Offline operation

Cloud unavailable:

- local Customer sessions: available
- local station controls: available
- local wallets/time ledgers: available
- local Emergency Admin: available
- cloud reporting/remote control: temporarily unavailable
- sync events: queued for retry
