# Wiring Fixes Applied

## Customer session extension rate selection
- The selected rate plan from `ExtendSessionModal` is now passed through `AppDataContext.requestSessionExtension()` as `ratePlanId`.
- `/session-extensions` now resolves and validates the selected active customer-self-service rate plan instead of always using the session's original rate plan.
- The selected plan is applied to amount/minute calculation and promo validation.
- The selected plan ID is returned in extension responses and included in extension audit logs.
- Existing callers that do not provide `ratePlanId` continue to fall back to the session's existing rate plan.

## Regular rate visibility
- Normal (non-promo) Regular-tier rates are eligible for Regular, Gold, VIP, and Guest customers.
- Guest refresh now loads public rate plans so the extension UI can show the normal Regular rate.
- Customer extension UI filters out non-self-service plans while keeping the normal Regular rate visible to every tier.
- Existing Gold/VIP tier-specific rules remain in place for non-Regular plans and promo plans.

## Validation
- Backend `apiRoutes.js` syntax check: passed.
- Customer/Admin Electron main process syntax checks: passed.
- Frontend JSX build was not run because the supplied source archive does not contain `node_modules`.

## Follow-up wiring pass (2026-08-16)
- Unified customer rate-plan visibility: Regular sees Regular-tier plans; Gold sees Regular + Gold; VIP sees Regular + Gold + VIP. Guest uses the Regular tier and therefore sees only Regular-tier customer-self-service plans.
- Applied the same tier rule to backend `ratePlanEligibility`, including promo plans; birthday eligibility remains a separate private-data check.
- `ExtendSessionModal` now uses the shared customer-plan filter and no longer falls back to displaying an ineligible current/session plan.
- `StartSessionModal` now uses the same shared customer-plan filter.
- Replaced runtime browser speech synthesis for the 5-minute/1-minute session warnings with the supplied offline MP3 voice assets.
- No change was made to prepaid expiry behavior or the private birthday/session-page behavior.
