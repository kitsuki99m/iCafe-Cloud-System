# Guest Pause & Save / Forfeit terminal logout fix — 2026-09-14

## Correct lifecycle

For an active Guest prepaid session, Admin **Pause & Save**, **Forfeit**, and **Refund** are terminal session actions, not long-lived station locks.

1. Customer Station enters a short reversible protected state while Admin waits for ACK.
2. Supabase/Café Edge commits the accounting operation.
3. The temporary lock snapshot and `Session Locked` overlay are destroyed.
4. Guest identity is cleared and Customer Station returns to the login kiosk.
5. The PC is available again.

Accounting remains different by disposition:

- **Pause & Save**: active session ends and remaining seconds are retained on the ended Guest session for later restore.
- **Forfeit**: active session ends and remaining/saved seconds become zero.
- **Refund**: active session ends, the calculated remaining-time refund is committed, and saved seconds become zero.

## Root cause fixed

The previous flow correctly cleared Guest auth after the database commit, but Electron left the reversible `Session Locked` renderer overlay active. The login kiosk was underneath that overlay, so the completed close looked exactly like a station lock. A Cloud wakeup could also clear Guest state before the final close command, causing the later command to misclassify the session from stale/empty renderer auth state.

The terminal flow now uses an explicit `showLoginKiosk` Electron transition and carries immutable Guest/Member identity through the close payload. Member idle transitions also dismiss the temporary close overlay.
