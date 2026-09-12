# Applied fixes — Aezakmi frontend/electron/backend

Applied from:
- admin-dashboard-modal-spam-issue.md
- checkpoint.md
- promo-abuse-prevention-implementation-plan.md

## Admin modal spam
- Modal keyboard/overlay effect now depends only on `open`.
- `onClose`, `onSubmit`, `canSubmit`, and `busy` are kept in refs so parent reconnect refreshes do not recreate the overlay listeners/effect.
- FloorMatrix deep-link popover now tracks `dismissedPcId` so a stale `?pc=` cannot resurrect a dismissed popover during reconnect refreshes.

## Admin Electron tray
- Added tray icon PNGs (16/32/48px) based on the existing SVG design.
- Added always-on admin tray with Open Admin Console and right-click Quit.
- Logged-in admin: X/minimize hides the window to tray instead of closing.
- Tray Quit asks the renderer to call backend logout first, waits for an acknowledgement, then exits (3s fallback).
- Logged-out admin: normal close still exits.

## Promo/top-up backend
- Added promo window fields: time_start, time_end, days_of_week, grace_minutes.
- Added promo redemption, guest seat cooldown/name ledger, and transfer request tables.
- Added live effective promo status and real-time redemption/window validation.
- Added once-per-member redemption and guest seat cooldown enforcement.
- Added staff cooldown clearing on staff-ended sessions; guest self-end does not clear it.
- Added validation to session starts, wallet extensions, staff session top-ups, and pending extension confirmation.
- Added recent redeemers endpoint.
- Added guest/public and staff PC transfer-request routes with approval-time destination validation and same-session transfer semantics.
- Added `midnight` as a supported promo type.

## Intentionally still open from the plan
- Birthday promo path for anonymous guests.
- Optional cap on transfer requests per session.
- Exact sub-hour `minutesPerUnit` decision for metered midnight promos.
- Dedicated recent-redeemer dashboard UI was not invented; the backend endpoint is present for the existing admin UI to consume.

## Validation performed
- Node syntax checks passed for modified `.cjs` and backend `.js` files.
- SQL placeholder/column counts were checked for the rate-plan insert/update statements.
- Full Vite/Electron production build was not run because the uploaded archive does not contain installed `node_modules`.


### Announcement mapping on customer login
- The customer login announcement container now maps **all currently active, customer-visible announcements** returned by `/public/announcements` instead of truncating the list to three items.
- Admin announcements targeted to `all` or `customers` and currently within their schedule are shown. Staff-only announcements remain hidden from the customer login screen.

## Latest customer login idle-shutdown adjustment

- Removed the **Stay on login screen** control and the pause/resume behavior from the customer login form.
- The login-screen idle-shutdown countdown now remains active and cannot be manually paused.
- The idle-shutdown indicator is removed only after a customer credential login or guest entry actually returns `{ ok: true }`.
- Failed customer login attempts and failed guest entry attempts keep the idle-shutdown indicator visible and the timer active.
- Successful login/guest entry also stops the login-screen timer from being reset by later input events while the authenticated view takes over.


See APPLIED_BATCH_2.md for the second implementation batch.
