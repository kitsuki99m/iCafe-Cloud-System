const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;

function asDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const parsed = value ? new Date(value) : null;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}

function minutesOfDay(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseDays(value) {
  if (!value) return null;
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    if (!Array.isArray(parsed)) return null;
    return parsed
      .map(Number)
      .filter(Number.isInteger)
      .filter((day) => day >= 0 && day <= 6);
  } catch {
    return null;
  }
}

function manilaParts(value) {
  const at = asDate(value) ?? new Date();
  const shifted = new Date(at.getTime() + MANILA_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() + shifted.getUTCSeconds() / 60,
  };
}

function previousManilaDay(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() - 1);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    dayOfWeek: date.getUTCDay(),
  };
}


function manilaDateToUtc(parts, minutes) {
  const wholeMinutes = Math.max(0, Number(minutes) || 0);
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      Math.floor(wholeMinutes / 60),
      wholeMinutes % 60,
      0,
      0,
    ) - MANILA_OFFSET_MS,
  );
}

function nextManilaDay(parts) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + 1);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    dayOfWeek: date.getUTCDay(),
  };
}

export function promoWindowBounds(plan, at = new Date()) {
  const current = asDate(at) ?? new Date();
  const parts = manilaParts(current);
  const allowedDays = parseDays(plan?.days_of_week);
  const dateStart = asDate(plan?.starts_at);
  const dateEnd = asDate(plan?.ends_at);
  const hasStartTime = Boolean(plan?.time_start);
  const hasEndTime = Boolean(plan?.time_end);
  const startMin = minutesOfDay(plan?.time_start);
  const endMin = minutesOfDay(plan?.time_end);

  // A half-configured daily window is invalid. Keep it non-active instead of
  // silently treating it as an unrestricted promo.
  if (hasStartTime !== hasEndTime || (hasStartTime && (startMin == null || endMin == null)))
    return null;

  let scheduleStart;
  let scheduleEnd;
  let scheduleDay = null;

  if (startMin != null && endMin != null) {
    const crossesMidnight = endMin <= startMin;
    const startDay = crossesMidnight && parts.minutes < endMin
      ? previousManilaDay(parts)
      : parts;
    const endDay = crossesMidnight ? nextManilaDay(startDay) : startDay;
    scheduleDay = startDay;
    scheduleStart = manilaDateToUtc(startDay, startMin);
    scheduleEnd = manilaDateToUtc(endDay, endMin);
  } else if (allowedDays) {
    // A day-only schedule means the promo is active for the full Manila
    // calendar day and therefore still has an authoritative daily cutoff.
    scheduleDay = parts;
    scheduleStart = manilaDateToUtc(parts, 0);
    scheduleEnd = manilaDateToUtc(nextManilaDay(parts), 0);
  } else {
    // Date-only promos are valid. Use their configured lifetime as the
    // redemption window; fully unscheduled promos remain open-ended.
    scheduleStart = dateStart ?? new Date(0);
    scheduleEnd = dateEnd ?? new Date('9999-12-31T23:59:59.999Z');
  }

  if (dateStart && current < dateStart)
    return { start: dateStart > scheduleStart ? dateStart : scheduleStart, end: scheduleEnd, active: false, reason: "not_started" };
  if (dateEnd && current >= dateEnd)
    return { start: scheduleStart, end: dateEnd < scheduleEnd ? dateEnd : scheduleEnd, active: false, reason: "expired" };
  if (allowedDays && scheduleDay && !allowedDays.includes(scheduleDay.dayOfWeek))
    return { start: scheduleStart, end: scheduleEnd, active: false, reason: "day_not_active" };

  // Global promo timestamps always cap a daily schedule. This prevents an
  // extension from crossing past ends_at just because time_end is later.
  const start = dateStart && dateStart > scheduleStart ? dateStart : scheduleStart;
  const end = dateEnd && dateEnd < scheduleEnd ? dateEnd : scheduleEnd;
  const active = current >= start && current < end;
  return {
    start,
    end,
    active,
    reason: active ? "active" : current < start ? "scheduled" : "expired",
  };
}

function manilaDateKey(value) {
  const parts = manilaParts(value);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function promoScheduleStatus(plan, at = new Date()) {
  if (!plan?.is_active) return "disabled";
  const bounds = promoWindowBounds(plan, at);
  if (!bounds) return "scheduled";
  if (bounds.active) return "active";
  return bounds.reason === "not_started" ? "scheduled" : bounds.reason;
}

export function tierAllowsPlan(memberTier = "Regular", planTier = "Regular") {
  const tierRank = { Regular: 0, Gold: 1, VIP: 2 };
  return (
    (tierRank[String(memberTier || "Regular")] ?? 0) >=
    (tierRank[String(planTier || "Regular")] ?? 0)
  );
}

export function planVisibleForTier(plan, tier = "Regular") {
  const memberTier = String(tier || "Regular");
  const planTier = String(
    plan?.customerTier ?? plan?.customer_tier ?? "Regular",
  );
  return tierAllowsPlan(memberTier, planTier);
}

export function ratePlanEligibility(plan, member, at = new Date(), options = {}) {
  const requireSelfService = options?.requireSelfService !== false;
  if (!plan || !plan.is_active || (requireSelfService && !plan.customer_self_service))
    return { eligible: false, reason: "not_available" };

  const scheduleStatus = promoScheduleStatus(plan, at);
  if (scheduleStatus !== "active")
    return { eligible: false, reason: scheduleStatus };

  const kind = plan.promo_kind ?? "none";
  const memberTier = member?.tier ?? "Regular";

  if (kind === "birthday") {
    const birthday = String(member?.birthdate ?? "");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(birthday) ||
      birthday.slice(5) !== manilaDateKey(at).slice(5)
    )
      return { eligible: false, reason: "birthday_only" };
    return planVisibleForTier(plan, memberTier)
      ? { eligible: true, reason: "birthday" }
      : { eligible: false, reason: "tier" };
  }

  if (kind === "holiday" || kind === "just_because") {
    return planVisibleForTier(plan, memberTier)
      ? { eligible: true, reason: kind }
      : { eligible: false, reason: "tier" };
  }

  return planVisibleForTier(plan, memberTier)
    ? { eligible: true, reason: "tier" }
    : { eligible: false, reason: "tier" };
}
