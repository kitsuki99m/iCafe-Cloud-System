import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { minutesForAmount, amountForMinutes } from '../apps/customer/src/lib/rates.js'
import { ratePlanEligibility, promoWindowBounds, promoScheduleStatus } from '../backend/src/utils/rateEligibility.js'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8')

test('customer linear rate math matches backend proportional billing', () => {
  const plan = { mode: 'linear', pesoUnit: 12, minutesPerUnit: 60 }
  assert.equal(minutesForAmount(plan, 18), 90)
  assert.equal(amountForMinutes(plan, 30), 6)
})

test('promo schedule rejects a plan outside its daily time window in Asia/Manila', () => {
  const plan = {
    is_active: 1,
    customer_self_service: 1,
    customer_tier: 'Regular',
    promo_kind: 'holiday',
    time_start: '18:00',
    time_end: '22:00',
    days_of_week: JSON.stringify([0]),
  }
  const at = new Date('2026-08-16T15:00:00+08:00')
  assert.equal(ratePlanEligibility(plan, { tier: 'Regular' }, at).eligible, false)
})

test('promo schedule supports cross-midnight windows using the start day', () => {
  const plan = {
    is_active: 1,
    customer_self_service: 1,
    customer_tier: 'Regular',
    promo_kind: 'just_because',
    time_start: '22:00',
    time_end: '02:00',
    days_of_week: JSON.stringify([0]),
  }
  assert.equal(ratePlanEligibility(plan, { tier: 'Regular' }, new Date('2026-08-17T01:00:00+08:00')).eligible, true)
})

test('GCash extension payment INSERT has one value per column', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  assert.match(source, /INSERT INTO payments \(id,reference,member_id,amount,method,status,external_reference,created_at\) VALUES \(\?,\?,\?,\?,\?,'pending',\?,\?\)/)
  assert.doesNotMatch(source, /VALUES \(\?,\?,\?,\?,\?,'pending',\?,\?,\?\)/)
})

test('Start/Extend/Top Up modals cannot close while busy and Start has no dead success branch', () => {
  const start = read('apps/customer/src/components/customer/StartSessionModal.jsx')
  const extend = read('apps/customer/src/components/customer/ExtendSessionModal.jsx')
  const topup = read('apps/customer/src/components/customer/TopUpModal.jsx')
  assert.match(start, /<Modal[\s\S]*?busy=\{busy\}/)
  assert.doesNotMatch(start, /result\?\.ok\s*\?\s*\(/)
  assert.match(extend, /<Modal[\s\S]*?busy=\{busy\}/)
  assert.match(extend, /function close\(\)\s*\{\s*if \(busy\) return;/)
  assert.match(topup, /<Modal[\s\S]*?busy=\{busy\}/)
  assert.match(topup, /function handleClose\(\)\s*\{\s*if \(busy\) return;/)
})

test('customer session warning milestones fire at exact 5-minute and 1-minute boundaries', async () => {
  const { sessionWarningMinute } = await import('../apps/customer/src/lib/sessionTime.js')
  assert.equal(sessionWarningMinute(300), 5)
  assert.equal(sessionWarningMinute(299), 5)
  assert.equal(sessionWarningMinute(61), 5)
  assert.equal(sessionWarningMinute(60), 1)
  assert.equal(sessionWarningMinute(59), 1)
  assert.equal(sessionWarningMinute(6), 1)
  assert.equal(sessionWarningMinute(5), null)
  assert.equal(sessionWarningMinute(0), null)
})

test('customer low-time audio uses bundled five-minute and one-minute MP3 warnings', () => {
  const sound = read('apps/customer/src/lib/sound.js')
  const view = read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(sound, /session-5-minutes-left\.mp3/)
  assert.match(sound, /session-1-minute-left\.mp3/)
  assert.match(sound, /audio\.pause\(\)/)
  assert.match(sound, /audio\.currentTime\s*=\s*0/)
  assert.match(view, /sessionWarningMinute\(remainingSeconds\)/)
})

test('blocking customer overlays consume Escape instead of leaking through to the desktop', () => {
  const locked = read('apps/customer/src/components/common/StationLockedOverlay.jsx')
  const power = read('apps/customer/src/components/common/PowerCommandWarning.jsx')
  assert.match(locked, /Escape.*includes\(event\.key\)/)
  assert.match(power, /Escape.*includes\(event\.key\)/)
})

test('Extend Time no longer exposes duration presets; pesos are the only linear extension input', () => {
  const source = read('apps/customer/src/components/customer/ExtendSessionModal.jsx')
  assert.doesNotMatch(source, /amountForMinutes/)
  assert.doesNotMatch(source, /TIME_PRESETS/)
  assert.match(source, /minutesForAmount\(effectivePlan, amount\)/)
})

test('login-screen Top Up validates Philippine GCash number and renders modal-local errors', () => {
  const source = read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  assert.match(source, /const \[topUpError, setTopUpError\]/)
  assert.match(source, /\^09\\d\{9\}\$/)
  assert.match(source, /topUpError\s*&&/)
})

test('backend public top-up rejects malformed customer GCash numbers', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  const section = source.slice(source.indexOf('router.post("/public/top-ups"'), source.indexOf('router.get("/public/settings"'))
  assert.match(section, /!\/\^09\\d\{9\}\$\/\.test\(request\.gcashNumber\)/)
})

test('customer-facing code contains no cashier role or cashier wording', () => {
  const appData = read('apps/customer/src/context/AppDataContext.jsx')
  const topup = read('apps/customer/src/components/customer/TopUpModal.jsx')
  assert.doesNotMatch(appData, /role === ['"]cashier['"]|role === ['"]admin['"] \|\| user\.role === ['"]cashier['"]/)
  assert.doesNotMatch(topup, /cashier/i)
})

test('Request Help buttons disable during busy state', () => {
  const source = read('apps/customer/src/pages/CustomerSessionView.jsx')
  const occurrences = [...source.matchAll(/disabled=\{assistanceSent \|\| assistanceBusy\}/g)]
  assert.ok(occurrences.length >= 3, `expected at least 3 guarded Request Help buttons, found ${occurrences.length}`)
  assert.doesNotMatch(source, /disabled=\{assistanceSent\}(?!\s*\|\|)/)
})

test('birthday notice requires an actually eligible birthday plan and connection badge reflects server errors', () => {
  const source = read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(source, /plan\?\.eligible === true/)
  assert.match(source, /serverError \? ['"]Offline['"] : ['"]Online['"]/)
})

test('zero-wallet/zero-saved-time customer login returns INSUFFICIENT_BALANCE', () => {
  const source = read('backend/src/routes/authRoutes.js')
  assert.match(source, /INSUFFICIENT_BALANCE/)
  assert.match(source, /wallet_balance/)
  assert.match(source, /session_seconds_remaining/)
})

test('login announcement still exposes all active plans as requested', () => {
  const source = read('backend/src/routes/apiRoutes.js')
  const section = source.slice(source.indexOf('router.get("/public/rate-plans"'), source.indexOf('router.get("/public/announcements"'))
  assert.match(section, /WHERE is_active=1 ORDER BY name/)
  assert.doesNotMatch(section, /customer_self_service=1/)
})

test('Electron ACTIVE mode is normal, cancel returns IDLE, and remote unlock restores IDLE', () => {
  const source = read('apps/customer/electron/main.cjs')
  assert.match(source, /function applyActiveWindowMode[\s\S]*?setAlwaysOnTop\(false\)/)
  assert.match(source, /client:cancel-session-start['"], \(\) => showIdleDashboard\(\)/)
  assert.match(source, /snapshot\?\.windowState === WINDOW_STATES\.IDLE[\s\S]*?showIdleDashboard\(\)/)
  assert.doesNotMatch(source, /for \(const accelerator of \['Alt\+F4','Alt\+Tab'/)
  assert.match(source, /before-input-event[\s\S]*?if \(isActive\(\)\) return/)
  assert.match(source, /mainWindow\.on\('blur'[\s\S]*?if \(isActive\(\)\) return/)
})

test('authenticated Electron mode maps to IDLE rather than contradictory LOCKED state', () => {
  const source = read('apps/customer/electron/main.cjs')
  const start = source.indexOf('function applyAuthenticatedWindowMode()')
  const end = source.indexOf('function enterActiveState()', start)
  const section = source.slice(start, end)
  assert.match(section, /return showIdleDashboard\(\)/)
  assert.doesNotMatch(section, /WINDOW_STATES\.LOCKED/)
})

test('customer station identity does not depend on a global runtime IP prefix', () => {
  const backend = read('backend/src/routes/apiRoutes.js')
  const preload = read('apps/customer/electron/preload.cjs')
  const auth = read('apps/customer/src/context/AuthContext.jsx')
  const publicSettings = backend.slice(backend.indexOf('router.get("/public/settings"'), backend.indexOf('router.get("/public/branding/logo"'))
  assert.doesNotMatch(publicSettings, /ipPrefix:/)
  assert.doesNotMatch(preload, /setIpPrefix|client:set-ip-prefix/)
  assert.doesNotMatch(auth, /setIpPrefix|settings\?\.ipPrefix/)
})

test('promo redemption window uses the same Asia/Manila cross-midnight schedule authority', async () => {
  const eligibility = await import('../backend/src/utils/rateEligibility.js')
  assert.equal(typeof eligibility.promoWindowBounds, 'function')
  const plan = {
    promo_kind: 'just_because',
    time_start: '22:00',
    time_end: '02:00',
    days_of_week: JSON.stringify([0]),
  }
  const bounds = eligibility.promoWindowBounds(plan, new Date('2026-08-17T01:00:00+08:00'))
  assert.equal(bounds?.active, true)
  assert.equal(bounds?.start.toISOString(), '2026-08-16T14:00:00.000Z')
  assert.equal(bounds?.end.toISOString(), '2026-08-16T18:00:00.000Z')
})

test('promo linear cutoff math is proportional, not block-rounded', () => {
  const source = read('backend/src/utils/promoValidation.js')
  assert.doesNotMatch(source, /Math\.floor\(requestedAmount \/ pesoUnit\) \* unitMinutes/)
  assert.match(source, /Math\.floor\(requestedAmount \* \(unitMinutes \/ pesoUnit\)\)/)
})


test('promo schedule applies days_of_week even when no daily time window is configured', () => {
  const plan = {
    is_active: 1,
    customer_self_service: 1,
    customer_tier: 'Regular',
    promo_kind: 'holiday',
    days_of_week: JSON.stringify([0]),
  }
  assert.equal(promoScheduleStatus(plan, new Date('2026-08-16T12:00:00+08:00')), 'active')
  assert.equal(promoScheduleStatus(plan, new Date('2026-08-17T12:00:00+08:00')), 'day_not_active')
})

test('promo redemption bounds support date-only promos without requiring time_start/time_end', () => {
  const plan = {
    is_active: 1,
    starts_at: '2026-08-16T00:00:00.000Z',
    ends_at: '2026-08-20T00:00:00.000Z',
  }
  const bounds = promoWindowBounds(plan, new Date('2026-08-17T00:00:00.000Z'))
  assert.equal(bounds?.active, true)
  assert.equal(bounds?.start.toISOString(), '2026-08-16T00:00:00.000Z')
  assert.equal(bounds?.end.toISOString(), '2026-08-20T00:00:00.000Z')
})

test('promo redemption cutoff never extends beyond the overall promo end timestamp', () => {
  const plan = {
    is_active: 1,
    time_start: '22:00',
    time_end: '02:00',
    days_of_week: JSON.stringify([0]),
    ends_at: '2026-08-16T15:00:00.000Z', // 23:00 Manila, before the 02:00 daily cutoff
  }
  const bounds = promoWindowBounds(plan, new Date('2026-08-16T14:30:00.000Z'))
  assert.equal(bounds?.active, true)
  assert.equal(bounds?.end.toISOString(), '2026-08-16T15:00:00.000Z')
})

test('customer session branding uses dynamic useBranding source and reacts to branding updates', () => {
  const hook = read('apps/customer/src/hooks/useBranding.js')
  const session = read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(hook, /aezakmi:branding-updated/)
  assert.match(hook, /apiGet\(['"]\/public\/settings['"]\)/)
  assert.match(session, /useBranding\(\)/)
  assert.match(session, /src=\{branding\.logoUrl \|\| logo\}/)
  assert.doesNotMatch(session, /settings\?\.logoUrl/)
})

test('customer realtime invalidation bridges backend branding/settings changes into useBranding refresh', () => {
  const source = read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(source, /payload\?\.path === ['"]\/branding\/logo['"]/)
  assert.match(source, /payload\?\.path === ['"]\/settings['"]/)
  assert.match(source, /aezakmi:branding-updated/)
})

test('login idle shutdown is not reset by clicks, typing, mouse movement, or form changes', () => {
  const source = read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  assert.doesNotMatch(source, /const events = \["pointerdown", "keydown", "mousemove", "touchstart"\]/)
  assert.doesNotMatch(source, /addEventListener\(event, reset/)
  assert.match(source, /let remaining = 180;/)
  assert.match(source, /if \(remaining > 0 \|\| shutdownTriggered\.current\) return;/)
})

test('customer duration labels are human-readable and Extend Time is peso-first only', async () => {
  const { formatDuration } = await import('../apps/customer/src/lib/duration.js')
  assert.equal(formatDuration(30), '30 min')
  assert.equal(formatDuration(60), '1 hr')
  assert.equal(formatDuration(90), '1 hr 30 min')
  assert.equal(formatDuration(120), '2 hrs')

  const source = read('apps/customer/src/components/customer/ExtendSessionModal.jsx')
  assert.doesNotMatch(source, /TIME_PRESETS/)
  assert.doesNotMatch(source, /amountForMinutes/)
  assert.match(source, /minutesForAmount\(effectivePlan, amount\)/)
  assert.match(source, /You will receive|Time to add/)
})

test('customer rate-plan labels show friendly durations instead of raw minute counts', () => {
  const extend = read('apps/customer/src/components/customer/ExtendSessionModal.jsx')
  const start = read('apps/customer/src/components/customer/StartSessionModal.jsx')
  assert.match(extend, /formatDuration\(plan\.minutesPerUnit \|\| plan\.minutes\)/)
  assert.match(start, /formatDuration\(p\.minutesPerUnit \|\| p\.minutes\)/)
})

test('customer theme keeps Midnight Express as primary while using gold accents in light mode', () => {
  const css = read('apps/customer/src/index.css')
  for (const hex of ['#202937','#423D42','#766664','#A99898','#D4C1B9','#E6D7CD','#F5F5F5']) assert.match(css, new RegExp(hex, 'i'))
  assert.match(css, /--color-ink:\s*#F5F5F5/i)
  assert.match(css, /--color-gold:\s*#C9A85D/i)
  assert.match(css, /--color-gold-dim:\s*#8B6B25/i)
  const button = read('apps/customer/src/components/common/Button.jsx')
  assert.match(button, /primary:\s*['"]bg-midnight text-soft-white hover:bg-bluish/)
})

test('customer Aktura fallback logo matches Midnight Express branding while warning stays semantic amber', () => {
  const svg = read('apps/customer/src/assets/aktura-logo.svg')
  assert.match(svg, /fill="#202937"/i)
  assert.match(svg, /stroke="#F5F5F5"/i)
  assert.match(svg, /fill="#F5F5F5"/i)
  const toasts = read('apps/customer/src/components/common/ToastContainer.jsx')
  assert.match(toasts, /warning:[\s\S]*border-amber-[0-9]+[\s\S]*text-amber-[0-9]+/)
})

test('customer ACTIVE dashboard is 960x680 while keeping normal desktop behavior', () => {
  const source = read('apps/customer/electron/main.cjs')
  assert.match(source, /const ACTIVE_WIDTH = 960/)
  assert.match(source, /const ACTIVE_HEIGHT = 680/)
  assert.match(source, /function applyActiveWindowMode[\s\S]*?setAlwaysOnTop\(false\)/)
  assert.match(source, /setSkipTaskbar\(true\)/)
})

test('customer dashboard keeps announcements and feedback while using plain-language actions', () => {
  const source = read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(source, />Announcements</)
  assert.match(source, /Feedback/)
  assert.match(source, /Time Left/)
  assert.match(source, /Add Time/)
  assert.match(source, /Top Up/)
  assert.match(source, /Ask for Help/)
  assert.doesNotMatch(source, />Extend Time</)
  assert.doesNotMatch(source, />Request Help</)
})

test('customer signed-in dashboard preserves default customer workflows', () => {
  const source = read('apps/customer/src/pages/CustomerSessionView.jsx')
  for (const token of [
    'setTopUpOpen(true)',
    'setExtendOpen(true)',
    'setStartOpen(true)',
    'handleHelp',
    'openFeedback',
    'handleThisPc',
    'setPowerConfirm("restart")',
    'setPowerConfirm("shutdown")',
  ]) assert.ok(source.includes(token), `missing preserved customer workflow: ${token}`)
})

test('customer shared modal supports Overview-style descriptions and readable controls', () => {
  const source = read('apps/customer/src/components/common/Modal.jsx')
  assert.match(source, /description/)
  assert.match(source, /text-\[20px\]/)
  assert.match(source, /min-h-11/)
  assert.match(source, /if \(busy\) return/)
  assert.match(source, /event\.key === ['"]Escape['"]/)
})

test('customer login preserves announcements, public rates, top up, guest entry, and fixed shutdown grace period', () => {
  const source = read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  assert.match(source, /Announcements/)
  assert.match(source, /Active rate plans/)
  assert.match(source, /Top Up/)
  assert.match(source, /enterGuestMode/)
  assert.match(source, /let remaining = 180;/)
  assert.match(source, /customer-login-shell/)
})

test('routed Customer Login uses the Overview-style user login hierarchy and preserves pre-login workflows', () => {
  const app = read('apps/customer/src/App.jsx')
  const source = read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  const css = read('apps/customer/src/index.css')
  assert.match(app, /CustomerLoginForm/)
  assert.match(source, /customer-login-header/)
  assert.match(source, /customer-login-actions/)
  assert.match(source, /Member sign in/)
  assert.match(source, />Announcements</)
  assert.match(source, /Top Up Wallet/)
  assert.match(source, /enterGuestMode/)
  assert.match(source, /Active rate plans/)
  assert.match(source, /let remaining = 180;/)
  assert.match(css, /\.customer-login-header/)
  assert.match(css, /\.customer-login-actions/)
})

test('customer dark mode uses the same Midnight-led neutral hierarchy without hard-coded white dashboard surfaces', () => {
  const css = read('apps/customer/src/index.css')
  const view = read('apps/customer/src/pages/CustomerSessionView.jsx')
  const modal = read('apps/customer/src/components/common/Modal.jsx')
  const login = read('apps/customer/src/components/auth/CustomerLoginForm.jsx')
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--color-surface:\s*#272D39/i)
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--color-surface-raised:\s*#303744/i)
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--color-surface-line:\s*#4B5360/i)
  assert.match(css, /\.customer-login-dark[\s\S]*--color-surface:\s*#272D39/i)
  assert.doesNotMatch(view, /bg-soft-white/)
  assert.doesNotMatch(modal, /bg-soft-white/)
  assert.doesNotMatch(login, /bg-soft-white/)
})

test('customer dark mode separates gold secondary accents from slate tertiary text', () => {
  const css = read('apps/customer/src/index.css')
  assert.match(css, /--color-slate-soft:\s*#5F6F82/i)
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--color-gold:\s*#D6B76A/i)
  assert.match(css, /html\[data-theme="dark"\][\s\S]*--color-slate-soft:\s*#94A3B8/i)
  assert.match(css, /\.customer-login-dark[\s\S]*--color-gold:\s*#D6B76A/i)
  assert.match(css, /\.customer-login-dark[\s\S]*--color-slate-soft:\s*#94A3B8/i)
})

test('Customer Electron tray icon uses current Midnight and Soft White Aktura branding', () => {
  const source = read('apps/customer/electron/tray-icon.svg')
  assert.match(source, /#202937/i)
  assert.match(source, /#F5F5F5/i)
  assert.doesNotMatch(source, /#E8A33D/i)
  assert.doesNotMatch(source, /#0B1017/i)
})

test('customer state snapshots replace identity-sensitive data across logout and account changes', () => {
  const source = read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(source, /function createPublicState\(/)
  assert.match(source, /setState\(snapshot\)/)
  assert.doesNotMatch(source, /writeSnapshot\(cacheKey,\{\.\.\.state,\.\.\.snapshot\}\)/)
})

test('customer fetches only the current station instead of the entire cafe floor', () => {
  const source = read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(source, /apiGet\(['"]\/pcs\/current['"]\)/)
  assert.doesNotMatch(source, /apiGet\(['"]\/pcs['"]\)/)
})

test('customer context does not expose dormant staff-only mutations or dead power endpoint', () => {
  const source = read('apps/customer/src/context/AppDataContext.jsx')
  for (const name of ['approveTopUp','rejectTopUp','clearResolvedTopUps','addMember','updateMember','deleteMember','adminTopUp','adminRefund','addRatePlan','updateRatePlan','deleteRatePlan','addPc','updatePcMeta','removePc','setMaintenance','refundSession']) {
    assert.doesNotMatch(source, new RegExp(`function ${name}\\(`), `${name} should not ship in customer context`)
  }
  assert.doesNotMatch(source, /apiPost\(['"]\/power['"]/)
})

test('customer realtime comparisons normalize member IDs', () => {
  const source = read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(source, /String\(payload\?\.memberId\)\s*===\s*String\(user\.memberId\)/)
})

test('tray and widget handlers use current callbacks instead of mount-time stale closures', () => {
  const source = read('apps/customer/src/pages/CustomerSessionView.jsx')
  assert.match(source, /const handleHelp = useCallback/)
  assert.match(source, /const handleThisPc = useCallback/)
  assert.match(source, /onTrayLogout[\s\S]{0,160}\[handleThisPc\]/)
  assert.match(source, /\[canExtend, handleHelp, handleThisPc\]/)
})

test('Session modal preserves manual rate selection and clears member identity when switching to Guest', () => {
  const source = read('apps/admin/src/components/floor/SessionModal.jsx')
  assert.match(source, /manualRateSelectionRef/)
  assert.match(source, /setMemberId\(['"]['"]\)/)
  assert.match(source, /customerMode === ['"]member['"]\s*\?\s*Number\(selectedMember\?\.sessionSecondsRemaining/)
})

test('Extend Session visibly selects a valid fallback when a rate disappears', () => {
  const source = read('apps/customer/src/components/customer/ExtendSessionModal.jsx')
  assert.match(source, /if \(!visiblePlans\.some\([\s\S]*selectedPlanId[\s\S]*\)\)\s*\{[\s\S]*setSelectedPlanId/)
})

test('power warning clears on terminal Electron command result', () => {
  const warning = read('apps/customer/src/components/common/PowerCommandWarning.jsx')
  const electron = read('apps/customer/electron/main.cjs')
  assert.match(warning, /onPowerCommandResult/)
  assert.match(warning, /setWarning\(null\)/)
  assert.match(electron, /station:power-command-result/)
})

test('customer mutation API supports stable caller-owned operation keys', () => {
  const source = read('apps/customer/src/lib/api.js')
  assert.match(source, /operationKey/)
  assert.match(source, /createOperationKey/)
})

test('packaged customer networking requires runtime server configuration instead of using file URL as a backend', () => {
  const config = read('apps/customer/src/lib/serverConfig.js')
  const socket = read('apps/customer/src/lib/socket.js')
  assert.match(config, /window\.location\.protocol === ['"]file:['"]/)
  assert.match(config, /SERVER_CONFIG_REQUIRED/)
  assert.match(socket, /apiUrl\(['"]\/['"]\)/)
  assert.doesNotMatch(socket, /window\.location\.origin/)
})

test('station enrollment reconnect binds realtime listeners to the replacement socket', () => {
  const source = read('apps/customer/src/context/AppDataContext.jsx')
  assert.match(source, /function bindSocket\(/)
  assert.match(source, /function unbindSocket\(/)
  assert.match(source, /const disconnectFallbackSocket[\s\S]*unbindSocket\(socket\)[\s\S]*disconnectSocket\(\)/)
  assert.match(source, /const connectFallbackSocket[\s\S]*socket\s*=\s*connectSocket\(\)[\s\S]*bindSocket\(socket\)/)
  assert.match(source, /onStationEnrolled[\s\S]*disconnectFallbackSocket\(\)[\s\S]*connectFallbackSocket\(\)/)
})

test('Customer Electron keeps fallback profile and IndexedDB beside the installed client', () => {
  const main = read('apps/customer/electron/main.cjs')
  const preload = read('apps/customer/electron/preload.cjs')
  const cache = read('apps/customer/src/lib/localCache.js')

  assert.match(main, /const CUSTOMER_LOCAL_DATA_DIR = ['"]\.aezakmi-customer['"]/)
  assert.match(main, /return path\.dirname\(process\.execPath\)/)
  assert.match(main, /app\.setPath\(['"]userData['"], target\)/)
  assert.match(main, /app\.setPath\(['"]sessionData['"], target\)/)
  assert.match(main, /execFileSync\(['"]attrib\.exe['"], \[['"]\+H['"], target\]/)
  assert.match(main, /'IndexedDB'/)
  assert.match(main, /'Local Storage'/)
  assert.match(main, /fs\.rmSync\(source, \{ recursive:true, force:true \}\)/)
  assert.ok(main.indexOf('configureCustomerInstallStorage()') < main.indexOf('app.requestSingleInstanceLock()'))
  assert.match(preload, /getLocalDataPath:\(\) => ipcRenderer\.sendSync\(['"]client:get-local-data-path['"]\)/)
  assert.match(cache, /indexedDB\.open\(DB_NAME,1\)/)
  assert.doesNotMatch(main, /C:\\\\ProgramData/)
})
