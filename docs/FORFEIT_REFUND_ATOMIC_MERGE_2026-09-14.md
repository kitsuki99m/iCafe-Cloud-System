# Forfeit / refund atomic lifecycle merge — 2026-09-14

This build keeps the neutral `game_update` two-phase close barrier for both Guest and Member sessions and merges the useful Guest anti-restore fence from the atomic branch.

- Customer Electron enters a local protected state before ACK; no billing pause is created by the handshake.
- Guest auto-detection is fenced during the ACK→commit interval and for a short post-commit grace period so stale Edge/Cloud reads cannot revive the ended guest session.
- The lifecycle marker and auth identity are not destroyed before the authoritative forfeit/refund commit.
- If the final accounting request fails after Customer protection, Admin sends a neutral `sessionCloseRelease` command that restores only the local Electron window; it does not resume/change billing state.
- Guest terminal events now include forfeit, refund, normal end, expiry, and settlement, all of which return Guest to the login kiosk.
- Member forfeit/refund keeps the same two-phase barrier and returns the signed-in member to the no-session dashboard after the authoritative close.
- The stopFocus cleanup fix and compact pairing card from the latest Customer build are preserved.
- Obsolete Software Updates UI/docs are removed; installed-version telemetry remains diagnostic only and has no update/install capability.
