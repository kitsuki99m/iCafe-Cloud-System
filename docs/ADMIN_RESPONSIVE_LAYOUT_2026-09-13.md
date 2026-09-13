# Admin Responsive Layout

The Cloud/Emergency Admin now uses one responsive shell across phone, tablet, laptop, and desktop sizes without changing the existing business workflows.

## Target widths

- **320–359px:** minimum supported phone class; navigation logo collapses when necessary and metric grids become single-column.
- **360–479px:** iPhone 6 / compact Samsung class; compact two-column metrics remain where values fit, with reduced padding and full-width overlays.
- **480–767px:** large phones; two-column summary grids and touch-first controls.
- **768–1023px:** tablets; two/three-column summary layouts, slide-out navigation, stacked utility rails.
- **1024px+:** existing desktop sidebar and desktop header remain intact.

## Responsive shell behavior

- Desktop sidebar is hidden below 1024px.
- Phone/tablet navigation uses a fixed top bar and slide-out drawer with all Admin routes, branch picker, connection state, lock, and logout.
- `100dvh` is used for the application shell so mobile browser chrome does not create clipped content.
- Page utility rails stack below the main content on tablet/phone.
- Tables intentionally scroll horizontally instead of compressing operational columns into unreadable widths.
- Side panels become full-screen sheets on phones.
- Modals use dynamic viewport height, safe compact padding, and wrapped touch-friendly footers.
- Search/filter controls expand to full width when space is limited.
- Overview actions stack/scroll without pushing the greeting off-screen.

## Regression coverage

`tools/admin-responsive-regressions.test.mjs` protects the mobile navigation breakpoint, phone/tablet CSS tiers, table/overlay behavior, and Overview mobile composition.
