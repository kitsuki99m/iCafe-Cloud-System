# Batch 2 implementation

Implemented from the agreed brainstorming batch while preserving the existing session/billing architecture.

- Upcoming birthdays in Admin Overview are limited to the current Manila calendar month, with today's birthdays ordered first.
- A customer/member receives a birthday announcement in Customer Session only when today is their birthday and an active birthday promo rate plan exists.
- Customer session warnings: 5-minute and 1-minute spoken warnings using the local browser/Electron speech voice; final 5-second countdown pings at 5/4/3/2/1 seconds. Warning refs are keyed to the session so reconnects/rerenders do not duplicate them.
- Existing expiry path remains authoritative. At prepaid expiry the existing session-end call is used; guests are then logged out/locked, while signed-in users are locked as before.
- Customer Extend Time now always permits Regular rate plans for every tier (including Guest when a regular plan is available), and adds time-duration presets alongside peso presets for scale/linear plans.
- Admin session-time transfer inputs in Floor Matrix and Members use HH:MM while the API continues to receive seconds. Existing backend data format is unchanged.
- Customer Electron tray uses a Windows-compatible 32px PNG instead of SVG for the runtime tray icon. Existing tray behavior remains unchanged.
- Admin logo upload now shows a warning modal for unsupported files or files over 512 KB. Backend 512 KB validation remains enforced.
- Existing admin header branding update event/cache path was preserved so uploaded branding continues to propagate to the header.

Validation performed:
- Node syntax checks passed for backend/src/routes/apiRoutes.js, customer Electron main/preload, admin Electron main, and backend promo validation.
- Frontend Vite builds were not run because the uploaded source archive does not contain node_modules.

## Follow-up wiring pass
- Unified tier inheritance for customer rate plans.
- Guest extension selector is limited to Regular-tier customer-self-service plans.
- Removed the ineligible-plan fallback from ExtendSessionModal.
- Added bundled offline voice assets supplied by the user for 5-minute and 1-minute warnings.
- StartSessionModal now uses the same shared customer-plan eligibility filter.
- Existing prepaid expiry behavior remains unchanged.
