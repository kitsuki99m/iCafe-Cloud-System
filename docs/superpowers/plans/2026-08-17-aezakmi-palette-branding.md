# Aezakmi Palette Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved brand palette across Admin and Customer UI, with Midnight Express prominent in light mode and the Aktura fallback logo recolored to match.

**Architecture:** Keep existing Tailwind semantic token names so the broad UI updates through two centralized `index.css` files. Only patch components/assets that bypass those tokens: shared Button variants, semantic warning toast styling, Analytics hard-coded chart brand color, and the two Aktura SVG fallbacks.

**Tech Stack:** React, Tailwind CSS v4 `@theme`, Vite source, SVG assets, Node regression scripts.

## Global Constraints
- Light base/white is `#F5F5F5`.
- Midnight Express `#202937` must remain prominent in light mode.
- Success/available stays green, warning stays amber, and danger/error stays red.
- Uploaded dynamic branding logos must not be recolored.
- No backend/database/rate/session behavior changes.

---

### Task 1: Theme-token regression coverage

**Files:**
- Modify: `tools/admin-regressions.test.mjs`
- Modify: `tools/customer-regressions.test.mjs`

**Interfaces:**
- Consumes: existing source-file text assertions used by the regression scripts.
- Produces: failing assertions for the approved palette, Midnight light-mode primary styling, and Aktura SVG colors.

- [ ] **Step 1: Add failing Admin assertions**
Assert `apps/admin/src/index.css` contains the seven approved hex values, `--color-ink: #F5F5F5`, and `--color-gold: #202937`; assert Admin `Button.jsx` primary uses `bg-gold text-white`; assert Admin Aktura SVG contains `#202937` and `#F5F5F5`.
- [ ] **Step 2: Add failing Customer assertions**
Mirror the palette and SVG assertions for Customer and assert customer primary Button uses Soft White text.
- [ ] **Step 3: Run both regression scripts**
Run `node tools/admin-regressions.test.mjs` and `node tools/customer-regressions.test.mjs`; expect the new palette checks to fail before production edits.

### Task 2: Central Admin and Customer theme tokens

**Files:**
- Modify: `apps/admin/src/index.css`
- Modify: `apps/customer/src/index.css`

**Interfaces:**
- Consumes: existing token class names such as `bg-ink`, `bg-surface`, `text-ink-900`, `bg-gold`, and `text-slate-soft`.
- Produces: approved light/dark palette values without changing consumer APIs.

- [ ] **Step 1: Remap light tokens**
Set light canvas to Soft White, cards to Dance of the Goddesses, raised/border neutrals to New Wool/Trillium, primary brand token to Midnight Express, and secondary muted text to Paradise Grape/Bluish Black.
- [ ] **Step 2: Remap dark tokens**
Use Midnight Express/Bluish Black structural surfaces with Dance/New Wool readable text and Trillium/Paradise support colors.
- [ ] **Step 3: Update focus, scrollbars, dot pattern and brand shadows**
Replace old orange/slate hard-coded styling with Midnight/Paradise/Trillium equivalents while leaving semantic green/red shadows intact.
- [ ] **Step 4: Update customer login dark override**
Make `.customer-login-dark` reuse the approved dark palette instead of old near-black/orange values.

### Task 3: Primary actions, warning semantics and chart bypasses

**Files:**
- Modify: `apps/admin/src/components/common/Button.jsx`
- Modify: `apps/customer/src/components/common/Button.jsx`
- Modify: `apps/customer/src/components/common/ToastContainer.jsx`
- Modify: `apps/admin/src/pages/AnalyticsPage.jsx`

**Interfaces:**
- Consumes: remapped theme tokens from Task 2.
- Produces: dedicated Midnight primary buttons with Soft White text, amber warning semantics independent from the brand token, and palette-aligned chart brand series.

- [ ] **Step 1: Update primary Button contrast**
Change `primary` to the dedicated `bg-midnight text-soft-white hover:bg-bluish` classes in both apps so the primary action remains Midnight Express in both light and dark mode.
- [ ] **Step 2: Preserve warning color comprehension**
Change the customer warning toast from `gold` classes to explicit amber Tailwind classes so warning remains amber after `gold` becomes Midnight Express.
- [ ] **Step 3: Update Analytics brand series**
Replace the old `#e8a33d` Net-series hard-coded brand color with `#766664`; retain green revenue and red expense series.

### Task 4: Aktura fallback logo branding

**Files:**
- Modify: `apps/admin/src/assets/aktura-logo.svg`
- Modify: `apps/customer/src/assets/aktura-logo.svg`

**Interfaces:**
- Consumes: fallback imports already used when dynamic branding is absent or fails.
- Produces: Midnight Express rounded-square mark with Soft White A glyph/dot.

- [ ] **Step 1: Recolor Admin SVG**
Use `fill="#202937"` on the rounded square and `stroke="#F5F5F5"` / `fill="#F5F5F5"` on the A mark.
- [ ] **Step 2: Recolor Customer SVG**
Apply the identical SVG palette.
- [ ] **Step 3: Confirm dynamic logo paths are unchanged**
Search `useBranding` consumers to ensure no CSS filter or recoloring is added to uploaded logos.

### Task 5: Verification and packaging

**Files:**
- Create: `PALETTE_BRANDING_UPDATE.md`
- Create: packaged ZIP in `/mnt/data`.

**Interfaces:**
- Consumes: all modifications from Tasks 1-4.
- Produces: verified source archive and change note.

- [ ] **Step 1: Run Admin and Customer regression scripts**
Both must pass with zero failures.
- [ ] **Step 2: Run frontend syntax/parser checks**
Use the existing parser-based verification approach over Admin and Customer JS/JSX source.
- [ ] **Step 3: Run backend/Electron syntax checks**
Ensure unrelated backend/Electron source remains syntactically valid.
- [ ] **Step 4: Audit old palette bypasses**
Search source for legacy primary values `#E8A33D`, `#F0993D`, `#C97324`, `#0f1219`, `#171c27`, and `#232938`; any remaining occurrence must be either removed or documented as intentional.
- [ ] **Step 5: Package and integrity-test ZIP**
Create the updated archive and run `unzip -t` successfully.
