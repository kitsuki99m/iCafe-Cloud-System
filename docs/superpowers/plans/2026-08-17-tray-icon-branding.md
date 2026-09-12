# Tray Icon Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the old orange Admin and Customer Electron tray icons with the current Midnight Express + Soft White Aktura mark while preserving existing tray behavior and icon paths.

**Architecture:** Keep Electron references unchanged and replace the tray asset files in place. Use the bundled Aktura logo geometry/colors as the single source of truth, and regenerate native PNG tray sizes from the updated SVG assets.

**Tech Stack:** Electron, SVG, PNG, Node regression tests.

## Global Constraints

- Use Midnight Express `#202937` for the tray background.
- Use Soft White `#F5F5F5` for the Aktura mark.
- Preserve transparent/native-safe outer padding and existing rounded-square geometry.
- Do not use dynamically uploaded café branding for native tray icons.
- Preserve all existing Electron tray/window behavior and file paths.

---

### Task 1: Lock tray branding with regression coverage

**Files:**
- Modify: `tools/admin-regressions.test.mjs`
- Modify: `tools/customer-regressions.test.mjs`

**Interfaces:**
- Consumes: existing tray asset paths under each Electron app.
- Produces: tests asserting current branding colors and rejecting the legacy orange/black tray palette.

- [ ] Add tests that read each tray SVG and assert `#202937` and `#F5F5F5` are present and `#E8A33D` / `#0B1017` are absent.
- [ ] Run the targeted regression tests and verify they fail against the legacy assets.

### Task 2: Replace tray assets

**Files:**
- Modify: `apps/admin/electron/tray-icon.svg`
- Modify: `apps/admin/electron/tray-icon-16.png`
- Modify: `apps/admin/electron/tray-icon-32.png`
- Modify: `apps/admin/electron/tray-icon-48.png`
- Modify: `apps/customer/electron/tray-icon.svg`
- Modify: `apps/customer/electron/tray-icon-32.png`

**Interfaces:**
- Consumes: `apps/admin/src/assets/aktura-logo.svg` and `apps/customer/src/assets/aktura-logo.svg` geometry/colors.
- Produces: native tray assets at the same paths already consumed by Electron.

- [ ] Copy the current Aktura mark/colors into both tray SVGs.
- [ ] Regenerate PNG sizes from the updated vector artwork.
- [ ] Run targeted regressions and verify they pass.

### Task 3: Verify and package

**Files:**
- Create: `TRAY_ICON_BRANDING_UPDATE.md`
- Create: `/mnt/data/Frontend_Electron_Fixed_New_Tray_Logo.zip`

**Interfaces:**
- Consumes: completed source tree.
- Produces: verified distributable source ZIP and change note.

- [ ] Run full Admin + Customer regressions.
- [ ] Run frontend parser checks and backend/Electron syntax checks.
- [ ] Validate generated PNG dimensions and non-empty transparency/alpha data.
- [ ] Package the source tree and run ZIP integrity verification.
