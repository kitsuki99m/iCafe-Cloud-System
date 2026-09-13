# Customer Offline Authority & Cache Fix — 2026-09-13

## Production authority order

1. Aezakmi Cloud / Supabase is primary while internet is available.
2. The configured cashier/Admin PC running Café Edge is the LAN fallback.
3. Customer-PC local storage is cache/emergency state only; it is never a member, wallet, or billing authority.

## Removed embedded Customer Café Edge

The packaged Customer Station no longer bundles, starts, or automatically targets a private `127.0.0.1:3000` Café Edge database. This prevented an empty per-PC SQLite database from returning default branding/settings and false `INVALID_CREDENTIALS` errors during internet outages.

Production Server Connection now accepts the cashier/Admin PC LAN address. Loopback addresses are rejected in packaged Electron. Development may still use the Vite localhost proxy.

## Offline behavior

- Cloud failure switches to the explicitly configured LAN Café Edge.
- If both Cloud and Café Edge are unavailable, the renderer keeps the last-known-good IndexedDB snapshot and shows an explicit connectivity warning.
- Member login and wallet/session mutations are not attempted against an empty local database. They require either Cloud or Café Edge.
- Cached branding keeps the last-known café name/branch even if the logo endpoint cannot be resolved offline.
- Persistent snapshots are updated only from successful authority reads; optimistic/failed mutations stay memory-only.
- Active-session lifecycle JSON stores session identity plus wallet/display checkpoint and prepaid remaining seconds for emergency recovery.

## Security boundary

The Customer cache cannot authenticate a fresh member or spend wallet funds independently. This avoids double-spend and multi-PC offline-login conflicts. Café Edge remains the offline financial/member authority for the branch.

## Deployment

Rebuild/redeploy Customer Electron only. No Supabase migration or Edge Function deployment is required. Ensure every production Customer Station has the cashier/Admin Café Edge LAN address configured if LAN fallback is desired.
