# Aezakmi Cafe Console — Implementation Notes

The current implementation uses a backend-authoritative architecture:

- Customer username/password authentication is validated by the backend.
- Member birthdate is persisted for future eligibility/promo logic.
- iCafe8 is the diskless deployment terminology.
- Customer Electron starts in locked fullscreen/kiosk/always-on-top mode.
- Successful authentication moves the customer station to an active, fixed 800×600, not-always-on-top state and keeps the main window hidden in the Windows system tray.
- The mini dashboard is opened on demand from the tray and can be hidden without terminating the customer application.
- Logout and session expiry return the station to the locked state.
- Windows-key locking is controlled by one Electron state machine and a single PowerShell hook process.
- Application-level shortcut/context-menu blocking remains enabled; full OS kiosk hardening still requires Windows Assigned Access, Shell Launcher, or equivalent policy where required.
- Wallet, session time, rate plans, authentication, PC identity, and billing remain backend/SQLite authoritative.
- Socket.IO is used for targeted realtime notifications and invalidation; REST remains the authoritative state source after reconnects.
- Top-up requests use the customer's GCash number rather than a transaction reference number in the current workflow.
- No demo members, PCs, rate plans, sessions, wallets, or mock logs are seeded.
- POS product/order, support, loyalty, and remote-command backend functionality remains available.

## Release validation note

Backend and Electron CommonJS files were syntax-checked locally with Node.js. A full dependency-backed Vite/Electron build was not run in this environment because installing the workspace dependencies timed out. The release package therefore contains source code only and does not include `node_modules`.
