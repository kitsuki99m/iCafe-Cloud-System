# Aezakmi Café — Reapplied Fixes + Admin Audit

_Date: August 16, 2026_

## Scope

This pass reapplied the previously audited customer/frontend/backend/Electron fixes to the supplied `Frontend_Electron_Fixed (1).zip`, preserved the intentional public login rate-plan announcement behavior, and then audited the Admin app for functional defects in buttons, modals, ID/data contracts, navigation, session/tier handling, and Overview station-state controls.

The corrected project changes 27 existing source files and adds two targeted regression-test files.

## Customer / Backend / Electron fixes reapplied

- **Rate math unified with backend billing.** Linear rate calculations now use proportional billing rather than frontend-only block rounding. Example: ₱12 = 60 min, ₱18 now resolves to 90 min on both frontend and backend.
- **Extend Time presets fixed.** Minute presets use `amountForMinutes(...)` rather than passing minutes into a peso-to-minutes function, so +30 minutes on a ₱12/60-min plan resolves to ₱6 rather than ₱12.
- **GCash extension SQL fixed.** The `payments` INSERT column/value/argument counts now match.
- **Public/login GCash validation hardened.** Philippine GCash numbers must match `^09\d{9}$` on both the customer flow and public backend endpoint.
- **Promo eligibility consolidated.** Start/Extend and redemption now share Asia/Manila-aware schedule logic for date ranges, days of week, daily windows, cross-midnight windows, birthday requirements, tier eligibility, and self-service eligibility.
- **Promo cutoff math fixed.** Linear promo cutoff calculations are proportional and redemption bounds do not extend past the overall promo end.
- **Zero-wallet/zero-saved-time login restored to the intended Top Up flow.** Backend login returns `INSUFFICIENT_BALANCE` instead of allowing a no-time customer into an unusable session state.
- **Customer Start/Extend/Top Up modal races fixed.** Async submissions pass `busy` into the shared Modal, cancel/close controls are protected, and failed login-screen top-ups show their error inside the top-up modal.
- **Dead Start Session success UI removed.** Success continues through the actual close/state-transition path rather than an unreachable Continue screen.
- **Request Help busy state fixed.** The visible button state matches the handler guard.
- **Birthday notification fixed.** It only advertises a birthday rate that is actually eligible for that member.
- **Connection badge fixed.** The customer UI no longer displays “Online” at the same time as a backend connection error.
- **Customer-facing Cashier wording/branch removed.** Customer top-up language now refers to staff/counter, not a customer-visible Cashier role.
- **Member/session ID comparisons normalized** where realtime/session/wallet matching previously depended on raw strict equality.
- **Runtime LAN IP prefix wired to Electron.** The customer app fetches the backend-configured prefix and updates Electron adapter selection rather than being locked to `192.168.100.`.
- **Electron ACTIVE mode fixed.** Paid sessions no longer retain globally registered Alt+Tab/desktop shortcut blockers, the 800×600 dashboard is not always-on-top, and blur does not steal focus back from other apps.
- **Electron state restoration fixed.** Failed Start Session returns to IDLE, remote unlock restores IDLE/ACTIVE correctly, and authenticated/no-session mode is no longer represented as contradictory LOCKED state.

### Intentional login announcement behavior preserved

`/public/rate-plans` still exposes **all active plans** for the login announcement, including Gold/VIP plans, as requested for tier upsell/visibility. Eligibility is enforced when the customer actually starts or extends a session rather than hiding the plans from the announcement.

## Admin audit — findings and fixes

### Critical / high-priority functional fixes

- **Admin session start runtime ReferenceError fixed.** `apiRoutes.js` called `tierAllowsPlan(...)` without importing it. The import is now present.
- **Tier enforcement aligned across admin UI and backend.** Regular → Regular only; Gold → Regular/Gold; VIP → Regular/Gold/VIP. Walk-ins are treated as Regular. The backend remains authoritative.
- **Session start rate picker fixed.** It no longer computes a filtered tier list and then renders the unfiltered plan list.
- **Floor Matrix Add Time fixed.** Single-PC Add Time only shows plans valid for the active member tier; guests only receive Regular plans. The configured default is used only if it belongs to the allowed set.
- **Bulk session top-up fixed.** The picker only exposes plans compatible with every selected member, using the lowest selected tier as the limiting tier.
- **Member session top-up backend enforcement added.** A direct request cannot bypass tier restrictions even if the UI is manipulated.
- **PC removal race/state bug fixed.** A PC with a live session cannot be removed even if its visible status is stale, and the modal waits for the backend result before closing.
- **Reservation Check In hardened.** The legacy Reserved branch now uses the same guarded async start path, locks the modal during submission, shows local errors, and no longer chooses an arbitrary `ratePlans[0]` value.

### Buttons / modal fixes

- **Add/Edit Member** now lock Escape/backdrop/X/Cancel during save and show save errors inside the active modal.
- **Wallet Edit, Wallet Top Up, Session Top Up, Wallet Transfer, Session Transfer** now use shared busy locking, disable duplicate actions, normalize relevant IDs, and render mutation errors locally.
- **Start Session / Manage Session / Maintenance** modal mutations now use busy state and modal-local errors instead of allowing repeated actions or hiding the failure behind the modal.
- **ConfirmModal** now forwards its `busy` state into the underlying Modal so keyboard/backdrop behavior matches its buttons.
- **Tariff delete** now forwards `deleting` into Modal busy locking.
- **Announcement Center** now forwards `saving` into Modal busy locking.
- **Feedback Inbox** now locks while resolving/restoring/archiving, disables conflicting controls, and visibly renders API errors.
- **Overview Feedback “Resolve”** now prevents duplicate submissions, shows a Resolving state, and surfaces API failures instead of creating an unhandled rejected button promise.
- **Settings save errors** now remain visible instead of being silently rejected from click handlers.

### Navigation / Overview fixes

The requested Overview station icons were already semantically correct and were retained:

- **Available** → `MonitorCheck` → `status=available`
- **In Use** → `MonitorPlay` → `status=occupied`
- **Maintenance** → `Wrench` → `status=maintenance`

The actual bug was navigation state: opening/closing a PC deep-link from a filtered Floor Matrix could lose the current `status` query or clear the filter. Query updates now preserve unrelated parameters and closing the PC popover leaves the chosen station-state filter intact.

The Floor Matrix also normalizes unsupported/stale status query values back to `all` rather than leaving inconsistent UI state.

### ID / data-contract audit

- Primary member/session IDs are still UUID-style IDs and no catastrophic `user.id` vs `member.id` mismatch was found in the admin session path.
- Floor Matrix and Members active-session matching now normalize IDs with `String(...)` before comparison where values can arrive through different API/realtime paths.
- Rate-plan selections/defaults use normalized ID comparisons where UI select values can be strings.
- The customer login contract still deliberately exposes both user `id` and `memberId`; customer Start Session uses the member ID.
- Legacy customer mock files remain in source but are not part of the production customer flow; they are cleanup, not a runtime defect.

## Lower-priority / architecture note

The codebase still contains a broader **admin/backend Cashier role architecture** in auth/schema/realtime/operations code. This pass removes the customer-facing Cashier branch/copy and obsolete Tariffs helper wording, but does **not** rewrite the existing admin/backend authorization model or database role constraints. Removing that role end-to-end is a separate schema/auth migration rather than a safe incidental UI patch.

A legacy `reserved` PC state also remains supported by the backend/UI even though the main Overview workflow is Available / In Use / Maintenance. Its Check In path was made safe in this pass; removing the reservation state itself would be a separate product/DB cleanup decision.

## Verification performed

Fresh verification after all edits:

- **Customer regression checks:** 21 / 21 passed.
- **Admin regression checks:** 21 / 21 passed.
- **Backend + Electron Node syntax checks:** 26 files passed (24 backend JS files + Electron `main.cjs` and `preload.cjs`).
- **Admin + Customer JS/JSX parser check:** 83 files parsed, 0 syntax diagnostics.
- **Source diff:** 27 existing project source files changed; 2 regression test files added.

### Build limitation

The supplied ZIP contains **no `node_modules`**, so a real Vite production build / Electron installer build cannot be truthfully verified from this archive in the current pass. Source syntax and regression invariants are verified, but before creating the Windows installers, install dependencies and run the project build commands (for example `npm run build` / `npm run dist:win` from the relevant app directories).

