# Admin Dashboard Overhaul Design

## Goal
Extend the reference-inspired Overview design across the entire Admin application while preserving existing backend/session/rate/wallet behavior and leaving the Customer/Electron applications unchanged.

## Visual system
- Keep the existing slim left navigation and rounded application frame from Overview.
- Use the approved Aezakmi palette with Midnight Express (`#202937`) prominent in light mode.
- Use large, quiet surfaces, restrained borders, 16–20px card radii, generous whitespace, compact typography, and minimal shadows.
- Non-Overview pages use the same header language as Overview rather than the older dense sticky header.

## Interaction architecture
- Small contextual menus use a shared anchored popover rendered through `document.body`; it follows its trigger, clamps to viewport edges, and repositions on resize/scroll.
- Record/station detail uses a shared right-side drawer. This replaces the Floor Matrix PC action popover and is also used for Member and Log details.
- Create/edit/confirm workflows remain centered modals.
- Escape/outside click semantics are consistent, with busy modals protected from accidental close.

## Shared header utilities
- Retain notifications, announcements, theme, lock, and profile/logout access.
- Add Quick Find for PCs and members, with direct navigation to the selected PC/member context.
- Feedback stays a compact top-level utility; Overview keeps its existing Feedback modal trigger.

## Page behavior
- Clients: reference-style toolbar and grid; clicking a station opens a right detail rail with session, time, status, power, maintenance, and edit actions.
- Members: KPI strip, search/table, row-driven member detail rail, existing mutation modals retained.
- Rates: same pricing logic and HH:MM configuration, presented in the new page shell/card language.
- Earnings: financial KPI hierarchy and controls restyled into the same system; existing wallet-funded revenue fix retained.
- Analytics: chart cards and range controls align with Overview spacing and card hierarchy.
- Logs: search/action filters, sticky table, row detail drawer, refresh control.
- Settings: grouped sections with a compact section navigator and improved long-page scanning.

## Responsive target
Optimize for 1366×768 through 1920×1080 desktop use. At narrower widths, secondary header utilities may collapse, drawers remain viewport-safe, and grids reduce columns without horizontal page overflow.

## Non-goals
- No customer/client UI redesign in this pass.
- No database schema changes.
- No rate/session/wallet business-logic changes except where required to keep existing functionality wired after the UI refactor.
