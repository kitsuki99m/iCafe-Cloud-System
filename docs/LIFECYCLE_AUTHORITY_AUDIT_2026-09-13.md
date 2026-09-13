# Lifecycle & Authority Audit — 2026-09-13

This pass verifies the Customer Electron UI, Café Edge backend, Cloud Station API, Cloud Admin station lifecycle, pairing, and command authority after the member/guest lifecycle fixes.

## Fixed findings

1. **Idle shutdown policy**
   - Login-screen 180-second timer is intentionally fixed while no member or Guest is authenticated. Pointer/keyboard activity and pre-login dialogs do not reset or pause it.
   - Signed-in/no-paid-session 300-second timer remains activity-aware and pauses while its interactive dialogs/actions are active.
   - Successful member login or Guest activation exits the unauthenticated login-kiosk countdown immediately.

2. **Natural member prepaid expiry no longer logs the member out**
   - `lockClient()` + logout on zero-time expiry is Guest-only.
   - Realtime `session_expired` is no longer treated as a member-auth revocation event.
   - Café Edge's periodic expiry cleanup no longer revokes member `auth_sessions`.
   - The member stays signed in and returns to the Start Session / Top Up state after paid time ends.

3. **Guest lifecycle event is explicit**
   - Confirmed Guest-session disappearance now emits `aezakmi:guest-session-ended` rather than a generic auth-expiry event.

4. **Dead legacy Customer login component removed**
   - Removed unused `components/auth/LoginForm.jsx`, which referenced `loginAdminPin` / `loginAdminPassword` APIs no longer supplied by `AuthContext`.

5. **Cloud Guest endpoint authority parity**
   - `/public/sessions/:id/end` now requires a Guest (`member_id IS NULL`) prepaid session on this station.
   - `/public/session-extensions` now requires a Guest prepaid session and only cash/GCash.
   - Authenticated member end/extension also verifies the session belongs to the authenticated member before transaction execution.
   - This matches the existing Café Edge authority rules and prevents a paired station from using Guest endpoints against a member session.

6. **Station identity collision protection**
   - Customer login is rejected if the physical station already owns an active Guest or different member session.
   - Admin session start is rejected when a different member is still authenticated on the station, even if the station has no active paid session and is otherwise `available`.
   - Starting the signed-in member's own session remains allowed.
   - Interrupted Guest restoration is also blocked while a member login owns the station.

7. **Admin power-command expiry**
   - Cloud `station-admin` now restores a station to Available after an expired reboot/shutdown command only when there is no active session and the station is not Maintenance/Reserved, matching `station-runtime` behavior.

8. **Legacy Cloud command station scope**
   - `issue-command` now verifies the requested station belongs to the selected Café Edge branch before enqueueing a command.

9. **Pair/restart availability boundary**
   - Pairing no longer starts Cloud runtime heartbeat in the pre-restart Electron process.
   - `pair-station` persists the logical PC as Offline/paired until the clean relaunched Customer Station sends its first `station-runtime` heartbeat.
   - Both Admin reset-pairing and Customer unpair persist Offline (except intentional Maintenance/Reserved state).
   - Cloud Admin paid-session start/Guest restore now requires a paired station plus a heartbeat fresher than ten seconds; (the original three-second rule was widened for production jitter tolerance); a stale persisted `available` value is not enough.

## Verified without a new fix

- Local `/sessions/start` already pins Customer-role requests to the authenticated member, authenticated PC, and prepaid billing.
- Cloud Customer `/sessions/start` overwrites client-provided member/PC/billing identity with station-authenticated values.
- `pair-station` uses a hashed, unexpired, unused code scoped to a specific organization/branch/logical station and rejects a second active installation.
- Cloud Admin write operations require owner/admin/manager membership.

## Deployment scope

No database schema migration is introduced by this audit. Supabase Edge Function deployment is required for the modified Cloud functions:

- `station-api`
- `station-admin`
- `admin-api`
- `issue-command`
- `station-runtime`

Also rebuild/redeploy:

- Customer Electron/web bundle
- Café Edge/backend

