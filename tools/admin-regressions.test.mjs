import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('Overview status cards use the intended semantic icons and status routes', () => {
  const source = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(source, /\['Available',summary\.available,MonitorCheck,[^\]]*'available'\]/)
  assert.match(source, /\['In use',summary\.inUse,MonitorPlay,[^\]]*'occupied'\]/)
  assert.match(source, /\['Maintenance',summary\.maintenance,Wrench,[^\]]*'maintenance'\]/)
})

test('Floor Matrix preserves status filters while opening and closing PC deep-links', () => {
  const source = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.doesNotMatch(source, /setSearchParams\(\{pc:pc\.id\}/)
  assert.doesNotMatch(source, /setSearchParams\(\{\}, \{replace:true\}\)/)
  assert.match(source, /function setClientSearchParam\(/)
  assert.match(source, /requestedStatus[^\n]*\?[^\n]*requestedStatus[^\n]*:[^\n]*['"]all['"]/)
  assert.match(source, /onClick=\{\(\)=>setClientStatusFilter\(value\)\}/)
})

test('Floor Matrix and Members normalize member/session IDs before comparison', () => {
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  const members = read('apps/admin/src/pages/MembersPage.jsx')
  assert.match(floor, /String\(pc\.session\?\.customerId\)===String\(member\.id\)/)
  assert.match(members, /String\(p\.session\?\.customerId\)===String\(m\.id\)/)
})

test('PC removal is blocked by any live session and awaits backend removal before closing', () => {
  const source = read('apps/admin/src/components/floor/PcFormModal.jsx')
  assert.match(source, /const canRemove =[^\n]*!pc\.session/)
  assert.match(source, /async function handleRemoveClick\(\)/)
  assert.match(source, /await onRemove\(pc\.id\)/)
  assert.match(source, /disabled=\{!canRemove \|\| saving\}/)
})

test('admin member session start imports tierAllowsPlan instead of throwing at runtime', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  assert.match(source, /import \{[^}]*tierAllowsPlan[^}]*\} from ['"]\.\.\/utils\/rateEligibility\.js['"]/s)
})

test('Session modal follows backend tier hierarchy and keeps walk-ins on Regular plans', () => {
  const source = read('apps/admin/src/components/floor/SessionModal.jsx')
  assert.match(source, /const TIER_RANK = \{\s*Regular:\s*0,\s*Gold:\s*1,\s*VIP:\s*2\s*\}/)
  assert.match(source, /String\(m\.id\) === String\(memberId\)/)
  assert.match(source, /planTierRank\(p\) <= memberTierRank/)
  assert.match(source, /: allActiveRatePlans\.filter\(\(p\) => String\(p\.customerTier \?\? ['"]Regular['"]\) === ['"]Regular['"]\)/)
  assert.match(source, /ratePlans=\{visibleRatePlans\}/)
  const backend = read('backend/src/routes/apiRoutes.js')
  assert.match(backend, /tierAllowsPlan\(member\?\.tier \?\? ['"]Regular['"], plan\.customer_tier\)/)
})

test('Session modals lock close/start/status controls during async mutations', () => {
  const source = read('apps/admin/src/components/floor/SessionModal.jsx')
  assert.match(source, /const \[startBusy, setStartBusy\]/)
  assert.match(source, /title="Start Session"[\s\S]*?busy=\{startBusy \|\| statusBusy\}/)
  assert.match(source, /title="Manage Session"[\s\S]*?busy=\{!!sessionAction\}/)
  assert.match(source, /const \[statusBusy, setStatusBusy\]/)
  assert.match(source, /title="Under Maintenance"[\s\S]*?busy=\{statusBusy\}/)
})

test('member create/edit and wallet/session mutation modals expose busy state and local errors', () => {
  const source = read('apps/admin/src/pages/MembersPage.jsx')
  assert.match(source, /<Modal[\s\S]{0,260}?busy=\{savingMember\}[\s\S]{0,180}?title="Add Member"/)
  assert.match(source, /<Modal[\s\S]{0,260}?busy=\{savingMember\}[\s\S]{0,180}?title=\{`Edit [^`]+`\}/)
  for (const name of ['WalletEditModal','WalletTopUpModal','SessionTopUpModal','WalletTransferModal','SessionTransferModal']) {
    const start = source.indexOf(`function ${name}`)
    const end = source.indexOf('\nfunction ', start + 10)
    const section = source.slice(start, end === -1 ? source.length : end)
    assert.match(section, /busy=\{busy\}/, `${name} should lock its Modal while submitting`)
    assert.match(section, /error\s*&&/, `${name} should render its own mutation error`)
  }
})

test('Logs pagination clamps back into range when refreshed data shrinks', () => {
  const source = read('apps/admin/src/pages/LogsPage.jsx')
  assert.match(source, /setPage\(current\s*=>\s*Math\.min\(current,\s*Math\.max\(1,\s*Math\.ceil\(nextLogs\.length\/pageSize\)\)\)\)/)
})

test('Floor/session mutations propagate failures into the open modal instead of hiding errors behind it', () => {
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  const session = read('apps/admin/src/components/floor/SessionModal.jsx')
  const start = floor.slice(floor.indexOf('async function handleStart'), floor.indexOf('async function handleEnd'))
  const end = floor.slice(floor.indexOf('async function handleEnd'), floor.indexOf('async function handleSetMaintenance'))
  const status = floor.slice(floor.indexOf('async function handleSetMaintenance'), floor.indexOf('async function handleRefund'))
  assert.match(start, /catch \(error\)[\s\S]*throw error/)
  assert.match(end, /catch \(error\)[\s\S]*throw error/)
  assert.match(status, /catch \(error\)[\s\S]*throw error/)
  assert.match(session, /async function runSessionAction[\s\S]*setLocalError\(/)
  assert.match(session, /async function runRefund\(/)
  assert.match(session, /<RefundControl[^>]*onRefund=\{runRefund\}/)
})


test('Floor Matrix Add Time only offers plans allowed for the active member tier or Regular for guests', () => {
  const source = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(source, /const TIER_RANK = \{\s*Regular:\s*0,\s*Gold:\s*1,\s*VIP:\s*2\s*\}/)
  assert.match(source, /function allowedRatePlansForSession\(ratePlans, members, session\)/)
  assert.match(source, /members\.find\([^\n]*String\(item\.id\)\s*===\s*String\(session\?\.customerId\)/)
  assert.match(source, /planTierRank\(plan\) <= memberTierRank/)
  assert.match(source, /String\(plan\.customerTier \?\? ['"]Regular['"]\) === ['"]Regular['"]/)
  assert.match(source, /\{timeActionRatePlans\.map\(plan=>/)
})

test('pause-and-save absorbs the propagated end-session rejection after surfacing page error', () => {
  const source = read('apps/admin/src/pages/FloorMatrix.jsx')
  const start = source.indexOf('async function pauseAndSaveTime')
  const end = source.indexOf('async function requestStationCommand', start)
  const section = source.slice(start, end)
  assert.match(section, /try\s*\{[\s\S]*await handleEnd\(pc,\s*['"]save['"]\)[\s\S]*\}\s*catch(?:\s*\([^)]*\))?\s*\{[\s\S]*\}\s*finally/)
})

test('Tariffs tier guidance matches the enforced Regular < Gold < VIP hierarchy', () => {
  const source = read('apps/admin/src/pages/TariffsPage.jsx')
  assert.doesNotMatch(source, /Gold sees Gold and VIP plans/)
  assert.match(source, /VIP sees Regular, Gold, and VIP plans/)
  assert.match(source, /Gold sees Regular and Gold plans/)
})

test('Floor Add Time default plan is selected from the same tier-allowed plan set', () => {
  const source = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(source, /function allowedRatePlansForSession\(/)
  assert.match(source, /const allowedPlans=allowedRatePlansForSession\(ratePlans,members,pc\.session\)/)
  assert.match(source, /allowedPlans\.some\([^\n]*settings\.defaultAddTimeRatePlanId/)
  assert.match(source, /const timeActionRatePlans = allowedRatePlansForSession\(ratePlans, members, timeAction\?\.session\)/)
})

test('bulk session top-up only offers plans compatible with every selected member tier', () => {
  const modal = read('apps/admin/src/components/bulk/BulkTopUpSessionModal.jsx')
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  const members = read('apps/admin/src/pages/MembersPage.jsx')
  assert.match(floor, /bulkSessionTargets[\s\S]*tier:member\.tier/)
  assert.match(members, /bulkSessionTargets[\s\S]*tier:m\.tier/)
  assert.match(modal, /const TIER_RANK = \{\s*Regular:\s*0,\s*Gold:\s*1,\s*VIP:\s*2\s*\}/)
  assert.match(modal, /selectedTierRank/)
  assert.match(modal, /eligibleRatePlans/)
  assert.match(modal, /planTierRank\(item\) <= selectedTierRank/)
  assert.match(modal, /eligibleRatePlans\.map/)
})

test('Settings saves keep backend errors visible instead of rejecting silently from button handlers', () => {
  const source = read('apps/admin/src/pages/SettingsPage.jsx')
  assert.match(source, /const \[saveError,setSaveError\]=useState\(['"]['"]\)/)
  assert.match(source, /async function saveSection[\s\S]*catch\(error\)[\s\S]*setSaveError/)
  assert.match(source, /async function saveProfile[\s\S]*catch\(error\)[\s\S]*setSaveError/)
  assert.match(source, /saveError&&<div/)
})

test('shared ConfirmModal propagates busy state into Modal keyboard/backdrop locking', () => {
  const source = read('apps/admin/src/components/common/ConfirmModal.jsx')
  assert.match(source, /<Modal[\s\S]*?busy=\{busy\}/)
})

test('custom admin dialogs handle Escape and only enable credential submit when valid', () => {
  const setup = read('apps/admin/src/components/auth/AdminCredentialSetup.jsx')
  const shell = read('apps/admin/src/components/layout/MainLayout.jsx')
  assert.match(setup, /event\.key !== ['"]Escape['"]/) 
  assert.match(setup, /disabled=\{busy \|\| !canSubmit\}/)
  assert.match(setup, /const canSubmit =/) 
  assert.match(shell, /event\.key === ['"]Escape['"]/) 
})

test('admin rate-policy helper text does not expose obsolete Cashier wording', () => {
  const source = read('apps/admin/src/pages/TariffsPage.jsx')
  assert.doesNotMatch(source, /Used when a cashier chooses Add Time/i)
  assert.match(source, /Used when staff chooses Add Time from a Client card\./)
})

test('remaining admin async modals propagate busy state into Modal keyboard/backdrop locking', () => {
  const tariffs = read('apps/admin/src/pages/TariffsPage.jsx')
  const announcements = read('apps/admin/src/components/admin/AnnouncementCenter.jsx')
  const feedback = read('apps/admin/src/components/admin/FeedbackInboxModal.jsx')
  assert.match(tariffs, /open=\{!!deleteTarget\}[\s\S]{0,180}?busy=\{deleting\}/)
  assert.match(announcements, /<Modal[\s\S]{0,180}?open=\{open\}[\s\S]{0,180}?busy=\{saving\}/)
  assert.match(feedback, /<Modal[\s\S]{0,180}?open=\{open\}[\s\S]{0,180}?busy=\{busy\}/)
})

test('feedback actions surface API errors and Overview delegates mutations to the protected feedback modal', () => {
  const feedback = read('apps/admin/src/components/admin/FeedbackInboxModal.jsx')
  const overview = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(feedback, /\[error,setError\]=useState\(['"]['"]\)/)
  assert.match(feedback, /async function update[\s\S]*catch\(error\)[\s\S]*setError\(/)
  assert.match(feedback, /async function archive[\s\S]*catch\(error\)[\s\S]*setError\(/)
  assert.match(feedback, /error&&<p/)
  assert.match(feedback, /busy=\{busy\}/)
  assert.match(overview, /<FeedbackInboxModal/)
  assert.match(overview, /onChanged=\{load\}/)
  assert.doesNotMatch(overview, /async function resolveFeedback\(/)
})

test('legacy reservation check-in cannot double-submit or bypass tier-safe plan selection', () => {
  const source = read('apps/admin/src/components/floor/SessionModal.jsx')
  const start = source.indexOf("if (sessionActionMode === 'reservation')")
  const end = source.indexOf("if (pc.status === 'maintenance')", start)
  const section = source.slice(start, end)
  assert.match(section, /busy=\{startBusy\}/)
  assert.match(section, /disabled=\{startBusy\}/)
  assert.match(section, /runStart\(/)
  assert.doesNotMatch(section, /ratePlans\?\.\[0\]\?\.id/)
})

test('admin branding uses one dynamic useBranding source for layout and login', () => {
  const hook = read('apps/admin/src/hooks/useBranding.js')
  const layout = read('apps/admin/src/components/layout/MainLayout.jsx')
  const login = read('apps/admin/src/components/auth/LoginForm.jsx')
  assert.match(hook, /aezakmi:branding-updated/)
  assert.match(hook, /apiGet\(['"]\/public\/settings['"]\)/)
  assert.match(layout, /useBranding\(\)/)
  assert.doesNotMatch(layout, /aezakmi\.branding\.logoUrl/)
  assert.doesNotMatch(layout, /brandingLogoUrl/)
  assert.match(login, /useBranding\(\)/)
  assert.match(login, /src=\{branding\.logoUrl \|\| logo\}/)
})

test('admin cafe profile save invalidates shared branding without a separate logoUrl cache key', () => {
  const source = read('apps/admin/src/pages/SettingsPage.jsx')
  assert.doesNotMatch(source, /aezakmi\.branding\.logoUrl/)
  const start = source.indexOf('async function saveProfile')
  const end = source.indexOf('\n\n  return', start)
  const section = source.slice(start, end)
  assert.match(section, /aezakmi:branding-updated/)
})

test('admin Rates uses separate hours/minutes inputs while persisting total minutes', async () => {
  const { splitMinutes, combineDurationParts, formatDuration } = await import('../apps/admin/src/lib/duration.js')
  assert.deepEqual(splitMinutes(90), { hours: 1, minutes: 30 })
  assert.equal(combineDurationParts(1, 30), 90)
  assert.equal(combineDurationParts(24, 0), 1440)
  assert.equal(formatDuration(90), '1 hr 30 min')

  const source = read('apps/admin/src/pages/TariffsPage.jsx')
  assert.match(source, /DurationInput/)
  assert.match(source, /label="Duration per unit"/)
  assert.match(source, /label="Package duration"/)
  assert.doesNotMatch(source, /HH:MM/)
  assert.doesNotMatch(source, /durationPerUnit|packageDuration/)
})

test('admin rate cards render friendly time labels rather than raw mins', () => {
  const source = read('apps/admin/src/pages/TariffsPage.jsx')
  assert.match(source, /formatDuration\(numberValue\(plan\.minutes\)\)/)
  assert.match(source, /formatDuration\(numberValue\(plan\.minutesPerUnit\)\)/)
})

test('branding update event applies the new logo immediately and branding GET bypasses browser cache in dev', () => {
  for (const file of ['apps/admin/src/hooks/useBranding.js','apps/customer/src/hooks/useBranding.js']) {
    const source = read(file)
    assert.match(source, /event\?\.detail\?\.logoUrl/)
  }
  for (const file of ['apps/admin/src/lib/api.js','apps/customer/src/lib/api.js']) {
    assert.match(read(file), /apiFetch\(path, \{ cache:['"]no-store['"] \}\)/)
  }
})

test('admin linear rate math matches backend proportional billing', async () => {
  const { minutesForAmount, amountForMinutes } = await import('../apps/admin/src/lib/rates.js')
  const plan = { mode:'linear', pesoUnit:12, minutesPerUnit:60 }
  assert.equal(minutesForAmount(plan, 18), 90)
  assert.equal(amountForMinutes(plan, 30), 6)
})

test('Overview seven-day revenue uses readable bars with exact peso hover values and visible zero days', () => {
  const source = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(source, /<RevenueBar\s+data=/)
  assert.match(source, /aria-label="Bar chart showing revenue for the last seven days"/)
  assert.match(source, /Seven-day revenue bar chart/)
  assert.match(source, /<rect/)
  assert.match(source, /Math\.max\(2,rawHeight\)/)
  assert.match(source, /<title>\{`\$\{point\.item\.day\}: \$\{formatAdminPeso\(point\.value,settings\)\}`\}<\/title>/)
  assert.doesNotMatch(source, /<RevenueLine\s+data=/)
  assert.doesNotMatch(source, /Seven-day revenue line chart/)
})

test('Overview revenue normalizes sparse data into seven calendar days with readable axis scale', async () => {
  const { normalizeSevenDayRevenue, buildRevenueScale } = await import('../apps/admin/src/lib/revenueChart.js')
  const rows = normalizeSevenDayRevenue([
    { day:'2026-08-16', revenue:596 },
    { day:'2026-08-17', revenue:360 },
  ], '2026-08-17')
  assert.deepEqual(rows.map(row=>row.day), [
    '2026-08-11','2026-08-12','2026-08-13','2026-08-14','2026-08-15','2026-08-16','2026-08-17',
  ])
  assert.deepEqual(rows.map(row=>row.revenue), [0,0,0,0,0,596,360])
  assert.deepEqual(buildRevenueScale(rows.map(row=>row.revenue)), { max:600, ticks:[600,400,200,0] })
  const source = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(source, /normalizeSevenDayRevenue\(data\)/)
  assert.match(source, /buildRevenueScale\(values\)/)
  assert.match(source, /formatRevenueDay\(point\.item\.day\)/)
  assert.doesNotMatch(source, /<div className="flex justify-between text-\[10px\] text-slate-soft">/)
})

test('admin theme uses approved Aezakmi palette with Midnight Express primary in light mode', () => {
  const css = read('apps/admin/src/index.css')
  for (const hex of ['#202937','#423D42','#766664','#A99898','#D4C1B9','#E6D7CD','#F5F5F5']) assert.match(css, new RegExp(hex, 'i'))
  assert.match(css, /--color-ink:\s*#F5F5F5/i)
  assert.match(css, /--color-gold:\s*#202937/i)
  const button = read('apps/admin/src/components/common/Button.jsx')
  assert.match(button, /primary:\s*['"]bg-midnight text-soft-white hover:bg-bluish/)
})

test('admin Aktura fallback logo matches Midnight Express branding', () => {
  const svg = read('apps/admin/src/assets/aktura-logo.svg')
  assert.match(svg, /fill="#202937"/i)
  assert.match(svg, /stroke="#F5F5F5"/i)
  assert.match(svg, /fill="#F5F5F5"/i)
})

test('Earnings wallet-funded usage is derived from wallet ledger debits by usage type and transaction time', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  const start = source.indexOf('function earningsSnapshot')
  const end = source.indexOf('\nfunction taxEstimate', start)
  const section = source.slice(start, end)
  assert.match(section, /FROM wallet_transactions/)
  assert.match(section, /created_at BETWEEN \? AND \?/)
  assert.match(section, /session_start/)
  assert.match(section, /session_extension/)
  assert.match(section, /postpaid_settlement/)
  assert.match(section, /SUM\(-amount\)/)
  assert.doesNotMatch(section, /settlement_method='wallet'/)
})

test('Earnings recognizes consumed wallet value instead of top-ups or remaining wallet balances', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  const helperStart = source.indexOf('function earningsRevenueRows')
  const helperEnd = source.indexOf('\nfunction earningsSnapshot', helperStart)
  const helper = source.slice(helperStart, helperEnd)
  const snapshotStart = source.indexOf('function earningsSnapshot')
  const snapshotEnd = source.indexOf('\nfunction taxEstimate', snapshotStart)
  const snapshot = source.slice(snapshotStart, snapshotEnd)

  assert.match(helper, /event_type NOT IN \('wallet_top_up','member_initial_wallet'\)/)
  assert.match(snapshot, /const grossCents = revenue\.reduce/)
  assert.match(snapshot, /Math\.max\(0, Number\(row\.amount_centavos \|\| 0\)\)/)
  assert.match(snapshot, /type IN \('top_up','admin_top_up','paid_deposit'\)/)
  assert.match(snapshot, /const walletRevenue =\s*Number\(walletUsage\.prepaid \|\| 0\) \+ Number\(walletUsage\.postpaid \|\| 0\)/)
  assert.doesNotMatch(snapshot, /const walletRevenue\s*=\s*[^;\n]*walletBalances/)
})

test('wallet-funded sessions, extensions and settlements write earned revenue events', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  assert.match(source, /"session_start",\s*"wallet_transaction",\s*walletRevenueTransactionId,\s*walletUsed/s)
  assert.match(source, /"session_extension",\s*"wallet_transaction",\s*walletRevenueTransactionId,\s*numeric/s)
  assert.match(source, /"postpaid_settlement",\s*paymentMethod === "wallet" \? "wallet_transaction" : "computer_session"/s)
  assert.match(source, /"postpaid_settlement","wallet_transaction",walletRevenueTransactionId,amountDue/s)
})

test('wallet top-ups stay in the wallet ledger and are not recorded as immediate revenue', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  const calls = [...source.matchAll(/recordRevenue\([\s\S]{0,160}?\)/g)].map((match) => match[0]).join('\n')
  assert.doesNotMatch(calls, /["']wallet_top_up["']/)
  assert.doesNotMatch(calls, /["']member_initial_wallet["']/)
})

test('wallet POS sales are recognized when the order is completed', () => {
  const source = read('backend/src/routes/operationsRoutes.js')
  const start = source.indexOf('function recordPosRevenue')
  const end = source.indexOf('\n\nfunction applyCompletedCommand', start)
  const section = source.slice(start, end)
  assert.match(section, /if\(cents<=0\)return/)
  assert.doesNotMatch(section, /payment_method===['"]wallet['"]/)
  assert.match(section, /['"]pos_sale['"]/)
})

test('historical wallet-funded usage is backfilled without double-counting legacy session totals', () => {
  const source = read('backend/src/db/schema.js')
  assert.match(source, /wt\.type IN \('session_start','session_extension','postpaid_settlement'\)/)
  assert.match(source, /legacy\.event_type='session_total'/)
  assert.match(source, /'wallet-' \|\| wt\.id|wallet_transaction/)
  assert.match(source, /payment_method[\s\S]*'wallet'/)
})

test('session refunds reverse recognized cash or wallet session revenue', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  const start = source.indexOf('const recognizedCents = Number(')
  const end = source.indexOf('return { balance };', start)
  const section = source.slice(start, end)
  assert.match(section, /LEFT JOIN wallet_transactions wt/)
  assert.match(section, /wt\.type IN \('session_start','session_extension'\)/)
  assert.match(section, /LEFT JOIN session_extensions se/)
  assert.match(section, /-revenueRefund/)
})

test('Earnings page refreshes its snapshot when realtime data changes', () => {
  const source = read('apps/admin/src/pages/EarningsPage.jsx')
  assert.match(source, /connectSocket/)
  assert.match(source, /socket\.on\(['"]data:changed['"]/)
  assert.match(source, /socket\.off\(['"]data:changed['"]/)
})

test('Overview adopts the reference-inspired main workspace plus right utility rail', () => {
  const source = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(source, /overview-workspace/)
  assert.match(source, /overview-main-column/)
  assert.match(source, /overview-utility-rail/)
  assert.match(source, /useAppData\(\)/)
  assert.match(source, /topUpRequests/)
  assert.match(source, /supportRequests/)
  assert.match(source, /\bpcs\b/)
  assert.match(source, /Live cafe activity/)
  assert.match(source, /Cafe status/)
})

test('Overview feedback moves to the top header and opens the existing feedback modal', () => {
  const source = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(source, /overview-header/)
  assert.match(source, />Feedback</)
  assert.match(source, /setFeedbackOpen\(true\)/)
  assert.match(source, /<FeedbackInboxModal/)
  assert.doesNotMatch(source, /title="Feedback inbox"/)
})

test('MainLayout lets Overview own its reference-style header while other pages keep the generic header', () => {
  const source = read('apps/admin/src/components/layout/MainLayout.jsx')
  assert.match(source, /const isOverview\s*=\s*location\.pathname\s*===\s*['"]\/['"]/)
  assert.match(source, /!isOverview\s*&&\s*<header/)
  assert.match(source, /admin-shell-frame/)
  assert.match(source, /admin-sidebar/)
})

test('admin contextual menus use one portal-based anchored popover instead of hard-coded screen coordinates', () => {
  const popover = read('apps/admin/src/components/common/AnchoredPopover.jsx')
  assert.match(popover, /createPortal/)
  assert.match(popover, /getBoundingClientRect\(\)/)
  assert.match(popover, /addEventListener\(['"]resize['"]/)
  assert.match(popover, /addEventListener\(['"]scroll['"]/)
  assert.match(popover, /Math\.max\(/)
  const bulk = read('apps/admin/src/components/bulk/BulkActionsDropdown.jsx')
  const notifications = read('apps/admin/src/components/admin/AdminNotificationCenter.jsx')
  assert.match(bulk, /<AnchoredPopover/)
  assert.doesNotMatch(bulk, /className="absolute right-0/)
  assert.match(notifications, /<AnchoredPopover/)
  assert.doesNotMatch(notifications, /fixed right-4 top-\[76px\]/)
})

test('non-Overview admin shell shares the reference-style header and Quick Find utility', () => {
  const layout = read('apps/admin/src/components/layout/MainLayout.jsx')
  assert.match(layout, /AdminQuickFind/)
  assert.match(layout, /admin-global-header/)
  assert.match(layout, /admin-header-identity/)
  const quickFind = read('apps/admin/src/components/admin/AdminQuickFind.jsx')
  assert.match(quickFind, /Search PCs and members/)
  assert.match(quickFind, /navigate\(`\/clients\?pc=/)
  assert.match(quickFind, /navigate\(`\/members\?member=/)
})

test('Floor Matrix replaces manual PC popover geometry with a right-side station detail rail', () => {
  const source = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(source, /<SidePanel/)
  assert.match(source, /Station details/)
  assert.doesNotMatch(source, /function positionPopover\(/)
  assert.doesNotMatch(source, /createPortal/)
  assert.doesNotMatch(source, /style=\{\{left:popover\.x,top:popover\.y\}\}/)
})

test('Members page adds operational summary and a member detail rail without replacing mutation modals', () => {
  const source = read('apps/admin/src/pages/MembersPage.jsx')
  assert.match(source, /member-kpi-grid/)
  assert.match(source, /<SidePanel/)
  assert.match(source, /Member details/)
  assert.match(source, /setDetailMemberId/)
  assert.match(source, /<WalletTopUpModal/)
  assert.match(source, /<SessionTopUpModal/)
})

test('Logs page supports search/action filtering and row detail rail', () => {
  const source = read('apps/admin/src/pages/LogsPage.jsx')
  assert.match(source, /Search logs/)
  assert.match(source, /actionFilter/)
  assert.match(source, /<SidePanel/)
  assert.match(source, /Log details/)
  assert.match(source, /filteredLogs/)
})

test('non-Overview admin pages use the shared reference-style content systems', () => {
  for (const file of ['FloorMatrix.jsx','MembersPage.jsx','TariffsPage.jsx','EarningsPage.jsx','AnalyticsPage.jsx','LogsPage.jsx']) {
    assert.match(read(`apps/admin/src/pages/${file}`), /AdminPageWorkspace/, `${file} should use the Overview-pattern page workspace`)
  }
  assert.match(read('apps/admin/src/pages/SettingsPage.jsx'), /admin-page-content/, 'Settings keeps the long-form settings frame')
  const css = read('apps/admin/src/index.css')
  assert.match(css, /\.admin-page-workspace/)
  assert.match(css, /\.admin-table-shell/)
})

test('Settings page exposes a compact section navigator for the long settings form', () => {
  const source = read('apps/admin/src/pages/SettingsPage.jsx')
  assert.match(source, /settings-section-nav/)
  assert.match(source, /Branding/)
  assert.match(source, /Payments/)
  assert.doesNotMatch(source, /settings-network|Customer LAN IP prefix/)
  assert.match(source, /Customer Station/)
  assert.match(source, /Security/)
})

test('Announcement delete uses the shared confirmation modal instead of browser confirm', () => {
  const source = read('apps/admin/src/components/admin/AnnouncementCenter.jsx')
  assert.match(source, /ConfirmModal/)
  assert.match(source, /Delete announcement/)
  assert.doesNotMatch(source, /window\.confirm/)
})

test('Overview header also exposes the shared Quick Find utility', () => {
  const source = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(source, /AdminQuickFind/)
  assert.match(source, /<AdminQuickFind\s*\/>/)
})

test('legacy expense routes keep the Earnings header identity inside the redesigned shell', () => {
  const source = read('apps/admin/src/components/layout/MainLayout.jsx')
  assert.match(source, /PAGE_ALIASES/)
  assert.match(source, /['"]\/expenses['"]\s*:\s*['"]Earnings['"]/)
  assert.match(source, /['"]\/expense['"]\s*:\s*['"]Earnings['"]/)
})

test('admin light-mode secondary text keeps WCAG contrast on warm branded surfaces', () => {
  const css = read('apps/admin/src/index.css')
  const token = (name) => {
    const match = css.match(new RegExp(`${name}:\\s*(#[0-9A-Fa-f]{6})`))
    assert.ok(match, `${name} should be defined as a hex color`)
    return match[1]
  }
  const luminance = (hex) => {
    const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255)
    const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
  }
  const ratio = (a, b) => {
    const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (high + 0.05) / (low + 0.05)
  }

  const secondary = token('--color-slate-soft')
  assert.equal(secondary.toUpperCase(), '#423D42')
  assert.ok(ratio(secondary, token('--color-surface')) >= 4.5, 'secondary text must be readable on Dance surfaces')
  assert.ok(ratio(secondary, token('--color-surface-raised')) >= 4.5, 'secondary text must be readable on New Wool surfaces')
})

test('Admin light-mode surfaces follow Overview weighting instead of large warm fills', () => {
  const css = read('apps/admin/src/index.css')
  assert.match(css, /--color-surface:\s*#F5F5F5/i)
  assert.match(css, /\.admin-search-field/)
  assert.match(css, /\.admin-segmented-control/)
  assert.match(css, /\.admin-empty-state-stage/)
  assert.match(css, /\.admin-empty-state-card/)
})

test('Clients uses Overview-style neutral controls and compact empty state', () => {
  const source = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(source, /admin-search-field/)
  assert.match(source, /admin-segmented-control/)
  assert.match(source, /AdminEmptyState/)
  assert.doesNotMatch(source, /className="panel px-6 py-12 text-center"/)
})

test('Admin pages reuse the Overview-style neutral control language', () => {
  const members = read('apps/admin/src/pages/MembersPage.jsx')
  const analytics = read('apps/admin/src/pages/AnalyticsPage.jsx')
  const logs = read('apps/admin/src/pages/LogsPage.jsx')
  const earnings = read('apps/admin/src/pages/EarningsPage.jsx')
  assert.match(members, /admin-search-field/)
  assert.match(analytics, /admin-segmented-control/)
  assert.match(logs, /admin-search-field/)
  assert.match(earnings, /admin-segmented-control/)
})

test('Clients uses a full-width floor workspace while other analytical pages may keep utility rails', () => {
  const clients = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(clients, /<AdminPageWorkspace>/)
  assert.doesNotMatch(clients, /aside=\{clientRail\}/)
  assert.doesNotMatch(clients, /const clientRail\s*=/)
  assert.doesNotMatch(clients, /AdminRailCard/)
  assert.match(clients, /clients-metric-grid/)
  assert.match(clients, /clients-floor-workspace/)

  for (const file of ['TariffsPage.jsx','MembersPage.jsx','EarningsPage.jsx','AnalyticsPage.jsx','LogsPage.jsx']) {
    const source = read(`apps/admin/src/pages/${file}`)
    assert.match(source, /AdminPageWorkspace/, `${file} should use AdminPageWorkspace`)
    assert.match(source, /AdminRailCard/, `${file} may keep an Overview-style utility rail`)
  }
})

test('Overview-pattern migration adds page-specific navigation utilities without new backend workflows', () => {
  const clients = read('apps/admin/src/pages/FloorMatrix.jsx')
  const rates = read('apps/admin/src/pages/TariffsPage.jsx')
  const members = read('apps/admin/src/pages/MembersPage.jsx')
  const earnings = read('apps/admin/src/pages/EarningsPage.jsx')
  const analytics = read('apps/admin/src/pages/AnalyticsPage.jsx')
  const logs = read('apps/admin/src/pages/LogsPage.jsx')
  assert.match(clients, /BulkActionsDropdown/)
  assert.match(clients, /Bulk add/)
  assert.match(clients, /Add PC/)
  assert.doesNotMatch(rates, /Pricing snapshot/)
  assert.match(rates, /Session controls/)
  assert.match(members, /Member snapshot/)
  assert.match(members, /Tier distribution/)
  assert.match(earnings, /Wallet-funded usage/)
  assert.match(earnings, /Reporting tools/)
  assert.match(analytics, /Key insights/)
  assert.match(analytics, /Traffic mix/)
  assert.match(logs, /Audit snapshot/)
  assert.match(logs, /Quick filters/)
})


test('shared Admin modal follows Overview typography, surfaces, and busy-safe interaction shell', () => {
  const modal = read('apps/admin/src/components/common/Modal.jsx')
  const css = read('apps/admin/src/index.css')
  assert.match(modal, /admin-modal-backdrop/)
  assert.match(modal, /admin-modal-shell/)
  assert.match(modal, /admin-modal-header/)
  assert.match(modal, /admin-modal-title/)
  assert.match(modal, /admin-modal-body/)
  assert.match(modal, /admin-modal-footer/)
  assert.match(modal, /disabled=\{busy\}/)
  assert.match(css, /\.admin-modal-shell/)
  assert.match(css, /\.admin-modal-body/)
  assert.match(css, /\.admin-modal-footer/)
  assert.match(css, /\.admin-modal-body input/)
  assert.match(css, /\.admin-modal-body select/)
})

test('Clients compact stat cards and floor workspace maximize usable horizontal area', () => {
  const css = read('apps/admin/src/index.css')
  assert.match(css, /\.clients-metric-grid \.admin-metric-card/)
  assert.match(css, /min-height:\s*88px/)
  assert.match(css, /\.clients-floor-workspace/)
})

test('AdminPageWorkspace does not reserve a hidden utility rail when aside is absent', () => {
  const source = read('apps/admin/src/components/layout/AdminPageWorkspace.jsx')
  assert.match(source, /aside\s*\?\s*['"]xl:grid-cols-\[minmax\(0,1fr\)_340px\]['"]\s*:\s*['"]grid-cols-1['"]/) 
})

test('Clients adds Locked Sessions as a fifth operational KPI and filter', () => {
  const source = read('apps/admin/src/pages/FloorMatrix.jsx')
  const css = read('apps/admin/src/index.css')
  assert.match(source, /CLIENT_STATUS_FILTERS\s*=\s*\[[^\]]*['"]locked['"]/)
  assert.match(source, /locked:pcs\.filter\([^\n]*session\?\.isLocked[^\n]*\)\.length/)
  assert.match(source, /label="Locked sessions"[\s\S]{0,220}?value=\{stats\.locked\}/)
  assert.match(source, /setClientStatusFilter\(['"]locked['"]\)/)
  assert.match(source, /filter===['"]locked['"][\s\S]{0,220}?pc\.session\?\.isLocked/)
  assert.match(css, /\.clients-metric-grid\s*\{[\s\S]{0,220}?repeat\(5,\s*minmax\(0,\s*1fr\)\)/)
})


test('Rates uses a Settings-style sticky left rail for metrics, controls, and tier coverage', () => {
  const source = read('apps/admin/src/pages/TariffsPage.jsx')
  assert.match(source, /rates-settings-layout/)
  assert.match(source, /rates-sticky-rail/)
  assert.match(source, /Active plans/)
  assert.match(source, /Customer-ready/)
  assert.match(source, /Total plans/)
  assert.match(source, /Premium plans/)
  assert.match(source, /Session controls/)
  assert.match(source, /Tier coverage/)
  assert.match(source, /Pricing catalog/)
  assert.doesNotMatch(source, /Pricing snapshot/)
  assert.doesNotMatch(source, /<AdminPageWorkspace\s+aside=\{rateRail\}/)
})

test('Earnings promotes Expense logs while keeping important context in a sticky right rail', () => {
  const source = read('apps/admin/src/pages/EarningsPage.jsx')
  assert.match(source, /Expense logs/)
  assert.match(source, /earnings-expense-log/)
  assert.match(source, /Reporting period/)
  assert.match(source, /Wallet-funded usage/)
  assert.match(source, /Reporting tools/)
  assert.match(source, /Expense controls/)
  const railStart = source.indexOf('const earningsRail')
  const returnStart = source.indexOf('return <AdminPageWorkspace', railStart)
  const rail = source.slice(railStart, returnStart)
  assert.ok(rail.indexOf('Period context') > rail.indexOf('Wallet-funded usage'), 'Period context should remain the final sticky rail card')
  assert.match(source, /<AdminPageWorkspace\s+aside=\{earningsRail\}/)
})

test('Earnings moves report and expense controls above Revenue sources and keeps the sticky rail contextual', () => {
  const source = read('apps/admin/src/pages/EarningsPage.jsx')
  assert.match(source, /earnings-primary-actions/)
  const actionsIndex = source.indexOf('earnings-primary-actions')
  const revenueIndex = source.indexOf('Revenue sources')
  assert.ok(actionsIndex >= 0 && actionsIndex < revenueIndex, 'report/expense controls should render before Revenue sources')
  const railStart = source.indexOf('const earningsRail')
  const returnStart = source.indexOf('return <AdminPageWorkspace', railStart)
  const rail = source.slice(railStart, returnStart)
  assert.doesNotMatch(rail, /Reporting tools/)
  assert.doesNotMatch(rail, /Expense controls/)
  assert.match(rail, /Income snapshot/)
  assert.match(rail, /Reporting period/)
  assert.match(rail, /Wallet-funded usage/)
  assert.match(rail, /Period context/)
})

test('Earnings expense table avoids nested vertical scrolling in the content panel', () => {
  const source = read('apps/admin/src/pages/EarningsPage.jsx')
  assert.doesNotMatch(source, /max-h-\[60vh\]\s+overflow-auto/)
  assert.match(source, /earnings-expense-table-wrap/)
})

test('non-Overview Admin header is compact and sticky rails follow the reduced header height', () => {
  const layout = read('apps/admin/src/components/layout/MainLayout.jsx')
  const workspace = read('apps/admin/src/components/layout/AdminPageWorkspace.jsx')
  assert.match(layout, /min-h-\[96px\]/)
  assert.doesNotMatch(layout, /min-h-\[124px\]/)
  assert.match(layout, /text-\[24px\]/)
  assert.match(workspace, /xl:top-\[112px\]/)
})

test('shared Admin modal uses compact Overview typography and spacing', () => {
  const modal = read('apps/admin/src/components/common/Modal.jsx')
  const css = read('apps/admin/src/index.css')
  assert.match(modal, /description/)
  assert.match(modal, /admin-modal-description/)
  assert.match(css, /\.admin-modal-title\s*\{[\s\S]{0,180}?font-size:\s*19px/)
  assert.match(css, /\.admin-modal-header\s*\{[\s\S]{0,180}?padding:\s*15px 18px 13px/)
  assert.match(css, /\.admin-modal-body\s*\{[\s\S]{0,180}?padding:\s*16px 18px 18px/)
  assert.match(css, /\.admin-modal-footer\s*\{[\s\S]{0,180}?min-height:\s*52px/)
  assert.match(css, /min-height:\s*40px/)
})

test('AdminPageWorkspace does not force a full-height body below the sticky header', () => {
  const source = read('apps/admin/src/components/layout/AdminPageWorkspace.jsx')
  assert.doesNotMatch(source, /admin-page-workspace grid min-h-full/)
})

test('Overview header uses the same compact 96px Admin rhythm', () => {
  const source = read('apps/admin/src/pages/OverviewPage.jsx')
  assert.match(source, /overview-header flex min-h-\[96px\]/)
  assert.doesNotMatch(source, /overview-header flex min-h-\[124px\]/)
  assert.match(source, /text-\[24px\] font-semibold/)
})

test('routed Admin Login uses the Overview-style two-panel auth layout and preserves both sign-in methods', () => {
  const app = read('apps/admin/src/App.jsx')
  const source = read('apps/admin/src/components/auth/AdminLoginForm.jsx')
  const css = read('apps/admin/src/index.css')
  assert.match(app, /AdminLoginForm/)
  assert.match(source, /admin-login-shell/)
  assert.match(source, /admin-login-grid/)
  assert.match(source, /admin-login-context/)
  assert.match(source, /admin-login-card/)
  assert.match(source, /BackendStatusIndicator/)
  assert.match(source, /loginAdminPin/)
  assert.match(source, /loginAdminPassword/)
  assert.match(source, /Admin PIN/)
  assert.match(source, /Username \+ Password/)
  assert.match(source, /Continue to Admin/)
  assert.match(css, /\.admin-login-grid/)
  assert.match(css, /\.admin-login-context/)
  assert.match(css, /\.admin-login-card/)
})

test('Admin dark mode uses a Midnight-led neutral surface hierarchy instead of warm brown structural fills', () => {
  const css = read('apps/admin/src/index.css')
  const darkBase = css.match(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\s*\}/)?.[1] || ''
  assert.match(darkBase, /--color-surface:\s*#272D39/i)
  assert.match(darkBase, /--color-surface-raised:\s*#303744/i)
  assert.match(darkBase, /--color-surface-line:\s*#4B5360/i)
  const adminDark = css.match(/html\[data-theme="dark"\]\s*\{\s*--admin-canvas-bg:([\s\S]*?)--admin-shell-shadow:/)?.[0] || ''
  assert.match(adminDark, /--admin-card-bg:\s*#272D39/i)
  assert.match(adminDark, /--admin-card-subtle:\s*rgba\(245,\s*245,\s*245,\s*0\.055\)/i)
  assert.match(adminDark, /--admin-ui-border:\s*rgba\(245,\s*245,\s*245,\s*0\.14\)/i)
  assert.doesNotMatch(adminDark, /--admin-card-bg:\s*#423D42/i)
  assert.doesNotMatch(adminDark, /--admin-card-subtle:\s*rgba\(118,\s*102,\s*100/i)
})

test('Analytics chart explicitly follows light and dark theme contrast instead of Chart.js defaults', () => {
  const source = read('apps/admin/src/pages/AnalyticsPage.jsx')
  assert.match(source, /useTheme/)
  assert.match(source, /const\s+\{\s*isDark\s*\}\s*=\s*useTheme\(\)/)
  assert.match(source, /chartTextColor/)
  assert.match(source, /chartGridColor/)
  assert.match(source, /legend:\{[\s\S]*?labels:\{[\s\S]*?color:chartTextColor/)
  assert.match(source, /x:\{[\s\S]*?ticks:\{color:chartTextColor/)
  assert.match(source, /y:\{[\s\S]*?ticks:\{color:chartTextColor/)
  assert.match(source, /borderColor:isDark\?'#D4C1B9':'#766664'/)
})

test('neutral Admin metric and dark-surface utility icons remain readable in dark mode', () => {
  const workspace = read('apps/admin/src/components/layout/AdminPageWorkspace.jsx')
  const css = read('apps/admin/src/index.css')
  assert.match(workspace, /bg-\[var\(--admin-card-subtle\)\]\s+text-gold-dim/)
  assert.match(css, /html\[data-theme="dark"\]\s+\.admin-empty-state-icon[\s\S]{0,120}?color:\s*var\(--color-dance\)/)
  assert.match(css, /html\[data-theme="dark"\]\s+\.admin-rail-card\s+\.text-midnight[\s\S]{0,120}?color:\s*var\(--color-dance\)/)
})

test('dark Admin support tiles do not place Midnight icons on dark raised surfaces', () => {
  const rates = read('apps/admin/src/pages/TariffsPage.jsx')
  const quickFind = read('apps/admin/src/components/admin/AdminQuickFind.jsx')
  const confirm = read('apps/admin/src/components/common/ConfirmModal.jsx')
  const login = read('apps/admin/src/components/auth/AdminLoginForm.jsx')
  assert.doesNotMatch(rates, /text-midnight bg-surface-raised/)
  assert.match(quickFind, /bg-surface-raised text-gold-dim/)
  assert.match(confirm, /bg-gold\/10 p-1\.5 text-gold-dim/)
  assert.match(login, /bg-midnight\/8 text-gold-dim/)
})

test('Admin dark secondary text uses the approved champagne-gold accent without changing light mode', () => {
  const css = read('apps/admin/src/index.css')
  const analytics = read('apps/admin/src/pages/AnalyticsPage.jsx')
  const lightTheme = css.match(/@theme\s*\{([\s\S]*?)\n\}/)?.[1] || ''
  const darkBase = css.match(/html\[data-theme="dark"\]\s*\{([\s\S]*?)\n\s*\}/)?.[1] || ''
  assert.match(lightTheme, /--color-slate-soft:\s*#423D42/i)
  assert.match(darkBase, /--color-slate-soft:\s*#C9B27A/i)
  assert.match(darkBase, /--color-ink-900:\s*#F5F5F5/i)
  assert.match(analytics, /const\s+chartTextColor\s*=\s*isDark\?'#C9B27A':'#423D42'/)
})

test('PC cards expose anchored station controls and Station Details reuses the same action component', () => {
  const card = read('apps/admin/src/components/floor/PcCard.jsx')
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(card, /onControls/)
  assert.match(card, /Open station controls/)
  assert.match(floor, /import AnchoredPopover from ['"]\.\.\/components\/common\/AnchoredPopover\.jsx['"]/)
  assert.match(floor, /import StationActions from ['"]\.\.\/components\/floor\/StationActions\.jsx['"]/)
  assert.match(floor, /<AnchoredPopover[\s\S]*?<StationActions[\s\S]*?variant="popover"/)
  assert.match(floor, /<SidePanel[\s\S]*?<StationActions[\s\S]*?variant="drawer"/)
})

test('station actions treat maintenance as reachable and offline as the only disconnected state', async () => {
  const { getStationActionIds, isStationReachable } = await import('../apps/admin/src/lib/stationActions.js')
  assert.equal(isStationReachable({ status:'maintenance' }), true)
  assert.equal(isStationReachable({ status:'offline' }), false)
  assert.deepEqual(getStationActionIds({ status:'maintenance', session:null }), ['restart','shutdown','return-available','edit'])
  assert.deepEqual(getStationActionIds({ status:'available', session:null }), ['session','restart','shutdown','maintenance','edit'])
  assert.deepEqual(getStationActionIds({ status:'occupied', session:{ billing:'prepaid', isLocked:false } }), ['session','add-time','reduce-time','transfer-time','lock','restart','shutdown','edit'])
  assert.deepEqual(getStationActionIds({ status:'occupied', session:{ billing:'prepaid', isLocked:true } }), ['session','add-time','reduce-time','transfer-time','unlock','pause-save','restart','shutdown','edit'])
})

test('Admin custom authentication overlays use the same Overview modal shell instead of legacy panel chrome', () => {
  const setup = read('apps/admin/src/components/auth/AdminCredentialSetup.jsx')
  const layout = read('apps/admin/src/components/layout/MainLayout.jsx')
  assert.match(setup, /admin-modal-shell/)
  assert.match(setup, /admin-modal-header/)
  assert.match(setup, /admin-modal-body/)
  assert.doesNotMatch(setup, /className="panel /)
  const lockStart = layout.indexOf('{locked &&')
  const lockSection = layout.slice(lockStart)
  assert.match(lockSection, /admin-modal-shell/)
  assert.match(lockSection, /admin-modal-header/)
  assert.match(lockSection, /admin-modal-body/)
  assert.match(lockSection, /<Button[^>]*onClick=\{unlock\}/)
  assert.doesNotMatch(lockSection, /className="panel /)
})

test('Admin navigation and overlay actions use the shared interaction classes', () => {
  const layout = read('apps/admin/src/components/layout/MainLayout.jsx')
  const sidePanel = read('apps/admin/src/components/common/SidePanel.jsx')
  const popover = read('apps/admin/src/components/common/AnchoredPopover.jsx')
  assert.match(layout, /className=\{\(\{ isActive \}\) => `nav-item \$\{isActive \? 'active' : ''\}`\}/)
  assert.match(layout, /admin-header-pill/)
  assert.match(layout, /admin-icon-button/)
  assert.match(sidePanel, /admin-side-panel/)
  assert.match(popover, /admin-popover/)
})

test('station session action and SessionModal share one mode so Manage Session always renders for active sessions', async () => {
  const { getStationSessionActionMode } = await import('../apps/admin/src/lib/stationActions.js')
  const actions = read('apps/admin/src/components/floor/StationActions.jsx')
  const modal = read('apps/admin/src/components/floor/SessionModal.jsx')

  assert.equal(getStationSessionActionMode({ status:'available', session:null }), 'start')
  assert.equal(getStationSessionActionMode({ status:'occupied', session:{ id:'s1' } }), 'manage')
  assert.equal(getStationSessionActionMode({ status:'offline', session:{ id:'s1', isPaused:true } }), 'manage')
  assert.equal(getStationSessionActionMode({ status:'maintenance', session:{ id:'s1' } }), 'manage')
  assert.equal(getStationSessionActionMode({ status:'available', session:{ id:'stale-active' } }), 'manage')
  assert.equal(getStationSessionActionMode({ status:'reserved', session:{ id:'r1' } }), 'reservation')
  assert.equal(getStationSessionActionMode({ status:'offline', session:null }), null)

  assert.match(actions, /getStationSessionActionMode/)
  assert.match(modal, /getStationSessionActionMode/)
  assert.match(modal, /sessionActionMode\s*===\s*['"]manage['"]/)
  assert.match(modal, /sessionActionMode\s*===\s*['"]reservation['"]/)
  assert.match(modal, /sessionActionMode\s*===\s*['"]start['"]/)
  assert.doesNotMatch(modal, /if\s*\(pc\.status\s*===\s*['"]occupied['"]\s*&&\s*pc\.session\)/)
})

test('Manage Session opens immediately from both station controls without depending on requestAnimationFrame', () => {
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(floor, /function openSessionModal\(pc\)/)
  assert.match(floor, /setSelectedId\(String\(pc\.id\)\)/)
  assert.match(floor, /const selected = selectedId \? pcs\.find\(\(p\) => String\(p\.id\) === String\(selectedId\)\)/)
  assert.match(floor, /onSession=\{openSessionModal\}/)
  assert.doesNotMatch(floor, /onSession=\{\(pc\)=>afterControlsClose\(\(\)=>setSelectedId\(pc\.id\)\)\}/)
  assert.doesNotMatch(floor, /onSession=\{\(pc\)=>afterPopoverClose\(\(\)=>setSelectedId\(pc\.id\)\)\}/)
})

test('Admin Electron tray icon uses current Midnight and Soft White Aktura branding', () => {
  const source = read('apps/admin/electron/tray-icon.svg')
  assert.match(source, /#202937/i)
  assert.match(source, /#F5F5F5/i)
  assert.doesNotMatch(source, /#E8A33D/i)
  assert.doesNotMatch(source, /#0B1017/i)
})

test('PC card Station Details uses the URL as a single source of truth to prevent double-open races', () => {
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.doesNotMatch(floor, /const \[popover, setPopover\] = useState\(null\)/)
  assert.match(floor, /const detailPc = requestedPcId \? pcs\.find\(\(pc\) => String\(pc\.id\) === String\(requestedPcId\)\) \?\? null : null/)
  assert.match(floor, /function openPopover\(pc\)\{[\s\S]*?setClientSearchParam\('pc', pc\.id\)[\s\S]*?\}/)
  const openPopoverBody = floor.match(/function openPopover\(pc\)\{([\s\S]*?)\n\s*\}/)?.[1] || ''
  assert.doesNotMatch(openPopoverBody, /setPopover/)
  assert.match(floor, /\{detailPc && !pendingTimeAction && !timeAction && \(\(\) => \{/)
  assert.doesNotMatch(floor, /requestedPcId[\s\S]{0,500}?setPopover\(\{ pcId:/)
})

test('bootstrap admin sessions are backend-restricted until credential setup completes', () => {
  const auth = read('backend/src/middleware/auth.js')
  assert.match(auth, /u\.must_change_credentials/)
  assert.match(auth, /CREDENTIAL_SETUP_REQUIRED/)
  assert.match(auth, /\/setup-credentials/)
  assert.match(auth, /\/me/)
})

test('remote command lifetime is persisted so stale queued commands cannot replay after restart', () => {
  const schema = read('backend/src/db/schema.js')
  const operations = read('backend/src/routes/operationsRoutes.js')
  const server = read('backend/src/server.js')
  assert.match(schema, /remote_commands[\s\S]*expires_at TEXT/)
  assert.match(schema, /ALTER TABLE remote_commands ADD COLUMN expires_at TEXT/)
  assert.match(operations, /expiresAt/)
  assert.match(operations, /INSERT INTO remote_commands\([^)]*expires_at/)
  assert.match(server, /UPDATE remote_commands SET status='failed'[\s\S]*REMOTE_COMMAND_SERVER_RESTARTED/)
  assert.match(server, /expires_at[^\n]*>[=]?[^\n]*now/i)
  assert.match(server, /expiresAt:command\.expires_at/)
})

test('customer and Electron reject expired remote power commands before executing shutdown.exe', () => {
  const context = read('apps/customer/src/context/AppDataContext.jsx')
  const electron = read('apps/customer/electron/main.cjs')
  assert.match(context, /payload\.expiresAt/)
  assert.match(context, /REMOTE_COMMAND_EXPIRED/)
  assert.match(context, /const expiresAt = payload\.expiresAt \|\| payload\.expires_at \|\| null/)
  assert.match(context, /expiresAtMs[\s\S]{0,220}Date\.now\(\)/)
  assert.match(context, /await bridge\(\{[\s\S]{0,420}expiresAt[\s\S]{0,80}\}/)
  assert.match(electron, /expiresAt/)
  assert.match(electron, /REMOTE_COMMAND_EXPIRED/)
  assert.match(electron, /Date\.now\(\)[\s\S]{0,220}expiresAt/)
})

test('remote command completion validates and transitions atomically before session side effects', () => {
  const source = read('backend/src/routes/operationsRoutes.js')
  assert.match(source, /function transitionRemoteCommand\(/)
  assert.match(source, /transaction\(\(\)\s*=>\s*\{[\s\S]*UPDATE remote_commands SET status=\?[\s\S]*WHERE id=\? AND status=\?[\s\S]*applyCompletedCommand/s)
  assert.doesNotMatch(source, /if\(status===['"]completed['"]\)\s*\{?[\s\S]{0,180}?applyCompletedCommand\(command\)[\s\S]{0,180}?updateCommandStatus/)
})

test('customer REST and Socket.IO use the same station credential verifier', () => {
  const stationAuth = read('backend/src/utils/stationAuth.js')
  const auth = read('backend/src/middleware/auth.js')
  const server = read('backend/src/server.js')
  const login = read('backend/src/routes/authRoutes.js')
  assert.match(stationAuth, /export function stationCredentialMatches/)
  assert.match(auth, /stationCredentialMatches/)
  assert.match(auth, /STATION_NOT_PAIRED/)
  assert.match(login, /req\.stationAuthenticated/)
  assert.match(server, /stationCredentialMatches/)
  assert.doesNotMatch(server, /const stationCredentialValid=/)
})

test('reset pairing revokes PC-bound customer auth sessions and disconnects station sockets', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  assert.match(source, /reset-pairing[\s\S]*UPDATE auth_sessions[\s\S]*pc_id=\?[\s\S]*revoked_at IS NULL/s)
  assert.match(source, /getIO\(\)/)
  assert.match(source, /auth:revoked/)
  assert.match(source, /disconnectSockets/)
})

test('floor-wide PC endpoint is staff-only while current station remains customer-safe', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  assert.match(source, /router\.get\("\/pcs",\s*auth,\s*requireRole\("admin"\)/)
  assert.match(source, /router\.get\("\/pcs\/current",\s*auth/)
})

test('admin refresh preserves local realtime connection state', () => {
  const source = read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(source, /setState\(\(current\)\s*=>\s*\(\{\s*\.\.\.current,\s*\.\.\.snapshot/)
  assert.doesNotMatch(source, /\n\s*setState\(snapshot\)\s*\n/)
})

test('member assignment can be explicitly cleared and member fields receive semantic validation', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(req\.body\s*\?\?\s*\{\},\s*["']pcId["']\)/)
  assert.match(source, /VALID_MEMBER_TIERS/)
  assert.match(source, /isValidIsoDate/)
})

test('PC creation and update share one cafe-network IP validator', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  assert.match(source, /validateStationIp/)
  const matches = source.match(/validateStationIp\(/g) || []
  assert.ok(matches.length >= 2, 'create and update should both call validateStationIp')
})

test('database enforces one active computer session per PC and per member', () => {
  const schema = read('backend/src/db/schema.js')
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_computer_sessions_one_active_pc[\s\S]*WHERE status='active'/)
  assert.match(schema, /CREATE UNIQUE INDEX IF NOT EXISTS idx_computer_sessions_one_active_member[\s\S]*WHERE status='active' AND member_id IS NOT NULL/)
})

test('new rate-plan schema no longer carries unrelated authentication columns', () => {
  const schema = read('backend/src/db/schema.js')
  const section = schema.slice(schema.indexOf('CREATE TABLE IF NOT EXISTS rate_plans'), schema.indexOf('CREATE TABLE IF NOT EXISTS cloud_member_credentials'))
  assert.doesNotMatch(section, /must_change_credentials/)
  assert.doesNotMatch(section, /auth_method/)
})

test('customer login never silently takes over another active station session', () => {
  const source = read('backend/src/routes/authRoutes.js')
  assert.match(source, /ACCOUNT_ALREADY_ACTIVE/)
  const customerLogin = source.slice(source.indexOf("router.post('/login'"), source.indexOf("router.post('/setup-credentials'"))
  assert.doesNotMatch(customerLogin, /new customer login takes ownership/i)
  assert.doesNotMatch(customerLogin, /closeSessionAndSaveRemaining\(activeComputerSession\.id\)[\s\S]{0,180}?activeComputerSession\.pc_id !== req\.pc\.id/)
})

test('customer support history is member-scoped instead of leaking by shared PC history', () => {
  const source = read('backend/src/routes/operationsRoutes.js')
  assert.match(source, /SELECT \* FROM support_messages WHERE member_id=\? ORDER BY created_at ASC/)
  assert.doesNotMatch(source, /member_id=\? OR pc_id=\? ORDER BY created_at ASC/)
})

test('pending POS reservations expire and release reserved stock', () => {
  const source = read('backend/src/routes/operationsRoutes.js')
  const schema = read('backend/src/db/schema.js')
  assert.match(schema, /pos_orders[\s\S]*expires_at TEXT/)
  assert.match(source, /expirePendingPosOrders/)
  assert.match(source, /POS_ORDER_EXPIRED/)
  assert.match(source, /stock=CASE WHEN stock IS NULL THEN NULL ELSE stock\+\? END/)
})

test('privacy-lock PIN verifies the currently authenticated staff account only', () => {
  const source = read('backend/src/routes/authRoutes.js')
  const section = source.slice(source.indexOf("router.post('/verify-admin-credentials'"), source.indexOf('function userView'))
  assert.match(section, /WHERE id=\? AND role(?: IN \('admin'\)|='admin') AND is_active=1/)
  assert.match(section, /get\(req\.auth\.userId\)/)
  assert.doesNotMatch(section, /SELECT pin_hash FROM users WHERE role='admin'/)
})

test('idempotency records have TTL cleanup and stale in-progress recovery', () => {
  const source = read('backend/src/middleware/idempotency.js')
  assert.match(source, /IDEMPOTENCY_TTL_MS/)
  assert.match(source, /IDEMPOTENCY_IN_PROGRESS_TTL_MS/)
  assert.match(source, /DELETE FROM idempotency_records WHERE created_at/)
  assert.match(source, /staleInProgress/)
})

test('admin mutation API accepts caller-owned operation keys for retry-safe actions', () => {
  const source = read('apps/admin/src/lib/api.js')
  assert.match(source, /operationKey/)
  assert.match(source, /Idempotency-Key/)
  assert.match(source, /createOperationKey/)
})

test('bulk financial mutations preserve per-target success and retry only failed targets', () => {
  const members = read('apps/admin/src/pages/MembersPage.jsx')
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(members, /runBulkMutation/)
  assert.match(floor, /runBulkMutation/)
  assert.doesNotMatch(members, /Promise\.all\(ids\.map\(\(id\)\s*=>\s*adminTopUp/)
  assert.doesNotMatch(floor, /Promise\.all\(ids\.map\(\(id\)\s*=>\s*adminTopUp/)
})

test('admin session timing uses one pause-aware helper in Members and Floor Matrix', async () => {
  const { remainingSessionSeconds } = await import('../apps/admin/src/lib/sessionTime.js')
  assert.equal(remainingSessionSeconds({billing:'prepaid',expiresAt:'2026-08-17T01:10:00.000Z',isPaused:true,pausedAt:'2026-08-17T01:05:00.000Z'}, Date.parse('2026-08-17T01:09:00.000Z')), 300)
  assert.equal(remainingSessionSeconds({billing:'prepaid',expiresAt:'2026-08-17T01:10:00.000Z'}, Date.parse('2026-08-17T01:09:00.000Z')), 60)
  const members = read('apps/admin/src/pages/MembersPage.jsx')
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  assert.match(members, /remainingSessionSeconds/)
  assert.match(floor, /remainingSessionSeconds/)
})

test('route handlers rely on global mutation invalidation instead of duplicating generic emits', () => {
  const app = read('backend/src/app.js')
  assert.match(app, /emitDataChanged\(\{ method: req\.method, path: req\.originalUrl \}\)/)
  const operations = read('backend/src/routes/operationsRoutes.js')
  assert.doesNotMatch(operations, /emitDataChanged\(\{method:'POST',path:'\/remote-commands'\}\)/)
})

test('backend source package excludes live .env secrets and keeps an example', () => {
  assert.equal(fs.existsSync(path.join(root, 'backend/.env')), false)
  assert.equal(fs.existsSync(path.join(root, 'backend/.env.example')), true)
})

test('member edit honors explicit null when clearing optional phone and email fields', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  assert.match(source, /hasPhone\s*=\s*Object\.prototype\.hasOwnProperty\.call\(req\.body\s*\?\?\s*\{\},\s*["']phone["']\)/)
  assert.match(source, /hasEmail\s*=\s*Object\.prototype\.hasOwnProperty\.call\(req\.body\s*\?\?\s*\{\},\s*["']email["']\)/)
  assert.match(source, /nextPhone/)
  assert.match(source, /nextEmail/)
  assert.doesNotMatch(source, /phone\s*\?\?\s*m\.phone/)
  assert.doesNotMatch(source, /email\s*\?\?\s*m\.email/)
})

test('legacy rate-plan tables drop copied authentication columns during migration', () => {
  const schema = read('backend/src/db/schema.js')
  assert.match(schema, /rateCols\.includes\(['"]must_change_credentials['"]\)[\s\S]{0,100}?DROP COLUMN must_change_credentials/)
  assert.match(schema, /rateCols\.includes\(['"]auth_method['"]\)[\s\S]{0,100}?DROP COLUMN auth_method/)
})

test('single-member financial modals reuse caller-owned idempotency keys across retries', () => {
  const page = read('apps/admin/src/pages/MembersPage.jsx')
  const context = read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(page, /operationKeyRef/)
  assert.match(page, /onConfirm\([^)]*\{\s*operationKey:/)
  assert.match(context, /function transferMemberWallet\([^)]*options\s*=\s*\{\}/)
  assert.match(context, /function transferMemberSessionTime\([^)]*options\s*=\s*\{\}/)
  assert.match(context, /function setMemberWallet\([^)]*options\s*=\s*\{\}/)
})

test('floor session-time adjustments reuse a user-action idempotency key across retries', () => {
  const floor = read('apps/admin/src/pages/FloorMatrix.jsx')
  const context = read('apps/admin/src/context/AppDataContext.jsx')
  assert.match(floor, /timeActionOperationKeyRef/)
  assert.match(floor, /adjustSessionTime\([^\n]*\{\s*operationKey:/)
  assert.match(floor, /topUpMemberSession\([^\n]*\{\s*operationKey:/)
  assert.match(context, /function adjustSessionTime\([^)]*options\s*=\s*\{\}/)
})
