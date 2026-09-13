# Customer + Admin Container Bounds — 2026-09-13

## Customer
- Desktop session dashboard is centered and capped at 1320px wide.
- Main customer content is capped at 760px high so cards do not stretch vertically on large displays.
- Login header/login workspace are capped at 1120px wide and the login workspace at 720px high.
- Compact windows (<=820px, including the 800x600 session window) remove the height caps and use vertical scrolling instead of clipping content.

## Admin Developer
- Developer approvals now uses a dedicated bounded workspace (1480px maximum).
- Desktop route gutters are 22px horizontally with 20px top / 28px bottom spacing.
- Tablet and mobile gutters reduce to 18px and 14px respectively.
- This prevents the Developer cards from touching the sidebar/header viewport edges while preserving responsive behavior.
