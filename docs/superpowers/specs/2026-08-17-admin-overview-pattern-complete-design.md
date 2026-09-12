# Admin Overview-Pattern Complete Redesign

## Goal
Make Clients, Rates, Members, Earnings, Analytics, and Logs feel like direct siblings of the redesigned Overview rather than legacy pages placed inside the new shell.

## Design source of truth
Overview remains the master pattern:
- Soft White `#F5F5F5` dominates the light canvas and primary cards.
- Midnight Express `#202937` provides structure, selected states, primary actions, and important figures.
- Dance/New Wool/Trillium/Paradise Grape are supporting accents only.
- Large page regions are organized as a spacious primary workspace plus a compact right utility rail.
- Cards use restrained borders, 16–18px radii, minimal shadow, and generous whitespace.
- Headers use the same vertical rhythm and utility placement as Overview.

## Shared layout architecture
Create a reusable `AdminPageWorkspace` with:
- `main`: the page's primary workflow.
- `aside`: a page-specific utility rail.
- responsive behavior: one column below XL, two columns at XL and above.

Create reusable visual primitives:
- `AdminRailCard` for compact right-rail summaries and quick actions.
- `AdminMetricCard` for Overview-style KPI blocks.
- `AdminEmptyState` for consistent low-density empty states.

The existing global sidebar, dynamic branding, Feedback, notifications, announcements, theme, lock, and global Quick Find remain shared in `MainLayout`.

## Page designs

### Clients
Main column:
- station status KPI strip
- local search/status toolbar
- station grid or compact empty state

Right rail:
- Cafe capacity summary (Available/In Use/Maintenance/Offline)
- operational quick actions (Add PC, Bulk add)
- attention list for low-time or maintenance/offline stations when data exists

Existing station detail `SidePanel` remains the record-detail interaction.

### Rates
Main column:
- concise KPI strip
- rate-plan toolbar and filters
- rate cards or empty state

Right rail:
- Pricing summary (active/customer-ready/tier mix)
- Session policy quick entry
- Postpaid configuration quick entry
- guidance for Regular/Gold/VIP visibility

### Members
Main column:
- member KPI strip
- search/action toolbar
- member table or empty state

Right rail:
- Active member/session summary
- Wallet exposure summary
- Tier distribution
- quick action to Add Member

Existing member detail `SidePanel` remains.

### Earnings
Main column:
- period toolbar
- revenue/expense/net KPI strip
- financial breakdown cards and transactions/reporting

Right rail:
- Wallet-funded usage summary
- report shortcuts
- expense controls
- selected period context

### Analytics
Main column:
- range selector
- headline KPI strip
- large primary chart
- secondary charts

Right rail:
- Key insights generated from current dataset only (no invented backend data)
- rate-plan mix summary
- traffic/member-vs-guest summary

### Logs
Main column:
- audit KPI strip
- search/filter toolbar
- table or empty state

Right rail:
- action-category counts
- latest event summary
- quick filter shortcuts

Existing log detail `SidePanel` remains.

## Navigation-related useful additions
Only existing-data, navigation-relevant additions are allowed:
- page-specific quick actions in each right rail
- click-to-filter summary items
- counts/summary information derived from already loaded page data
- contextual links to related Admin routes

No new backend schema or business workflow is required.

## Overlay rules
- small contextual menu: `AnchoredPopover`
- selected record/station details: `SidePanel`
- create/edit/confirm workflow: `Modal`
- no pointer-positioned floating action panels
- no browser-native alerts/confirms

## Responsive behavior
- XL+: main + 300–320px right rail
- below XL: rail stacks below main content
- tables remain horizontally scrollable when necessary
- avoid fixed-height empty whitespace; content sections should size to data

## Testing
Regression tests must verify:
- all six target pages use `AdminPageWorkspace`
- right-rail page-specific content exists
- shared workspace uses Overview card variables and responsive two-column grid
- old page-only flat layout patterns are removed where migrated
- existing business/regression tests remain green
- all JS/JSX parses successfully
