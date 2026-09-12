# Admin Overview Reference Redesign

## Goal
Redesign the Admin Overview using the supplied KULAK dashboard screenshot as the layout reference while preserving Aezakmi Cafe functionality, data, routes, accessibility, and the approved brand palette.

## Visual Direction
- Use the reference's slim persistent left navigation, spacious central workspace, and narrow right utility rail.
- Favor large breathing room, soft-white cards, light borders, restrained shadows, rounded corners, and compact typography.
- Keep Midnight Express `#202937` prominent in light mode for primary structure, active navigation, headings, key icons, and primary controls.
- Use `#F5F5F5` as the white/light canvas, with `#E6D7CD`, `#D4C1B9`, `#A99898`, `#766664`, and `#423D42` as supporting brand neutrals.
- Preserve semantic status colors for success/available, warning, and danger/maintenance.

## Admin Shell
- Retain all existing navigation routes.
- Restyle the left navigation to resemble the reference: narrow rail, brand block at top, rounded active row with a strong vertical active marker, and profile/server controls at the bottom.
- On Overview only, suppress the generic breadcrumb header and let Overview render its own reference-style greeting header.
- Other Admin pages keep the existing generic header behavior.

## Overview Layout
At desktop widths, Overview uses two workspace columns after the sidebar:
1. Main content column, flexible width.
2. Right utility rail, approximately 330-350px.

### Main header
- Greeting: `Hi, {admin name}` with a short operational subtitle.
- Utility controls on the right: Feedback button, notification center, announcement center, theme toggle, and lock control.
- Feedback opens the existing FeedbackInboxModal and never duplicates feedback data in the Overview body.

### Main content
- Four compact KPI cards: Available, In Use, Maintenance, Today’s Revenue.
- Primary operational section: compact floor/PC preview and seven-day revenue chart.
- Secondary operational section: sessions ending soon and quick actions.
- Existing routes remain the destination for deeper management.

### Right utility rail
- Week/date card inspired by the reference calendar card.
- PC status summary card with Available, In Use, Maintenance, Total.
- Live cafe activity card generated from already-loaded realtime application state:
  - active sessions,
  - pending top-ups,
  - open support requests.
- Activity items include timestamp/context where available and link to relevant Admin destinations when actionable.

## Feedback
- Feedback is removed as a large Overview panel.
- A compact top-header button opens FeedbackInboxModal.
- The button displays an unresolved indicator derived from Overview feedback data.

## Data and Behavior
- Keep `/dashboard/overview` revenue, summary, active session, announcement, top-customer, and birthday behavior intact.
- Reuse `AppDataContext` for live PC, top-up, support, announcement, and settings data; do not create a second polling system for those resources.
- Existing Overview 30-second backend overview refresh remains for analytical data.
- Existing Floor Matrix deep-link filters remain unchanged.

## Responsive Behavior
- Desktop (`xl`): full main column + right utility rail.
- Medium widths: right rail stacks below main content.
- Small widths: KPI cards and operational panels stack without horizontal overflow.
- Sidebar remains usable and existing navigation semantics remain unchanged.

## Testing
Regression checks must verify:
- Overview retains Available/In Use/Maintenance route mapping.
- Overview uses a two-column workspace and contains a right utility rail.
- Feedback is triggered from the Overview header and the old Feedback panel is removed.
- Right rail consumes `pcs`, `topUpRequests`, and `supportRequests` from AppDataContext.
- The seven-day revenue chart remains present and uses the existing normalized seven-day data helpers.
- MainLayout suppresses its generic header only on Overview.
- Frontend JSX parsing and existing regression suites remain green.
