# Member Start Session Authentication Fix — 2026-09-13

## Root cause

Electron intentionally writes a lifecycle marker with `active: true` while a paid session is healthy so an unexpected process/PC exit can later recover and save that session. The renderer helper incorrectly interpreted every `active: true` marker as *pending interruption recovery*.

When a member clicked **Start Session**, CustomerSessionView immediately activated the optimistic pending session in Electron. Electron wrote `active: true`. AuthContext's recovery retry then treated that healthy/new marker as stale, called `/public/station/lifecycle`, checkpointed/released the new session, revoked the station's member auth, and cleared the signed-in user. This produced the observed Start Session -> logout failure.

A renderer remount could trigger the same problem because `recoverPendingStationLifecycle()` also checked raw `active` instead of a true recovery condition.

## Fix

- Electron lifecycle markers now include a per-process `runtimeInstanceId`.
- Electron exposes `recoveryRequired` only when:
  - an explicit exit/interruption was requested, or
  - the active marker belongs to an older Electron process / legacy marker.
- A healthy marker owned by the current process is **not** pending recovery.
- `recoverPendingStationLifecycle()` now requires `recoveryRequired`.
- Added separate `hasActiveStationLifecycle()` for real active-session interruption handling.
- Transport loss and auth invalidation still checkpoint active paid sessions.
- Member Start Session no longer creates a fake `pending:` active session before the backend commits the session/wallet transaction. The modal busy state is used while the request is pending; Electron is marked active only after authoritative session refresh.

## Validation

- Dedicated member Start Session lifecycle regressions added.
- Full regression suite: 416/416 passing.
- Electron main process syntax check passes.
- Release-readiness static checks pass.
- Customer Vite build could not be run in the patch workspace because dependencies/node_modules are not bundled in the source ZIP (`vite: not found`).

## Deployment

No Supabase migration or Edge Function change is introduced by this fix. Rebuild/redeploy the Customer Electron application from this source.
