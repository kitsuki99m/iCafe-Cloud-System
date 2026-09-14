# Guest Admin Authoritative Forfeit Fix — 2026-09-14

## Failure fixed
Admin Guest Forfeit/Pause & Save previously waited for a Customer Station `game_update` close-preparation ACK before committing the authoritative session mutation. A stale or broken station command queue could therefore prevent Admin from forfeiting a visibly active Guest session at all.

A second deployment-order failure existed when `station-admin` was newer than the `aezakmi_admin_close_session` RPC migration. That returned a schema error instead of executing Forfeit.

## New Guest rule
For Guest prepaid close actions, Admin/Supabase is authoritative:

1. Commit the session close in Cloud/Edge first.
2. Set the station available and end the active Guest session.
3. Broadcast the terminal `session_changed` wakeup.
4. Send the Customer terminal close command as a best-effort fast UI signal.
5. Customer returns to the login kiosk. Failure to ACK cannot undo or veto the committed Guest close.

Member close retains the pre-close protection barrier because member authentication remains alive after the paid session ends.

## Deployment compatibility
If the newer atomic-close RPC is missing, `station-admin` safely falls back to the already-existing `aezakmi_cloud_execute` transaction engine for `forfeit` and `refund`. Pause & Save still requires the newer RPC because Guest saved time must be persisted for restoration.
