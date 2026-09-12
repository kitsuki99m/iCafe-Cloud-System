# Admin Dashboard Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the reference-inspired Overview layout and interaction model throughout Admin, including robust popovers/drawers and useful operational navigation.

**Architecture:** Add shared `AnchoredPopover`, `SidePanel`, and `QuickFind` components. Use those primitives from the existing shell and pages, then move each page to a common `admin-page-content` visual system without changing backend contracts.

**Tech Stack:** React 19, React Router, Tailwind CSS 4, Lucide React, existing AppDataContext/backend APIs.

## Global Constraints
- Leave `apps/customer` behavior unchanged.
- Preserve all existing admin routes and backend contracts.
- Preserve the approved Aezakmi palette and dynamic branding.
- Preserve existing modal busy-state protections.
- Preserve existing session/rate/wallet regression behavior.

---

### Task 1: Shared overlay primitives
**Files:**
- Create: `apps/admin/src/components/common/AnchoredPopover.jsx`
- Create: `apps/admin/src/components/common/SidePanel.jsx`
- Modify: `apps/admin/src/components/bulk/BulkActionsDropdown.jsx`
- Modify: `apps/admin/src/components/admin/AdminNotificationCenter.jsx`
- Test: `tools/admin-regressions.test.mjs`

- [ ] Write regression checks for portal anchoring, viewport clamping, scroll/resize repositioning, and bulk/notification adoption.
- [ ] Run tests and confirm those checks fail against the old fixed/absolute positioning.
- [ ] Implement the shared primitives and migrate the two popovers.
- [ ] Run targeted regressions and confirm they pass.

### Task 2: Unified Admin shell and Quick Find
**Files:**
- Create: `apps/admin/src/components/admin/AdminQuickFind.jsx`
- Modify: `apps/admin/src/components/layout/MainLayout.jsx`
- Modify: `apps/admin/src/index.css`
- Test: `tools/admin-regressions.test.mjs`

- [ ] Add failing checks for the reference-style non-Overview header and Quick Find.
- [ ] Implement PC/member search with direct navigation to Clients/Members.
- [ ] Add shared page/card/table CSS tokens and responsive shell behavior.
- [ ] Verify regressions.

### Task 3: Clients right-side station detail rail
**Files:**
- Modify: `apps/admin/src/pages/FloorMatrix.jsx`
- Test: `tools/admin-regressions.test.mjs`

- [ ] Add failing checks ensuring the manual PC popover geometry is gone and SidePanel is used.
- [ ] Replace the floating action menu with station detail state tied to the existing `?pc=` deep-link.
- [ ] Keep all start/manage/add/reduce/transfer/lock/power/edit actions available from the rail.
- [ ] Verify Floor Matrix filter/deep-link regressions.

### Task 4: Members and Logs detail workflows
**Files:**
- Modify: `apps/admin/src/pages/MembersPage.jsx`
- Modify: `apps/admin/src/pages/LogsPage.jsx`
- Test: `tools/admin-regressions.test.mjs`

- [ ] Add member KPI summary and member detail SidePanel while retaining existing mutation modals.
- [ ] Add Logs search/action filters and row detail SidePanel.
- [ ] Verify ID/busy/pagination regressions.

### Task 5: Remaining page visual overhaul
**Files:**
- Modify: `apps/admin/src/pages/TariffsPage.jsx`
- Modify: `apps/admin/src/pages/EarningsPage.jsx`
- Modify: `apps/admin/src/pages/AnalyticsPage.jsx`
- Modify: `apps/admin/src/pages/SettingsPage.jsx`
- Modify: `apps/admin/src/index.css`
- Test: `tools/admin-regressions.test.mjs`

- [ ] Move each page to the shared reference-style content width/spacing/card language.
- [ ] Add Settings section navigator and visual anchors without changing save logic.
- [ ] Preserve Rates HH:MM, Earnings wallet-funded usage, and Analytics data behavior.
- [ ] Verify all regressions.

### Task 6: Final verification and package
**Files:**
- Create: `ADMIN_DASHBOARD_OVERHAUL.md`

- [ ] Run full admin/customer regression suites.
- [ ] Parse every frontend JS/JSX source file.
- [ ] Run backend/Electron Node syntax checks.
- [ ] Check ZIP integrity after packaging.
