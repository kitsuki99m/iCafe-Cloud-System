# Backup, recovery, and observability

Café Edge creates a verified SQLite backup on startup and every 6 hours by default. The newest 28 backups are retained. The backup process uses SQLite's online backup API and verifies every file before retaining it.

Environment controls:

- `AEZAKMI_DATABASE_BACKUP_ENABLED=true`
- `AEZAKMI_DATABASE_BACKUP_DIR=./data/backups`
- `AEZAKMI_DATABASE_BACKUP_INTERVAL_HOURS=6`
- `AEZAKMI_DATABASE_BACKUP_RETENTION=28`
- `AEZAKMI_OBSERVABILITY_DIR=./data/logs`
- optional `AEZAKMI_OBSERVABILITY_WEBHOOK_URL=https://...`

Manual backup: `npm --workspace backend run backup`

Restore only while Café Edge is stopped:

`npm --workspace backend run restore -- ./data/backups/<backup>.sqlite --confirm`

The restore tool runs `PRAGMA integrity_check`, keeps a pre-restore copy of the current database, removes stale WAL/SHM files, installs the selected backup, and verifies the restored database again.

Backend errors are written to daily JSONL files and queued in the local database. When Cloud sync is enabled, queued error summaries piggyback on the normal Edge sync request and are aggregated in Supabase `system_observability_events` in ten-minute buckets. This adds no separate steady-state Cloud polling request. An HTTPS webhook can also be configured for immediate external alerts.

Local error logs and already-synced local observability rows are retained for 30 days by default (`AEZAKMI_OBSERVABILITY_RETENTION_DAYS=30`). Cloud observability buckets self-prune after 90 days. The Developer Console includes the last-24-hour aggregated error count and latest Cloud/Edge event in its normal cached Developer snapshot, so this visibility does not add a separate polling endpoint.
