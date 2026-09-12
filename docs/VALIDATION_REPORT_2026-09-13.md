# Release Validation Report — 2026-09-13

## Result

The source release passed all validation that can be executed in the current isolated environment.

### Passed

- Full repository regression suite: **302 / 302 passed**.
- Cloud/deployment regression suite: **18 / 18 passed**.
- Release readiness/static security gate: **passed**.
- Node syntax checks for backend JavaScript: **passed** through the release gate.
- Node syntax checks for Admin/Customer Electron CJS files: **passed** through the release gate.
- Parser syntax smoke for Admin JSX/JS, Customer JSX/JS, and Supabase Edge Function TypeScript: **120 source files passed**.
- Customer source contains no direct Supabase client/config connection.
- Browser/Edge example environments contain no Supabase secret/service-role credential.
- Legacy Render service and duplicate cloud Admin app are removed.
- `apps/admin` is the single Admin codebase for Vercel cloud mode and local Emergency Electron mode.
- Windows/Node 24 build launchers avoid direct `npm.cmd` / `electron-builder.cmd` spawning and invoke npm through its JavaScript CLI, preventing `spawn EINVAL` on current Windows Node releases.

## Build-environment limitation

A fresh `npm ci --ignore-scripts --offline` was attempted. The isolated runner does not have the Electron/Vite npm tarballs cached, so dependency installation stopped with `ENOTCACHED` for Electron and the production Vite bundles could not be regenerated in this runner.

This is an environment/dependency-availability limitation rather than a test failure. Vercel/GitHub or the developer machine must perform the real locked dependency install and production build:

```powershell
npm install
npm test
npm run check:release
npm run build:admin
npm run build:customer
```

## Live integration still required

No static/local test can prove connectivity to a Supabase project or Vercel deployment that was not supplied to the runner. Before production use, test with the real project:

1. apply migrations,
2. deploy Edge Functions,
3. owner sign-up/sign-in,
4. organization and branch creation,
5. Edge pairing,
6. initial baseline sync,
7. Customer station pairing,
8. remote Admin mutation and acknowledgement,
9. duplicate request/idempotency behavior,
10. offline session operation,
11. reconnect/outbox catch-up,
12. Edge revoke and re-pair.

The user/deployer should perform those environment-specific tests with real credentials and the target Windows/LAN setup.
