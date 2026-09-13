# Customer Power + Heartbeat Lifecycle Fix — 2026-09-13

## UI
- Moved both Customer Station idle-shutdown notices from the bottom-right to the bottom-left so they do not overlap the PC controls / shutdown button.

## Customer-initiated restart / shutdown
- Customer restart/shutdown now starts logout and session persistence immediately while Electron displays its existing five-second power warning.
- Electron writes the local `session-lifecycle.json` interruption marker before invoking `shutdown.exe`.
- Electron emits an app-exit interruption event before Windows power execution, which immediately clears the signed-in member/guest UI.
- If Cloud/Edge persistence is unavailable, the lifecycle marker remains for startup recovery rather than silently losing paid time.

## Unexpected station disconnect / heartbeat loss
- Customer realtime disconnect now uses the same 10-second confirmed-outage grace window as Café Edge.
- Reconnect inside the grace window cancels the interruption.
- A sustained disconnect checkpoints/releases any pending paid session and clears local member/guest identity.
- Café Edge already performs the authoritative backend-side release, time checkpoint, auth-session revoke, and PC offline transition after the same 10-second confirmed-outage boundary.

## Coverage
- Added `tools/customer-power-heartbeat-regressions.test.mjs`.
- Full source regression suite: 392/392 passing.
