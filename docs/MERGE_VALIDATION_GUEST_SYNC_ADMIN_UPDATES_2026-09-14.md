# Guest Forfeit/Refund Sync + Admin-Managed Customer Updates — Merge Validation

Date: 2026-09-14

This build merges the latest Guest forfeit/refund synchronization lifecycle changes with the Admin-managed Customer Station update system.

## Preserved Guest close synchronization

- Admin waits for an online Guest Customer Station to acknowledge the close/exit boundary before committing destructive forfeit or refund operations.
- Command status lookup remains available for the synchronization wait.
- Session pause rows are closed when sessions end/refund so stale pause state is not left open.
- Migration `20260914000017_close_session_pause_on_end.sql` is retained.

## Added Admin-managed Customer updates

- Admin Clients exposes the Customer Software Updates center.
- Admin can check, download, cancel, and queue `Install when idle` deployments per station or in bulk.
- Offline stations can retain update commands for reconnect instead of failing immediately.
- Customer Station reports current version, update version/state/progress, and install-when-idle intent.
- Customer Electron does not autonomously deploy production updates; Admin/Edge is the deployment authority.
- Customer installation remains blocked until the session lifecycle is safe.
- Café Edge can cache and serve one verified Customer installer across the branch LAN.
- Migration `20260914000018_admin_managed_customer_updates.sql` is included after the Guest close migration.

## Validation

- `npm test`: **486 / 486 tests passed**.
- `npm run check:release`: passed.
- TypeScript parser syntax validation: **228 source files passed**.
- Node syntax checks passed for merged updater/backend runtime files.
- No unresolved three-way merge conflict markers remain.

The Windows Customer installer still needs to be built on Windows with:

```bash
npm --workspace apps/customer run dist:win
```
