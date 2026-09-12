# Admin Dark Secondary Gold Accent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply `#C9B27A` to Admin dark-mode secondary text and Analytics secondary chart text without changing light mode or semantic status colors.

**Architecture:** Keep the change centralized in the Admin theme token `--color-slate-soft`, which already drives secondary UI text throughout the dashboard. Update the one Chart.js color path that bypasses CSS tokens so Analytics matches the same accent.

**Tech Stack:** React, Tailwind CSS v4 theme variables, Chart.js, Node test runner.

## Global Constraints
- Dark secondary text uses exactly `#C9B27A`.
- Light secondary text remains `#423D42`.
- Primary text remains Soft White in dark mode.
- Do not change Customer Station, backend, authentication, session behavior, or semantic status colors.

---

### Task 1: Add regression guard

**Files:**
- Modify: `tools/admin-regressions.test.mjs`

**Interfaces:**
- Consumes: Admin CSS theme variables and Analytics chart theme constants.
- Produces: regression coverage for the approved champagne-gold dark secondary text.

- [ ] Add a test that expects dark `--color-slate-soft: #C9B27A`, light `--color-slate-soft: #423D42`, and Analytics dark `chartTextColor` to use `#C9B27A`.
- [ ] Run the Admin regression suite and confirm the new test fails for the old `#D4C1B9` value.

### Task 2: Apply centralized dark secondary accent

**Files:**
- Modify: `apps/admin/src/index.css`
- Modify: `apps/admin/src/pages/AnalyticsPage.jsx`

**Interfaces:**
- Consumes: existing `text-slate-soft` utilities and `isDark` Analytics theme state.
- Produces: consistent champagne-gold secondary copy across Admin dark mode and chart labels.

- [ ] Set dark `--color-slate-soft` to `#C9B27A`.
- [ ] Set dark Analytics `chartTextColor` to `#C9B27A`.
- [ ] Run Admin regressions and confirm green.

### Task 3: Verify and package

**Files:**
- Create: `ADMIN_DARK_SECONDARY_GOLD_ACCENT.md`

**Interfaces:**
- Consumes: completed source tree.
- Produces: verified distributable ZIP.

- [ ] Run Admin + Customer regressions.
- [ ] Parse all frontend source files.
- [ ] Run backend and Electron syntax checks.
- [ ] Package the exact source tree and run ZIP integrity verification.
