// Shared mock data for the floor matrix.
// Once the Express/Socket.io backend is wired up (see Section 5 of the roadmap),
// this module is replaced by GET /api/pcs + GET /api/time-rates and live socket updates.
//
// Zone grouping was removed — CCBoot maps every client by IP (Section 1), so the
// floor matrix is a single flat grid.
//
// Billing was reworked from hourly per-PC-tier tariffs to a floor-wide, amount-in ▸
// time-out model: the staff types/taps a peso amount and the rate plan converts
// it straight to minutes. Rate plans are NOT a fixed trio — admins can add, edit,
// and delete them from the Tariffs page (see AppDataContext). This file just seeds
// the initial three. A plan is either:
//   - "linear": scales — every `pesoUnit` pesos buys `minutesPerUnit` minutes
//   - "package": fixed — paying exactly `amount` always buys `minutes`, it doesn't scale

// `customerSelfService` gates whether a plan shows up on the customer dashboard's
// self-service Start Session / picker (Outstanding §4). There's no tier gating —
// whatever an admin flags here is exactly what customers see — but promo/package
// plans default OFF since not every rate plan should be self-service by default.
export const RATE_PLANS = [
  {
    id: 'standard',
    name: 'Standard Rate',
    mode: 'linear',
    pesoUnit: 1,
    minutesPerUnit: 4, // ₱1 = 4 mins
    minAmount: 1,
    customerSelfService: true,
  },
  {
    id: 'midnight',
    name: 'Midnight Rate',
    mode: 'linear',
    pesoUnit: 12,
    minutesPerUnit: 60, // ₱12 = 60 mins
    minAmount: 12,
    customerSelfService: true,
  },
  {
    id: 'promo',
    name: 'Promo Rate',
    mode: 'package',
    amount: 65,
    minutes: 240, // 3 hrs paid + 1 hr free = 4 hrs
    baseMinutes: 180,
    bonusMinutes: 60,
    description: '3 hrs + 1 hr free',
    customerSelfService: false,
  },
]

// All rate-plan helpers below take the *live* ratePlans array (from AppDataContext)
// rather than reaching for the static RATE_PLANS seed above, so admin edits/adds/
// deletes are reflected everywhere immediately.

export function rateForId(ratePlans, ratePlanId) {
  return ratePlans?.find((r) => r.id === ratePlanId) ?? ratePlans?.[0] ?? null
}

// Peso amount -> minutes, for whichever rate plan is active.
export function minutesForAmount(ratePlans, ratePlanId, amount) {
  const plan = rateForId(ratePlans, ratePlanId)
  if (!plan) return 0
  if (plan.mode === 'package') return plan.minutes
  const minutesPerPeso = plan.minutesPerUnit / plan.pesoUnit
  return Math.max(0, Math.floor(Number(amount || 0) * minutesPerPeso))
}

// Minutes -> peso amount, used for postpaid running totals (package plans aren't valid postpaid).
export function amountForMinutes(ratePlans, ratePlanId, minutes) {
  const plan = rateForId(ratePlans, ratePlanId)
  if (!plan) return 0
  if (plan.mode === 'package') return plan.amount
  const pesoPerMinute = plan.pesoUnit / plan.minutesPerUnit
  return Math.max(0, Number(minutes || 0) * pesoPerMinute)
}

export function minAmountFor(ratePlans, ratePlanId) {
  const plan = rateForId(ratePlans, ratePlanId)
  if (!plan) return 1
  return plan.mode === 'package' ? plan.amount : plan.minAmount
}

const now = Date.now()

export const INITIAL_PCS = [
  { id: 'pc-1', label: 'PC-1', ipAddress: '192.168.100.11', spec: 'i3 · GTX 1650', status: 'available' },
  { id: 'pc-2', label: 'PC-2', ipAddress: '192.168.100.12', spec: 'i3 · GTX 1650', status: 'occupied', session: { customerName: 'Jhon Rey', billing: 'postpaid', ratePlanId: 'standard', startedAt: now - 42 * 60000 } },
  { id: 'pc-3', label: 'PC-3', ipAddress: '192.168.100.13', spec: 'i3 · GTX 1650', status: 'occupied', session: { customerName: 'Maricel', billing: 'prepaid', ratePlanId: 'standard', amount: 15, startedAt: now - 18 * 60000, prepaidSeconds: 60 * 60 } },
  { id: 'pc-4', label: 'PC-4', ipAddress: '192.168.100.14', spec: 'i3 · GTX 1650', status: 'maintenance' },
  { id: 'pc-5', label: 'PC-5', ipAddress: '192.168.100.15', spec: 'i3 · GTX 1650', status: 'available' },
  { id: 'pc-6', label: 'PC-6', ipAddress: '192.168.100.16', spec: 'i3 · GTX 1650', status: 'reserved', session: { customerName: 'Kevin D.' } },
  { id: 'pc-7', label: 'PC-7', ipAddress: '192.168.100.21', spec: 'i5 · RTX 3060', status: 'occupied', session: { customerName: 'Ace', customerId: 'm3', billing: 'prepaid', ratePlanId: 'standard', amount: 30, startedAt: now - 105 * 60000, prepaidSeconds: 120 * 60 } },
  { id: 'pc-8', label: 'PC-8', ipAddress: '192.168.100.22', spec: 'i5 · RTX 3060', status: 'available' },
  { id: 'pc-9', label: 'PC-9', ipAddress: '192.168.100.23', spec: 'i5 · RTX 3060', status: 'occupied', session: { customerName: 'Renz', customerId: 'm4', billing: 'postpaid', ratePlanId: 'standard', startedAt: now - 6 * 60000 } },
  { id: 'pc-10', label: 'PC-10', ipAddress: '192.168.100.24', spec: 'i5 · RTX 3060', status: 'available' },
  { id: 'pc-11', label: 'PC-11', ipAddress: '192.168.100.25', spec: 'i5 · RTX 3060', status: 'occupied', session: { customerName: 'Jhun', billing: 'prepaid', ratePlanId: 'midnight', amount: 12, startedAt: now - 58 * 60000, prepaidSeconds: 60 * 60 } },
  { id: 'pc-12', label: 'PC-12', ipAddress: '192.168.100.26', spec: 'i5 · RTX 3060', status: 'available' },
  { id: 'pc-13', label: 'PC-13', ipAddress: '192.168.100.31', spec: 'i7 · RTX 4070', status: 'available' },
  { id: 'pc-14', label: 'PC-14', ipAddress: '192.168.100.32', spec: 'i7 · RTX 4070', status: 'occupied', session: { customerName: 'Nico Alvarado', customerId: 'm5', billing: 'postpaid', ratePlanId: 'standard', startedAt: now - 130 * 60000 } },
  { id: 'pc-15', label: 'PC-15', ipAddress: '192.168.100.33', spec: 'i7 · RTX 4070', status: 'maintenance' },
  { id: 'pc-16', label: 'PC-16', ipAddress: '192.168.100.34', spec: 'i7 · RTX 4070', status: 'available' },
]

export function findPcById(pcs, pcId) {
  return pcs.find((p) => p.id === pcId) ?? null
}

// How many currently-occupied sessions are billing against a given rate plan —
// used by the Tariffs page to show a soft "in use by N sessions" warning before
// a delete, per the roadmap's rate-plan-in-use guard.
export function ratePlanUsageCount(pcs, ratePlanId) {
  return pcs.filter((p) => p.status === 'occupied' && p.session?.ratePlanId === ratePlanId).length
}

// Slug + random suffix so admin-created PCs get a stable, unique id without a
// backend to hand one out — mirrors makeRatePlanId below.
export function makePcId(label) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'pc'
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}

// Slug + random suffix so admin-created rate plans get a stable, unique id
// without needing a backend to hand one out.
export function makeRatePlanId(name) {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'plan'
  return `${base}-${Math.random().toString(36).slice(2, 6)}`
}
