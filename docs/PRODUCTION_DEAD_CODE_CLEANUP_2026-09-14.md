# Production dead-code cleanup — 2026-09-14

This cleanup aligns the repository with the already-shipped removal of the in-app Customer software-update workflow.

## Removed live dead code

- `apps/admin/src/components/updates/CustomerUpdateCenter.jsx`
  - It was no longer mounted by `FloorMatrix`, but still contained three live API calls to backend routes that had already been removed.
- `apps/customer/src/components/auth/LoginForm.jsx`
  - The application uses `CustomerLoginForm.jsx`; this legacy form was unreachable and referenced an obsolete authentication shape.
- `scripts/serve-customer-updates.mjs`
  - The production Customer updater no longer consumes `latest.json`, so this server had no supported caller.
- `docs/customer-update-config.example.json`
  - The update-source configuration it documented no longer exists.

## Tests

The two historical updater regression files were retained but rewritten as removal regressions. This keeps the regression count stable while protecting the current production contract instead of asserting the deleted updater feature.

The historical Supabase migrations that introduced updater columns/command names were intentionally **not edited or deleted**. Applied migrations are production history and must remain immutable. Live Edge/Cloud/Customer command paths do not accept or emit the removed command family.
