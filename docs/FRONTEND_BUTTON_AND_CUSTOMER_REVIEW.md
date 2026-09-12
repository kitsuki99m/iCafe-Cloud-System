# Aezakmi Cafe — Admin Button & Customer Frontend Review

_Last reviewed: Aug 11, 2026_

## Scope

Reviewed the current shipping ZIP after the report that Admin buttons were disabled and that Add Member was not working. The Admin and Customer React source was checked for disabled-state logic, button handlers, API actions, and duplicate-submit risks.

## Admin fixes

### Add Member

- Added explicit Admin-role capability handling.
- A cashier cannot invoke the Admin-only member-creation endpoint; this is intentional backend authorization, not a frontend failure.
- Add Member validates all required fields before submission.
- Phone and email validation now matches backend rules.
- API errors are surfaced in the Members page instead of silently returning.
- Added a save-in-progress guard so double-clicking cannot create duplicate members.
- Add Member button now displays `Adding…` while the request is in progress.
- Edit Member received the same validation and duplicate-submit protection.

### Other Admin button review

- Wallet edit Save is enabled only for a valid non-negative amount.
- Session-time top-up is enabled only for members with an active session.
- Delete remains disabled for active sessions by design.
- Rate-plan Save/Delete buttons are disabled only while their operation is running or the form is invalid.
- Add PC/Save PC buttons are disabled only for invalid PC data or while saving.
- Floor session controls retain confirmation where destructive actions are involved.
- Admin role is now displayed accurately as Admin or Cashier in the sidebar.

## Customer fixes

### Self-service start

- Prevented duplicate session-start requests from rapid button presses.
- Start button now changes to the busy state during submission.
- Only active customer-self-service rate plans are presented.

### Extend Time

- Prevented duplicate extension requests from rapid button presses.
- Button now shows `Submitting…` while the backend request is running.
- Existing payment-method validation remains intact.
- Cash remains the default method.

### Existing customer protections verified

- Top-up button already had duplicate-submit protection.
- Help already has busy protection.
- Logout already has busy protection.
- GCash requires both a valid customer number and configured cafe GCash number.
- Wallet extension checks available wallet balance.
- Customer session expiration remains backend-authoritative.

## Validation performed

- All backend `.js` and Electron `.js/.cjs` files pass `node --check`.
- Button/disabled-state source audit completed for Admin and Customer JSX.
- Confirmed no unexplained always-disabled shared Button component behavior.
- Attempted dependency installation for a production React build.

## Build limitation

A full Vite build could not be executed in this environment because the npm registry/cache was unavailable. Both normal and offline `npm install` attempts were unsuccessful. Therefore this review does **not** claim that a production Vite build was executed here.

Before physical deployment on the Windows build machine:

```text
npm install
npm run build:all
```

Then run the live Admin and Customer acceptance tests against the real SQLite backend and Electron clients.

## Important authorization note

The backend deliberately restricts `POST /api/members` to the `admin` role. The frontend now reflects that rule instead of pretending a cashier can create members. This is a security boundary and was not weakened merely to make the button clickable.
