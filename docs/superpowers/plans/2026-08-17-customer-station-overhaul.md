# Customer Station Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Rebuild the Customer Station into readable Login, Signed-in Idle, and 960×680 Active Session experiences while preserving all existing customer features and backend behavior.

**Architecture:** Keep `CustomerSessionView.jsx` as the state-aware customer shell and `CustomerLoginForm.jsx` as the unauthenticated kiosk entry point. Centralize visual behavior in customer CSS and the shared customer `Modal`, and only change Electron constants/window sizing for ACTIVE mode.

**Tech Stack:** React, Tailwind CSS v4, Lucide React, Electron, Node test runner.

## Global Constraints
- Preserve announcements, feedback, Top Up, Ask for Help, rate plans/promos, shutdown timers, session state, tray behavior, remote lock, warning sounds, and dynamic branding.
- Locked/Login and signed-in Idle remain fullscreen kiosk states.
- ACTIVE mode is exactly 960×680, normal desktop behavior, not always-on-top, skip-taskbar, tray-accessible.
- Use plain language understandable across ages.
- Do not change backend billing/session eligibility behavior.
- Keep the latest Admin work untouched.

---

### Task 1: Lock the Customer redesign with regression tests

**Files:**
- Modify: `tools/customer-regressions.test.mjs`

**Interfaces:**
- Consumes: Customer source files as static regression targets.
- Produces: Failing assertions defining 960×680 ACTIVE mode, plain customer language, announcements/feedback preservation, and shared modal design requirements.

- [x] **Step 1: Add tests for ACTIVE window size and preserved behavior**
- [x] **Step 2: Add tests for customer dashboard labels and Announcement/Feedback presence**
- [x] **Step 3: Add tests for shared modal description/readability/busy-safe close**
- [x] **Step 4: Run `node --test tools/customer-regressions.test.mjs` and confirm the new assertions fail for the expected missing design**

### Task 2: Increase ACTIVE Electron dashboard to 960×680

**Files:**
- Modify: `apps/customer/electron/main.cjs`

**Interfaces:**
- Consumes: Existing `ACTIVE_WIDTH`, `ACTIVE_HEIGHT`, `applyActiveWindowMode` behavior.
- Produces: 960×680 ACTIVE dashboard with all existing state transitions unchanged.

- [x] **Step 1: Change `ACTIVE_WIDTH` to 960 and `ACTIVE_HEIGHT` to 680**
- [x] **Step 2: Run customer regressions and confirm Electron sizing/state tests pass**

### Task 3: Build the shared Customer visual/modal language

**Files:**
- Modify: `apps/customer/src/index.css`
- Modify: `apps/customer/src/components/common/Modal.jsx`
- Modify: `apps/customer/src/components/common/Button.jsx` only if required for 44px customer targets

**Interfaces:**
- Consumes: Existing Aezakmi palette tokens and shared customer modal API.
- Produces: Reusable customer surfaces, KPI/info cards, action tiles, modal description support, readable field/button sizing, and busy-safe close behavior.

- [x] **Step 1: Add customer dashboard utility classes for shells, cards, timer, info tiles, and supporting panels**
- [x] **Step 2: Add optional modal `description` prop and customer-friendly 20px title / ~44px controls**
- [x] **Step 3: Preserve Escape/backdrop/X busy locking**
- [x] **Step 4: Run customer regressions**

### Task 4: Redesign the authenticated Customer Station

**Files:**
- Modify: `apps/customer/src/pages/CustomerSessionView.jsx`

**Interfaces:**
- Consumes: Existing user/session/wallet/PC/rate/help/feedback/announcement data and existing modal components.
- Produces: Fullscreen Idle dashboard and 960×680 Active mini-dashboard using one responsive layout without changing business logic.

- [x] **Step 1: Rebuild the top bar with branding, PC/connection, theme, Announcement/Feedback access, Hide, power controls, and separated Log Out**
- [x] **Step 2: Rebuild identity/session summary with plain labels and readable values**
- [x] **Step 3: Make Time Left / Time Used the dominant active-session card with actionable low-time copy**
- [x] **Step 4: Provide Add Time, Top Up, Ask for Help primary actions while retaining guest restrictions**
- [x] **Step 5: Rebuild signed-in Idle state around Start Session, Wallet/Saved Time, Top Up, Ask for Help, announcements, and active rates**
- [x] **Step 6: Keep Feedback history/detail and power confirmation flows wired to existing functions**
- [x] **Step 7: Run customer regressions**

### Task 5: Redesign Locked/Login without losing public features

**Files:**
- Modify: `apps/customer/src/components/auth/CustomerLoginForm.jsx`

**Interfaces:**
- Consumes: Existing auth, public announcements, public rate plans, pre-login top-up, client IP, fixed shutdown timer.
- Produces: Readable kiosk login layout with preserved public information and plain language.

- [x] **Step 1: Rebuild header and sign-in card with larger inputs/actions**
- [x] **Step 2: Keep station readiness, guest entry, and pre-login Top Up visible**
- [x] **Step 3: Keep all active announcements and public rate plans visible in the supporting panel**
- [x] **Step 4: Reuse the shared Modal for pre-login Top Up instead of a bespoke overlay**
- [x] **Step 5: Preserve the fixed 180-second shutdown timer behavior**
- [x] **Step 6: Run customer regressions**

### Task 6: Align Start/Add Time/Top Up modals with plain customer wording

**Files:**
- Modify: `apps/customer/src/components/customer/StartSessionModal.jsx`
- Modify: `apps/customer/src/components/customer/ExtendSessionModal.jsx`
- Modify: `apps/customer/src/components/customer/TopUpModal.jsx`

**Interfaces:**
- Consumes: Shared Customer `Modal`, current rate math, existing API mutations.
- Produces: Overview-style customer modals with plain wording and unchanged calculations/submission behavior.

- [x] **Step 1: Add concise descriptions and replace technical labels with plain equivalents**
- [x] **Step 2: Rename customer-facing Extend Time wording to Add Time where appropriate without changing function names**
- [x] **Step 3: Keep peso-first extension and existing GCash validation unchanged**
- [x] **Step 4: Run customer regressions**

### Task 7: Full verification and packaging

**Files:**
- Create: `CUSTOMER_STATION_OVERVIEW_OVERHAUL.md`
- Create: updated ZIP in `/mnt/data`

**Interfaces:**
- Consumes: Completed source tree.
- Produces: Verified downloadable archive and concise change note.

- [x] **Step 1: Run `node --test tools/admin-regressions.test.mjs tools/customer-regressions.test.mjs`**
- [x] **Step 2: Parse all Admin + Customer JS/JSX/TS/TSX sources with the existing TypeScript parser check**
- [x] **Step 3: Run `node --check` on backend JS and both Electron main/preload files**
- [x] **Step 4: Scan customer source for preserved Announcements, Feedback, Top Up, Ask for Help, shutdown behavior, and no removed default workflow handlers**
- [x] **Step 5: Create ZIP and run `unzip -t` against the exact archive**
