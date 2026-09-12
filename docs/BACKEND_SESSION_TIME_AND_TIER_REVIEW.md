# Backend Session-Time & Customer-Tier Review

_Last reviewed: Aug 11, 2026_

## Implemented

### 1. Persistent customer session time
- Added `members.session_seconds_remaining`.
- Customer session time is checkpointed during authenticated heartbeat.
- Heartbeat runs every 10 seconds from the customer Electron frontend.
- Logout closes the active computer session and saves its exact remaining seconds to the member account.
- Remote PC restart/shutdown closes the active session first and saves remaining time.
- A stale/missing heartbeat is treated as a station interruption; the last persisted remaining time is preserved instead of continuing to consume time while the PC is offline.
- Customer login reconciles stale active sessions before allowing recovery.

### 2. Automatic resume
- If a member has saved session time, starting a session uses that time immediately.
- Rate selection is skipped.
- No wallet deduction occurs for already-saved time.
- The saved time is cleared when it is consumed into a new active session and then checkpointed again while active.

### 3. Zero-time behavior
- A customer may log in with zero wallet balance so they can access the station UI and top-up controls.
- Starting a new paid session still requires sufficient wallet balance for customer self-service.
- If there is no saved time and no wallet balance, the customer can use the existing GCash/counter top-up flow.

### 4. Customer tier rate plans
- Rate plans now have a `customer_tier` field:
  - `Regular`
  - `Gold`
  - `VIP`
- Admin Tariffs allows the tier to be selected when creating/editing a plan.
- Customer `/rate-plans` only returns active self-service plans matching the authenticated member's tier.
- Backend session-start validation rejects a plan whose tier does not match the member.
- Therefore Gold customers see Gold-marked promo rates, VIP customers see VIP-marked rates, and Regular customers see Regular-marked rates.

### 5. Extension and top-up synchronization
- Wallet session extensions update persistent remaining time immediately.
- Admin/cashier session-time top-ups update persistent remaining time.
- Approved top-ups that extend an active session update persistent remaining time.
- GCash/counter top-ups without an active session remain wallet credit; the customer can then start a new session using the appropriate tier rate.

## Frontend changes

### Customer
- Saved time is shown as resumable session time.
- Start Session can resume saved time even with zero wallet balance and without rate plans.
- Customer rate-plan choices are backend-filtered by tier.
- Duplicate session-end invocation was removed.

### Admin
- Tariff editor includes Customer Tier.
- Member session start filters rate plans to the selected member's tier.
- Members with saved session time can be started immediately without selecting a new rate.

## Validation performed

- Node syntax checks passed for modified backend files.
- TypeScript JSX transpilation/parsing passed for all modified React files.
- No npm dependency installation/build was performed in this environment.

## Shipping test matrix

1. Regular member + Regular plan → correct rates only.
2. Gold member + Gold plan → Gold promo rates only.
3. VIP member + VIP plan → VIP promo rates only.
4. Start 60 minutes → logout after 20 minutes → verify approximately 40 minutes saved.
5. Login again → resume saved 40 minutes without payment/rate selection.
6. Start session → remote shutdown → verify remaining time is saved and does not continue burning while offline.
7. Reboot station → login → resume saved time.
8. Let session reach zero → verify saved time becomes zero and PC returns available.
9. Zero saved time + wallet balance → start using the customer's tier rate.
10. Zero saved time + zero wallet → login still succeeds; GCash/counter top-up controls remain available.
11. Wallet top-up approved with no active session → wallet increases; next start uses tier rate.
12. Wallet extension during active session → remaining time increases and persistent saved time matches.
13. GCash/counter extension approval → remaining time increases and persists.
