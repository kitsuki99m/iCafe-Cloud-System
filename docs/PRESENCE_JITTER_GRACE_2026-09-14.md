# Station Presence Jitter Grace — 2026-09-14

Production presence now distinguishes a short reconnecting window from confirmed offline state.

- Customer Cloud heartbeat remains every 1 second.
- 0–3 seconds since the last Cloud heartbeat: online.
- 3–10 seconds: reconnecting/degraded internally; Admin keeps the last usable station state instead of flickering Offline.
- 10+ seconds: confirmed offline.
- Café Edge Socket.IO disconnect release/checkpoint grace is 10 seconds.
- Customer total Cloud + Café Edge transport-loss logout/checkpoint watchdog is 10 seconds.
- Explicit lifecycle actions (logout, restart, shutdown, lock, pairing reset) remain immediate and do not wait for the network grace period.
- Paid-session start, station commands, and interrupted-Guest restore use the same 10-second Cloud freshness boundary server-side.

Deploy `20260914000015_presence_jitter_grace.sql` and redeploy `admin-api` and `station-admin`. Rebuild Admin, Customer, and Café Edge because all three contain presence-threshold changes.
