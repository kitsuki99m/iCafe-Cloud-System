# Aezakmi Cafe Console — Release Review

_Last reviewed: August 11, 2026_

## Implemented in priority order

### P0

- Electron customer locked/active state is now one authoritative state machine.
- Locked state restores fullscreen, kiosk, always-on-top, skip-taskbar, and Windows-key blocking.
- Active state is fixed at 800×600, not fullscreen, not always-on-top, not resizable, and hidden to the tray after activation.
- Mini Dashboard is tray-openable and can be hidden without terminating the app.
- Logout and session expiry return the customer station to locked mode.
- Windows-key hook startup/restart/EPIPE handling was hardened and duplicate hook creation is prevented by the Electron state owner.
- Customer authentication is backend-authoritative and requires a registered PC.
- One active authenticated account session is enforced; a second login is rejected instead of revoking the existing station.
- Customer tokens are station-bound for every authenticated customer request.
- Customer IP-to-PC mapping is normalized and production header spoofing is reduced by requiring the advertised IP to match the TCP peer outside localhost development.
- Wallet values are normalized to `wallet` / `walletBalance` and financial mutations remain SQLite-authoritative.
- Rate-plan identifiers use canonical `id` at the React boundary.
- Rate-plan creation/update/deactivation validation was hardened.
- Admin wallet edits and member-started sessions remain transactional.
- Customer session time is always calculated by the backend from the selected rate plan; client-supplied prepaid seconds are ignored.
- Zero-time and insufficient-balance session creation is rejected.
- Top-up approval, wallet updates, session updates, and customer success notifications use targeted Socket.IO events.
- Session extension paths now update both `prepaid_seconds` and `expires_at` atomically.

### P1 / reliability

- Add Member validation includes username, password, birthdate, wallet, optional phone/email, and assigned-PC validation.
- Add PC validation includes IPv4, duplicate ID/IP, configured IP prefix, and state integrity.
- Tariff customer self-service state has an explicit accessible toggle and active/inactive state support.
- Members, Floor Matrix, Tariffs, Logs, and Settings use constrained desktop content widths.
- Socket.IO reconnects refresh authoritative REST state.
- Admin realtime status distinguishes Socket.IO availability from REST fallback.
- Help/top-up notification events are targeted to staff rooms.
- Customer session expiry has a dedicated auth/session transition back to the locked login screen.

### P2 / hardening

- Socket.IO private rooms are used for customers, PCs, Admin, and Cashier.
- API errors expose stable `code` values for important failure cases.
- Remote command mutation is restricted to staff roles until a dedicated station-agent authentication protocol exists.
- POS wallet mutations emit authoritative wallet updates.
- Production startup rejects weak/default JWT secrets and wildcard CORS configuration.
- Customer Electron blocks additional reload/devtools/navigation shortcuts and denies new windows/external navigation.
- iCafe8 terminology is retained; CCBoot references were removed from active implementation comments/UI.

## Validation performed in this environment

- All backend `.js` files passed `node --check`.
- All Electron `.cjs` files passed `node --check`.
- All workspace `package.json` files passed JSON parsing.
- React/Admin/Customer source was audited for the old snake_case data fields and those fields no longer enter the React state layer.
- No `node_modules`, SQLite database files, or build artifacts are included in the release ZIP.

## Runtime validation limitation

The workspace dependencies could not be installed in this environment: `npm install --ignore-scripts` timed out twice. Because Vite, React, Electron, Socket.IO client, better-sqlite3, and argon2 are not installed here, a dependency-backed `npm run build:all` and live Electron/SQLite integration test could not honestly be reported as passed.

The source package is therefore **implementation-complete and statically reviewed**, but the final shipping gate should still run on a Windows development/build machine with network access:

```text
npm install
npm run build:all
npm --workspace backend run reset
npm --workspace backend run seed
npm --workspace backend run start
```

Then execute the acceptance matrix in the supplied roadmap, especially the customer Electron locked/active/tray/800×600/logout/expiry flow and the wallet/top-up/rate-plan/session transaction tests.
