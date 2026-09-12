# Rates and Earnings Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align Rates and Earnings with the Overview visual system while giving each page a workflow-specific sticky navigation/context column.

**Architecture:** Rates becomes a Settings-style two-column page: a sticky 220px left configuration rail containing KPIs, session controls, and tier coverage, with rate-plan content using the remaining width. Earnings keeps `AdminPageWorkspace` with its sticky right rail, but the main column promotes Expense Logs into a large accounting table and moves period selection/context into the sticky rail.

**Tech Stack:** React, Tailwind CSS utility classes, shared Admin components (`AdminMetricCard`, `AdminRailCard`, `AdminPageWorkspace`, `Modal`), Node regression scripts.

## Global Constraints

- Preserve all existing pricing, session-policy, wallet, expense, reporting, and PDF-generation business logic.
- Preserve the shared Overview palette and typography tokens.
- Do not redesign Customer/Electron UI.
- Keep existing modal behavior and busy-state protections.
- Rates left rail must remain visible while scrolling on desktop and collapse naturally on smaller screens.
- Earnings right rail must remain sticky on desktop, with Period Context as its final card.

---

### Task 1: Add failing layout regressions

**Files:**
- Modify: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Consumes: `TariffsPage.jsx`, `EarningsPage.jsx` source structure.
- Produces: regression requirements for sticky Rates rail and scaled Earnings Expense Logs.

- [ ] Add a regression requiring Rates to remove `Pricing snapshot`, use a sticky left rail, place the four KPI metrics inside that rail, and put Session Controls and Tier Coverage below them.
- [ ] Add a regression requiring Earnings to keep a sticky right rail, place Period Context last, and expose a large `Expense logs` workspace with its own toolbar/count/table.
- [ ] Run `node --test tools/admin-regressions.test.mjs` and confirm the new tests fail for the expected old layout.

### Task 2: Recompose Rates around a sticky Settings-style left rail

**Files:**
- Modify: `apps/admin/src/pages/TariffsPage.jsx`

**Interfaces:**
- Consumes: existing rate counts, tier counts, policy actions, filters, plan cards, modals.
- Produces: `rates-settings-layout`, `rates-sticky-rail`, unchanged mutation functions.

- [ ] Remove the `Pricing snapshot` utility rail and stop passing Rates through `AdminPageWorkspace aside={...}`.
- [ ] Build a responsive `xl:grid-cols-[220px_minmax(0,1fr)]` page frame.
- [ ] Put Active Plans, Customer-ready, Total Plans, Premium Plans into compact sticky-rail stat rows/cards.
- [ ] Put Session Policy, Postpaid Rate, and New Rate Plan immediately below the metrics.
- [ ] Put Tier Coverage below Session Controls with Regular/Gold/VIP counts and hierarchy note.
- [ ] Keep filters/search and rate-plan cards in the main column.
- [ ] Run the Admin regression suite and verify Rates tests pass.

### Task 3: Promote Earnings Expense Logs and reorganize sticky context

**Files:**
- Modify: `apps/admin/src/pages/EarningsPage.jsx`

**Interfaces:**
- Consumes: existing earnings data, wallet usage, expenses, report generation, expense modals.
- Produces: wide expense log table plus sticky financial control rail.

- [ ] Move period segmented controls/date selection from the main toolbar into a `Reporting period` rail card near the top.
- [ ] Keep Wallet-funded usage as an important sticky rail card.
- [ ] Keep reporting controls and expense controls below it.
- [ ] Make `Period context` the final sticky rail card.
- [ ] Keep financial KPIs in the main column.
- [ ] Keep Revenue Breakdown as a compact main-column card.
- [ ] Replace the old half-width `Expense breakdown` with a full-width `Expense logs` accounting section with title, record count, Add Expense action, scrollable table, stronger row spacing, and visible totals/context.
- [ ] Run the Admin regression suite and verify Earnings tests pass.

### Task 4: Typography and final verification

**Files:**
- Modify only if needed: `apps/admin/src/pages/TariffsPage.jsx`, `apps/admin/src/pages/EarningsPage.jsx`, `apps/admin/src/index.css`

**Interfaces:**
- Consumes: Overview typography (`eyebrow`, `stat-figure`, `overview-card`, `admin-rail-card`).
- Produces: consistent Rates/Earnings visual hierarchy.

- [ ] Normalize page section headings to Overview-style `text-sm`/`text-base` semibold hierarchy and small tracked eyebrow labels.
- [ ] Run `node --test tools/admin-regressions.test.mjs` and `node --test tools/customer-regressions.test.mjs`.
- [ ] Parse all frontend JS/JSX files and run backend/Electron syntax checks.
- [ ] Package the exact verified source into a new ZIP and run `unzip -t`.
