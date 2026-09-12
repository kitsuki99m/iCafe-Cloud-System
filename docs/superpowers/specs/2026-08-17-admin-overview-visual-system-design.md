# Admin Overview Visual System Design

## Goal
Make every Admin page visually match the redesigned Overview instead of mixing the new shell with the previous warm-surface-heavy page styling.

## Visual hierarchy
- Soft White `#F5F5F5` is the dominant page, card, table, input, and toolbar surface in light mode.
- Midnight Express `#202937` is the dominant structural/interactive brand color for selected states and primary actions.
- Dance of the Goddesses `#E6D7CD`, New Wool `#D4C1B9`, Trillium `#A99898`, and Paradise Grape `#766664` remain supporting accents, not large-area default backgrounds.
- Secondary text remains Bluish Black `#423D42` for accessible contrast.
- Semantic green/amber/red status colors remain unchanged.

## Shared page language
- Page toolbars use the same clean card surface and border as Overview cards.
- Search controls use the neutral card background rather than a warm fill.
- Segmented controls use only a subtle warm translucent track; the active option is Midnight Express.
- Tables and cards stay on neutral surfaces with warm colors used for hover/highlight states only.
- Empty states use whitespace plus a compact centered neutral card rather than a full-width beige panel.
- Existing right-side drawers, modals, and anchored popovers keep the shared overlay architecture.

## Page coverage
Clients is the reference implementation. The same surface/toolbar/segmented/search/empty-state language is applied to Rates, Members, Earnings, Analytics, Logs, and Settings without changing their business logic.

## Responsive behavior
Preserve existing responsive breakpoints and controls. The visual changes must work from common 1366x768 admin displays through 1920x1080.

## Testing
Regression checks assert the shared light-mode surface hierarchy, Clients empty-state structure, and reuse of neutral search/segmented-control classes. Existing business regressions and JS/JSX syntax checks must remain green.
