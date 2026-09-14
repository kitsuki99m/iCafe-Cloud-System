# Guest Atomic Cloud Lifecycle Fix — 2026-09-14

## Root cause
The Customer Station close-prepare ACK was already local and neutral, but Cloud Admin still sent the final `/sessions/:id/end`, `/refund`, and settlement-preview requests through the `admin-api` Café Edge bridge. If Edge was unreachable after the Station ACK, the final commit failed and Admin issued the local release command, restoring the old Guest session.

## Correct lifecycle
1. Admin sends neutral `game_update/sessionClose`.
2. Customer Electron enters a local protected kiosk state. Billing is not paused or mutated.
3. Customer ACKs only after local protection succeeds.
4. Cloud Admin commits Pause & Save / Forfeit / Refund directly in Supabase using `aezakmi_admin_close_session`.
5. Supabase broadcasts the terminal reason (`session_saved`, `session_forfeited`, or `session_refunded`).
6. Admin sends a best-effort `sessionCloseCommit` UI finalizer. Guest returns to login; Member returns to signed-in idle.
7. `sessionCloseRelease` is sent only when step 4 fails, because only then is the original active session still authoritative.

## Guest Save semantics
Guest Pause & Save stores `savedRemainingSeconds` on the ended `branch_sessions.data` row. The existing interrupted-Guest restore flow can recover this time. Forfeit and Refund explicitly set saved remaining time to zero.

## Deployment
Apply Supabase migration `20260914000020_admin_atomic_session_close.sql` and deploy the updated `station-admin` Edge Function before testing the new Cloud Admin lifecycle.
