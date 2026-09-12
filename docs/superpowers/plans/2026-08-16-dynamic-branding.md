# Dynamic Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use the backend public branding settings as the single dynamic logo/name source for admin layout/login and CustomerSessionView, with bundled logos only as fallbacks.

**Architecture:** Both admin and customer `useBranding()` hooks fetch `/public/settings`, normalize the versioned backend `logoUrl`, cache only a startup snapshot, and listen for `aezakmi:branding-updated` so mounted consumers refresh immediately. Admin Settings emits that event after saving; consumers no longer maintain separate logo caches or hard-code the bundled logo as their primary source.

**Tech Stack:** React, Vite, existing `apiGet`/`apiUrl` helpers, DOM CustomEvent, Node test runner.

## Global Constraints

- Keep `/api/public/branding/logo?v=<version>` as the authoritative logo URL.
- Preserve bundled `aktura-logo.svg` only as a missing/error fallback.
- Do not add a remote arbitrary-URL branding field.
- Do not change PDF branding behavior.

---

### Task 1: Shared branding hooks

**Files:**
- Modify: `apps/admin/src/hooks/useBranding.js`
- Modify: `apps/customer/src/hooks/useBranding.js`
- Test: `tools/admin-regressions.test.mjs`
- Test: `tools/customer-regressions.test.mjs`

**Interfaces:**
- Consumes: `apiGet('/public/settings')`, `apiUrl(relativePath)` and `aezakmi:branding-updated` event details.
- Produces: `useBranding()` returning `{ cafeName, branch, branchLocation, logoUrl, ...settings }` with an absolute/versioned logo URL.

- [ ] Add failing tests proving both hooks listen for branding updates and refetch public settings.
- [ ] Run targeted regression tests and confirm failure.
- [ ] Add a `loadBranding()` path and event listener to both hooks.
- [ ] Re-run targeted tests and confirm pass.

### Task 2: Admin consumers

**Files:**
- Modify: `apps/admin/src/components/layout/MainLayout.jsx`
- Modify: `apps/admin/src/components/auth/LoginForm.jsx`
- Test: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Consumes: `useBranding().logoUrl/cafeName/branch/branchLocation`.
- Produces: dynamically branded admin sidebar and login screen.

- [ ] Add failing tests that reject `aezakmi.branding.logoUrl` sidebar storage and hard-coded primary login logo usage.
- [ ] Run tests and confirm failure.
- [ ] Replace local branding state/cache with `useBranding()`.
- [ ] Change LoginForm logo/name to `useBranding()` with bundled fallback only in `src` fallback and `onError`.
- [ ] Re-run tests and confirm pass.

### Task 3: CustomerSessionView consumer

**Files:**
- Modify: `apps/customer/src/pages/CustomerSessionView.jsx`
- Test: `tools/customer-regressions.test.mjs`

**Interfaces:**
- Consumes: `useBranding().logoUrl/cafeName/branch`.
- Produces: customer active/idle session header that updates with current branding.

- [ ] Add failing test proving CustomerSessionView uses `useBranding()` rather than `settings.logoUrl` for header branding.
- [ ] Run test and confirm failure.
- [ ] Wire the hook into CustomerSessionView and remove duplicated title/logo URL handling.
- [ ] Re-run tests and confirm pass.

### Task 4: Verification and package

**Files:**
- Verify all changed JS/JSX and regression suites.
- Create: updated shipping ZIP.

- [ ] Run admin and customer regression suites.
- [ ] Parse all admin/customer JS/JSX source.
- [ ] Run backend/Electron syntax checks relevant to unchanged integration safety.
- [ ] Create ZIP and run archive integrity verification.
