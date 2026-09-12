# Admin Overview Visual System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all Admin pages use the Overview visual hierarchy, with neutral light surfaces dominating and warm palette colors used as accents.

**Architecture:** Keep the existing Admin shell, business components, routes, drawers, modals, and popovers. Change the shared light-mode surface tokens and add reusable Admin visual utility classes, then migrate page-specific search, segmented control, and empty-state markup to those classes.

**Tech Stack:** React, Vite, Tailwind CSS v4, Lucide React, Node test runner.

## Global Constraints
- Preserve all current Admin business logic, navigation, IDs, backend contracts, and overlay behavior.
- Do not modify Customer/Electron UI in this pass.
- Preserve Midnight Express `#202937` as the primary light-mode brand color.
- Preserve semantic success/warning/error colors.
- Keep secondary light-mode text at Bluish Black `#423D42` for contrast.

---

### Task 1: Lock the visual hierarchy with regressions

**Files:**
- Modify: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Consumes: Admin CSS and page source text.
- Produces: regression coverage for neutral surfaces, shared search/segment utilities, and compact Clients empty state.

- [ ] **Step 1: Add failing tests** asserting `--color-surface: #F5F5F5`, warm raised surfaces are secondary, Clients uses `admin-search-field`, `admin-segmented-control`, and `admin-empty-state-card`, and the old full-width `panel px-6 py-12 text-center` empty state is absent.
- [ ] **Step 2: Run `node --test tools/admin-regressions.test.mjs` and confirm the new tests fail for the intended visual reasons.**

### Task 2: Centralize Overview-matching surface utilities

**Files:**
- Modify: `apps/admin/src/index.css`

**Interfaces:**
- Produces: `admin-search-field`, `admin-segmented-control`, `admin-empty-state-stage`, `admin-empty-state-card`, and neutral light-mode surface tokens.

- [ ] **Step 1: Make light-mode `surface` neutral Soft White and reduce warm-area dominance while keeping dark-mode tokens intact.**
- [ ] **Step 2: Add reusable search, segmented, and empty-state utility classes based on Overview card variables.**
- [ ] **Step 3: Re-run the new visual regressions and verify they move toward green.**

### Task 3: Make Clients the reference implementation

**Files:**
- Modify: `apps/admin/src/pages/FloorMatrix.jsx`

**Interfaces:**
- Consumes: visual utility classes from Task 2.
- Produces: neutral toolbar controls and compact centered empty-state card.

- [ ] **Step 1: Replace local warm search/filter wrappers with `admin-search-field` and `admin-segmented-control`.**
- [ ] **Step 2: Replace the large full-width beige empty panel with `admin-empty-state-stage` containing `admin-empty-state-card`.**
- [ ] **Step 3: Run Admin regressions and verify Clients-specific tests pass.**

### Task 4: Propagate the same visual language to remaining Admin pages

**Files:**
- Modify: `apps/admin/src/pages/TariffsPage.jsx`
- Modify: `apps/admin/src/pages/MembersPage.jsx`
- Modify: `apps/admin/src/pages/EarningsPage.jsx`
- Modify: `apps/admin/src/pages/AnalyticsPage.jsx`
- Modify: `apps/admin/src/pages/LogsPage.jsx`
- Modify: `apps/admin/src/pages/SettingsPage.jsx`

**Interfaces:**
- Consumes: shared visual utility classes from Task 2.
- Produces: consistent neutral search fields/segmented controls and Overview-style empty states without business-flow changes.

- [ ] **Step 1: Convert search controls and segmented filters to the shared utility classes where applicable.**
- [ ] **Step 2: Convert oversized page-level empty states to the compact Overview-style empty-state treatment.**
- [ ] **Step 3: Keep warm fills only for small status/accent blocks and hover states.**

### Task 5: Verify and package

**Files:**
- Modify: `ADMIN_VISUAL_SYSTEM_ALIGNMENT.md`

**Interfaces:**
- Produces: verified ZIP artifact and concise change record.

- [ ] **Step 1: Run `node --test tools/admin-regressions.test.mjs tools/customer-regressions.test.mjs`.**
- [ ] **Step 2: Parse all frontend JS/JSX sources and run backend/Electron syntax checks.**
- [ ] **Step 3: Scan Admin page source for the old oversized Clients empty-state pattern and unintended page-level warm fills.**
- [ ] **Step 4: Package the isolated workspace into a new ZIP and run ZIP integrity verification.**
