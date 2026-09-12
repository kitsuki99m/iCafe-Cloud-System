# Admin + Customer Login Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the routed Admin Login and Customer/User Login screens into the same compact Overview-inspired visual system while preserving every existing authentication and pre-login workflow.

**Architecture:** Keep authentication/data logic in the existing `AdminLoginForm.jsx` and `CustomerLoginForm.jsx`. Change only composition, typography, and shared page-specific CSS classes. The Admin screen becomes a responsive brand/context panel plus focused auth card; Customer Login keeps its member form + support rail but gains a clearer header/action hierarchy and denser 1080p-friendly sizing.

**Tech Stack:** React, Tailwind CSS v4 utility classes, existing Admin/Customer context hooks, Node regression tests.

## Global Constraints

- Preserve Admin PIN and Username + Password authentication.
- Preserve backend status/retry and dynamic branding on Admin Login.
- Preserve Customer username/password sign-in, guest entry, pre-login Top Up, GCash validation, public announcements, all active public rates, client IP display, theme toggle, and fixed 180-second shutdown grace period.
- Preserve existing post-login Announcements and Feedback workflows.
- Use plain language understandable across age groups.
- Use the approved Midnight Express / Soft White / warm-support palette and Overview typography hierarchy.
- Do not change backend authentication behavior.

---

### Task 1: Admin Login composition

**Files:**
- Modify: `apps/admin/src/components/auth/AdminLoginForm.jsx`
- Modify: `apps/admin/src/index.css`
- Test: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Consumes: `useBranding()`, `useBackendStatus()`, `loginAdminPin()`, `loginAdminPassword()`.
- Produces: `admin-login-shell`, `admin-login-grid`, `admin-login-context`, and `admin-login-card` visual contract.

- [ ] Write a regression test that requires the new Admin Login classes and preserved PIN/password/backend-status tokens.
- [ ] Run the Admin regression suite and confirm the new test fails.
- [ ] Recompose Admin Login into the Overview-style responsive two-panel layout without changing submit logic.
- [ ] Add compact responsive login CSS.
- [ ] Run the Admin regression suite and confirm it passes.

### Task 2: Customer/User Login composition

**Files:**
- Modify: `apps/customer/src/components/auth/CustomerLoginForm.jsx`
- Modify: `apps/customer/src/index.css`
- Test: `tools/customer-regressions.test.mjs`

**Interfaces:**
- Consumes: existing login/top-up/guest/announcement/rate-plan data flows.
- Produces: compact `customer-login-header`, `customer-login-actions`, and clearer member/support hierarchy.

- [ ] Write a regression test requiring the redesigned customer login hierarchy and preserved pre-login workflows.
- [ ] Run the Customer regression suite and confirm the new test fails.
- [ ] Update the Customer Login header, member card, support rail, and plain-language copy while preserving logic.
- [ ] Add responsive 1080p-friendly customer login CSS.
- [ ] Run the Customer regression suite and confirm it passes.

### Task 3: Verification and packaging

**Files:**
- Create: `LOGIN_SCREENS_OVERVIEW_OVERHAUL.md`

**Interfaces:**
- Consumes: completed Admin and Customer login redesigns.
- Produces: verified source ZIP.

- [ ] Run Admin + Customer regression suites together.
- [ ] Parse all Admin/Customer JS/JSX/TS/TSX sources using the installed TypeScript parser.
- [ ] Run `node --check` across backend JS and Electron CJS/JS files.
- [ ] Audit routed login imports to confirm the redesigned components are the live screens.
- [ ] Write the concise change note.
- [ ] Package the source tree and run `unzip -t` on the exact ZIP.
