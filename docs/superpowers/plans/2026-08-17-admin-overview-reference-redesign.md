# Admin Overview Reference Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Admin Overview using the approved reference-inspired three-zone dashboard layout without changing existing business logic.

**Architecture:** Keep the existing React Router/Admin shell and backend overview endpoint. Restyle MainLayout's sidebar and suppress its generic header on `/`; move the reference-style Overview header, feedback modal trigger, operational cards, right status rail, and live activity composition into OverviewPage. Reuse AppDataContext for realtime operational state.

**Tech Stack:** React, React Router, Tailwind CSS v4, Lucide React, existing AppDataContext/API helpers.

## Global Constraints
- Preserve all current Admin routes and existing functionality.
- Keep the approved Aezakmi palette and semantic status colors.
- Do not duplicate backend business calculations.
- Feedback must use the existing FeedbackInboxModal.
- Seven-day revenue must keep the existing normalization/scale helpers.
- No new runtime dependency.

---

### Task 1: Add failing regression coverage for the redesigned Overview

**Files:**
- Modify: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Consumes: `OverviewPage.jsx`, `MainLayout.jsx` source.
- Produces: regression assertions for the new layout contract.

- [ ] Add tests asserting Overview reads `pcs`, `topUpRequests`, and `supportRequests` from `useAppData()`.
- [ ] Assert Overview contains a right utility rail and top-header Feedback button opening `FeedbackInboxModal`.
- [ ] Assert the old `Feedback inbox` large Panel title is absent.
- [ ] Assert MainLayout conditionally suppresses its generic header on `/`.
- [ ] Run `node --test tools/admin-regressions.test.mjs` and confirm the new assertions fail before implementation.

### Task 2: Restyle Admin shell and Overview-specific header ownership

**Files:**
- Modify: `apps/admin/src/components/layout/MainLayout.jsx`
- Modify: `apps/admin/src/index.css`

**Interfaces:**
- Consumes: current route from `useLocation()`.
- Produces: reference-inspired sidebar and `isOverview` conditional header behavior.

- [ ] Add `isOverview = location.pathname === '/'`.
- [ ] Keep generic Admin header for non-Overview pages only.
- [ ] Restyle sidebar brand/nav/footer proportions using existing palette tokens.
- [ ] Add reusable overview shell/card CSS utilities only where Tailwind composition would become unreadable.
- [ ] Run Admin regression tests.

### Task 3: Rebuild Overview composition

**Files:**
- Modify: `apps/admin/src/pages/OverviewPage.jsx`

**Interfaces:**
- Consumes: `/dashboard/overview`, `useAppData()` (`pcs`, `topUpRequests`, `supportRequests`, `settings`, `serverError`), existing FeedbackInboxModal, AdminNotificationCenter, AnnouncementCenter, ThemeContext/AuthContext for header controls.
- Produces: reference-inspired Overview header, KPI cards, operational center, right utility rail, feedback modal trigger.

- [ ] Replace the existing flat 12-column Panel grid with a main+rail layout.
- [ ] Add Overview-owned greeting header with Feedback, notification, announcement, theme, and lock-compatible navigation utility treatment without duplicating business state.
- [ ] Keep Available/In Use/Maintenance KPI buttons wired to existing `/clients?status=...` routes.
- [ ] Build compact floor preview from `pcs`.
- [ ] Keep `RevenueBar` and Full analytics navigation.
- [ ] Add sessions-ending-soon list from active Overview sessions.
- [ ] Add quick-action buttons for Clients, Members, Rates, and Earnings.
- [ ] Add right week/date card, PC summary, and live activity assembled from active sessions/pending top-ups/open support requests.
- [ ] Remove the large Feedback panel and retain FeedbackInboxModal triggered from the header.
- [ ] Run Admin regression tests until green.

### Task 4: Verify full project integrity

**Files:**
- No production changes expected.

**Interfaces:**
- Consumes: entire modified source tree.
- Produces: verification evidence and shipping ZIP.

- [ ] Run customer and admin regression suites.
- [ ] Parse every frontend JS/JSX file with the existing parser verification approach.
- [ ] Run Node syntax checks on backend JS and Electron main/preload files.
- [ ] Create `OVERVIEW_REFERENCE_REDESIGN.md` summarizing user-visible changes and limitations.
- [ ] Package the project and run ZIP integrity verification.
