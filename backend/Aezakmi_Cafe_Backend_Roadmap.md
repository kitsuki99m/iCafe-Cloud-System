# Aezakmi Cafe — Backend Roadmap

_Last updated: Aug 2026_

## 0. Backend Goal

Build the real backend for the Aezakmi Cafe client/server system.

The backend replaces the current frontend mock/local state with a single source of truth for:

- Customer/member accounts
- Authentication and authorization
- One active login session per customer account
- PC/client identity
- PC availability and customer computer-use sessions
- Rate plans/tariffs
- Wallet balances
- Top-up requests
- Cashier/admin approval flows
- Time extensions
- GCash payment status
- Logs/audit history
- Cafe settings
- Real-time state synchronization

### Runtime / Deployment Model

- **Backend:** Node.js + Express
- **Database:** SQLite
- **Authentication:** JWT-based authentication
- **Password storage:** Argon2id or bcrypt
- **Client deployment:** iCafe8 diskless client environment
- **Network model:** local cafe LAN
- **Client addressing:** each client PC connects to the server using the server's LAN IP address/hostname configured for the iCafe8 environment
- **Backend bind:** configurable `HOST`
- **Backend port:** configurable `PORT`
- **Client IP matching:** configurable `IP_PREFIX`
- **Internet dependency:** the core cafe operation must continue to work on the local network without requiring an external cloud backend

The server should normally bind to the LAN interface rather than only `127.0.0.1`, because diskless client PCs need to reach it over the cafe network.

---

# 1. Proposed Backend Structure

```text
backend/
├── src/
│   ├── app.js
│   ├── server.js
│   │
│   ├── config/
│   │   ├── env.js
│   │   └── database.js
│   │
│   ├── db/
│   │   ├── migrations/
│   │   ├── seed.js
│   │   └── connection.js
│   │
│   ├── middleware/
│   │   ├── auth.js
│   │   ├── roles.js
│   │   ├── rateLimiter.js
│   │   ├── errorHandler.js
│   │   ├── requestLogger.js
│   │   └── clientIdentity.js
│   │
│   ├── routes/
│   │   ├── authRoutes.js
│   │   ├── memberRoutes.js
│   │   ├── pcRoutes.js
│   │   ├── sessionRoutes.js
│   │   ├── walletRoutes.js
│   │   ├── topUpRoutes.js
│   │   ├── paymentRoutes.js
│   │   ├── ratePlanRoutes.js
│   │   ├── logsRoutes.js
│   │   ├── settingsRoutes.js
│   │   └── healthRoutes.js
│   │
│   ├── controllers/
│   │   ├── authController.js
│   │   ├── memberController.js
│   │   ├── pcController.js
│   │   ├── sessionController.js
│   │   ├── walletController.js
│   │   ├── topUpController.js
│   │   ├── paymentController.js
│   │   ├── ratePlanController.js
│   │   ├── logsController.js
│   │   └── settingsController.js
│   │
│   ├── services/
│   │   ├── authService.js
│   │   ├── sessionService.js
│   │   ├── pcService.js
│   │   ├── walletService.js
│   │   ├── topUpService.js
│   │   ├── paymentService.js
│   │   ├── billingService.js
│   │   ├── logService.js
│   │   └── syncService.js
│   │
│   ├── models/
│   │   └── *.js
│   │
│   ├── validators/
│   │   ├── authValidators.js
│   │   ├── memberValidators.js
│   │   ├── sessionValidators.js
│   │   ├── paymentValidators.js
│   │   └── commonValidators.js
│   │
│   └── utils/
│       ├── jwt.js
│       ├── password.js
│       ├── clientIp.js
│       ├── ids.js
│       └── time.js
│
├── data/
│   └── aezakmi.sqlite
│
├── .env
├── .env.example
├── package.json
└── README.md
```

The exact folder structure can change during implementation, but responsibilities should remain separated between routes, controllers, services, database access, validation, and middleware.

---

# 2. Core Dependencies

Initial backend stack:

- `express`
- `better-sqlite3` or another stable SQLite driver
- `jsonwebtoken`
- `argon2` or `bcrypt`
- `cors`
- `express-rate-limit`
- `helmet`
- `dotenv`
- `zod` or `joi`
- `uuid`
- `morgan` or a structured request logger

Optional as needed:

- WebSocket library such as `ws` or Socket.IO for real-time dashboard updates
- `node-cron` for cleanup/maintenance jobs

Avoid adding dependencies unless they solve a real backend requirement.

---

# 3. Environment Configuration

Create `.env.example`:

```env
NODE_ENV=development

HOST=0.0.0.0
PORT=3000

IP_PREFIX=192.168.1.

DATABASE_PATH=./data/aezakmi.sqlite

JWT_SECRET=change_this_to_a_long_random_secret
JWT_EXPIRES_IN=8h

SESSION_IDLE_TIMEOUT_MINUTES=10
SESSION_HEARTBEAT_SECONDS=30

CORS_ORIGIN=*
TRUST_PROXY=false
```

### Important iCafe8 requirement

The server's LAN IP must be configurable.

Example:

```env
HOST=0.0.0.0
PORT=3000
IP_PREFIX=192.168.1.
```

Clients should connect using the server's LAN address, for example:

```text
http://192.168.1.10:3000
```

Do not hardcode `localhost` into the production client configuration.

The final iCafe8 deployment should have one predictable backend address that every diskless client can reach.

---

# 4. Database Design — SQLite

SQLite should become the backend source of truth.

Recommended tables:

## `users`

For authentication identity.

Fields:

- `id`
- `member_id`
- `username`
- `password_hash`
- `role`
- `is_active`
- `created_at`
- `updated_at`

Roles:

- `admin`
- `cashier`
- `customer`

## `members`

Customer profile/business data.

Fields:

- `id`
- `user_id`
- `member_code`
- `name`
- `phone`
- `email`
- `wallet_balance`
- `status`
- `created_at`
- `updated_at`

Keep authentication credentials separate from member profile data.

## `pcs`

Cafe computer/client identity.

Fields:

- `id`
- `pc_number`
- `name`
- `ip_address`
- `mac_address` *(if reliably available)*
- `status`
- `assigned_member_id`
- `created_at`
- `updated_at`

Possible statuses:

- `available`
- `in_use`
- `reserved`
- `offline`
- `maintenance`

## `auth_sessions`

Tracks active customer/admin/cashier login sessions.

Fields:

- `id`
- `user_id`
- `jwt_id`
- `pc_id`
- `client_ip`
- `created_at`
- `last_seen_at`
- `expires_at`
- `revoked_at`

This table is the key to enforcing **one active login session per account**.

## `computer_sessions`

Tracks paid computer-use sessions.

Fields:

- `id`
- `member_id`
- `pc_id`
- `rate_plan_id`
- `started_at`
- `expires_at`
- `ended_at`
- `status`
- `billing_type`
- `amount_paid`

Do not merge this with `auth_sessions`.

A customer can log out of an account on a PC without automatically ending the paid computer-use session unless the business rules explicitly require it.

## `rate_plans`

Fields:

- `id`
- `name`
- `type`
- `price`
- `minutes`
- `customer_self_service`
- `is_active`
- `created_at`
- `updated_at`

## `wallet_transactions`

Never rely only on a mutable balance.

Record every wallet change:

- `id`
- `member_id`
- `type`
- `amount`
- `balance_before`
- `balance_after`
- `reference_type`
- `reference_id`
- `created_at`

Types can include:

- `top_up`
- `session_start`
- `session_extension`
- `refund`
- `adjustment`

## `top_up_requests`

Fields:

- `id`
- `member_id`
- `amount`
- `payment_method`
- `status`
- `requested_at`
- `processed_at`
- `processed_by`

Statuses:

- `pending`
- `approved`
- `rejected`
- `cancelled`

## `session_extensions`

Fields:

- `id`
- `computer_session_id`
- `member_id`
- `amount`
- `minutes_added`
- `payment_method`
- `status`
- `requested_at`
- `confirmed_at`
- `confirmed_by`

Payment methods:

- `cash`
- `wallet`
- `gcash`

## `payments`

For payment tracking, especially GCash.

Fields:

- `id`
- `reference`
- `member_id`
- `amount`
- `method`
- `status`
- `external_reference`
- `created_at`
- `confirmed_at`
- `confirmed_by`

## `logs`

Audit trail.

Fields:

- `id`
- `user_id`
- `action`
- `entity_type`
- `entity_id`
- `pc_id`
- `details`
- `created_at`

---

# 5. Authentication

## Requirements

Implement:

- Login
- Logout
- Current-user lookup
- JWT validation
- Password hashing
- Role authorization
- Active-session tracking
- Session heartbeat
- Session expiry
- Account disable/revocation

### Passwords

Never store plaintext passwords.

Use:

- Argon2id preferred
- bcrypt acceptable if Argon2 is impractical

### JWT

JWT payload should contain only what is necessary, for example:

```json
{
  "sub": "user-id",
  "role": "customer",
  "pcId": "pc-id",
  "jti": "unique-session-id"
}
```

Do not put wallet balance, remaining minutes, or other mutable business data into the JWT.

Those values must come from the database/API.

---

# 6. One Active Login Per Customer

This is a mandatory backend rule.

A member can use their account on **any PC**, but only one active account login may exist at a time.

### Login flow

```text
Customer enters username/password
        ↓
Backend verifies password
        ↓
Find active auth_sessions for user
        ↓
Active session exists?
   ┌───────┴────────┐
   YES              NO
   ↓                 ↓
Reject login      Create auth_session
with clear        + JWT
message              ↓
                  Return account
                  + current PC
```

The backend must enforce this atomically so two PCs cannot successfully log in at nearly the same time.

Recommended SQLite approach:

- Use a transaction for login.
- Check active session.
- Create the new session only if no active session exists.
- Add a database constraint/index where practical to prevent duplicate active sessions.

### Do not rely on frontend/localStorage

The following are not sufficient:

```text
localStorage.loggedIn = true
```

or

```text
localStorage.memberId = ...
```

The backend must determine whether the account is active.

---

# 7. "This PC" / Logout Flow

Frontend:

```text
This PC
   ↓
Confirm logout
   ↓
POST /api/auth/logout
   ↓
Backend revokes auth_sessions row
   ↓
Frontend clears local auth state
   ↓
Return to customer login
```

Important:

**Account logout and computer-use session termination are separate operations.**

If the customer is still paying for time on that PC, logging out should not automatically destroy the paid session unless that is intentionally defined as a cafe business rule.

---

# 8. PC Identity

Every client must identify itself to the backend.

The backend should determine the client PC using a combination of:

1. Registered PC ID/configuration
2. Client IP address
3. Optional MAC address where reliable
4. Server-side PC registry

Do not trust arbitrary customer-submitted `pcId` values for authorization.

Recommended request context:

```text
HTTP request
   ↓
clientIdentity middleware
   ↓
determine source IP
   ↓
match registered PC
   ↓
req.pc
```

Example:

```text
192.168.1.21 → PC-01
192.168.1.22 → PC-02
192.168.1.23 → PC-03
```

`IP_PREFIX` can help identify clients within the configured LAN range, but the backend should still use an explicit PC registry rather than assuming the last IP octet always equals the PC number.

---

# 9. Customer Login From Any PC

Remove the current frontend concept that a member must stay tied to one assigned PC.

Desired behavior:

```text
Member
  ↓
PC-01 → login → active account session
  ↓
logout
  ↓
PC-07 → login → allowed
```

Also:

```text
PC-01 → login
PC-07 → same account login
       ↓
      REJECT
```

The backend should return a specific error such as:

```json
{
  "success": false,
  "code": "ACCOUNT_ALREADY_ACTIVE",
  "message": "This account is already logged in on another PC."
}
```

---

# 10. Customer Mini Dashboard API

The customer dashboard should be backed by one authenticated API response or a small set of authenticated endpoints.

Suggested:

```http
GET /api/auth/me
GET /api/pcs/current
GET /api/members/me
GET /api/wallet
GET /api/sessions/current
GET /api/session-extensions
```

Dashboard should show:

- Customer name
- Current PC
- Remaining time
- Session expiration
- Wallet balance
- Top Up button
- Extend Time button
- This PC / Logout action

The frontend should refresh mutable values from the backend rather than trusting stale local state.

---

# 11. Extend Time Payment Flow

## Default Payment Method

The frontend must default to:

**Pay at Counter / Cash**

Available methods:

```text
Pay at Counter / Cash  ← default
Use Wallet
Pay via GCash
```

## Cash

```text
Customer
  ↓
Extend Time
  ↓
Cash selected
  ↓
POST /api/session-extensions
  ↓
status = pending
  ↓
Cashier sees request
  ↓
Cashier confirms payment
  ↓
Backend adds time
  ↓
status = approved
```

No wallet deduction occurs while the request is pending.

## Wallet

```text
Customer
  ↓
Extend Time
  ↓
Use Wallet
  ↓
Backend validates wallet
  ↓
SQLite transaction:
  deduct wallet
  + add session minutes
  + write wallet transaction
  + write extension record
  ↓
success
```

Wallet deduction and time extension must occur in the **same database transaction** so the system cannot deduct money without adding time or add time without recording the payment.

## GCash

Because this is a local cafe deployment, the backend should initially treat GCash as a payment workflow rather than assuming a cloud payment gateway exists.

```text
Customer
  ↓
Extend Time
  ↓
GCash
  ↓
Create payment/extension request
  ↓
status = pending
  ↓
Payment verification/confirmation
  ↓
Backend confirms payment
  ↓
Add session time
```

The final GCash verification mechanism can be implemented separately depending on the cafe's actual GCash process.

---

# 12. Top-Up Flow

Existing frontend top-up behavior should eventually become:

```text
Customer
  ↓
Top Up
  ↓
Create top_up_request
  ↓
Cashier/Admin notification
  ↓
Approve / Reject
  ↓
If approved:
    wallet transaction
    + wallet balance update
    + audit log
```

The wallet balance must never be increased directly by the frontend.

---

# 13. Session Management

Separate:

### Authentication session

Answers:

> "Is this account currently logged in?"

### Computer-use session

Answers:

> "Is this customer currently consuming paid PC time?"

These must be separate database records and API concepts.

Required endpoints:

```http
POST /api/sessions/start
GET  /api/sessions/current
POST /api/sessions/:id/extend
POST /api/sessions/:id/end
```

Customer self-service should only be allowed where the rate plan and account are eligible.

---

# 14. Heartbeat / Abandoned Client Recovery

Because iCafe8 diskless clients can be restarted, disconnected, or lose network connectivity, the backend needs an account-session heartbeat.

Example:

```http
POST /api/auth/heartbeat
```

Every ~30 seconds:

```text
Client → heartbeat
Backend → update last_seen_at
```

If:

```text
now - last_seen_at > SESSION_IDLE_TIMEOUT
```

the backend may mark the authentication session expired/revoked.

This prevents a customer from becoming permanently locked out because a PC crashed or was rebooted.

The timeout must not be so aggressive that normal LAN/network jitter logs customers out unexpectedly.

---

# 15. Authorization / Roles

Middleware:

```text
authenticate
requireRole("admin")
requireRole("cashier")
requireRole("customer")
```

Example access:

| Resource | Admin | Cashier | Customer |
|---|---:|---:|---:|
| Members | ✅ | Limited | Own account |
| PCs | ✅ | ✅ | Current PC only |
| Rate Plans | ✅ | Read | Read eligible |
| Wallet | ✅ | ✅ | Own wallet |
| Top-Ups | ✅ | ✅ | Own requests |
| Extensions | ✅ | ✅ | Own session |
| Logs | ✅ | Limited | ❌ |
| Settings | ✅ | Limited | ❌ |
| User Accounts | ✅ | ❌ | Own account |

Never rely on the frontend hiding buttons as authorization.

---

# 16. Rate Limiting

Use `express-rate-limit`.

At minimum:

### Login

Strict rate limit:

```text
POST /api/auth/login
```

This protects against repeated password guessing.

### General API

More relaxed rate limit for normal requests.

### Heartbeat

Do not apply an overly restrictive general limiter to heartbeat traffic.

Use a separate policy if needed.

---

# 17. CORS

Because the system is local-network based, CORS should be configurable.

Development can use a permissive setting, but production should ideally specify the known frontend origin(s).

Example:

```env
CORS_ORIGIN=http://192.168.1.10:5173
```

If the frontend is served by the same Express server, CORS requirements become simpler.

---

# 18. Security Middleware

Add:

- `helmet`
- `express.json()` with a sensible body-size limit
- CORS configuration
- Rate limiter
- Input validation
- Central error handler
- Request logging
- Authentication middleware
- Role middleware
- Client identity middleware

Do not expose stack traces to client PCs in production.

---

# 19. API Route Map

## Authentication

```http
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
POST /api/auth/heartbeat
```

## Members

```http
GET    /api/members
GET    /api/members/me
GET    /api/members/:id
POST   /api/members
PATCH  /api/members/:id
DELETE /api/members/:id
```

## PCs

```http
GET    /api/pcs
GET    /api/pcs/current
GET    /api/pcs/:id
POST   /api/pcs
PATCH  /api/pcs/:id
DELETE /api/pcs/:id
```

## Sessions

```http
GET  /api/sessions/current
POST /api/sessions/start
POST /api/sessions/:id/extend
POST /api/sessions/:id/end
```

## Wallet

```http
GET /api/wallet
GET /api/wallet/transactions
```

Admin/cashier operations:

```http
POST /api/wallet/adjustments
```

## Top-Ups

```http
POST  /api/top-ups
GET   /api/top-ups
GET   /api/top-ups/:id
PATCH /api/top-ups/:id/approve
PATCH /api/top-ups/:id/reject
```

## Extensions

```http
POST /api/session-extensions
GET  /api/session-extensions
GET  /api/session-extensions/:id
POST /api/session-extensions/:id/confirm
POST /api/session-extensions/:id/cancel
```

## Payments

```http
POST /api/payments
GET  /api/payments/:id
POST /api/payments/:id/confirm
```

## Rate Plans

```http
GET    /api/rate-plans
POST   /api/rate-plans
PATCH  /api/rate-plans/:id
DELETE /api/rate-plans/:id
```

## Logs

```http
GET /api/logs
```

## Settings

```http
GET   /api/settings
PATCH /api/settings
```

## Health

```http
GET /api/health
```

Example:

```json
{
  "success": true,
  "status": "ok",
  "database": "connected"
}
```

---

# 20. Transactions Are Critical

Use SQLite transactions for operations that modify multiple pieces of state.

### Wallet extension

One transaction:

```text
BEGIN
  validate active session
  validate wallet
  deduct wallet
  add session minutes
  insert wallet transaction
  insert extension record
  insert audit log
COMMIT
```

If any operation fails:

```text
ROLLBACK
```

### Top-up approval

One transaction:

```text
BEGIN
  verify request is pending
  update top_up_request
  update wallet balance
  insert wallet transaction
  insert audit log
COMMIT
```

This prevents inconsistent money/time state.

---

# 21. Real-Time Synchronization

The frontend currently simulates shared state.

The backend should eventually become the shared source of truth.

Minimum implementation:

- Frontend polls important state periodically.
- Backend owns all mutations.
- UI updates after successful API responses.

Better implementation:

- WebSocket/Socket.IO channel for:
  - PC status changes
  - Customer session time updates
  - Top-up notifications
  - Cashier approval events
  - Customer logout/session invalidation

Real-time transport should be added only after the REST API is stable.

---

# 22. Frontend → Backend Replacement Map

| Current Frontend Mock | Backend Replacement |
|---|---|
| Mock members | `members` + `users` |
| Mock PCs | `pcs` |
| Mock rate plans | `rate_plans` |
| Local login state | `auth_sessions` + JWT |
| localStorage auth | Backend authentication |
| Mock wallet | `wallet_transactions` |
| Mock top-up queue | `top_up_requests` |
| Mock session timer | `computer_sessions` |
| Mock extension | `session_extensions` |
| Mock payment | `payments` |
| Mock logs | `logs` |
| Local settings | `settings` |
| Frontend PC mapping | Backend PC registry + client identity |
| Frontend account lock | Backend single-active-session rule |

---

# 23. Backend Implementation Phases

## Phase 1 — Scaffold

- [ ] Create Node.js project
- [ ] Install Express
- [ ] Configure environment variables
- [ ] Create server/app separation
- [ ] Add `HOST`, `PORT`, `IP_PREFIX`
- [ ] Add `/api/health`
- [ ] Add centralized error handling
- [ ] Add request logging

## Phase 2 — SQLite

- [ ] Create SQLite database
- [ ] Create migrations
- [ ] Create seed data
- [ ] Create users
- [ ] Create members
- [ ] Create PCs
- [ ] Create rate plans
- [ ] Create sessions
- [ ] Create wallet tables
- [ ] Create top-up tables
- [ ] Create payment tables
- [ ] Create logs
- [ ] Create settings

## Phase 3 — Security

- [ ] Password hashing
- [ ] JWT
- [ ] JWT ID (`jti`)
- [ ] Auth middleware
- [ ] Role middleware
- [ ] Rate limiting
- [ ] CORS
- [ ] Helmet
- [ ] Input validation
- [ ] Error handling
- [ ] Audit logging

## Phase 4 — Authentication

- [ ] Login
- [ ] Logout
- [ ] `/me`
- [ ] Heartbeat
- [ ] Session expiry
- [ ] Single active customer session
- [ ] Account revocation
- [ ] Login from any PC

## Phase 5 — PC Identity

- [ ] Detect client IP
- [ ] Register PC → IP mapping
- [ ] `IP_PREFIX`
- [ ] `/api/pcs/current`
- [ ] Client identity middleware
- [ ] Handle unknown clients
- [ ] Handle changed DHCP addresses safely

## Phase 6 — Billing / Sessions

- [ ] Start session
- [ ] End session
- [ ] Remaining time
- [ ] Extend time
- [ ] Wallet payment
- [ ] Cash request
- [ ] GCash pending/confirmation flow
- [ ] Atomic billing transactions

## Phase 7 — Wallet / Top-Up

- [ ] Wallet balance
- [ ] Transaction ledger
- [ ] Top-up requests
- [ ] Admin/cashier approval
- [ ] Reject flow
- [ ] History
- [ ] Audit log

## Phase 8 — Frontend Integration

Connect the existing frontend to:

- [ ] Authentication API
- [ ] PC API
- [ ] Members API
- [ ] Rate Plans API
- [ ] Sessions API
- [ ] Wallet API
- [ ] Top-Up API
- [ ] Extension API
- [ ] Payment API
- [ ] Logs API
- [ ] Settings API

Remove mock mutation paths once each corresponding backend endpoint is verified.

## Phase 9 — Real-Time

- [ ] Decide polling vs WebSocket
- [ ] PC status updates
- [ ] Customer session updates
- [ ] Top-up notifications
- [ ] Cashier approval events
- [ ] Account/session invalidation events

## Phase 10 — iCafe8 Deployment

- [ ] Configure server LAN IP
- [ ] Configure firewall inbound rule for backend port
- [ ] Confirm all diskless clients can reach server
- [ ] Configure frontend API base URL
- [ ] Verify PC IP mapping
- [ ] Test DHCP/IP changes
- [ ] Test client reboot
- [ ] Test server restart
- [ ] Test concurrent logins
- [ ] Test account logout/re-login on another PC
- [ ] Test wallet transaction recovery
- [ ] Backup SQLite database
- [ ] Add database backup procedure

---

# 24. iCafe8 / Local Network Acceptance Tests

The backend is not considered ready until these scenarios work.

### Test 1 — Normal Customer Login

```text
PC-01
  ↓
Customer login
  ↓
Success
  ↓
PC-01 + customer dashboard displayed
```

### Test 2 — Same Customer On Another PC

```text
PC-01 → Customer A logged in

PC-07 → Customer A attempts login

Expected:
REJECT
"Account is already logged in on another PC."
```

### Test 3 — Logout Then Move

```text
PC-01 → Customer A logout

PC-07 → Customer A login

Expected:
SUCCESS
```

### Test 4 — PC Reboot

```text
PC-01 → Customer A logged in
PC-01 → reboot

Expected:
backend eventually expires stale auth session
Customer can log in again
```

### Test 5 — Wallet Extension

```text
Customer
  ↓
Extend Time
  ↓
Use Wallet
  ↓
Confirm
  ↓
Wallet decreases
Session time increases
```

Both changes must succeed or both must roll back.

### Test 6 — Cash Extension

```text
Customer
  ↓
Extend Time
  ↓
Pay at Counter / Cash
  ↓
Pending request
  ↓
Cashier confirms
  ↓
Session time increases
```

### Test 7 — GCash

```text
Customer
  ↓
Extend Time
  ↓
GCash
  ↓
Pending
  ↓
Payment confirmed
  ↓
Session time increases
```

### Test 8 — Concurrent Login Race

Two PCs attempt to log into the same account at nearly the same time.

Expected:

```text
Exactly ONE login succeeds.
Exactly ONE active auth session exists.
```

This must be tested against the backend, not just the frontend.

---

# 25. Backup / Recovery

SQLite is local and therefore easy to back up.

Implement:

- Scheduled database backup
- Manual backup command
- Safe copy procedure
- Backup retention
- Restore procedure

At minimum, maintain backups of:

```text
aezakmi.sqlite
```

Do not rely on the diskless client images as the only copy of cafe data.

---

# 26. Final Architecture

```text
                    ┌───────────────────────┐
                    │   Aezakmi Cafe Server │
                    │   Node.js + Express   │
                    │       SQLite          │
                    └───────────┬───────────┘
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
          PC-01              PC-02              PC-03
        iCafe8 diskless    iCafe8 diskless    iCafe8 diskless
             │                  │                  │
             └──────────── LAN / TCP ──────────────┘

                    Backend owns:
              ┌─────────────────────────┐
              │ Authentication          │
              │ Active login sessions   │
              │ PC identity             │
              │ Computer sessions       │
              │ Wallet                  │
              │ Top-ups                 │
              │ Extensions              │
              │ Payments                │
              │ Rate plans              │
              │ Logs                    │
              └─────────────────────────┘
```

The frontend becomes a client of the backend rather than an independent state store.

---

# 27. Definition of Done

Backend integration is complete when:

- [ ] No production-critical customer/auth state is stored only in frontend mock state.
- [ ] Every PC can identify itself to the backend.
- [ ] Customers can log into their accounts from any PC.
- [ ] Only one active login session is allowed per customer account.
- [ ] Logout correctly invalidates the backend session.
- [ ] Stale sessions recover after client failure/reboot.
- [ ] Customer dashboard reads real backend data.
- [ ] Top Up creates real backend requests.
- [ ] Extend Time supports Cash, Wallet, and GCash states.
- [ ] Cash is the default extension payment method.
- [ ] Wallet transactions are atomic and auditable.
- [ ] Paid computer-use sessions are separate from authentication sessions.
- [ ] Admin/cashier actions are role-protected.
- [ ] SQLite database is backed up.
- [ ] iCafe8 diskless clients can reach the server over LAN.
- [ ] `HOST`, `PORT`, and `IP_PREFIX` are configurable.
- [ ] Concurrent login testing proves the single-session rule.
- [ ] Frontend and backend share one authoritative source of truth.


## Session Time Persistence & Customer Tier Rates — Added Aug 11, 2026

- Persist remaining customer prepaid seconds on the member account.
- Checkpoint remaining time while authenticated.
- Save remaining time on logout and remote PC shutdown/restart.
- Resume saved time before requiring a new rate/payment.
- Allow zero-wallet customers to log in so they can top up.
- Add Regular/Gold/VIP rate-plan eligibility and enforce it in the backend.
- Customer rate-plan API must return only the authenticated customer's eligible tier plans.
