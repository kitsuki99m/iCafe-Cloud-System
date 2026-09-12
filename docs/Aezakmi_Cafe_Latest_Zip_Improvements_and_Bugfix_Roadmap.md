# Aezakmi Cafe Console — Latest ZIP Improvements & Bug-Fix Roadmap

_Last reviewed: Aug 11, 2026_

## Source Baseline

This document is based on the latest available ZIP:

`Aezakmi_Cafe_Electron_Tray_MiniDashboard_WindowMode_Fix_no_node_modules.zip`

The ZIP already contains the split architecture:

- `backend/` — Node.js + Express + SQLite + Socket.IO
- `apps/customer/` — customer Electron station
- `apps/admin/` — admin/cashier frontend
- iCafe8 diskless deployment model
- Socket.IO real-time events
- customer IP identity handling
- member wallet/session operations
- top-up and support notifications
- Windows-key lock/unlock hook
- customer Electron tray/minimized-session behavior

The goal of this roadmap is **not to redesign unrelated code**. Fix the identified bugs first, preserve working behavior, and only refactor where it directly prevents reliable operation.

---

# 1. Critical Electron Customer Window-State Bug

## Required behavior

The customer station must have two clearly separated states:

### LOCKED / LOGGED OUT

The customer station is in kiosk mode.

- Fullscreen: **ON**
- Kiosk: **ON**
- Always on top: **ON**
- Skip taskbar: **ON**
- Window controls: **OFF**
- Windows key: **BLOCKED**
- Customer cannot access the normal desktop
- Login/guest screen is visible
- Tray menu must not expose the mini dashboard

### LOGGED IN / ACTIVE SESSION

The customer station must leave kiosk mode immediately.

- Fullscreen: **OFF**
- Kiosk: **OFF**
- Always on top: **OFF**
- Window size: **800 × 600**
- Resizable: **OFF**
- Skip taskbar: **ON**
- Main Electron window: **HIDDEN** after session activation
- Customer station remains available through the **system tray icon**
- Right-click tray → **Open Mini Dashboard**
- Tray → **Lock / Log Out** must return the station to the locked state
- Windows key: **ENABLED** after successful customer login

### IMPORTANT

Do **not** interpret “minimize Electron” as leaving an 800×600 window sitting visibly on the desktop.

The intended behavior is:

```text
LOGIN SUCCESS
    ↓
Unlock Windows key
    ↓
Exit kiosk/fullscreen/always-on-top
    ↓
Set window to fixed 800×600
    ↓
Hide main Electron window
    ↓
Keep customer app in system tray
    ↓
Right-click tray → Open Mini Dashboard
```

When the customer logs out:

```text
LOGOUT
    ↓
Invalidate backend session
    ↓
Clear customer authentication state
    ↓
Stop/clear active session UI state
    ↓
Enable Windows-key lock
    ↓
Show main Electron window
    ↓
Fullscreen ON
    ↓
Kiosk ON
    ↓
Always-on-top ON
    ↓
Return to customer login / guest screen
```

## Current ZIP implementation to verify

`apps/customer/electron/main.cjs` already contains `setActiveWindowMode()`, `setLockedWindowMode()`, `showMiniDashboard()`, tray handling, and `client:activate-session` / `client:lock` IPC handlers.

The next implementation must make these functions behave as **one deterministic state machine**, rather than relying on multiple renderer effects repeatedly changing the Electron window state.

## Fix requirements

- Create one authoritative Electron state variable:
  - `locked`
  - `active`
  - optionally `transitioning`
- Make every IPC state change idempotent.
- Do not call `setActiveWindowMode()` repeatedly every second from React.
- Do not repeatedly call `hide()` / `show()` because the remaining-time timer changes.
- `activate-session` should only be triggered when entering an active session or when the state actually changes.
- `lockClient` must always restore the complete locked configuration.
- `showMiniDashboard` must never accidentally restore fullscreen or always-on-top.
- Tray menu must always reflect the current state.
- Prevent race conditions between:
  - React session expiry
  - logout
  - tray logout
  - automatic session termination
  - Electron window state changes

## Acceptance test

1. Launch customer Electron.
2. Confirm fullscreen + always-on-top + kiosk.
3. Confirm Windows key is blocked.
4. Log in with a valid customer account with usable time.
5. Confirm kiosk/fullscreen/always-on-top are disabled.
6. Confirm the main window disappears.
7. Confirm the app remains in the Windows system tray.
8. Confirm it does **not** appear as a normal taskbar application.
9. Right-click tray → Open Mini Dashboard.
10. Confirm an **800×600 fixed window** opens.
11. Confirm it is **not always-on-top**.
12. Close/hide the mini dashboard and confirm the tray app remains alive.
13. Right-click tray → Lock / Log Out.
14. Confirm fullscreen + kiosk + always-on-top return.
15. Confirm Windows key becomes blocked again.

---

# 2. Electron Windows-Key Hook Reliability

The latest ZIP uses a PowerShell low-level keyboard hook for the Windows key.

## Fix / harden

- Keep Windows-key locking enabled only in the locked state.
- Unlock it only after backend authentication/session authorization succeeds.
- Re-lock it before returning to the login screen.
- Prevent duplicate hook processes.
- Handle hook process termination cleanly.
- Never allow an `EPIPE` from the PowerShell process to crash Electron.
- Verify the hook is restarted if it unexpectedly terminates while the station is locked.
- Do not claim Ctrl+Alt+Del can be blocked by ordinary Electron code.
- For production kiosk hardening, use Windows Assigned Access / Shell Launcher / equivalent Windows policy where required.

## Regression test

- Windows key
- Left Windows key
- Right Windows key
- Alt+Tab
- Alt+F4
- Ctrl+Shift+Esc
- F11
- Ctrl+W
- Ctrl+Q
- Right-click/context menu

---

# 3. Customer Authentication & Session Guard

## Fix

Authentication must remain backend-authoritative.

The customer frontend must never decide that an account is active merely because a token or local state exists.

Required flow:

```text
Customer login
    ↓
Backend validates username/password
    ↓
Backend validates account state
    ↓
Backend validates active-session rule
    ↓
Backend validates current PC identity
    ↓
Backend validates available paid time / wallet requirement
    ↓
Return authenticated session
    ↓
Electron unlocks station
```

## Zero-time login rule

If a customer has no usable paid time and cannot start a valid session:

- Do not unlock the station into an active customer session.
- Show a clear error:

> **Insufficient balance / time. Top up now.**

Do not allow the frontend to bypass this by manually selecting a rate plan.

## Single active account session

One customer account may be active on only one PC at a time.

- Login elsewhere → clear backend rejection.
- Logout → release the account session.
- Heartbeat → maintain the session.
- Expired heartbeat → allow recovery.
- Electron crash → backend eventually releases stale authentication state.

---

# 4. Customer PC Identity / IP Detection

The latest ZIP already sends `X-Aezakmi-Client-IP` from the customer Electron app and the backend has `attachClientIdentity` support.

## Verify/fix

The registered PC must be resolved consistently using:

```text
Customer Electron local IPv4
        ↓
X-Aezakmi-Client-IP
        ↓
Backend clientIdentity middleware
        ↓
pc.ip_address
        ↓
Current PC record
```

## Bugs to check

- `localhost` / `127.0.0.1` being incorrectly treated as the station IP during Vite development.
- Multiple network adapters returning the wrong IPv4.
- Wi-Fi/Ethernet adapter ordering changing the selected IP.
- Stale PC records.
- Duplicate PC IP addresses in SQLite.
- Admin adding an IP but customer `/client/context` still returning no PC.
- Customer frontend comparing numeric IDs with string IDs.

## Required safeguards

- Normalize IPv4 values before comparison.
- Reject duplicate `ip_address` records.
- Display the actual detected IP in Admin diagnostics.
- Display the resolved PC label in the customer station.
- If no PC is registered, show:

> **This PC is not registered with the cafe server yet.**

Do not silently fall back to another PC.

---

# 5. Customer Wallet Mapping

The wallet must always come from SQLite/backend state.

## Required source of truth

```text
members.wallet_balance
        ↓
GET /api/wallet
        ↓
Customer AppDataContext
        ↓
Customer dashboard
```

The frontend should normalize:

- `wallet`
- `walletBalance`
- `wallet_balance`

into one consistent field internally.

## Fix

Do not allow:

```text
Database = ₱300
UI = ₱0
```

after login, refresh, Socket.IO update, or session start.

## Live wallet updates

When backend emits:

```text
wallet:updated
```

the customer UI must update immediately without manual refresh.

---

# 6. Customer Top-Up Real-Time Flow

The latest ZIP already contains Socket.IO top-up events and a customer realtime toast implementation.

## Required behavior

Customer submits top-up:

```text
Customer
  ↓
POST /api/top-ups
  ↓
Pending request in SQLite
  ↓
Socket.IO → Admin
  ↓
Admin approves
  ↓
SQLite wallet transaction
  ↓
Socket.IO → Customer
  ↓
Customer wallet updates
  ↓
Customer sees:
"Top up successful"
```

## Customer toast

Show a live toast such as:

> **Top up successful**  
> ₱100.00 has been added to your wallet.

Requirements:

- No manual refresh.
- Do not duplicate the toast.
- Do not show success for a rejected top-up.
- Match the event to the correct `memberId`.
- Refresh authoritative wallet data after the event.
- Keep the toast visible for approximately 5 seconds.

---

# 7. GCash Settings

Admin-configured GCash details must be visible on the customer station.

Required fields:

- GCash account name
- GCash number

Customer top-up modal should display:

```text
Send your GCash payment to
GCash Name
09XXXXXXXXX
```

Do not ask for a GCash **reference number** when the current workflow is specifically based on the customer's GCash number.

The customer's own GCash number remains the customer-provided field where required by the top-up workflow.

---

# 8. Top-Up and Login Rate Limiting

Backend rate limiting must remain authoritative.

## Login

Protect:

```http
POST /api/auth/login
```

against repeated credential attempts.

## Top-up

Protect:

```http
POST /api/top-ups
```

against request spam.

## Frontend behavior

When rate limited:

- Do not repeatedly retry automatically.
- Show the backend's friendly message.
- Disable the submit button temporarily.
- Preserve the entered form data where safe.
- Do not create duplicate requests by double-clicking.

---

# 9. Customer Help / Staff Notification

Customer **Request Help** must notify Admin in real time.

Required flow:

```text
Customer clicks Request Help
        ↓
POST /api/public/support or authenticated support route
        ↓
SQLite support_messages
        ↓
Socket.IO support:new_request
        ↓
Admin notification center
        ↓
Ping sound
        ↓
Toast / notification
```

## Sound requirement

Use a clear notification ping lasting approximately **2–3 seconds**.

- Do not spam the sound for duplicate events.
- New support request = one notification sound.
- New top-up request = one notification sound.
- Browser/Electron volume handling should not accidentally mute the notification.
- Avoid creating multiple Audio objects for the same event.

---

# 10. Admin Members Panel

## Member modal

The Add Member modal must include all backend-required fields:

- Name
- Username
- Password
- Birthdate
- Phone, if supported
- Email, if supported
- Tier
- Starting wallet
- Assigned PC

Birthdate must be persisted because it is needed for future birthday eligibility/promo logic.

## Validation

Disable submission when:

- Name is empty
- Username is shorter than the backend minimum
- Password is shorter than the backend minimum
- Birthdate is missing
- Wallet is negative
- Username already exists
- Assigned PC is invalid

Backend validation must still be enforced.

---

# 11. Admin Wallet Bug

The Members table must display the real current wallet balance.

Known failure pattern to eliminate:

```text
SQLite wallet = ₱300
Admin Members table = ₱0
Wallet edit modal = ₱0
```

## Fix

Normalize every member returned by the backend into:

```js
{
  wallet: Number(...),
  walletBalance: Number(...)
}
```

Use the same normalized value in:

- Members table
- Wallet edit modal
- Top-up modal
- Session top-up modal
- Customer lookup
- Socket.IO wallet update

After wallet edit, the backend response must be applied immediately and the wallet ledger must record the adjustment.

---

# 12. Admin Floor Matrix — Member Session Billing

When Admin starts a session for a member manually:

```text
Member selected
+ Rate plan selected
+ Amount/time selected
        ↓
Check member wallet
        ↓
Use available wallet balance
        ↓
Deduct wallet transactionally
        ↓
Create session
        ↓
Update PC occupied state
        ↓
Socket.IO wallet/session update
```

The selected rate plan must determine the correct minutes/price.

Do not use a frontend-only rate calculation as the final billing authority.

Backend must validate:

- Rate plan exists
- Rate plan is active
- Amount is valid
- Minimum amount is respected
- Package amount is respected
- Resulting minutes are greater than zero
- Member exists
- PC exists
- PC is available
- Member has sufficient wallet where wallet payment is required

All money and time mutations must occur inside one SQLite transaction.

---

# 13. Rate Plan / Tariff Panel

Admin-defined rates remain the source of truth.

Do **not** add built-in/mock rates.

## Fix

The Tariff panel must correctly support:

- Create rate plan
- Edit rate plan
- Delete rate plan
- Linear/scaled pricing
- Fixed package pricing
- Minimum amount
- Minutes per unit
- Package minutes
- Customer self-service toggle
- Active/inactive state

## Toggle UI

The Customer Self-Service toggle must have:

- correct track size
- correct knob position
- no clipping
- correct enabled/disabled state
- keyboard focus state
- accessible label
- no layout shift

The toggle state sent to the backend must match the visual state.

---

# 14. Rate Plan ID Consistency

Fix all cases where the frontend sends a rate-plan ID that the backend cannot find.

Known failure pattern:

```text
Error: Rate plan not found.
```

## Requirements

- Use one canonical field: `id`.
- Do not mix:
  - `ratePlanId`
  - `rate_plan_id`
  - `planId`
  - array index
  - display name
- Normalize API data at the context boundary.
- Never use an array index as a rate-plan identifier.
- Validate the selected plan immediately before submission.
- If a plan was deleted/disabled while a modal is open, show a clear error and reload plans.

---

# 15. Admin Floor Matrix — Add PC Modal

The Add PC modal must map exactly to backend requirements:

- PC ID
- Label
- IP address
- Spec

## Validation

Reject:

- Empty ID
- Empty label
- Invalid IPv4
- Duplicate PC ID
- Duplicate IP address
- Invalid IP prefix if the cafe is configured to require one

The modal must not submit empty values and rely on the backend to return a generic 400 error.

Error messages should be shown directly inside the modal.

---

# 16. ID / Data Mapping Audit

Perform a complete frontend/backend field audit.

## Canonical names

### PC

```text
id
label
ipAddress
spec
status
session
```

### Member

```text
id
name
username
birthdate
tier
wallet
walletBalance
pcId
pcIp
```

### Session

```text
id
pcId
customerId
ratePlanId
billing
amount
prepaidSeconds
startedAt
expiresAt
status
```

### Top-up

```text
id
memberId
pcId
amount
method
gcashNumber
status
```

Do not mix camelCase and snake_case after data enters the React state layer.

---

# 17. Admin Table Layout / 1920×1080 Fix

Tables should be visually constrained on large displays instead of stretching across the entire viewport.

## Required pattern

Use a centered content wrapper such as:

```text
w-full max-w-[1600px] mx-auto
```

or another consistent project-wide maximum width.

Apply this to:

- Members
- Logs
- Floor Matrix where appropriate
- Settings tables/sections
- Tariff tables/cards where applicable
- Notification/history tables

## Requirements

- 1920×1080 should not look excessively empty or stretched.
- 1366×768 must remain usable.
- Smaller widths must use horizontal scrolling where necessary.
- Tables must not force the entire page to become horizontally oversized.
- Do not solve table overflow by reducing text to unreadable sizes.

---

# 18. Admin Logs Panel

Logs must remain readable at 1920×1080.

Required:

```text
centered max-width container
        ↓
responsive table
        ↓
horizontal overflow only inside table container
```

Columns should not force the page itself wider than the viewport.

If log details are long, use:

- truncated preview
- expandable detail
- modal/detail drawer

rather than making every row extremely wide.

---

# 19. Admin Settings Panel

Settings should use the same content-width system as other Admin pages.

Avoid a full-width form/table that stretches unnecessarily on 1920×1080.

Group settings into clear sections:

- Cafe identity
- Network / client IP configuration
- GCash
- Low-time warning
- Socket.IO / realtime status
- iCafe8 configuration

Only Admin should be allowed to modify protected settings.

---

# 20. Socket.IO Architecture Cleanup

The current ZIP already uses Socket.IO, but event delivery should be made more precise.

## Current principle

REST remains authoritative while Socket.IO invalidates/updates the UI.

Keep this principle.

## Improve

Use rooms where appropriate:

```text
admin
cashier
customer:<memberId>
pc:<pcId>
```

Examples:

```text
wallet:updated
→ customer:<memberId>

session:updated
→ customer:<memberId> + pc:<pcId> + admin/cashier

topup:new_request
→ admin + cashier

support:new_request
→ admin + cashier
```

Do not broadcast private customer information to every connected station.

## Reconnection

On Socket.IO reconnect:

1. Re-authenticate socket if needed.
2. Rejoin the correct rooms.
3. Refresh authoritative REST state.
4. Do not duplicate notifications.

---

# 21. Socket.IO Connection Error Handling

Current development can show messages such as:

```text
WebSocket connection ... failed
WebSocket is closed before the connection is established
```

These should not break the application.

## Fix

- Show a small non-blocking realtime status indicator.
- Continue using REST if Socket.IO is unavailable.
- Reconnect automatically.
- Avoid console spam from repeated connection attempts.
- Do not display an error modal for a temporary socket disconnect.
- Once reconnected, refresh authoritative state.

---

# 22. Backend Transactions

Every money/time operation must be atomic.

Especially:

- Session start
- Wallet deduction
- Wallet adjustment
- Wallet refund
- Session extension
- Top-up approval
- Top-up rejection state change
- Member deletion where related records are affected

Pattern:

```text
BEGIN
  validate
  update wallet/session
  insert ledger record
  insert audit log
COMMIT
```

Any failure:

```text
ROLLBACK
```

Never leave a wallet updated while the corresponding session/ledger update failed.

---

# 23. Backend Error Responses

All important API errors should return consistent JSON.

Recommended structure:

```json
{
  "success": false,
  "code": "RATE_PLAN_NOT_FOUND",
  "error": "Rate plan not found."
}
```

Frontend should use `code` for behavior and `error` for display.

Do not make the frontend parse stack traces or SQL messages.

Important codes to standardize:

```text
AUTH_REQUIRED
INVALID_CREDENTIALS
SESSION_INVALID
ACCOUNT_ALREADY_ACTIVE
INSUFFICIENT_BALANCE
NO_ACTIVE_SESSION
RATE_PLAN_NOT_FOUND
PC_NOT_FOUND
PC_ALREADY_REGISTERED
PC_NOT_AVAILABLE
INVALID_AMOUNT
TOPUP_RATE_LIMITED
LOGIN_RATE_LIMITED
TOPUP_NOT_FOUND
TOPUP_ALREADY_RESOLVED
SUPPORT_RATE_LIMITED
```

---

# 24. Backend Database Reset / Seed

The project intentionally has no demo/mock members, PCs, sessions, or built-in rates.

Keep that behavior.

Seed/reset must not recreate unwanted sample data.

Reset must reliably clear:

- members
- customer users
- PCs
- sessions
- wallet transactions
- top-ups
- payments
- extensions
- logs
- support messages
- loyalty records
- remote command records

Admin bootstrap credentials may remain intentionally available for first-run setup.

---

# 25. Logs

The user specifically requires clean logs during reset/seed.

Verify that:

```text
npm run reset
npm run seed
```

actually produce an empty operational history.

Do not allow frontend mock data to recreate old session logs after the database has been reset.

The frontend must never generate fake logs to make the Logs page look populated.

---

# 26. Customer Session Expiry

When remaining prepaid time reaches `00:00`:

1. Backend should be authoritative for expiration.
2. Customer UI should immediately reflect expired state.
3. Session should end.
4. PC should become available.
5. Customer auth/session state should be cleared where appropriate.
6. Electron should return to locked kiosk state.
7. Windows key should become blocked again.
8. Customer should see the login screen.

Avoid duplicate end-session requests caused by multiple React effects.

Use an idempotent backend session-end operation.

---

# 27. Customer Mini Dashboard UX

The mini dashboard should always make these actions obvious:

- Remaining time
- Wallet balance
- Current PC
- Extend Time
- Top Up
- Request Help
- Log Out

## Extend Time

Default payment method:

> **Pay at Counter / Cash**

Alternative:

> **Use Wallet**

GCash should only appear when configured/available.

If wallet balance is insufficient:

> **Insufficient balance. Top up now.**

Do not allow invalid extension amounts.

---

# 28. Customer Logout Modal

Keep the logout confirmation modal.

It should clearly explain:

> Logging out will end your customer session on this PC and return the station to the locked login screen.

Buttons:

- Cancel
- Log Out

Prevent accidental double submission.

After successful logout, the Electron state must transition to locked mode.

---

# 29. Guest Mode

Guest mode must remain available when a customer has no account.

Admin starts the guest session for a specific PC.

Customer station detects:

```text
registered PC IP
        ↓
guest session active
        ↓
Guest mode available
```

If no guest session exists:

> No guest session is active on this PC. Please ask staff to start one.

Guest mode must not create a fake member account.

---

# 30. Customer / Admin Separation

Keep the two Electron applications separate.

### Customer

- Customer login
- Guest mode
- Wallet
- Top-up
- Extend time
- Help
- Session dashboard
- Tray behavior

### Admin

- Members
- Floor Matrix
- Guest session control
- Rate plans
- Top-ups
- Wallet management
- Logs
- Settings
- Station operations

Both use the same backend and SQLite database.

---

# 31. iCafe8 Deployment

Keep iCafe8 as the diskless deployment target.

Do not reintroduce CCBoot terminology unless explicitly required.

Production layout:

```text
                 ┌──────────────────────┐
                 │  Aezakmi Backend     │
                 │  Node + Express      │
                 │  SQLite + Socket.IO  │
                 │  LAN IP :3000        │
                 └──────────┬───────────┘
                            │
             ┌──────────────┴──────────────┐
             │                             │
      ┌──────▼──────┐               ┌──────▼──────┐
      │ Customer PC │               │ Admin PC    │
      │ iCafe8      │               │ Electron    │
      │ Electron    │               │ Dashboard   │
      └─────────────┘               └─────────────┘
```

Customer PCs should use the backend server's LAN IP in their production environment.

---

# 32. Security / Production Hardening

Before production deployment:

- Use a strong JWT secret.
- Do not ship `.env` secrets in source control.
- Keep SQLite database on the server only.
- Restrict backend port 3000 to the cafe LAN where possible.
- Validate all client-provided IP values.
- Never trust client-provided wallet balances.
- Never trust client-provided remaining time.
- Never trust client-provided rate calculations.
- Never trust client-provided member IDs without authorization checks.
- Use backend authorization for Admin/Cashier/Customer roles.
- Keep audit logs for financial operations.

---

# 33. Testing Matrix

## Customer Electron

- [ ] Startup
- [ ] Fullscreen lock
- [ ] Always-on-top lock
- [ ] Windows-key lock
- [ ] Customer login
- [ ] Guest mode
- [ ] Zero-balance rejection
- [ ] Valid session start
- [ ] 800×600 active state
- [ ] Hidden main window after session start
- [ ] Tray icon remains visible
- [ ] Right-click tray menu
- [ ] Open Mini Dashboard
- [ ] Tray logout
- [ ] Logout modal
- [ ] Session expiry
- [ ] Wallet update
- [ ] Top-up request
- [ ] Live top-up success toast
- [ ] Request Help
- [ ] Live help notification
- [ ] Socket reconnect

## Admin

- [ ] Login
- [ ] First-login credential setup
- [ ] Members list
- [ ] Add member
- [ ] Birthdate
- [ ] Edit member
- [ ] Delete member
- [ ] Wallet edit
- [ ] Wallet top-up
- [ ] Session top-up
- [ ] Floor Matrix
- [ ] Add PC
- [ ] Edit PC
- [ ] IP detection
- [ ] Start member session
- [ ] Wallet deduction
- [ ] Guest session
- [ ] Tariffs
- [ ] Rate plan create
- [ ] Rate plan edit
- [ ] Rate plan delete
- [ ] Toggle UI
- [ ] Top-up approval
- [ ] Top-up rejection
- [ ] Support notification
- [ ] Logs layout
- [ ] Settings layout
- [ ] GCash settings
- [ ] Socket.IO reconnect

## Backend

- [ ] Clean reset
- [ ] Clean seed
- [ ] No mock members
- [ ] No mock PCs
- [ ] No mock rates
- [ ] No mock logs
- [ ] Auth rate limiter
- [ ] Top-up rate limiter
- [ ] Support rate limiter
- [ ] Wallet transactions
- [ ] Session transactions
- [ ] Top-up transactions
- [ ] Single active account session
- [ ] Heartbeat expiry
- [ ] PC IP identity
- [ ] Socket.IO events
- [ ] Socket.IO reconnection
- [ ] Consistent error codes

---

# 34. Priority Order

## P0 — Fix before further feature work

1. **Electron locked/active window state machine**
2. **Electron tray + 800×600 active-session behavior**
3. **Windows-key lock/unlock reliability**
4. **Customer IP → PC mapping**
5. **Customer wallet mapping**
6. **Rate-plan ID mismatch**
7. **Admin wallet mapping/edit**
8. **Member session wallet deduction**
9. **Zero-time / insufficient-balance session validation**
10. **Socket.IO live top-up/customer updates**

## P1 — Important UX/reliability

11. Add Member validation
12. Add PC validation
13. Tariff toggle UI
14. Logs max-width
15. Settings max-width
16. Socket.IO reconnection handling
17. Help notification sound
18. Top-up success toast
19. Logout transition
20. Session expiry transition

## P2 — Hardening / polish

21. Socket.IO rooms
22. Standard API error codes
23. Duplicate request protection
24. Better diagnostics
25. Production Windows kiosk hardening
26. iCafe8 deployment verification

---

# 35. Definition of Done

The current release should not be considered stable until all of these are true:

- Customer station starts locked.
- Windows key is blocked while locked.
- Valid customer login unlocks the station.
- Active customer session hides the Electron window from the taskbar while leaving the app in the tray.
- Mini dashboard opens as a fixed 800×600 window.
- Active mini dashboard is not fullscreen and not always-on-top.
- Logout returns the station to fullscreen + kiosk + always-on-top.
- Customer account cannot start a zero-time session.
- Customer wallet always matches SQLite.
- Admin wallet always matches SQLite.
- Member-started sessions correctly deduct wallet balance when applicable.
- Rate plans always resolve by canonical ID.
- Customer sees GCash name and number configured by Admin.
- Top-up approval updates the customer wallet without a manual refresh.
- Customer sees a live successful-top-up toast.
- Request Help reaches Admin without a refresh.
- Admin receives a clear 2–3 second notification sound.
- Add Member and Add PC modals validate all required fields.
- Logs and Settings fit properly within a 1920×1080 viewport.
- Socket.IO disconnects do not break REST functionality.
- Socket.IO reconnects restore authoritative state.
- Reset/seed does not recreate mock members, PCs, rates, or logs.
- Backend remains the authoritative source for money, time, authentication, PC identity, and session state.

---

# 36. Files to Prioritize

### Customer Electron

```text
apps/customer/electron/main.cjs
apps/customer/electron/preload.cjs
apps/customer/electron/windows-key-hook.ps1
```

### Customer React

```text
apps/customer/src/context/AuthContext.jsx
apps/customer/src/context/AppDataContext.jsx
apps/customer/src/pages/CustomerSessionView.jsx
apps/customer/src/components/customer/TopUpModal.jsx
apps/customer/src/components/customer/ExtendSessionModal.jsx
apps/customer/src/components/customer/StartSessionModal.jsx
apps/customer/src/lib/api.js
apps/customer/src/lib/socket.js
apps/customer/src/lib/rates.js
```

### Admin React

```text
apps/admin/src/pages/MembersPage.jsx
apps/admin/src/pages/FloorMatrix.jsx
apps/admin/src/pages/TariffsPage.jsx
apps/admin/src/pages/LogsPage.jsx
apps/admin/src/pages/SettingsPage.jsx
apps/admin/src/context/AppDataContext.jsx
apps/admin/src/lib/api.js
apps/admin/src/lib/socket.js
apps/admin/src/components/floor/PcFormModal.jsx
```

### Backend

```text
backend/src/routes/authRoutes.js
backend/src/routes/apiRoutes.js
backend/src/routes/operationsRoutes.js
backend/src/middleware/auth.js
backend/src/middleware/clientIdentity.js
backend/src/middleware/rateLimiter.js
backend/src/realtime.js
backend/src/server.js
backend/src/db/schema.js
backend/src/db/reset.js
backend/src/db/seed.js
```

---

## Final Implementation Rule

**Do not introduce new mock data, do not duplicate the backend source of truth in React, and do not change unrelated working components.**

Fix the P0 items first, especially the Electron state transition:

```text
LOCKED
  fullscreen + kiosk + always-on-top + Windows key blocked

        ⇅ login/logout

ACTIVE
  hidden main window + tray icon + 800×600 dashboard on demand
  + not fullscreen + not always-on-top + Windows key enabled
```

That state transition must remain deterministic even when login, logout, session expiry, Socket.IO events, or network failures happen at nearly the same time.
