// Admin-side rate/PC helpers. Rate plans are always backend-backed; no mock plans are stored here.

export function findPcById(pcs = [], pcId) {
  return (Array.isArray(pcs) ? pcs : []).find((pc) => String(pc?.id) === String(pcId)) ?? null
}

export function rateForId(ratePlans = [], rateId) {
  return (Array.isArray(ratePlans) ? ratePlans : []).find((rate) => String(rate?.id) === String(rateId)) ?? null
}

function resolvePlan(planOrPlans, rateId) {
  if (Array.isArray(planOrPlans)) return rateForId(planOrPlans, rateId)
  return planOrPlans ?? null
}

export function minAmountFor(planOrPlans, rateId) {
  const plan = resolvePlan(planOrPlans, rateId)
  if (!plan) return 0
  const configured = Number(plan.minAmount ?? 0)
  if (configured > 0) return configured
  return Number(plan.pesoUnit ?? plan.amount ?? 0) || 0
}

export function minutesForAmount(planOrPlans, rateIdOrAmount, maybeAmount) {
  const plan = Array.isArray(planOrPlans) ? resolvePlan(planOrPlans, rateIdOrAmount) : planOrPlans
  const value = Number(Array.isArray(planOrPlans) ? maybeAmount : rateIdOrAmount)
  if (!plan || !Number.isFinite(value) || value <= 0) return 0
  if (plan.mode === 'package') return Number(plan.minutes ?? 0)
  const pesoUnit = Number(plan.pesoUnit ?? 0)
  const minutesPerUnit = Number(plan.minutesPerUnit ?? 0)
  if (pesoUnit > 0 && minutesPerUnit > 0) return Math.max(0, Math.floor(value * (minutesPerUnit / pesoUnit)))
  const perMinute = Number(0)
  return perMinute > 0 ? Math.floor(value / perMinute) : 0
}

export function amountForMinutes(planOrPlans, rateIdOrMinutes, maybeMinutes) {
  const plan = Array.isArray(planOrPlans) ? resolvePlan(planOrPlans, rateIdOrMinutes) : planOrPlans
  const mins = Number(Array.isArray(planOrPlans) ? maybeMinutes : rateIdOrMinutes)
  if (!plan || !Number.isFinite(mins) || mins <= 0) return 0
  if (plan.mode === 'package') return Number(plan.amount ?? 0)
  const pesoUnit = Number(plan.pesoUnit ?? 0)
  const minutesPerUnit = Number(plan.minutesPerUnit ?? 0)
  if (pesoUnit > 0 && minutesPerUnit > 0) return mins * (pesoUnit / minutesPerUnit)
  const perMinute = Number(0)
  return perMinute > 0 ? mins * perMinute : 0
}

export function makePcId(pc) {
  if (!pc) return null
  if (typeof pc === 'string') {
    const label = pc.trim()
    if (!label) return null
    return `pc-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
  }
  if (pc.id) return String(pc.id)
  const label = String(pc.label ?? '').trim()
  if (!label) return null
  return `pc-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')}`
}

/**
 * Create a stable backend-safe rate-plan id from either a plan object or a name.
 * The old implementation returned undefined for a newly-created plan because a
 * draft has no id yet. That made POST /rate-plans fail and left the Tariffs UI in
 * an inconsistent state.
 */
export function makeRatePlanId(planOrName) {
  const existing = typeof planOrName === 'object' && planOrName !== null
    ? planOrName.id
    : null
  if (existing) return String(existing)

  const name = typeof planOrName === 'string' ? planOrName : planOrName?.name
  const slug = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

  const suffix = Math.random().toString(36).slice(2, 7)
  return `rate-${slug || 'plan'}-${suffix}`
}
