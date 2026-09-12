# Wallet + Logo Fix

- Added SQLite compatibility migration for existing `wallet_transactions` tables so `reference_type` and `reference_id` are added on startup when missing.
- Added a dedicated individual **Top Up Wallet** modal in Members. The wallet icon now accepts a top-up amount and records it through `/wallet/adjustments`; the pencil remains the separate Edit Wallet Balance action.
- Increased JSON request capacity to 1 MB so a 512 KB base64 logo can reach the logo endpoint.
- Logo uploads are now persisted locally under the installed database data directory: `branding/logo.png` or `branding/logo.svg`. The database BLOB remains as a compatibility fallback.
- Public/authenticated branding endpoints prefer the local logo file, with versioned URLs and `no-store` caching, so the Admin dashboard header and Customer Station can immediately use the locally saved logo.
