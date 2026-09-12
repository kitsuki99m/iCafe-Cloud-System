// Backend-backed rate/PC helpers. No mock rate plans are stored here.

export function findPcById(pcs = [], pcId) {
  return (
    (Array.isArray(pcs) ? pcs : []).find(
      (pc) => String(pc?.id) === String(pcId),
    ) ?? null
  );
}

export function rateForId(ratePlans = [], rateId) {
  return (
    (Array.isArray(ratePlans) ? ratePlans : []).find(
      (rate) => String(rate?.id) === String(rateId),
    ) ?? null
  );
}

function resolvePlan(planOrPlans, rateId) {
  if (Array.isArray(planOrPlans)) return rateForId(planOrPlans, rateId);
  return planOrPlans ?? null;
}

export function minAmountFor(planOrPlans, rateId) {
  const plan = resolvePlan(planOrPlans, rateId);
  if (!plan) return 0;
  const configured = Number(plan.minAmount ?? 0);
  if (configured > 0) return configured;
  return Number(plan.pesoUnit ?? plan.amount ?? 0) || 0;
}

export function minutesForAmount(planOrPlans, rateIdOrAmount, maybeAmount) {
  const plan = Array.isArray(planOrPlans)
    ? resolvePlan(planOrPlans, rateIdOrAmount)
    : planOrPlans;
  const value = Number(
    Array.isArray(planOrPlans) ? maybeAmount : rateIdOrAmount,
  );
  if (!plan || !Number.isFinite(value) || value <= 0) return 0;
  if (plan.mode === "package") return Number(plan.minutes ?? 0);
  const pesoUnit = Number(plan.pesoUnit ?? 0);
  const minutesPerUnit = Number(plan.minutesPerUnit ?? 0);
  if (pesoUnit > 0 && minutesPerUnit > 0)
    return Math.max(0, Math.floor(value * (minutesPerUnit / pesoUnit)));
  const perMinute = Number(0);
  return perMinute > 0 ? Math.floor(value / perMinute) : 0;
}

export function amountForMinutes(planOrPlans, rateIdOrMinutes, maybeMinutes) {
  const plan = Array.isArray(planOrPlans)
    ? resolvePlan(planOrPlans, rateIdOrMinutes)
    : planOrPlans;
  const mins = Number(
    Array.isArray(planOrPlans) ? maybeMinutes : rateIdOrMinutes,
  );
  if (!plan || !Number.isFinite(mins) || mins <= 0) return 0;
  if (plan.mode === "package") return Number(plan.amount ?? 0);
  const pesoUnit = Number(plan.pesoUnit ?? 0);
  const minutesPerUnit = Number(plan.minutesPerUnit ?? 0);
  if (pesoUnit > 0 && minutesPerUnit > 0)
    return mins * (pesoUnit / minutesPerUnit);
  const perMinute = Number(0);
  return perMinute > 0 ? mins * perMinute : 0;
}

export function makePcId(pc) {
  return pc?.id ?? null;
}
export function makeRatePlanId(ratePlan) {
  return ratePlan?.id ?? null;
}

function tierAllowsPlan(memberTier = "Regular", planTier = "Regular") {
  const tierRank = { Regular: 0, Gold: 1, VIP: 2 };
  return (tierRank[String(memberTier || "Regular")] ?? 0) >=
    (tierRank[String(planTier || "Regular")] ?? 0);
}

export function planVisibleForTier(plan, tier = "Regular") {
  const memberTier = String(tier || "Regular");
  const planTier = String(
    plan?.customerTier || plan?.customer_tier || "Regular",
  );
  return tierAllowsPlan(memberTier, planTier);
}

export function eligibleCustomerPlans(ratePlans = [], tier = "Regular") {
  const normalizedTier = String(tier || "Regular");
  return (Array.isArray(ratePlans) ? ratePlans : [])
    .filter((plan) => plan?.isActive !== false && plan?.customerSelfService)
    .filter((plan) =>
      plan?.eligible === undefined
        ? planVisibleForTier(plan, normalizedTier)
        : plan.eligible,
    )
    .sort((a, b) => {
      const order = { Regular: 0, Gold: 1, VIP: 2 };
      return (
        (order[String(b.customerTier || "Regular")] ?? 0) -
        (order[String(a.customerTier || "Regular")] ?? 0)
      );
    });
}

export function isTierPromo(plan, tier = "Regular") {
  const promoKind = String(plan?.promoKind || plan?.promo_kind || "none");
  const planTier = String(
    plan?.customerTier || plan?.customer_tier || "Regular",
  );
  const memberTier = String(tier || "Regular");
  return (
    promoKind !== "none" || (memberTier !== "Regular" && planTier !== "Regular")
  );
}
