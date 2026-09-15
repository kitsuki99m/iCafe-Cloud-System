# Café Edge backup and recovery

Café Edge creates a verified SQLite backup 30 seconds after startup and every 6 hours by default. Backups are written to `./data/backups`, verified with SQLite `quick_check`, and rotated to the newest 28 copies.

Environment overrides:

- `AEZAKMI_DATABASE_BACKUP_ENABLED=true`
- `AEZAKMI_DATABASE_BACKUP_DIR=./data/backups`
- `AEZAKMI_DATABASE_BACKUP_INTERVAL_HOURS=6`
- `AEZAKMI_DATABASE_BACKUP_RETENTION=28`

Manual backup: `npm --workspace backend run backup`.

Restore procedure: stop Café Edge, preserve the current database, copy a verified backup over `DATABASE_PATH`, then start Café Edge. Cloud reconciliation will resume from the restored local state and pending outbox state. Never restore while the backend process is running.
