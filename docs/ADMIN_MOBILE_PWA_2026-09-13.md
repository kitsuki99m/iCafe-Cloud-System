# Admin Mobile PWA

The Admin web application is now installable as a Progressive Web App on supported mobile browsers. Customer Station remains Electron-only and is not affected.

## Included

- Web app manifest with standalone display mode and Admin shortcuts.
- 192px, 512px, maskable Android, and Apple touch icons generated from the existing Aezakmi branding asset.
- Web-only service-worker registration; Electron is explicitly excluded.
- Offline app-shell/static-asset caching. API and Socket.IO traffic are never intercepted or cached.
- Network-first navigation so current deployments win while the previously loaded Admin shell remains available during a connection outage.
- Mobile drawer **Install Admin App** action when the browser exposes an install prompt.
- iPhone/iPad Safari guidance for **Share → Add to Home Screen**.
- Service-worker and manifest cache headers for Vercel deployments.

## Important behavior

PWA offline support is intentionally limited to the application shell and static assets. Live cafe operations still require the backend/Supabase connection. Existing Admin local cache behavior remains responsible for any previously cached business data.

## Build / deploy

Cloud Admin:

```bash
npm run build:admin
```

Then deploy the generated Admin web build as usual. PWA installation requires HTTPS (localhost is also accepted during development).
