# Admin Space + Modal Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Maximize the Admin Earnings workspace at 1920×1080, compact the shared Admin header, and make every Admin modal inherit the Overview typography and spacing system.

**Architecture:** Keep business logic unchanged. Recompose Earnings so action controls live in the main column and the sticky rail contains only persistent context. Apply header/modal density through shared `MainLayout`, `Modal`, and `index.css` tokens so existing workflows inherit the new layout without per-feature forks.

**Tech Stack:** React, Tailwind utility classes, shared CSS component tokens, Node regression tests.

## Global Constraints

- Admin-only visual/layout changes; do not redesign Customer/Electron.
- Preserve all existing Earnings calculations and mutation APIs.
- Avoid nested vertical scrolling in the Earnings content panel at 1920×1080; page/main scrolling remains the single scroll owner when content genuinely exceeds the viewport.
- Preserve modal busy-state protections for Escape, backdrop, close, and duplicate submits.
- Follow Overview typography: compact eyebrow, strong restrained title, minimal helper text, Midnight primary actions, Soft White neutral surfaces.

---

### Task 1: Earnings viewport composition

**Files:**
- Modify: `apps/admin/src/pages/EarningsPage.jsx`
- Modify: `apps/admin/src/index.css`
- Test: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Consumes: existing `createReport`, `load`, `setModal`, `AdminPageWorkspace`, `AdminRailCard`.
- Produces: `earnings-primary-actions`, `earnings-content-stack`, and an expense table without nested vertical scrolling.

- [ ] Add failing regression assertions that Reporting Tools and Expense Controls render before Revenue Sources and no longer live in the sticky rail.
- [ ] Add a failing assertion that Expense Logs does not use `max-h-[60vh] overflow-auto`.
- [ ] Move reporting/expense controls into a compact horizontal action area above Revenue Sources.
- [ ] Keep the sticky rail ordered Income Snapshot → Reporting Period → Wallet-funded Usage → Period Context.
- [ ] Remove nested vertical table scrolling and tighten vertical spacing for 1920×1080.
- [ ] Run Admin regressions.

### Task 2: Compact shared Admin header

**Files:**
- Modify: `apps/admin/src/components/layout/MainLayout.jsx`
- Modify: `apps/admin/src/components/layout/AdminPageWorkspace.jsx`
- Modify: `apps/admin/src/index.css`
- Test: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Consumes: existing Quick Find, Feedback, notifications, announcements, theme, lock, profile controls.
- Produces: a 92–96px non-Overview header and matching sticky rail offset.

- [ ] Add failing regression assertions for the compact header height and reduced sticky rail offset.
- [ ] Reduce header padding/title/description sizes while preserving all utilities.
- [ ] Update sticky rail top offset so it follows the compact header.
- [ ] Run Admin regressions.

### Task 3: Compact Overview-pattern modal system

**Files:**
- Modify: `apps/admin/src/components/common/Modal.jsx`
- Modify: `apps/admin/src/components/common/ConfirmModal.jsx`
- Modify: `apps/admin/src/index.css`
- Test: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Consumes: all existing Admin `<Modal>` and `<ConfirmModal>` callers.
- Produces: compact shared modal typography, body/footer spacing, input density, and `admin-modal-description` support without changing caller logic.

- [ ] Add failing regressions for 18–19px modal titles, compact header/body/footer spacing, and lower input height.
- [ ] Add optional `description` rendering to the shared Modal header so future/complex workflows can use Overview-style helper copy without custom headers.
- [ ] Tighten modal shell radius, header/body/footer padding, field height, textarea height, and maximum body height.
- [ ] Keep busy-safe close semantics unchanged.
- [ ] Tighten ConfirmModal alert treatment to match Overview surfaces.
- [ ] Run full Admin + Customer regression suites and parse/syntax checks.
