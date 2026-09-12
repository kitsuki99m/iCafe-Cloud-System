# Logo Save Fix

## Fixed
- Admin Settings logo upload now treats the successful `/branding/logo` response as authoritative.
- Removed the immediate `refresh()` after logo upload, which could race with settings hydration and restore an older logo URL in the UI.
- The returned versioned `logoUrl` is applied immediately to Settings preview, local branding cache, and the Admin header via `aezakmi:branding-updated`.
- Authenticated `/settings` and public `/public/settings` responses now send `Cache-Control: no-store` so stale settings metadata cannot be reused by the browser/Electron renderer.
- Updated the packaged `apps/admin/dist` bundle as well as source, because the Electron packaged app loads `dist/index.html` rather than source files.

## Verification
- `node --check backend/src/routes/apiRoutes.js` passed.
- `node --check apps/admin/electron/main.cjs` passed.
- Confirmed packaged dist no longer performs the stale post-upload refresh.
- Full Vite build was not run because dependencies are not present in the supplied project and `npm install` did not complete within the available environment.
