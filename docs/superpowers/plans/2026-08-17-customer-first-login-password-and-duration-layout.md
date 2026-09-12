# Customer First-Login Password + Stable Duration Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make newly created customer accounts use temporary password `1234` with an optional first-login password-change prompt, and remove HH/MM form layout shifts by using same-row duration inputs with placeholders only.

**Architecture:** Reuse `users.must_change_credentials` for customer first-login password state while keeping the existing admin setup behavior role-scoped. Member creation will no longer accept a custom initial password; the backend hashes `1234` and marks the new customer for password setup. Customer authentication already returns `mustChangeCredentials`; `AuthContext` will expose a token-scoped defer state and a dedicated authenticated completion endpoint will replace the password and clear the flag. Duration inputs remain total-minute controlled components but render HH/MM as equal-height same-row controls with placeholders rather than an additional label row.

**Tech Stack:** React, React Router, Tailwind CSS, Express, SQLite/better-sqlite3, Argon2, Node test runner.

## Global Constraints

- Preserve all fixes in `Frontend FF - Split Duration Inputs.zip`.
- New customer temporary password is exactly `1234`.
- Permanent customer password remains at least 8 characters.
- `Set Later` dismisses the prompt for the current auth token only; the next successful login receives a new token and prompts again until the password is changed.
- HH/MM controls store and submit total minutes exactly as before.
- Duration examples use `placeholder` only; no extra helper/example rows that can shift layout.
- Do not redesign unrelated UI.

---

### Task 1: Stable HH/MM input layout

**Files:**
- Modify: `apps/admin/src/components/common/DurationInput.jsx`
- Test: `tools/duration-input-regressions.test.mjs`

**Interfaces:**
- Consumes: `valueMinutes`, `onChange`, and duration conversion helpers.
- Produces: two equal-height numeric inputs with inline `HH` and `MM` prefixes and placeholders while still emitting total minutes.

- [ ] Add a failing regression asserting there are no separate HH/MM label rows and that both inputs have placeholders.
- [ ] Run the duration regression and confirm it fails on the existing component.
- [ ] Render HH/MM as inline prefix controls in one stable row, with examples provided only by placeholders.
- [ ] Run the duration regression and full renderer parser checks.

### Task 2: New members use temporary password 1234

**Files:**
- Modify: `backend/src/routes/apiRoutes.js`
- Modify: `apps/admin/src/pages/MembersPage.jsx`
- Test: `tools/customer-password-regressions.test.mjs`

**Interfaces:**
- Consumes: Admin member creation request without a password field.
- Produces: customer `users` row and mirrored member password hash using Argon2(`1234`) and `must_change_credentials=1`.

- [ ] Add failing tests asserting create-member no longer requires/submits a custom initial password and hashes `1234` with the first-login flag.
- [ ] Run the new tests and confirm failure.
- [ ] Remove the create-time password field and validation from Admin Members.
- [ ] Make the backend ignore any supplied create-time password, hash exactly `1234`, and set `must_change_credentials=1` for the customer user.
- [ ] Preserve optional admin password edit behavior for existing members.

### Task 3: Customer password completion endpoint

**Files:**
- Modify: `backend/src/routes/authRoutes.js`
- Test: `tools/customer-password-regressions.test.mjs`

**Interfaces:**
- Consumes: authenticated customer `{ newPassword }`.
- Produces: updated `users.password_hash`, mirrored `members.password_hash`, `must_change_credentials=0`, and refreshed customer user view.

- [ ] Add failing endpoint contract tests.
- [ ] Run and confirm failure.
- [ ] Add `POST /auth/complete-customer-password-setup`, customer-only, setup-pending-only, minimum 8 characters.
- [ ] Update both password hashes atomically and clear the setup flag.
- [ ] Return the refreshed user view without issuing a replacement auth token.

### Task 4: First-login password modal and Set Later behavior

**Files:**
- Create: `apps/customer/src/components/auth/CustomerPasswordSetupModal.jsx`
- Modify: `apps/customer/src/context/AuthContext.jsx`
- Modify: `apps/customer/src/components/common/Modal.jsx`
- Modify: `apps/customer/src/App.jsx`
- Test: `tools/customer-password-regressions.test.mjs`

**Interfaces:**
- Consumes: `user.mustChangeCredentials`, current bearer token, `completeCustomerPasswordSetup`, `deferCustomerPasswordSetup`.
- Produces: blocking modal with New Password, Confirm New Password, Submit, Set Later; defer applies only to the current token.

- [ ] Add failing UI/source-contract tests for fields, buttons, token-scoped deferral, and modal non-dismissible behavior.
- [ ] Run and confirm failure.
- [ ] Add optional Modal props for hiding the close button and disabling Escape/backdrop close, defaulting to current behavior for every other modal.
- [ ] Add token-scoped defer bookkeeping in `sessionStorage`; clear it on logout and successful password setup.
- [ ] Add password setup API call and update `user.mustChangeCredentials` to false on success.
- [ ] Render the modal over the authenticated Customer Session view whenever setup is pending and not deferred for the current token.
- [ ] Validate password length and exact confirmation before submission.

### Task 5: Full verification and packaging

**Files:**
- Verify all modified source and regression files.

- [ ] Run all project regression suites.
- [ ] Parse every JS/JSX renderer file and verify relative imports.
- [ ] Run `node --check` on backend/Electron/build JS files.
- [ ] Package the complete source into a new ZIP.
- [ ] Re-extract the exact ZIP and repeat regression/syntax/import verification.
