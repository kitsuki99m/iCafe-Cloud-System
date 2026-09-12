# Dynamic Branding Update

- Admin `MainLayout` now uses `useBranding()` directly for logo, cafe name, branch, and branch location.
- Admin `LoginForm` now uses the dynamic branding logo/name; bundled SVG is fallback only.
- Customer `CustomerSessionView` now uses `useBranding()` for logo, cafe name, and branch.
- Admin and customer `useBranding()` hooks refetch `/public/settings` when branding is invalidated.
- Admin Settings no longer writes the obsolete `aezakmi.branding.logoUrl` cache key.
- Saving cafe profile or logo invalidates shared branding immediately.
- Customer Socket.IO `data:changed` events for `/branding/logo` and `/settings` trigger a local branding refresh, so already-open stations update without restart.
- Backend versioned `/api/public/branding/logo?v=...` remains the authoritative dynamic logo URL.
- PDF branding behavior was left unchanged.

Verification: 46/46 targeted regression tests passed; all admin/customer JS/JSX parsed successfully with TypeScript; backend JS plus customer Electron main/preload passed Node syntax checks.
