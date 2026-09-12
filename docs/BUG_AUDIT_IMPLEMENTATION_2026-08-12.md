# Aezakmi Cafe — Bug Audit Implementation

Implemented from `BUG_AUDIT_2026-08-11.md` in the supplied Aezakmi Cafe ZIP.

## Fixed

1. Customer Electron session-start transition
- Session start no longer immediately hides the customer window.
- Confirmation remains visible before the mini-dashboard transition.
- Added explicit `completeSessionStart` IPC.
- Repeated active-session refreshes no longer resize/hide the window.

2. Electron fullscreen sizing
- Removed 800x600 min/max bounds from BrowserWindow creation.
- Locked mode clears size caps before fullscreen/kiosk.
- Active mode applies fixed 800x600 bounds only when entering the mini-dashboard state.

3. Heartbeat correctness
- Customer heartbeat changed to 10 seconds by default.
- Backend records `computer_sessions.last_heartbeat_at` on each customer heartbeat.
- Stale threshold is derived from the configured heartbeat interval and shared by checkpointing and the server sweep.

4. Staff realtime wallet freshness
- Wallet events now reach customer and admin/cashier rooms.
- Wallet changes emit authoritative `data:changed` invalidation.
- Session/top-up mutation paths emit data invalidation where needed.

5. Admin wallet setter
- `setMemberWallet` refreshes after completion so server-side side effects are not missed.

## Preserved
- Existing Admin/Cashier role architecture was not added, removed, or weakened.
- Existing Add Member fix remains intact.
- Existing Regular/Gold/VIP tier rate filtering remains intact.
- Existing saved-session-time persistence/resume work remains intact.

## Validation
- Backend and Electron syntax checks should be run before deployment.
- A full Vite/Electron production build is not claimed without the project's npm dependency tree.
