# Aezakmi Cafe Frontend — Outstanding Work

_Compared against `Aezakmi_Cafe_Frontend_Roadmap.md` · Aug 2026 (v4 — post Customer Self-Service Dashboard + top-up history + low-time sound)_

This supersedes v3. Everything scoped in v3's §3 "Suggested Order — Remaining"
that's frontend-only is now built, and the Customer Self-Service Dashboard from
v3 §4 is implemented. Only the Express `HOST`/`PORT`/`IP_PREFIX` env wiring
(backend) and Section 5 (full backend integration) remain untouched.

---

## Fixed / Built This Pass

- **Top-up request history + clear**: `AdminNotificationCenter`'s bell panel now
  has Pending/History tabs. History shows every approved/rejected request with
  a status badge; a "Clear history" button (arm-then-confirm, same pattern as
  the rest of the app) drops resolved requests via a new
  `clearResolvedTopUps()` on `AppDataContext`. Pending requests are untouched
  by clearing.
- **Low-time sound alert**: new `src/lib/sound.js` plays a short two-beep tone,
  distinct from the admin top-up chime. Wired into both `PcCard` (cashier
  view) and `CustomerSessionView` (customer view) — fires once per session as
  remaining time crosses the threshold, not on every tick, and is free to
  re-fire if a session is extended back up and later dips low again. The
  threshold now reads `settings.lowTimeWarningMinutes` (Settings page) instead
  of a hardcoded 5 minutes — that setting was previously saved but never
  actually consulted anywhere.
- **Typography pass (partial)**: the smallest status-bearing text in `PcCard`
  (IP address, "Reserved", billing type) and the Floor Matrix stat-chip labels
  moved from 10px to 11px — these are the "Clear Status Indicators" the
  roadmap's UX section calls out specifically, so they got priority over
  cosmetic-only micro-text (toast timestamps, notification badge counts),
  which is unchanged. A full contrast/typography audit across every screen is
  still open — this pass targeted only the highest-value session-status text.
- **Customer Self-Service Dashboard** (v3 §4, all four bullets):
  - **Self-service extend**: `CustomerSessionView` now shows an "Extend with
    Wallet" button on any active prepaid session (replacing "Top Up" when the
    wallet has a balance; "Top Up" is still reachable via a small link
    underneath). `ExtendSessionModal` spends wallet balance immediately via a
    new `extendSessionFromWallet(pcId, memberId, amount)` on
    `AppDataContext` — no admin approve/reject step, distinct from the
    existing `requestTopUp`/`approveTopUp` queue that `TopUpModal` still uses
    for adding *new* money.
  - **No more tier gating on rate plan visibility**: there never was a
    separate tier filter to remove from the customer view — the gate is now
    purely the new `customerSelfService` boolean on each rate plan (see
    below), which every customer sees identically regardless of tier.
  - **Admin-only self-service toggle**: rate plans gained a
    `customerSelfService` field. `TariffsPage` shows a switch inside the
    edit/create modal and a quick-toggle pill directly on each plan's card.
    Seeded defaults: Standard and Midnight (linear) are on; Promo (package) is
    off, so promo-style plans don't become self-service without an admin
    opting in.
  - **Self-service Start Session**: when a customer has no active session but
    does have wallet balance, an assigned PC that's currently `available`, and
    at least one self-service-enabled rate plan exists, `CustomerSessionView`
    offers a "Start Session" button opening `StartSessionModal`. It reuses the
    same rate-plan-tabs-plus-amount pattern as the admin `SessionModal`, filtered
    to self-service plans, and calls a new
    `startSelfServiceSession(pcId, memberId, ratePlanId, amount)` — validates
    PC availability, plan eligibility, minimum amount, and wallet balance
    before touching state.
  - Storage key bumped to `aezakmi.appdata.v3` since rate plans changed shape
    (new field) — old persisted state reseeds clean instead of running with an
    `undefined` `customerSelfService`.

## 1. Roadmap Section Status

| # | Section | Status | Notes |
|---|---|---|---|
| 1 | Client Network Identity & Floor Matrix IP Mapping | **Mostly done** | Unchanged this pass — still missing only the Express `HOST`/`PORT`/`IP_PREFIX` env wiring (backend). |
| 2 | Authentication & Role-Based Access | **Done** | Unchanged. |
| 3 | Customer Top-Up Notification System | **Done (frontend-simulated)** | Gained a history/clear view this pass; the request→approve flow itself is unchanged. |
| 4 | Multi-Generational UX Framework | **Mostly reflected** | Low-time sound alert now shipped and tied to the Settings threshold. Full contrast/typography audit still open (see above). |
| 5 | Backend Integration & Real-Time Sync | **Not started** | Still all mock state. |
| 6 | Feature Backlog | **Not started** | Unchanged. |

## 2. Full CRUD — Admin (all closed except Logs)

| Entity | Create | Read | Update | Delete | Notes |
|---|---|---|---|---|---|
| **PCs / Floor Matrix** | ✅ | ✅ | ✅ | ✅ | Unchanged. |
| **Rate Plans (Tariffs)** | ✅ | ✅ | ✅ | ✅ | Gained the `customerSelfService` toggle this pass (card quick-toggle + modal switch). |
| **Members** | ✅ | ✅ | ✅ | ✅ | Unchanged. |
| **Logs** | — | ✅ | — | — | Still a fully static mock array — needs real session start/end events from the backend. |
| **Settings** | — | ✅ | ✅ | — | `lowTimeWarningMinutes` is now actually consulted by the low-time alert, not just stored. |
| **Top-Up Requests** | ✅ | ✅ | ✅ | ✅ | **Closed this pass** — History tab + "Clear history" for resolved requests. |

## 3. Suggested Order — Remaining

1. Full contrast/typography audit across every screen (this pass only fixed the highest-value session-status text).
2. Section 1's remaining backend half (Express `HOST`/`PORT`/`IP_PREFIX` env wiring), then
   Section 5 backend integration wholesale — real data replaces every mock store
   above at that point.


## 5. Customer Frontend TODO — Login, PC Switching & Mini Dashboard

### Customer PC Switching

- Add a clearly visible **"This PC"** action to the customer interface.
- When the customer selects **"This PC"**, the currently logged-in customer account on that PC must be logged out before another customer can log in.
- The action should be explicit and easy to understand, especially for shared/public PC use.
- After logout, return the PC to the customer login screen without affecting the PC's availability/session state unless the backend confirms that the customer's actual computer-use session has ended.
- Do not treat changing the logged-in account as automatically ending the customer's paid PC session. The backend should remain the source of truth for session state.

### Customer Mini Dashboard UX

Improve the customer mini dashboard so the most important actions are immediately visible:

- **Remaining Time** — prominent and easy to distinguish.
- **Wallet Balance** — always visible.
- **Top Up** — keep this button directly accessible instead of hiding it behind another action.
- **Extend Time** — keep this as a primary action while the customer has an active session.
- **Current PC / PC Identity** — clearly show which PC the customer is currently using.
- **Account** — provide an obvious logout/account-switch action.

The dashboard should follow the existing multi-generational UX requirement: controls must be easy to distinguish, readable, and understandable across different age groups. Avoid relying only on tiny text, subtle color differences, or icon-only controls.

### Extend Time — Payment Method

When the customer selects **Extend Time**, present a simple payment-method choice:

1. **Pay at Counter / Cash** — **default selection**
2. **Use Wallet**
3. **Pay via GCash**

The default should be **Pay at Counter / Cash**.

#### Payment behavior

- **Pay at Counter / Cash**
  - Create an extension request for staff/cashier approval.
  - Do not immediately deduct wallet balance.
  - Show a clear pending state after the request is submitted.
  - The cashier/admin completes the payment and confirms the extension.

- **Use Wallet**
  - Show the wallet balance before confirmation.
  - Validate that the wallet has enough balance.
  - Deduct the required amount only after successful confirmation.
  - Extend the active session immediately after the backend confirms the transaction.

- **Pay via GCash**
  - Show the GCash payment flow/instructions configured by the cafe.
  - The extension must remain pending until the payment is confirmed.
  - Do not add time merely because the customer opened or submitted the GCash option.
  - The backend must record the payment method and final payment status.

### Customer Account Login — Any PC

Customers must be able to log into their member account from **any PC in the cafe**.

Frontend requirements:

- Remove any frontend assumption that a member can only log in to their previously assigned PC.
- The login screen should work on every distributed client PC.
- After successful login, the frontend should obtain the backend-assigned customer/account session and current PC identity.
- The customer dashboard should always display the actual PC currently being used.
- If the account is already actively logged in on another PC, show a clear message rather than silently replacing the other login.

### Single Active Customer Login Session

The frontend must support the backend rule that **one customer account may have only one active login session at a time**.

Expected UX:

- Login succeeds → create one active account session.
- Login from another PC while already active → reject the second login with a clear message.
- Logout → invalidate the active account session so the customer can log in elsewhere.
- Network interruption should not permanently lock the account; the backend should use session expiry/heartbeat rules to recover abandoned sessions.
- The UI should never claim a customer is logged in on another PC based only on localStorage/mock state. The backend is authoritative.

### Frontend API Integration Needed

Replace the current mock/local-only behavior with backend calls for:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/heartbeat`
- `GET /api/pcs/current`
- `GET /api/members/me`
- `GET /api/wallet`
- `POST /api/top-ups`
- `POST /api/session-extensions`
- `GET /api/session-extensions/:id`
- `POST /api/payments/gcash/confirm` *(or the final payment-confirmation endpoint selected by the backend design)*

The exact endpoint names may be adjusted during backend implementation, but the frontend must not retain a second independent source of truth for authentication, wallet balance, active sessions, or paid time.

### Frontend Completion Criteria

- [ ] "This PC" is visible and understandable.
- [ ] Customer can log out and allow another customer to use the same PC.
- [ ] Customer can log into the same account from any cafe PC.
- [ ] Backend rejects a second active login for the same account.
- [ ] Mini dashboard keeps **Top Up** visible.
- [ ] Mini dashboard makes **Extend Time** prominent.
- [ ] Extend Time defaults to **Pay at Counter / Cash**.
- [ ] Wallet extension works after backend confirmation.
- [ ] Cash extension creates a staff/cashier request.
- [ ] GCash extension has a pending/confirmed payment state.
- [ ] Account, PC, remaining time, and wallet information are clearly distinguishable.
- [ ] No customer authentication/session state depends solely on localStorage.


## 4. Notes / Follow-ups on the Self-Service Dashboard

- **Package-plan extend is a repeat-purchase, not a proportional top-up.** If a
  customer's running session is on a fixed-package plan (e.g. Promo), the
  "Extend with Wallet" amount is locked to the package price and always adds
  the package's full minutes again — mirrors how `approveTopUp` already
  behaved for package plans, just made explicit in the UI instead of letting
  someone type an arbitrary amount that wouldn't scale correctly.
- **Self-service start requires an assigned PC.** A customer with no `pcId` on
  their member record (never sat at a PC, or an admin hasn't assigned one)
  still sees "ask staff" — there's no self-service path to *pick* a PC, only
  to start a session on the one they're already assigned to. Whether
  self-service should let a customer choose from any available PC is worth
  clarifying before backend integration, since it changes the API shape for
  `POST /api/sessions/start`.
- **Wallet balance is the only funding source for self-service.** A customer
  with ₱0 wallet has no self-service options at all (must go through
  Top-Up → admin approval first) — this was implicit in the requirement
  ("a customer with remaining wallet balance") but worth confirming matches
  intent, since it means self-service is unavailable to first-time customers
  with no prior top-up.
