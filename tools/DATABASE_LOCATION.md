# Installed database location

The packaged Admin Electron application uses:

`%ProgramData%\iCafe Management System\data\aezakmi.sqlite`

The app intentionally does **not** use Electron `app.getPath("userData")` for the operational database. This keeps the database location stable across reinstalls and prevents an old per-user database from unexpectedly reappearing.

For a manual reset, close Admin/Electron and remove:

- `aezakmi.sqlite`
- `aezakmi.sqlite-wal`
- `aezakmi.sqlite-shm`

from that directory, or run `tools/reset-installed-database.ps1`.

The backend still creates the database/schema automatically on the next start and creates only the bootstrap admin when appropriate; it does not restore demo operational data.
