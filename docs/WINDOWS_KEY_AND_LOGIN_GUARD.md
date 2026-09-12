# Windows Key + Customer Login Guard

## Windows key

The customer Electron app starts a small Windows low-level keyboard-hook helper while the station is locked.

- **Locked / login screen:** Left and Right Windows keys are blocked globally.
- **Successful member login:** Windows-key blocking is disabled immediately.
- **Guest mode with a staff-started session:** Windows-key blocking is disabled.
- **Logout, invalid authentication, or session expiry:** Windows-key blocking is enabled again.
- `Ctrl+Alt+Delete` is still protected by Windows and cannot be intercepted by an ordinary Electron app.

The helper is `apps/customer/electron/windows-key-hook.ps1` and uses the Windows low-level keyboard hook (`WH_KEYBOARD_LL`). It does not require `node_modules` to be generated ahead of time.

For a production iCafe8 diskless image, still combine this with Windows kiosk policy / Assigned Access / Shell Launcher if the goal is full OS lockdown. The Electron hook is the application-side Windows-key guard, not a replacement for Windows security policy.

## Login with zero balance

Customer member login is rejected by the backend when the member has no positive wallet balance.

Response:

- HTTP `402`
- `code: INSUFFICIENT_BALANCE`
- `action: TOP_UP`
- Message: `Insufficient balance. Please top up now before logging in.`

The customer login screen immediately shows **Top Up Now**.

The Top Up Now flow is intentionally unauthenticated only for creating a **pending top-up request**. It cannot directly change the wallet. Staff must approve the request from Admin before the balance changes.

Cash is the default payment method. GCash shows the cafe account details and asks for the customer's own GCash number; staff approval is still required.

## Zero-minute sessions

Customer self-service session creation also rejects a prepaid session when the calculated time is `0` or less. Invalid amounts return `INVALID_AMOUNT`; insufficient wallet balance returns `INSUFFICIENT_BALANCE`. This prevents a user from starting a session that immediately has no usable time.
