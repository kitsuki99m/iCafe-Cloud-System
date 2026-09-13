# Forfeit/Refund Close Barrier + Software Update Removal — 2026-09-14

## Session close race fixed

Admin forfeit and refund now use the same two-phase close preparation for both Guest and Member prepaid sessions. The preparation command is carried over `game_update`, which has no billing-side pause effect. Customer Station first enters a protected Electron lock state and only then acknowledges readiness. Admin commits the authoritative forfeit/refund after that acknowledgement.

The previous close handshake used the real `lock` command for a running Guest session. Queueing that command immediately inserted a session pause before the destructive close was committed. If the close request then raced with refresh/fallback state, the old paused session could reappear and the station could become usable again.

Customer Station no longer clears its lifecycle marker or logs out before the accounting commit. On authoritative `session_forfeited` / `session_refunded`, the marker is cleared. Guests return to the login kiosk; Members remain authenticated and return to their signed-in no-session dashboard. Cloud refunds now broadcast the same immediate station wakeup used by forfeits.

## Software updates removed

The Admin Software Updates center, Customer updater runtime/IPC, update command family, Edge update cache routes, Cloud update commands, and update-serving script were removed. Customer/Edge version telemetry may still report the installed application version for diagnostics, but there is no in-app software update workflow.
