# Admin Overview-Pattern Complete Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Clients, Rates, Members, Earnings, Analytics, and Logs around the same main-workspace/right-rail visual and interaction pattern as Overview.

**Architecture:** Add shared `AdminPageWorkspace`, `AdminRailCard`, `AdminMetricCard`, and `AdminEmptyState` primitives, then migrate each page without changing backend contracts or core business logic. Right rails expose summaries and quick actions derived from each page's already-loaded data.

**Tech Stack:** React 19, React Router, Tailwind CSS v4, Lucide React, Node test runner.

## Global Constraints
- Overview is the visual source of truth.
- Soft White `#F5F5F5` is the dominant light-mode surface.
- Midnight Express `#202937` is the main structural/interactive brand color.
- Warm palette colors are supporting accents, not large page backgrounds.
- Preserve all existing backend APIs, IDs, rate/session/wallet logic, modals, SidePanels, and popovers.
- Do not modify Customer/Electron UI in this pass.
- Do not add new backend schema or mock data.

---

### Task 1: Regression gates and shared page primitives

**Files:**
- Create: `apps/admin/src/components/layout/AdminPageWorkspace.jsx`
- Modify: `apps/admin/src/index.css`
- Modify: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Produces: `AdminPageWorkspace`, `AdminRailCard`, `AdminMetricCard`, `AdminEmptyState`.

- [ ] Add failing regressions requiring all target pages to import/use `AdminPageWorkspace` and requiring the shared responsive two-column workspace classes.
- [ ] Run `node --test tools/admin-regressions.test.mjs` and confirm failure is caused by the missing new layout.
- [ ] Implement the shared primitives using existing Overview variables and responsive stacking.
- [ ] Add CSS utilities for page main column, utility rail, metric grids, compact rail buttons, and low-density empty states.
- [ ] Re-run targeted Admin regressions.

### Task 2: Clients migration

**Files:**
- Modify: `apps/admin/src/pages/FloorMatrix.jsx`

**Interfaces:**
- Consumes: shared page primitives.
- Produces: Overview-pattern Clients workspace and station utility rail.

- [ ] Add status metric strip from existing `stats`.
- [ ] Keep search/status/bulk toolbar in main column.
- [ ] Keep station grid and station SidePanel behavior unchanged.
- [ ] Add right rail with cafe capacity, quick actions, and attention counts derived from current `pcs`.
- [ ] Verify existing Floor Matrix regression checks.

### Task 3: Rates migration

**Files:**
- Modify: `apps/admin/src/pages/TariffsPage.jsx`

**Interfaces:**
- Produces: Overview-pattern Rates workspace with pricing utility rail.

- [ ] Keep all Create/Edit/Delete/Session Policy/Postpaid flows unchanged.
- [ ] Move KPI strip and rate list into the main column.
- [ ] Add right rail for plan counts, tier mix, Session Policy, Postpaid, and New Rate Plan quick actions.
- [ ] Keep archive/status/tier logic intact.

### Task 4: Members migration

**Files:**
- Modify: `apps/admin/src/pages/MembersPage.jsx`

**Interfaces:**
- Produces: member workspace with member summary rail.

- [ ] Preserve member table, bulk actions, wallet/time transfers, and detail SidePanel.
- [ ] Reformat KPI strip to Overview-style metrics.
- [ ] Add right rail for active members, wallet total, tier distribution, and Add Member shortcut.

### Task 5: Earnings migration

**Files:**
- Modify: `apps/admin/src/pages/EarningsPage.jsx`

**Interfaces:**
- Produces: financial workspace with report/usage utility rail.

- [ ] Preserve period/date controls and PDF/expense flows.
- [ ] Keep revenue/expense calculations unchanged.
- [ ] Add right rail for wallet-funded prepaid/postpaid usage, report actions, expense actions, and period context.
- [ ] Keep non-additive wallet usage wording explicit.

### Task 6: Analytics migration

**Files:**
- Modify: `apps/admin/src/pages/AnalyticsPage.jsx`

**Interfaces:**
- Produces: chart-focused workspace plus derived insights rail.

- [ ] Keep current API/range and chart calculations.
- [ ] Make financial chart the primary main-column card.
- [ ] Add right rail with derived utilization/traffic/rate-plan insights using only current dataset.
- [ ] Keep secondary traffic/mix content visually aligned.

### Task 7: Logs migration

**Files:**
- Modify: `apps/admin/src/pages/LogsPage.jsx`

**Interfaces:**
- Produces: audit workspace with category/filter utility rail.

- [ ] Preserve search/filter/table/pagination and detail SidePanel.
- [ ] Add top audit metrics derived from loaded logs.
- [ ] Add right rail with action counts, latest event, and click-to-filter shortcuts.

### Task 8: Global header rhythm and final visual alignment

**Files:**
- Modify: `apps/admin/src/components/layout/MainLayout.jsx`
- Modify: `apps/admin/src/index.css`

**Interfaces:**
- Produces: non-Overview header spacing/proportions matching Overview.

- [ ] Increase non-Overview header rhythm and align control sizes with Overview.
- [ ] Ensure page workspace begins directly below header without oversized blank regions.
- [ ] Verify right rails and headers collapse correctly below XL.

### Task 9: Verification and packaging

**Files:**
- Create: `ADMIN_OVERVIEW_PATTERN_COMPLETE.md`

**Interfaces:**
- Produces: final verified ZIP.

- [ ] Run `node --test tools/admin-regressions.test.mjs tools/customer-regressions.test.mjs`.
- [ ] Parse all Admin/Customer JS/JSX source.
- [ ] Run Node syntax checks for backend and Electron JS/CJS.
- [ ] Scan target pages for `AdminPageWorkspace` coverage and unintended old large warm backgrounds.
- [ ] Package workspace into a new ZIP and run `unzip -t` integrity verification.
