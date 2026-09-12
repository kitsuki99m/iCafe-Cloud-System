# Customer Station Overhaul Design

## Goal
Redesign the Customer Station around three clear customer states—Locked/Login, Signed-in Idle, and Active Session—using the same restrained Aezakmi/Overview visual language as Admin while keeping customer wording understandable across ages.

## Non-negotiable behavior
- Preserve all existing session, wallet, top-up, help, feedback, announcement, promo, shutdown, tray, remote lock, warning-sound, and authentication behavior.
- Keep the locked/login state fullscreen kiosk.
- Keep signed-in/no-session state fullscreen kiosk with the existing Windows-key guard.
- Increase the ACTIVE mini-dashboard Electron size from 800×600 to 960×680; ACTIVE remains normal, not always-on-top, hidden from taskbar, and tray-accessible.
- Do not alter backend billing/session eligibility logic.
- Dynamic branding remains authoritative; bundled Aktura logo stays fallback only.
- Announcements and Feedback remain visible customer features, not hidden utilities.

## Customer language
Prefer plain labels: Time Left, Wallet Balance, Current Rate, Session Type, Add Time, Top Up, Ask for Help, Log Out. Avoid admin-oriented phrases such as settlement, redemption, or request assistance in primary UI.

## 1. Locked / Login
- Fullscreen branded kiosk with compact top brand bar.
- Main sign-in card is the visual priority with large readable fields and 44–48px targets.
- Station readiness and detected PC/IP appear as secondary context.
- Guest/prepaid entry and pre-login Top Up remain available.
- Announcements and public rate plans remain visible in a dedicated supporting column/card, with readable scrolling only inside that supporting content when necessary.
- Fixed unauthenticated shutdown grace period remains visible and is never reset by interaction.
- Existing public Top Up flow remains functional, but uses the same customer modal shell and plain language.

## 2. Signed-in Idle
- Fullscreen customer dashboard.
- Welcome identity/tier, wallet balance, saved time, and station identity are easy to scan.
- Start Session is the primary action when eligible.
- Top Up and Ask for Help remain prominent secondary actions.
- Announcements, Feedback, and currently active rate plans stay visible as supporting customer information.
- Idle five-minute signed-in shutdown behavior remains unchanged.

## 3. Active Session
- ACTIVE Electron dashboard uses 960×680.
- Timer is the largest visual element and uses plain language: Time Left for prepaid, Time Used for postpaid.
- Below timer: Wallet Balance, Current Rate, Session Type, and station identity.
- Primary action row: Add Time, Top Up, Ask for Help.
- Secondary customer information: announcements/promos and a concise session summary.
- Feedback remains reachable from the announcement/customer-info area.
- Low-time states explain what to do, not only change color.
- Log Out is visually separated from payment/session-extension actions.
- Restart/Shutdown remain available only when the Electron bridge exposes them and are visually secondary/destructive.

## 4. Customer modal system
- Shared `Modal` provides Overview-inspired customer typography and spacing while retaining larger readable customer controls than Admin.
- Eyebrow: small uppercase context; title: strong 20px; optional description under title.
- Neutral Soft White body, restrained warm accents, Midnight primary buttons, semantic red for destructive/error states.
- Inputs target ~44px minimum height; buttons target ~44px minimum height.
- Busy state blocks backdrop, Escape, close button, and duplicate submission.
- Start Session, Add Time, Top Up, Feedback, feedback details, power confirmation, and other modal workflows reuse the shared system instead of bespoke overlays where practical.

## 5. Responsive/readability rules
- Primary design target: ACTIVE 960×680 and kiosk 1920×1080.
- No dense admin-style tables.
- Use 13–16px customer body text where information matters; helper text does not drop below 11px.
- Important actions use icons plus words, never icons alone.
- Keep semantic green/amber/red recognizable.
- Avoid nested page-level vertical scrolling; only announcement/rate supporting lists may scroll when their content exceeds the available panel.

## Testing
- Add regression assertions for 960×680 ACTIVE size and unchanged window-state behavior.
- Assert Announcements and Feedback remain present in Customer Session UI.
- Assert plain-language customer actions (Add Time, Top Up, Ask for Help, Time Left).
- Assert shared customer modal shell exposes description support, busy-safe close behavior, and readable sizing.
- Parse all customer/admin frontend source and run existing regression suites after changes.
