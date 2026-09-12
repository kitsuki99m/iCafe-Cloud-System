import { Router } from "express";
import argon2 from "argon2";
import { db, nowIso, transaction } from "../db/connection.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import {
  id,
  parseJson,
  minutesForAmount,
  amountForMinutes,
  boolInt,
} from "../utils/helpers.js";
import {
  topUpLimiter,
  supportLimiter,
  stationControlLimiter,
} from "../middleware/rateLimiter.js";
import {
  emitTopUpRequest,
  emitSupportRequest,
  emitTopUpUpdated,
  emitWalletUpdated,
  emitSessionUpdated,
  emitDataChanged,
  emitRatePlansUpdated,
  emitAnnouncementsUpdated,
  emitSessionExtensionRequest,
  emitSessionExtensionUpdated,
  emitToStaff,
  getIO,
} from "../realtime.js";
import { env } from "../config/env.js";
import {
  activeSessionPause,
  checkpointMemberSession,
  closeSessionAndSaveRemaining,
  elapsedBillableSeconds,
  remainingSecondsForSession,
  extendPrepaidSession,
  pauseActiveSession,
  resumeActiveSession,
} from "../utils/sessionTime.js";
import crypto from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, unlinkSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { effectivePromoStatus, validatePromoRedemption, recordPromoRedemption, clearSeatCooldown, recentPromoRedeemers } from '../utils/promoValidation.js';
import { ratePlanEligibility, tierAllowsPlan } from '../utils/rateEligibility.js';
import { VALID_MEMBER_TIERS, isValidMemberTier, isValidIsoDate, validateStationIp } from '../utils/validation.js';
import { requirePairedStation } from '../middleware/clientIdentity.js';

const router = Router();
const auth = authenticate;
const TEMPORARY_CUSTOMER_PASSWORD = "1234";

function memberView(m) {
  return {
    id: m.id,
    memberCode: m.member_code,
    name: m.name,
    username: m.username,
    birthdate: m.birthdate,
    phone: m.phone,
    email: m.email,
    tier: m.tier,
    status: m.status,
    wallet: Number(m.wallet_balance ?? 0),
    walletBalance: Number(m.wallet_balance ?? 0),
    pcId: m.pc_id,
    pcIp: m.pc_ip,
    sessionSecondsRemaining: Number(m.session_seconds_remaining ?? 0),
  };
}
function planView(p) {
  return {
    id: p.id,
    name: p.name,
    mode: p.mode,
    pesoUnit: p.peso_unit == null ? null : Number(p.peso_unit),
    minutesPerUnit:
      p.minutes_per_unit == null ? null : Number(p.minutes_per_unit),
    minAmount: p.min_amount == null ? null : Number(p.min_amount),
    amount: p.amount == null ? null : Number(p.amount),
    minutes: p.minutes == null ? null : Number(p.minutes),
    baseMinutes: p.base_minutes == null ? null : Number(p.base_minutes),
    bonusMinutes: p.bonus_minutes == null ? null : Number(p.bonus_minutes),
    description: p.description ?? "",
    customerTier: p.customer_tier ?? "Regular",
    customerSelfService: Boolean(p.customer_self_service),
    isActive: Boolean(p.is_active),
    promoKind: p.promo_kind ?? "none",
    startsAt: p.starts_at ?? null,
    endsAt: p.ends_at ?? null,
    timeStart: p.time_start ?? null,
    timeEnd: p.time_end ?? null,
    daysOfWeek: p.days_of_week ? parseJson(p.days_of_week, p.days_of_week) : null,
    graceMinutes: Number(p.grace_minutes ?? 0),
    effectiveStatus: effectivePromoStatus(p),
  };
}

function prepaidSnapshot(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    name: plan.name,
    mode: plan.mode,
    peso_unit: plan.peso_unit == null ? null : Number(plan.peso_unit),
    minutes_per_unit:
      plan.minutes_per_unit == null ? null : Number(plan.minutes_per_unit),
    min_amount: plan.min_amount == null ? null : Number(plan.min_amount),
    amount: plan.amount == null ? null : Number(plan.amount),
    minutes: plan.minutes == null ? null : Number(plan.minutes),
    base_minutes: plan.base_minutes == null ? null : Number(plan.base_minutes),
    bonus_minutes:
      plan.bonus_minutes == null ? null : Number(plan.bonus_minutes),
    customer_tier: plan.customer_tier ?? "Regular",
    customer_self_service: Boolean(plan.customer_self_service),
    promo_kind: plan.promo_kind ?? "none",
    starts_at: plan.starts_at ?? null,
    ends_at: plan.ends_at ?? null,
  };
}

function sessionRatePlan(session) {
  const snapshot = parseJson(session?.prepaid_rate_snapshot, null);
  return (
    snapshot ||
    db.prepare("SELECT * FROM rate_plans WHERE id=?").get(session?.rate_plan_id)
  );
}

function announcementView(row) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    kind: row.kind,
    audience: row.audience,
    isActive: Boolean(row.is_active),
    startsAt: row.starts_at || null,
    endsAt: row.ends_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
function pcView(p, suppliedActive) {
  const active =
    arguments.length > 1
      ? suppliedActive
      : db
          .prepare(
            `
    SELECT cs.*, rp.name AS rate_plan_name, m.username AS member_username, m.name AS member_name FROM computer_sessions cs
    LEFT JOIN rate_plans rp ON rp.id = cs.rate_plan_id
    LEFT JOIN members m ON m.id = cs.member_id
    WHERE cs.pc_id = ? AND cs.status = 'active'
    ORDER BY cs.started_at DESC LIMIT 1
  `,
          )
          .get(p.id);
  const pause = active ? activeSessionPause(active.id) : null;
  const accruedAmount =
    active?.billing_type === "postpaid"
      ? Math.round(
          (elapsedBillableSeconds(active) / 60) *
            Number(active.postpaid_rate_per_minute || 0) *
            100,
        ) / 100
      : null;
  const session = active
    ? {
        id: active.id,
        customerName: active.customer_name,
        customerId: active.member_id,
        billing: active.billing_type,
        ratePlanId: active.rate_plan_id,
        amount: active.amount_paid ?? null,
        prepaidSeconds: active.prepaid_seconds ?? null,
        startedAt: new Date(active.started_at).getTime(),
        expiresAt: active.expires_at
          ? new Date(active.expires_at).getTime()
          : null,
        postpaidRatePerMinute:
          active.postpaid_rate_per_minute == null
            ? null
            : Number(active.postpaid_rate_per_minute),
        postpaidMinutesPerPeso:
          active.postpaid_rate_per_minute > 0
            ? 1 / Number(active.postpaid_rate_per_minute)
            : null,
        accruedAmount,
        remainingSeconds: remainingSecondsForSession(active),
        billableSeconds: elapsedBillableSeconds(active),
        observedAt: Date.now(),
        username: active.member_username,
        memberName: active.member_name,
        isLocked: Boolean(pause),
        pausedAt: pause?.paused_at ? new Date(pause.paused_at).getTime() : null,
        pauseReason: pause?.reason ?? null,
      }
    : null;
  const numberMatch = String(p.label || p.id || "").match(/\d+/);
  return {
    id: p.id,
    pcNumber: numberMatch ? Number(numberMatch[0]) : null,
    label: p.label,
    ipAddress: p.ip_address,
    macAddress: p.mac_address,
    spec: p.spec,
    status: p.status,
    session,
  };
}

function settingsView() {
  const rows = db.prepare("SELECT key,value FROM settings").all();
  const out = {};
  for (const r of rows) {
    if (r.key === 'ipPrefix') continue;
    out[r.key] = parseJson(r.value, r.value);
  }
  return out;
}
function localLogoPaths() {
  const dataDir = dirname(env.databasePath)
  const brandingDir = join(dataDir, "branding")
  return {
    brandingDir,
    png: join(brandingDir, "logo.png"),
    svg: join(brandingDir, "logo.svg"),
  }
}
function localLogoMeta() {
  const paths = localLogoPaths()
  for (const [mime, filePath] of [["image/png", paths.png], ["image/svg+xml", paths.svg]]) {
    if (existsSync(filePath)) {
      const stat = statSync(filePath)
      return { mime_type: mime, filePath, updated_at: stat.mtime.toISOString(), source: "file" }
    }
  }
  const asset = db.prepare("SELECT mime_type,data,updated_at FROM brand_assets WHERE id='primary'").get()
  return asset ? { ...asset, source: "database" } : null
}

function log(userId, action, type, entityId, pcId, details) {
  db.prepare(
    `INSERT INTO logs (id,user_id,action,entity_type,entity_id,pc_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)`,
  ).run(
    id(),
    userId,
    action,
    type,
    entityId,
    pcId,
    details ? JSON.stringify(details) : null,
    nowIso(),
  );
}

const REVENUE_CATEGORY = {
  session_start: "prepaid",
  session_extension: "extension",
  postpaid_settlement: "postpaid",
  session_refund: "refund",
  wallet_top_up: "wallet_top_up",
  member_initial_wallet: "initial_wallet",
  pos_sale: "pos",
};
function recordRevenue(
  eventType,
  sourceType,
  sourceId,
  amount,
  userId = null,
  occurredAt = nowIso(),
  options = {},
) {
  const cents = Math.round(Number(amount || 0) * 100);
  if (!Number.isFinite(cents) || cents === 0) return;
  db.prepare(
    "INSERT OR IGNORE INTO revenue_events(id,event_type,source_type,source_id,amount_centavos,occurred_at,created_by,category,payment_method,member_id,pc_id,metadata,reversed_event_id) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).run(
    id(),
    eventType,
    sourceType,
    String(sourceId),
    cents,
    occurredAt,
    userId,
    options.category || REVENUE_CATEGORY[eventType] || eventType,
    options.paymentMethod || null,
    options.memberId || null,
    options.pcId || null,
    options.metadata ? JSON.stringify(options.metadata) : null,
    options.reversedEventId || null,
  );
}

function manilaDateParts(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

function manilaIso(year, month, day, end = false) {
  const utc = end
    ? Date.UTC(year, month - 1, day, 15, 59, 59, 999)
    : Date.UTC(year, month - 1, day - 1, 16, 0, 0, 0);
  return new Date(utc).toISOString();
}

function reportBounds(period = "monthly", dateValue = null) {
  const parsed =
    dateValue && /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))
      ? new Date(`${dateValue}T12:00:00+08:00`)
      : new Date();
  const { year, month, day } = manilaDateParts(parsed);
  if (period === "daily")
    return {
      period: "daily",
      start: manilaIso(year, month, day),
      end: manilaIso(year, month, day, true),
      year,
      label: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    };
  if (period === "yearly")
    return {
      period,
      start: manilaIso(year, 1, 1),
      end: manilaIso(year, 12, 31, true),
      year,
      label: String(year),
    };
  if (period === "ytd")
    return {
      period,
      start: manilaIso(year, 1, 1),
      end: manilaIso(year, month, day, true),
      year,
      label: `YTD ${year}`,
    };
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    period: "monthly",
    start: manilaIso(year, month, 1),
    end: manilaIso(year, month, lastDay, true),
    year,
    label: `${year}-${String(month).padStart(2, "0")}`,
  };
}

function taxPolicyView() {
  const settings = settingsView();
  return {
    profile: "pure_self_employed_8_percent",
    ratePercent: Number(settings.taxRatePercent ?? 8),
    annualReduction: Number(settings.taxAnnualReduction ?? 250000),
    eligibilityThreshold: Number(settings.taxEligibilityThreshold ?? 3000000),
    regimeState: String(settings.taxRegimeState ?? "eligible"),
  };
}

function earningsSnapshot(period = "monthly", dateValue = null) {
  const bounds = reportBounds(period, dateValue);
  const revenue = db
    .prepare(
      "SELECT * FROM revenue_events WHERE occurred_at BETWEEN ? AND ? ORDER BY occurred_at,id",
    )
    .all(bounds.start, bounds.end);
  const expenses = db
    .prepare(
      "SELECT * FROM expense_records WHERE voided_at IS NULL AND recorded_at BETWEEN ? AND ? ORDER BY recorded_at,id",
    )
    .all(bounds.start, bounds.end);
  const grossCents = revenue.reduce(
    (sum, row) => sum + Number(row.amount_centavos || 0),
    0,
  );
  const expenseCents = expenses.reduce(
    (sum, row) =>
      sum + Math.round(Number((row.signed_amount ?? row.amount) || 0) * 100),
    0,
  );
  const categories = {};
  for (const row of revenue) {
    const key =
      row.category || REVENUE_CATEGORY[row.event_type] || row.event_type;
    categories[key] =
      (categories[key] || 0) + Number(row.amount_centavos || 0) / 100;
  }
  const expenseCategories = {};
  for (const row of expenses) {
    expenseCategories[row.category] =
      (expenseCategories[row.category] || 0) +
      Number((row.signed_amount ?? row.amount) || 0);
  }
  const walletBalances = Number(
    db
      .prepare(
        "SELECT COALESCE(SUM(wallet_balance),0) total FROM members WHERE status='active'",
      )
      .get().total || 0,
  );
  // Wallet-funded usage is a ledger metric, not revenue. Read the actual
  // wallet debits at the time they occurred so prepaid starts/extensions and
  // postpaid settlements are attributed to the selected earnings period.
  const usage = db
    .prepare(
      `SELECT
         CASE
           WHEN type IN ('session_start','session_extension') THEN 'prepaid'
           WHEN type='postpaid_settlement' THEN 'postpaid'
         END billing_type,
         COALESCE(SUM(-amount),0) amount
       FROM wallet_transactions
       WHERE created_at BETWEEN ? AND ?
         AND amount < 0
         AND type IN ('session_start','session_extension','postpaid_settlement')
       GROUP BY billing_type`,
    )
    .all(bounds.start, bounds.end);
  const walletUsage = Object.fromEntries(
    usage.map((row) => [row.billing_type, Number(row.amount || 0)]),
  );
  const taxProvision = expenses
    .filter((row) =>
      ["Estimated Tax Provision", "Custom Tax Estimate"].includes(row.category),
    )
    .reduce(
      (sum, row) => sum + Number(row.signed_amount ?? row.amount ?? 0),
      0,
    );
  const walletRevenue =
    Number(walletUsage.prepaid || 0) +
    Number(walletUsage.postpaid || 0) +
    walletBalances;
  return {
    bounds,
    summary: {
      gross: grossCents / 100,
      expenses: expenseCents / 100,
      net: (grossCents - expenseCents) / 100,
      walletBalances,
      taxProvision,
      walletRevenue,
    },
    categories,
    expenseCategories,
    revenue: revenue.map((row) => ({
      ...row,
      amount: Number(row.amount_centavos) / 100,
      metadata: parseJson(row.metadata, null),
    })),
    expenses: expenses.map((row) => ({
      ...row,
      amount: Number(row.signed_amount ?? row.amount),
      formulaSnapshot: parseJson(row.formula_snapshot, null),
    })),
    walletUsage,
    taxPolicy: taxPolicyView(),
  };
}

function taxEstimate(dateValue = null, rateOverride = null) {
  const parsed =
    dateValue && /^\d{4}-\d{2}-\d{2}$/.test(String(dateValue))
      ? new Date(`${dateValue}T12:00:00+08:00`)
      : new Date();
  const { year, month, day } = manilaDateParts(parsed);
  const policy = taxPolicyView();
  const ratePercent =
    rateOverride == null ? policy.ratePercent : Number(rateOverride);
  const start = manilaIso(year, 1, 1),
    end = manilaIso(year, month, day, true);
  const grossYtd =
    Number(
      db
        .prepare(
          "SELECT COALESCE(SUM(amount_centavos),0) cents FROM revenue_events WHERE occurred_at BETWEEN ? AND ?",
        )
        .get(start, end).cents || 0,
    ) / 100;
  const taxableGross = Math.max(0, grossYtd - policy.annualReduction);
  const liability = Math.round(taxableGross * (ratePercent / 100) * 100) / 100;
  const priorProvision = Number(
    db
      .prepare(
        "SELECT COALESCE(SUM(COALESCE(signed_amount,amount)),0) total FROM expense_records WHERE source_key='fixed:business-tax' AND tax_year=? AND voided_at IS NULL AND recorded_at<=?",
      )
      .get(year, end).total || 0,
  );
  const exceedsThreshold = grossYtd > policy.eligibilityThreshold;
  const regimeState =
    exceedsThreshold && policy.regimeState !== "manual_confirmed"
      ? "manual_required"
      : policy.regimeState;
  return {
    taxYear: year,
    asOf: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    grossYtd,
    annualReduction: policy.annualReduction,
    taxableGross,
    ratePercent,
    estimatedLiability: liability,
    priorProvision,
    proposedProvision: Math.round((liability - priorProvision) * 100) / 100,
    eligibilityThreshold: policy.eligibilityThreshold,
    exceedsThreshold,
    regimeState,
    profile: policy.profile,
  };
}

function manilaStart(daysBack = 0) {
  const shifted = new Date(Date.now() + 8 * 3600000);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() - daysBack,
    ) -
      8 * 3600000,
  ).toISOString();
}

router.get("/health", (req, res) =>
  res.json({ success: true, status: "ok", database: "connected" }),
);
router.post("/public/station/enroll", (req, res) => {
  if (!req.pc)
    return res
      .status(403)
      .json({
        success: false,
        error: "Register this station in Clients first.",
      });
  if (req.pc.station_token_hash && !req.stationAuthenticated)
    return res
      .status(409)
      .json({
        success: false,
        code: "STATION_ALREADY_PAIRED",
        error:
          "This station is already paired. Reset its pairing from Admin before reinstalling.",
      });
  if (req.stationAuthenticated)
    return res.json({ success: true, paired: true });
  const token = crypto.randomBytes(32).toString("base64url"),
    hash = crypto.createHash("sha256").update(token).digest("hex");
  const result = transaction(() =>
    db
      .prepare(
        "UPDATE pcs SET station_token_hash=?,paired_at=?,updated_at=? WHERE id=? AND station_token_hash IS NULL",
      )
      .run(hash, nowIso(), nowIso(), req.pc.id),
  );
  if (!result.changes)
    return res
      .status(409)
      .json({
        success: false,
        code: "STATION_ALREADY_PAIRED",
        error:
          "This station was paired by another request. Retry with the existing pairing.",
      });
  res.status(201).json({ success: true, paired: true, token });
});

function feedbackQuota(accountKey) {
  const rows = db
    .prepare(
      "SELECT id,message,status,created_at FROM customer_feedback WHERE account_key=? AND julianday(created_at)>=julianday('now','-5 days') ORDER BY created_at DESC",
    )
    .all(accountKey);
  const oldest = rows.at(-1)?.created_at;
  return {
    used: rows.length,
    remaining: Math.max(0, 2 - rows.length),
    resetsAt: oldest
      ? new Date(new Date(oldest).getTime() + 5 * 86400000).toISOString()
      : null,
    messages: rows,
  };
}

function activeGuestFeedbackIdentity(req) {
  const pc = req.pc;
  if (!pc) return null;
  const session = db
    .prepare(
      "SELECT * FROM computer_sessions WHERE pc_id=? AND status='active' AND member_id IS NULL ORDER BY started_at DESC LIMIT 1",
    )
    .get(pc.id);
  return session ? { pc, session, key: `guest-session:${session.id}` } : null;
}

router.get("/public/feedback/me", requirePairedStation, (req, res) => {
  const identity = activeGuestFeedbackIdentity(req);
  if (!identity)
    return res
      .status(403)
      .json({ success: false, error: "An active guest session is required." });
  res.json({ success: true, quota: feedbackQuota(identity.key) });
});
router.get("/feedback/me", auth, requireRole("customer"), (req, res) =>
  res.json({
    success: true,
    quota: feedbackQuota(`member:${req.auth.memberId}`),
  }),
);

router.post("/public/feedback", requirePairedStation, (req, res, next) => {
  try {
    const identity = activeGuestFeedbackIdentity(req);
    if (!identity)
      return res
        .status(403)
        .json({
          success: false,
          code: "GUEST_SESSION_REQUIRED",
          error: "An active guest session is required.",
        });
    const { pc, session, key } = identity;
    const message = String(req.body?.message || "").trim();
    if (message.length < 3 || message.length > 300)
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_FEEDBACK",
          error: "Feedback must contain 3 to 300 characters.",
        });
    const feedbackId = id();
    transaction(() => {
      const recent = feedbackQuota(key).used;
      if (recent >= 2) {
        const error = new Error(
          "This station has reached the two-feedback limit for five days.",
        );
        error.status = 429;
        error.code = "FEEDBACK_LIMIT";
        throw error;
      }
      db.prepare(
        "INSERT INTO customer_feedback(id,account_key,pc_id,customer_name,message,created_at) VALUES(?,?,?,?,?,?)",
      ).run(
        feedbackId,
        key,
        pc.id,
        session.customer_name || "Guest",
        message,
        nowIso(),
      );
    });
    emitDataChanged({ method: "POST", path: "/public/feedback" });
    res
      .status(201)
      .json({ success: true, id: feedbackId, quota: feedbackQuota(key) });
  } catch (error) {
    next(error);
  }
});

router.post("/feedback", auth, requireRole("customer"), (req, res, next) => {
  try {
    const message = String(req.body?.message || "").trim();
    if (message.length < 3 || message.length > 300)
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_FEEDBACK",
          error: "Feedback must contain 3 to 300 characters.",
        });
    const key = `member:${req.auth.memberId}`;
    const member = db
      .prepare("SELECT name FROM members WHERE id=?")
      .get(req.auth.memberId);
    const feedbackId = id();
    transaction(() => {
      const recent = feedbackQuota(key).used;
      if (recent >= 2) {
        const error = new Error(
          "You have reached the two-feedback limit for five days.",
        );
        error.status = 429;
        error.code = "FEEDBACK_LIMIT";
        throw error;
      }
      db.prepare(
        "INSERT INTO customer_feedback(id,account_key,member_id,pc_id,customer_name,message,created_at) VALUES(?,?,?,?,?,?,?)",
      ).run(
        feedbackId,
        key,
        req.auth.memberId,
        req.auth.pcId,
        member?.name || "Member",
        message,
        nowIso(),
      );
    });
    emitDataChanged({ method: "POST", path: "/feedback" });
    res
      .status(201)
      .json({ success: true, id: feedbackId, quota: feedbackQuota(key) });
  } catch (error) {
    next(error);
  }
});

router.get("/feedback", auth, requireRole("admin"), (req, res) => {
  const archived = req.query.archived === "1",
    status = ["resolved", "unresolved"].includes(req.query.status)
      ? req.query.status
      : null;
  const page = Math.max(1, Number.parseInt(req.query.page || "1", 10) || 1),
    limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit || "50", 10) || 50),
    ),
    offset = (page - 1) * limit;
  const where = [`f.archived_at IS ${archived ? "NOT " : ""}NULL`],
    params = [];
  if (status) {
    where.push("f.status=?");
    params.push(status);
  }
  const rows = db
    .prepare(
      `SELECT f.*,m.username,p.label pc_label,(SELECT COUNT(*) FROM customer_feedback c WHERE c.account_key=f.account_key) account_count FROM customer_feedback f LEFT JOIN members m ON m.id=f.member_id LEFT JOIN pcs p ON p.id=f.pc_id WHERE ${where.join(" AND ")} ORDER BY f.status='unresolved' DESC,f.created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset);
  const total = db
    .prepare(
      `SELECT COUNT(*) count FROM customer_feedback f WHERE ${where.join(" AND ")}`,
    )
    .get(...params).count;
  res.json({
    success: true,
    feedback: rows,
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  });
});
router.patch(
  "/feedback/:id/status",
  auth,
  requireRole("admin"),
  (req, res) => {
    const status = String(req.body?.status || "");
    if (!["resolved", "unresolved"].includes(status))
      return res
        .status(400)
        .json({ success: false, error: "Invalid feedback status." });
    const existing = db
      .prepare(
        "SELECT status FROM customer_feedback WHERE id=? AND archived_at IS NULL",
      )
      .get(req.params.id);
    if (!existing)
      return res
        .status(404)
        .json({ success: false, error: "Feedback not found." });
    if (existing.status === status)
      return res.json({ success: true, unchanged: true });
    db.prepare(
      "UPDATE customer_feedback SET status=?,resolved_at=?,resolved_by=? WHERE id=?",
    ).run(
      status,
      status === "resolved" ? nowIso() : null,
      status === "resolved" ? req.auth.userId : null,
      req.params.id,
    );
    emitDataChanged({
      method: "PATCH",
      path: `/feedback/${req.params.id}/status`,
    });
    res.json({ success: true });
  },
);
router.post("/feedback/archive", auth, requireRole("admin"), (req, res) => {
  const ids = Array.isArray(req.body?.ids)
    ? [...new Set(req.body.ids.map(String))]
    : [];
  if (!ids.length)
    return res
      .status(400)
      .json({ success: false, error: "Choose resolved feedback." });
  const marks = ids.map(() => "?").join(",");
  const result = db
    .prepare(
      `UPDATE customer_feedback SET archived_at=? WHERE archived_at IS NULL AND status='resolved' AND id IN (${marks})`,
    )
    .run(nowIso(), ...ids);
  emitDataChanged({ method: "POST", path: "/feedback/archive" });
  res.json({ success: true, count: result.changes });
});
router.post("/feedback/:id/restore", auth, requireRole("admin"), (req, res) => {
  const result = db
    .prepare(
      "UPDATE customer_feedback SET archived_at=NULL WHERE id=? AND archived_at IS NOT NULL",
    )
    .run(req.params.id);
  if (!result.changes)
    return res
      .status(404)
      .json({ success: false, error: "Feedback not found." });
  emitDataChanged({
    method: "POST",
    path: `/feedback/${req.params.id}/restore`,
  });
  res.json({ success: true });
});

router.post(
  "/public/verify-admin-pin",
  requirePairedStation,
  stationControlLimiter,
  async (req, res, next) => {
    try {
      const pin = String(req.body?.pin || "").trim();
      const admins = db
        .prepare(
          "SELECT id,pin_hash FROM users WHERE role='admin' AND is_active=1 AND pin_hash IS NOT NULL",
        )
        .all();
      if (!admins.length)
        return res.status(409).json({
          success: false,
          code: "ADMIN_PIN_NOT_CONFIGURED",
          error: "Configure an active Admin management PIN before changing station server settings.",
        });

      let admin = null;
      for (const candidate of admins) {
        if (candidate.pin_hash && await argon2.verify(candidate.pin_hash, pin)) {
          admin = candidate;
          break;
        }
      }
      if (!admin)
        return res.status(401).json({
          success: false,
          code: "ADMIN_PIN_INVALID",
          error: "Incorrect Admin management PIN.",
        });

      return res.json({ success: true, verified: true });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/public/station-control",
  requirePairedStation,
  stationControlLimiter,
  async (req, res, next) => {
    try {
      const command = String(req.body?.command || "").toLowerCase();
      const pin = String(req.body?.pin || "");
      if (!req.pc && !env.allowUnregisteredDevStation)
        return res
          .status(403)
          .json({
            success: false,
            code: "PC_NOT_REGISTERED",
            error: "This station is not registered.",
          });
      if (req.pc?.station_token_hash && !req.stationAuthenticated)
        return res
          .status(403)
          .json({
            success: false,
            code: "STATION_NOT_PAIRED",
            error: "Station enrollment credential is missing or invalid.",
          });
      if (!["quit", "lock", "unlock"].includes(command))
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_COMMAND",
            error: "Invalid station command.",
          });
      const admins = db
        .prepare(
          "SELECT id,pin_hash FROM users WHERE role='admin' AND is_active=1 AND pin_hash IS NOT NULL",
        )
        .all();
      if (!admins.length)
        return res
          .status(409)
          .json({
            success: false,
            code: "ADMIN_PIN_NOT_CONFIGURED",
            error:
              "Configure an active Admin PIN before using station emergency controls.",
          });
      let admin = null;
      for (const candidate of admins) {
        if (await argon2.verify(candidate.pin_hash, pin)) {
          admin = candidate;
          break;
        }
      }
      if (!admin)
        return res
          .status(401)
          .json({
            success: false,
            code: "ADMIN_PIN_REQUIRED",
            error: "Enter a valid Admin PIN to use this emergency control.",
          });
      const controlId = id(),
        createdAt = nowIso(),
        expiresAt = new Date(Date.now() + 30000).toISOString();
      db.prepare(
        "INSERT INTO station_control_requests(id,pc_id,command,status,authorized_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?)",
      ).run(
        controlId,
        req.pc?.id || null,
        command,
        "authorized",
        admin.id,
        createdAt,
        expiresAt,
      );
      log(
        admin.id,
        `station.${command}.authorized`,
        "pc",
        req.pc?.id ?? null,
        req.pc?.id ?? null,
        {
          source: "hidden_shortcut",
          developmentUnregistered: !req.pc,
          controlId,
        },
      );
      res.json({ success: true, command, controlId, expiresAt });
    } catch (error) {
      next(error);
    }
  },
);
router.patch("/public/station-control/:id/ack", requirePairedStation, (req, res, next) => {
  try {
    if (req.pc?.station_token_hash && !req.stationAuthenticated)
      return res
        .status(403)
        .json({ success: false, error: "Station credential is invalid." });
    const request = db
      .prepare(
        "SELECT * FROM station_control_requests WHERE id=? AND status='authorized'",
      )
      .get(req.params.id);
    if (!request)
      return res
        .status(409)
        .json({
          success: false,
          error: "Station control request is no longer active.",
        });
    if (new Date(request.expires_at).getTime() < Date.now())
      return res
        .status(410)
        .json({ success: false, error: "Station control request expired." });
    if (request.pc_id && String(request.pc_id) !== String(req.pc?.id))
      return res
        .status(403)
        .json({
          success: false,
          error: "Station control request belongs to another PC.",
        });
    const ok = req.body?.status === "completed";
    if (ok && request.pc_id) {
      if (request.command === "lock")
        pauseActiveSession(request.pc_id, {
          reason: "emergency_lock",
          commandId: request.id,
          userId: request.authorized_by,
        });
      if (request.command === "unlock")
        resumeActiveSession(request.pc_id, { commandId: request.id });
      if (request.command === "quit") {
        const session = db
          .prepare(
            "SELECT id,member_id FROM computer_sessions WHERE pc_id=? AND status='active' LIMIT 1",
          )
          .get(request.pc_id);
        if (session?.member_id)
          checkpointMemberSession(session.member_id, session.id);
      }
    }
    db.prepare(
      "UPDATE station_control_requests SET status=?,completed_at=?,result=? WHERE id=?",
    ).run(
      ok ? "completed" : "failed",
      nowIso(),
      JSON.stringify(req.body?.result || null),
      request.id,
    );
    emitDataChanged({
      method: "PATCH",
      path: `/public/station-control/${request.id}/ack`,
    });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Customer/guest help requests. These are persisted so Admin can see them even
// if the dashboard was temporarily offline; Socket.IO is only the real-time alert.
router.post("/public/support", requirePairedStation, supportLimiter, (req, res, next) => {
  try {
    const { message = "Customer needs assistance.", username = null } =
      req.body ?? {};
    const pc = req.pc;
    if (!pc)
      return res
        .status(404)
        .json({
          success: false,
          code: "PC_NOT_REGISTERED",
          error: "This PC is not registered with the cafe server.",
        });
    const clean = String(message).trim().slice(0, 500);
    if (!clean)
      return res
        .status(400)
        .json({ success: false, error: "Help request message is required." });
    const supportId = id();
    db.prepare(
      `INSERT INTO support_messages (id,member_id,pc_id,sender_role,message,status,created_at) VALUES (?,?,?,?,?,'open',?)`,
    ).run(supportId, null, pc.id, "customer", clean, nowIso());
    emitSupportRequest({
      id: supportId,
      memberId: null,
      pcId: pc.id,
      pcLabel: pc.label,
      pcIp: pc.ip_address,
      customerName: String(username || "Guest"),
      message: clean,
    });
    res
      .status(201)
      .json({ success: true, request: { id: supportId, status: "open" } });
  } catch (e) {
    next(e);
  }
});

router.post("/support", auth, supportLimiter, (req, res, next) => {
  try {
    if (!["customer"].includes(req.auth.role))
      return res
        .status(403)
        .json({ success: false, error: "Customer access required." });
    const pc = req.auth.pcId
      ? db.prepare("SELECT * FROM pcs WHERE id=?").get(req.auth.pcId)
      : db.prepare("SELECT * FROM pcs WHERE ip_address=?").get(req.clientIp);
    if (!pc)
      return res
        .status(404)
        .json({
          success: false,
          code: "PC_NOT_REGISTERED",
          error: "This PC is not registered with the cafe server.",
        });
    const clean = String(req.body?.message || "Customer needs assistance.")
      .trim()
      .slice(0, 500);
    if (!clean)
      return res
        .status(400)
        .json({ success: false, error: "Help request message is required." });
    const supportId = id();
    const member = db
      .prepare("SELECT name FROM members WHERE id=?")
      .get(req.auth.memberId);
    db.prepare(
      `INSERT INTO support_messages (id,member_id,pc_id,sender_role,message,status,created_at) VALUES (?,?,?,?,?,'open',?)`,
    ).run(supportId, req.auth.memberId, pc.id, "customer", clean, nowIso());
    db.prepare(
      `INSERT INTO logs (id,user_id,action,entity_type,entity_id,pc_id,details,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      id(),
      req.auth.userId,
      "support.request",
      "support_message",
      supportId,
      pc.id,
      JSON.stringify({ message: clean }),
      nowIso(),
    );
    emitSupportRequest({
      id: supportId,
      memberId: req.auth.memberId,
      pcId: pc.id,
      pcLabel: pc.label,
      pcIp: pc.ip_address,
      customerName: member?.name || req.auth.username || "Customer",
      message: clean,
    });
    res
      .status(201)
      .json({ success: true, request: { id: supportId, status: "open" } });
  } catch (e) {
    next(e);
  }
});

router.get("/support", auth, requireRole("admin"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT s.*,m.name customer_name,p.label pc_label,p.ip_address pc_ip FROM support_messages s LEFT JOIN members m ON m.id=s.member_id LEFT JOIN pcs p ON p.id=s.pc_id ORDER BY s.created_at DESC LIMIT 200`,
    )
    .all();
  res.json({
    success: true,
    supportRequests: rows.map((r) => ({
      id: r.id,
      memberId: r.member_id,
      pcId: r.pc_id,
      senderRole: r.sender_role,
      message: r.message,
      status: r.status,
      createdAt: r.created_at,
      readAt: r.read_at,
      customerName: r.customer_name ?? "Customer",
      pcLabel: r.pc_label ?? "Unknown PC",
      pcIp: r.pc_ip ?? null,
    })),
  });
});

router.patch(
  "/support/:id/resolve",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const r = db
        .prepare("SELECT * FROM support_messages WHERE id=?")
        .get(req.params.id);
      if (!r)
        return res
          .status(404)
          .json({ success: false, error: "Support request not found." });
      db.prepare(
        "UPDATE support_messages SET status='resolved',read_at=? WHERE id=?",
      ).run(nowIso(), r.id);
      log(req.auth.userId, "support.resolve", "support_message", r.id, r.pc_id);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  },
);

// Unauthenticated top-up request used only when a member cannot log in because
// their wallet is empty. This creates a pending request; it never changes the
// wallet balance. Staff approval is still required.
router.post("/public/top-ups", requirePairedStation, topUpLimiter, (req, res, next) => {
  try {
    const {
      username,
      amount,
      method = "cash",
      gcashNumber = null,
    } = req.body ?? {};
    if (
      !String(username || "").trim() ||
      !(Number(amount) > 0) ||
      !Number.isFinite(Number(amount)) ||
      !["cash", "gcash"].includes(method)
    ) {
      return res
        .status(400)
        .json({
          success: false,
          error: "Username, valid amount, and payment method are required.",
        });
    }
    const member = db
      .prepare(
        `SELECT m.*,u.username AS account_username FROM members m JOIN users u ON u.id=m.user_id WHERE u.role='customer' AND u.is_active=1 AND m.status='active' AND lower(u.username)=lower(?) LIMIT 1`,
      )
      .get(String(username).trim());
    if (!member)
      return res
        .status(404)
        .json({
          success: false,
          code: "MEMBER_NOT_FOUND",
          error: "Member account was not found.",
        });
    const pc = req.pc;
    if (!pc)
      return res
        .status(403)
        .json({
          success: false,
          code: "PC_NOT_REGISTERED",
          error: "This PC is not registered with the cafe server yet.",
        });
    const request = {
      id: id(),
      memberId: member.id,
      pcId: pc.id,
      amount: Number(amount),
      method,
      gcashNumber: method === "gcash" ? String(gcashNumber || "").trim() : null,
    };
    if (method === "gcash" && !/^09\d{9}$/.test(request.gcashNumber))
      return res
        .status(400)
        .json({
          success: false,
          code: "GCASH_NUMBER_REQUIRED",
          error: "Enter a valid 11-digit GCash number starting with 09.",
        });
    if (method === "gcash") {
      const configured = settingsView();
      if (!/^09\d{9}$/.test(String(configured.gcashNumber || "")))
        return res
          .status(400)
          .json({
            success: false,
            code: "GCASH_NOT_CONFIGURED",
            error:
              "GCash is not available until the cafe GCash number is configured.",
          });
    }
    db.prepare(
      `INSERT INTO top_up_requests (id,member_id,pc_id,amount,payment_method,ref_no,status,requested_at) VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      request.id,
      request.memberId,
      request.pcId,
      request.amount,
      request.method,
      request.gcashNumber,
      "pending",
      nowIso(),
    );
    emitTopUpRequest({
      id: request.id,
      memberId: request.memberId,
      pcId: request.pcId,
      amount: request.amount,
      method: request.method,
      gcashNumber: request.gcashNumber,
      customerName: member.name,
      pcLabel: pc?.label ?? "Unknown PC",
    });
    res
      .status(201)
      .json({
        success: true,
        request: {
          id: request.id,
          amount: request.amount,
          method: request.method,
          status: "pending",
        },
      });
  } catch (e) {
    next(e);
  }
});

router.get("/public/settings", (req, res) => {
  res.set("Cache-Control", "no-store");
  const all = settingsView();
  const logo = localLogoMeta();
  res.json({
    success: true,
    settings: {
      cafeName: all.cafeName ?? "Aezakmi Cafe",
      branch: all.branch ?? "Davao Branch",
      branchLocation: all.branchLocation ?? "",
      gcashName: all.gcashName ?? "",
      gcashNumber: all.gcashNumber ?? "",
      logoUrl: logo
        ? `/api/public/branding/logo?v=${encodeURIComponent(logo.updated_at)}`
        : null,
      logoVersion: logo?.updated_at ?? null,
    },
  });
});
router.get("/public/branding/logo", (req, res) => {
  const logo = localLogoMeta()
  if (!logo) return res.status(404).end()
  res.set("Content-Type", logo.mime_type)
  res.set("Cache-Control", "no-store")
  res.set("Cross-Origin-Resource-Policy", "cross-origin")
  res.set("ETag", `\"${logo.updated_at}\"`)
  if (logo.source === "file") return res.sendFile(logo.filePath)
  res.send(logo.data)
});

router.get("/public/rate-plans", (req, res, next) => {
  try {
    const rows = db
      .prepare("SELECT * FROM rate_plans WHERE is_active=1 ORDER BY name")
      .all();
    res.json({ success: true, ratePlans: rows.map(planView) });
  } catch (error) {
    next(error);
  }
});

router.get("/public/announcements", (req, res, next) => {
  try {
    const rows = db
      .prepare(
        "SELECT * FROM announcements WHERE is_active=1 AND audience IN ('all','customers') AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?) ORDER BY created_at DESC",
      )
      .all(nowIso(), nowIso());
    res.json({ success: true, announcements: rows.map(announcementView) });
  } catch (error) {
    next(error);
  }
});

router.get("/client/context", (req, res) => {
  const pc = req.pc;
  res.json({
    success: true,
    clientIp: req.clientIp,
    pc: pc
      ? {
          id: pc.id,
          label: pc.label,
          ipAddress: pc.ip_address,
          status: pc.status,
          spec: pc.spec,
        }
      : null,
  });
});

router.get("/guest/session", requirePairedStation, (req, res) => {
  // Guest mode is intentionally unauthenticated, but it is locked to the
  // registered PC identified by the client's LAN IP. Only a session with no
  // member account is exposed here; member sessions are never disclosed.
  const pc = req.pc;
  if (!pc) {
    return res
      .status(404)
      .json({
        success: false,
        code: "PC_NOT_REGISTERED",
        error: "This PC is not registered with the cafe server.",
      });
  }
  const session = db
    .prepare(
      `
    SELECT cs.*, rp.name AS rate_plan_name
    FROM computer_sessions cs
    LEFT JOIN rate_plans rp ON rp.id = cs.rate_plan_id
    WHERE cs.pc_id = ? AND cs.status = 'active' AND cs.member_id IS NULL
    ORDER BY cs.started_at DESC LIMIT 1
  `,
    )
    .get(pc.id);
  const pause = session ? activeSessionPause(session.id) : null;
  res.json({
    success: true,
    guest: true,
    pc: {
      id: pc.id,
      label: pc.label,
      ipAddress: pc.ip_address,
      spec: pc.spec,
      status: pc.status,
    },
    session: session
      ? {
          id: session.id,
          customerName: session.customer_name,
          billing: session.billing_type,
          ratePlanId: session.rate_plan_id,
          ratePlanName: session.rate_plan_name,
          amount: session.amount_paid ?? 0,
          prepaidSeconds: session.prepaid_seconds ?? null,
          postpaidRatePerMinute:
            session.postpaid_rate_per_minute == null
              ? null
              : Number(session.postpaid_rate_per_minute),
          postpaidMinutesPerPeso:
            Number(session.postpaid_rate_per_minute) > 0
              ? 1 / Number(session.postpaid_rate_per_minute)
              : null,
          accruedAmount:
            session.billing_type === "postpaid"
              ? Math.round(
                  (elapsedBillableSeconds(session) / 60) *
                    Number(session.postpaid_rate_per_minute || 0) *
                    100,
                ) / 100
              : null,
          remainingSeconds: remainingSecondsForSession(session),
          billableSeconds: elapsedBillableSeconds(session),
          observedAt: Date.now(),
          startedAt: new Date(session.started_at).getTime(),
          expiresAt: session.expires_at
            ? new Date(session.expires_at).getTime()
            : null,
          isLocked: Boolean(pause),
          pausedAt: pause?.paused_at
            ? new Date(pause.paused_at).getTime()
            : null,
          pauseReason: pause?.reason ?? null,
        }
      : null,
  });
});

router.get("/pcs", auth, requireRole("admin"), (req, res) => {
  const pcs = db.prepare("SELECT * FROM pcs ORDER BY id").all();
  const sessions = db
    .prepare(
      `SELECT cs.*,rp.name AS rate_plan_name,m.username AS member_username,m.name AS member_name FROM computer_sessions cs LEFT JOIN rate_plans rp ON rp.id=cs.rate_plan_id LEFT JOIN members m ON m.id=cs.member_id WHERE cs.status='active' ORDER BY cs.started_at DESC`,
    )
    .all();
  const byPc = new Map();
  for (const session of sessions)
    if (!byPc.has(String(session.pc_id)))
      byPc.set(String(session.pc_id), session);
  res.json({
    success: true,
    pcs: pcs.map((pc) => pcView(pc, byPc.get(String(pc.id)) ?? null)),
  });
});
router.get("/pcs/current", auth, (req, res) => {
  const pc = req.auth.pcId
    ? db.prepare("SELECT * FROM pcs WHERE id = ?").get(req.auth.pcId)
    : null;
  res.json({ success: true, pc: pc ? pcView(pc) : null });
});
router.post("/pcs", auth, requireRole("admin"), (req, res, next) => {
  try {
    // A PC starts offline until its paired Customer Station has connected.
    // Registration only records an identity; it must not make an unreachable
    // IP look ready for customers.
    const {
      id: requestedPcId,
      label,
      ipAddress,
      spec,
      status = "offline",
      macAddress = null,
    } = req.body;
    const cleanLabel = String(label || "").trim();
    const cleanIp = String(ipAddress || "").trim();
    if (!cleanLabel || !cleanIp)
      return res
        .status(400)
        .json({
          success: false,
          error: "PC label and IP address are required.",
        });
    const ipValidation = validateStationIp(cleanIp);
    if (!ipValidation.ok)
      return res.status(400).json({ success:false, code:ipValidation.code, error:ipValidation.error });
    if (
      !["offline", "available", "maintenance", "reserved", "occupied"].includes(
        status,
      )
    )
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_PC_STATUS",
          error: "Invalid PC status.",
        });
    if (status === "occupied" || status === "available")
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_PC_STATUS",
          error:
            "New PCs start offline until the paired Customer Station connects.",
        });
    const generatedId = `pc-${cleanLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")}`;
    const pcId = requestedPcId || generatedId;
    if (!pcId)
      return res
        .status(400)
        .json({ success: false, error: "A valid PC label is required." });
    const duplicateId = db.prepare("SELECT id FROM pcs WHERE id=?").get(pcId);
    if (duplicateId)
      return res
        .status(409)
        .json({
          success: false,
          code: "PC_ID_EXISTS",
          error: `A PC with ID ${pcId} already exists.`,
        });
    const duplicateIp = db
      .prepare("SELECT id,label FROM pcs WHERE ip_address=?")
      .get(cleanIp);
    if (duplicateIp)
      return res
        .status(409)
        .json({
          success: false,
          code: "PC_IP_EXISTS",
          error: `IP address ${cleanIp} is already assigned to ${duplicateIp.label}.`,
        });
    const now = nowIso();
    db.prepare(
      `INSERT INTO pcs (id,pc_number,label,ip_address,mac_address,spec,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)`,
    ).run(
      pcId,
      String(pcId).replace(/^pc-/, "").toUpperCase(),
      cleanLabel,
      cleanIp,
      macAddress,
      spec ?? "",
      status,
      now,
      now,
    );
    log(req.auth.userId, "pc.create", "pc", pcId, null, { label, ipAddress });
    res
      .status(201)
      .json({
        success: true,
        pc: pcView(db.prepare("SELECT * FROM pcs WHERE id=?").get(pcId)),
      });
  } catch (e) {
    next(e);
  }
});
router.patch(
  "/pcs/:id",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const p = db.prepare("SELECT * FROM pcs WHERE id=?").get(req.params.id);
      if (!p)
        return res.status(404).json({ success: false, error: "PC not found." });
      const patch = req.body ?? {};
      const next = {
        label: String(patch.label ?? p.label).trim(),
        ipAddress: String(patch.ipAddress ?? p.ip_address).trim(),
        spec: patch.spec ?? p.spec,
        status: patch.status ?? p.status,
        macAddress: patch.macAddress ?? p.mac_address,
      };
      if (
        ![
          "offline",
          "available",
          "maintenance",
          "reserved",
          "occupied",
        ].includes(next.status)
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_PC_STATUS",
            error: "Invalid PC status.",
          });
      const activeSession = db
        .prepare(
          "SELECT id FROM computer_sessions WHERE pc_id=? AND status='active' LIMIT 1",
        )
        .get(p.id);
      if (!activeSession && patch.status === "available")
        return res
          .status(409)
          .json({
            success: false,
            code: "PC_PRESENCE_MANAGED",
            error:
              "A PC becomes available automatically when its paired Customer Station connects.",
          });
      if (activeSession && next.status !== "occupied")
        return res
          .status(409)
          .json({
            success: false,
            code: "PC_HAS_ACTIVE_SESSION",
            error: "End the active session before changing this PC status.",
          });
      if (!activeSession && next.status === "occupied")
        return res
          .status(409)
          .json({
            success: false,
            code: "PC_HAS_NO_SESSION",
            error: "A PC can only be marked occupied by an active session.",
          });
      if (!next.label)
        return res.status(400).json({ success:false, code:"INVALID_PC_LABEL", error:"A PC label is required." });
      const ipValidation = validateStationIp(next.ipAddress);
      if (!ipValidation.ok)
        return res.status(400).json({ success:false, code:ipValidation.code, error:ipValidation.error });
      const duplicateIp = db
        .prepare("SELECT id,label FROM pcs WHERE ip_address=? AND id<>?")
        .get(next.ipAddress, p.id);
      if (duplicateIp)
        return res
          .status(409)
          .json({
            success: false,
            code: "PC_IP_EXISTS",
            error: `IP address ${next.ipAddress} is already assigned to ${duplicateIp.label}.`,
          });
      db.prepare(
        `UPDATE pcs SET label=?,ip_address=?,spec=?,status=?,mac_address=?,updated_at=? WHERE id=?`,
      ).run(
        next.label,
        next.ipAddress,
        next.spec,
        next.status,
        next.macAddress,
        nowIso(),
        p.id,
      );
      log(req.auth.userId, "pc.update", "pc", p.id, null, next);
      res.json({
        success: true,
        pc: pcView(db.prepare("SELECT * FROM pcs WHERE id=?").get(p.id)),
      });
    } catch (e) {
      next(e);
    }
  },
);
router.post(
  "/pcs/:id/reset-pairing",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const now = nowIso();
      const result = transaction(() => {
        const pc = db.prepare("SELECT id FROM pcs WHERE id=?").get(req.params.id);
        if (!pc) throw Object.assign(new Error("PC not found."), { status:404, code:"PC_NOT_FOUND", expose:true });
        db.prepare("UPDATE pcs SET station_token_hash=NULL,paired_at=NULL,updated_at=? WHERE id=?").run(now, pc.id);
        const revoked = db.prepare(`
          UPDATE auth_sessions
          SET revoked_at=?, ended_at=?, end_reason='pairing_reset'
          WHERE pc_id=? AND revoked_at IS NULL
            AND user_id IN (SELECT id FROM users WHERE role='customer')
        `).run(now, now, pc.id).changes;
        log(req.auth.userId, "pc.pairing_reset", "pc", pc.id, pc.id, { revokedSessions:revoked });
        return { pcId:pc.id, revoked };
      });
      const io = getIO();
      io?.to(`pc:${result.pcId}`).emit('auth:revoked', { reason:'pairing_reset', pcId:result.pcId, at:Date.now() });
      io?.in(`pc:${result.pcId}`).disconnectSockets(true);
      res.json({ success:true, revokedSessions:result.revoked });
    } catch (error) { next(error); }
  },
);
router.delete(
  "/pcs/:id",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const p = db.prepare("SELECT * FROM pcs WHERE id=?").get(req.params.id);
      if (!p)
        return res.status(404).json({ success: false, error: "PC not found." });
      const activeSession = db
        .prepare(
          "SELECT id FROM computer_sessions WHERE pc_id=? AND status='active' LIMIT 1",
        )
        .get(p.id);
      if (activeSession || ["occupied", "reserved"].includes(p.status))
        return res
          .status(409)
          .json({
            success: false,
            code: "PC_IN_USE",
            error: "Cannot remove an occupied, reserved, or actively used PC.",
          });
      db.prepare("DELETE FROM pcs WHERE id=?").run(p.id);
      log(req.auth.userId, "pc.delete", "pc", p.id, null);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  },
);

router.get("/members", auth, requireRole("admin"), (req, res) => {
  res.json({
    success: true,
    members: db
      .prepare("SELECT * FROM members ORDER BY name")
      .all()
      .map(memberView),
  });
});
router.get("/members/me", auth, (req, res) => {
  const m = req.auth.memberId
    ? db.prepare("SELECT * FROM members WHERE id=?").get(req.auth.memberId)
    : null;
  if (!m)
    return res.status(404).json({ success: false, error: "Member not found." });
  res.json({ success: true, member: memberView(m) });
});
router.post("/members", auth, requireRole("admin"), async (req, res, next) => {
  try {
    const {
      id: requestedMemberId = null,
      name,
      tier = "Regular",
      phone = null,
      email = null,
      memberCode = null,
      pcId = null,
      username,
      birthdate,
      wallet = 0,
    } = req.body ?? {};
    const cleanName = String(name ?? "").trim();
    const cleanUsername = String(username ?? "").trim();
    const cleanBirthdate = String(birthdate ?? "").trim();
    const startingWallet = Number(wallet);

    if (
      !cleanName ||
      cleanUsername.length < 3 ||
      !cleanBirthdate
    ) {
      return res
        .status(400)
        .json({
          success: false,
          code: "MEMBER_FIELDS_INVALID",
          error:
            "Name, username (at least 3 characters), and birthdate are required.",
        });
    }
    if (!isValidIsoDate(cleanBirthdate))
      return res.status(400).json({ success:false, code:"INVALID_BIRTHDATE", error:"Birthdate must be a real date in YYYY-MM-DD format." });
    if (!isValidMemberTier(tier))
      return res.status(400).json({ success:false, code:"INVALID_TIER", error:`Tier must be one of ${VALID_MEMBER_TIERS.join(', ')}.` });
    if (!Number.isFinite(startingWallet) || startingWallet < 0)
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_AMOUNT",
          error: "Starting wallet must be zero or greater.",
        });
    if (phone && !/^09\d{9}$/.test(String(phone).replace(/\D/g, "")))
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_PHONE",
          error:
            "Phone must be an 11-digit Philippine mobile number starting with 09.",
        });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim()))
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_EMAIL",
          error: "Enter a valid email address.",
        });

    const existingUser = db
      .prepare("SELECT id FROM users WHERE lower(username)=lower(?)")
      .get(cleanUsername);
    if (existingUser)
      return res
        .status(409)
        .json({
          success: false,
          code: "USERNAME_EXISTS",
          error: "That username is already in use.",
        });

    const memberId = requestedMemberId || id();
    if (db.prepare("SELECT id FROM members WHERE id=?").get(memberId))
      return res
        .status(409)
        .json({
          success: false,
          code: "MEMBER_ID_EXISTS",
          error: "That member ID already exists.",
        });

    const pc = pcId
      ? db.prepare("SELECT * FROM pcs WHERE id=?").get(pcId)
      : null;
    if (pcId && !pc)
      return res
        .status(404)
        .json({
          success: false,
          code: "PC_NOT_FOUND",
          error: "Assigned PC was not found.",
        });

    const argon2 = (await import("argon2")).default;
    const hash = await argon2.hash(TEMPORARY_CUSTOMER_PASSWORD);
    const userId = id();
    const now = nowIso();
    transaction(() => {
      db.prepare(
        `INSERT INTO users (id,member_id,username,password_hash,role,is_active,must_change_credentials,created_at,updated_at) VALUES (?,?,?,?, 'customer',1,1,?,?)`,
      ).run(userId, memberId, cleanUsername, hash, now, now);
      db.prepare(
        `INSERT INTO members (id,user_id,member_code,name,username,birthdate,phone,email,tier,wallet_balance,status,pc_id,pc_ip,password_hash,created_at,updated_at) VALUES (?,?,?,?,?,?,?, ?,?,?, 'active',?,?,?, ?,?)`,
      ).run(
        memberId,
        userId,
        memberCode ?? `M-${Date.now()}`,
        cleanName,
        cleanUsername,
        cleanBirthdate,
        phone,
        email,
        tier,
        startingWallet,
        pcId || null,
        pc?.ip_address ?? null,
        hash,
        now,
        now,
      );
      if (startingWallet > 0)
        db.prepare(
          "INSERT INTO wallet_transactions(id,member_id,type,amount,balance_before,balance_after,reference_type,created_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          id(),
          memberId,
          "admin_top_up",
          startingWallet,
          0,
          startingWallet,
          "member_create",
          now,
        );
      if (startingWallet > 0)
        recordRevenue(
          "member_initial_wallet",
          "member",
          memberId,
          startingWallet,
          req.auth.userId,
          now,
          { paymentMethod: "cash", memberId },
        );
      log(req.auth.userId, "member.create", "member", memberId, null);
    });
    emitDataChanged({ method: "POST", path: "/members" });
    res
      .status(201)
      .json({
        success: true,
        member: memberView(
          db.prepare("SELECT * FROM members WHERE id=?").get(memberId),
        ),
      });
  } catch (e) {
    next(e);
  }
});

router.patch(
  "/members/:id",
  auth,
  requireRole("admin"),
  async (req, res, next) => {
    try {
      const m = db
        .prepare("SELECT * FROM members WHERE id=?")
        .get(req.params.id);
      if (!m)
        return res
          .status(404)
          .json({
            success: false,
            code: "MEMBER_NOT_FOUND",
            error: "Member not found.",
          });
      const { name, tier, phone, email, pcId, password, username, birthdate } = req.body ?? {};
      const hasPcId = Object.prototype.hasOwnProperty.call(req.body ?? {}, "pcId");
      const hasPhone = Object.prototype.hasOwnProperty.call(req.body ?? {}, "phone");
      const hasEmail = Object.prototype.hasOwnProperty.call(req.body ?? {}, "email");
      const nextPcId = hasPcId ? (pcId || null) : m.pc_id;
      const nextPhone = hasPhone
        ? (phone == null || String(phone).trim() === "" ? null : String(phone).replace(/\D/g, ""))
        : m.phone;
      const nextEmail = hasEmail
        ? (email == null || String(email).trim() === "" ? null : String(email).trim())
        : m.email;
      const nextBirthdate = String(birthdate ?? m.birthdate ?? "").trim();
      const nextTier = tier ?? m.tier;
      const cleanUsername = String(username ?? m.username ?? "").trim();
      if (cleanUsername.length < 3)
        return res
          .status(400)
          .json({
            success: false,
            code: "USERNAME_INVALID",
            error: "Username must be at least 3 characters.",
          });
      if (!isValidIsoDate(nextBirthdate))
        return res.status(400).json({ success:false, code:"INVALID_BIRTHDATE", error:"Birthdate must be a real date in YYYY-MM-DD format." });
      if (!isValidMemberTier(nextTier))
        return res.status(400).json({ success:false, code:"INVALID_TIER", error:`Tier must be one of ${VALID_MEMBER_TIERS.join(', ')}.` });
      if (hasPhone && nextPhone && !/^09\d{9}$/.test(nextPhone))
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_PHONE",
            error:
              "Phone must be an 11-digit Philippine mobile number starting with 09.",
          });
      if (hasEmail && nextEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail))
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_EMAIL",
            error: "Enter a valid email address.",
          });
      const duplicate = db
        .prepare(
          "SELECT id FROM users WHERE lower(username)=lower(?) AND id<>?",
        )
        .get(cleanUsername, m.user_id);
      if (duplicate)
        return res
          .status(409)
          .json({
            success: false,
            code: "USERNAME_EXISTS",
            error: "That username is already in use.",
          });
      const pc = nextPcId
        ? db.prepare("SELECT * FROM pcs WHERE id=?").get(nextPcId)
        : null;
      if (nextPcId && !pc)
        return res
          .status(404)
          .json({
            success: false,
            code: "PC_NOT_FOUND",
            error: "Assigned PC was not found.",
          });
      let hash = m.password_hash;
      if (password) {
        const argon2 = (await import("argon2")).default;
        hash = await argon2.hash(String(password));
      }
      db.prepare(
        `UPDATE members SET name=?,username=?,birthdate=?,tier=?,phone=?,email=?,pc_id=?,pc_ip=?,password_hash=?,updated_at=? WHERE id=?`,
      ).run(
        String(name ?? m.name).trim(),
        cleanUsername,
        nextBirthdate,
        nextTier,
        nextPhone,
        nextEmail,
        nextPcId,
        pc?.ip_address ?? null,
        hash,
        nowIso(),
        m.id,
      );
      if (password) {
        db.prepare(
          "UPDATE users SET password_hash=?,username=?,must_change_credentials=0,updated_at=? WHERE id=?",
        ).run(hash, cleanUsername, nowIso(), m.user_id);
      } else if (username) {
        db.prepare(
          "UPDATE users SET username=?,updated_at=? WHERE id=?",
        ).run(cleanUsername, nowIso(), m.user_id);
      }
      log(req.auth.userId, "member.update", "member", m.id, null);
      emitDataChanged({ method: "PATCH", path: `/members/${m.id}` });
      res.json({
        success: true,
        member: memberView(
          db.prepare("SELECT * FROM members WHERE id=?").get(m.id),
        ),
      });
    } catch (e) {
      next(e);
    }
  },
);

router.delete("/members/:id", auth, requireRole("admin"), (req, res, next) => {
  try {
    const active = db
      .prepare(
        `SELECT 1 FROM computer_sessions WHERE member_id=? AND status='active' LIMIT 1`,
      )
      .get(req.params.id);
    if (active)
      return res
        .status(409)
        .json({
          success: false,
          error: "Cannot delete a member with an active computer session.",
        });
    transaction(() => {
      const m = db
        .prepare("SELECT * FROM members WHERE id=?")
        .get(req.params.id);
      if (!m)
        throw Object.assign(new Error("Member not found."), {
          status: 404,
          expose: true,
        });
      db.prepare("DELETE FROM users WHERE id=?").run(m.user_id);
      db.prepare("DELETE FROM members WHERE id=?").run(m.id);
      log(req.auth.userId, "member.delete", "member", m.id, null);
    });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.patch(
  "/members/:id/wallet",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const target = Number(req.body?.balance);
      if (!Number.isFinite(target) || target < 0)
        return res
          .status(400)
          .json({
            success: false,
            error: "Wallet balance must be zero or greater.",
          });
      const result = transaction(() => {
        const m = db
          .prepare("SELECT wallet_balance FROM members WHERE id=?")
          .get(req.params.id);
        if (!m)
          throw Object.assign(new Error("Member not found."), {
            status: 404,
            expose: true,
          });
        const before = Number(m.wallet_balance);
        const delta = target - before;
        if (delta !== 0) {
          db.prepare(
            "UPDATE members SET wallet_balance=?,updated_at=? WHERE id=?",
          ).run(target, nowIso(), m.id);
          db.prepare(
            `INSERT INTO wallet_transactions (id,member_id,type,amount,balance_before,balance_after,reference_type,created_at) VALUES (?,?,?,?,?,?,?,?)`,
          ).run(
            id(),
            m.id,
            "admin_balance_edit",
            delta,
            before,
            target,
            "admin",
            nowIso(),
          );
          log(req.auth.userId, "wallet.balance_edit", "member", m.id, null, {
            before,
            after: target,
          });
        }
        return { memberId: m.id, balance: target, before };
      });
      emitWalletUpdated(result.memberId, {
        balance: result.balance,
        previousBalance: result.before,
        reason: "wallet_balance_edit",
      });
      res.json({
        success: true,
        balance: result.balance,
        memberId: result.memberId,
      });
    } catch (e) {
      next(e);
    }
  },
);

// Add time to a member's currently active session using a configured rate plan.
// Linear plans use the supplied amount (or their minimum); package plans use the
// plan's fixed amount/minutes. This is an admin operation and never touches
// the member wallet because the payment is assumed to be made at the counter.
router.post(
  "/members/:id/session-topup",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const memberId = req.params.id;
      const { ratePlanId, amount = null, username, birthdate } = req.body ?? {};
      const result = transaction(() => {
        const member = db
          .prepare("SELECT * FROM members WHERE id=?")
          .get(memberId);
        if (!member)
          throw Object.assign(new Error("Member not found."), {
            status: 404,
            expose: true,
          });
        const session = db
          .prepare(
            `SELECT * FROM computer_sessions WHERE member_id=? AND status='active' ORDER BY started_at DESC LIMIT 1`,
          )
          .get(memberId);
        if (!session)
          throw Object.assign(
            new Error("This member has no active computer session."),
            { status: 409, expose: true },
          );
        const plan = db
          .prepare("SELECT * FROM rate_plans WHERE id=? AND is_active=1")
          .get(ratePlanId);
        if (!plan)
          throw Object.assign(new Error("Rate plan not found or inactive."), {
            status: 404,
            expose: true,
          });
        if (!tierAllowsPlan(member.tier, plan.customer_tier))
          throw Object.assign(
            new Error(`This rate plan is for ${plan.customer_tier} members only.`),
            { status: 403, code: "RATE_PLAN_TIER_MISMATCH", expose: true },
          );
        let addAmount;
        let addMinutes;
        if (plan.mode === "package") {
          addAmount = Number(plan.amount || 0);
          addMinutes = Number(plan.minutes || 0);
        } else {
          addAmount = Number(amount ?? plan.min_amount ?? 0);
          if (!(addAmount > 0))
            throw Object.assign(
              new Error("A valid amount is required for this rate plan."),
              { status: 400, expose: true },
            );
          if (addAmount < Number(plan.min_amount || 0))
            throw Object.assign(
              new Error(
                `Minimum amount is ₱${Number(plan.min_amount || 0).toFixed(2)}.`,
              ),
              { status: 400, expose: true },
            );
          addMinutes = minutesForAmount(plan, addAmount);
        }
        if (!(addMinutes > 0))
          throw Object.assign(
            new Error("The selected rate plan adds no time."),
            { status: 400, expose: true },
          );
        let promoCheck = { isPromo:false, nameFlag:false };
        if (String(plan.promo_kind || 'none') !== 'none') {
          promoCheck = validatePromoRedemption({
            plan, memberId, pcId: session.pc_id, customerName: session.customer_name,
            amount: addAmount, anchorAt: session.expires_at ? new Date(session.expires_at) : new Date(), now: new Date(),
          });
        }
        const extended = extendPrepaidSession(session, addMinutes * 60);
        db.prepare(
          "UPDATE computer_sessions SET amount_paid=? WHERE id=?",
        ).run(Number(session.amount_paid || 0) + addAmount, session.id);
        const extensionId = id();
        db.prepare(
          `INSERT INTO session_extensions (id,computer_session_id,member_id,rate_plan_id,amount,minutes_added,payment_method,status,requested_at,confirmed_at,confirmed_by) VALUES (?,?,?,?,?,?,'cash','approved',?,?,?)`,
        ).run(
          extensionId,
          session.id,
          memberId,
          plan.id,
          addAmount,
          addMinutes,
          nowIso(),
          nowIso(),
          req.auth.userId,
        );
        if (promoCheck.isPromo) recordPromoRedemption({ plan, memberId, pcId: session.pc_id, sessionId: session.id, customerName: session.customer_name });
        recordRevenue(
          "session_extension",
          "session_extension",
          extensionId,
          addAmount,
          req.auth.userId,
        );
        log(
          req.auth.userId,
          "member.session_topup",
          "computer_session",
          session.id,
          session.pc_id,
          { memberId, ratePlanId, amount: addAmount, minutes: addMinutes },
        );
        return {
          sessionId: session.id,
          amount: addAmount,
          minutesAdded: addMinutes,
          expiresAt: extended.expires_at,
        };
      });
      res.status(201).json({ success: true, ...result });
    } catch (e) {
      next(e);
    }
  },
);

function positiveTransferAmount(value) {
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0
    ? Math.round(amount * 100) / 100
    : null;
}
// The displayed prepaid amount represents the value still attached to the
// session. Moving or removing time moves its proportional value too; revenue
// remains untouched because no new cash was received.
function prepaidValueForSeconds(session, seconds) {
  const totalSeconds = Math.max(0, Number(session?.prepaid_seconds || 0));
  const paid = Math.max(0, Number(session?.amount_paid || 0));
  if (!totalSeconds || !paid || !seconds) return 0;
  return Math.min(
    paid,
    Math.round(
      ((paid * Math.min(Math.max(0, seconds), totalSeconds)) / totalSeconds) *
        100,
    ) / 100,
  );
}
function positiveTransferSeconds(value) {
  const seconds = Number(value);
  return Number.isInteger(seconds) && seconds > 0 ? seconds : null;
}

router.post(
  "/members/:id/wallet-transfers",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const sourceId = String(req.params.id),
        destinationId = String(req.body?.destinationMemberId || "");
      const amount = positiveTransferAmount(req.body?.amount);
      if (!destinationId || sourceId === destinationId || !amount)
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_WALLET_TRANSFER",
            error:
              "Choose a different recipient and a positive transfer amount.",
          });
      const result = transaction(() => {
        const source = db
          .prepare(
            "SELECT id,wallet_balance FROM members WHERE id=? AND status='active'",
          )
          .get(sourceId);
        const destination = db
          .prepare(
            "SELECT id,wallet_balance FROM members WHERE id=? AND status='active'",
          )
          .get(destinationId);
        if (!source || !destination)
          throw Object.assign(
            new Error("Both transfer members must be active."),
            { status: 404, code: "MEMBER_NOT_FOUND", expose: true },
          );
        const before = Number(source.wallet_balance),
          destinationBefore = Number(destination.wallet_balance);
        if (before < amount)
          throw Object.assign(
            new Error("The source wallet does not have enough balance."),
            { status: 409, code: "INSUFFICIENT_BALANCE", expose: true },
          );
        const transferId = id(),
          timestamp = nowIso(),
          after = before - amount,
          destinationAfter = destinationBefore + amount;
        db.prepare(
          "UPDATE members SET wallet_balance=?,updated_at=? WHERE id=?",
        ).run(after, timestamp, sourceId);
        db.prepare(
          "UPDATE members SET wallet_balance=?,updated_at=? WHERE id=?",
        ).run(destinationAfter, timestamp, destinationId);
        const insert = db.prepare(
          "INSERT INTO wallet_transactions(id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
        );
        insert.run(
          id(),
          sourceId,
          "member_transfer_out",
          -amount,
          before,
          after,
          "member_wallet_transfer",
          transferId,
          timestamp,
        );
        insert.run(
          id(),
          destinationId,
          "member_transfer_in",
          amount,
          destinationBefore,
          destinationAfter,
          "member_wallet_transfer",
          transferId,
          timestamp,
        );
        log(
          req.auth.userId,
          "member.wallet_transfer",
          "member_wallet_transfer",
          transferId,
          null,
          { sourceId, destinationId, amount },
        );
        return {
          transferId,
          sourceBalance: after,
          destinationBalance: destinationAfter,
        };
      });
      emitWalletUpdated(sourceId, {
        balance: result.sourceBalance,
        reason: "member_transfer_out",
        amount,
      });
      emitWalletUpdated(destinationId, {
        balance: result.destinationBalance,
        reason: "member_transfer_in",
        amount,
        fromMemberId: sourceId,
      });
      emitDataChanged({
        method: "POST",
        path: `/members/${sourceId}/wallet-transfers`,
        memberId: sourceId,
      });
      res.status(201).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/sessions/:id/time-adjustments",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const kind = String(req.body?.kind || "").toLowerCase();
      const seconds = positiveTransferSeconds(req.body?.seconds);
      const amount =
        kind === "add" && req.body?.amount != null
          ? positiveTransferAmount(req.body.amount)
          : null;
      const destinationPcId = req.body?.destinationPcId
        ? String(req.body.destinationPcId)
        : null;
      if (
        !["add", "reduce", "transfer"].includes(kind) ||
        !seconds ||
        (kind === "add" && req.body?.amount != null && !amount) ||
        (kind === "transfer" && !destinationPcId)
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_TIME_ADJUSTMENT",
            error:
              "Choose add, reduce, or transfer and enter valid positive values.",
          });
      const result = transaction(() => {
        const session = db
          .prepare(
            "SELECT * FROM computer_sessions WHERE id=? AND status='active'",
          )
          .get(req.params.id);
        if (!session || session.billing_type !== "prepaid")
          throw Object.assign(
            new Error("Only an active prepaid session can be adjusted."),
            { status: 409, code: "PREPAID_SESSION_REQUIRED", expose: true },
          );
        const remaining = remainingSecondsForSession(session);
        if (kind !== "add" && remaining < seconds)
          throw Object.assign(
            new Error("The session does not have enough remaining time."),
            { status: 409, code: "INSUFFICIENT_SESSION_TIME", expose: true },
          );
        let destination = null;
        if (kind === "transfer") {
          if (destinationPcId === String(session.pc_id))
            throw Object.assign(new Error("Choose a different PC."), {
              status: 400,
              code: "SAME_RECIPIENT",
              expose: true,
            });
          destination = db
            .prepare(
              "SELECT * FROM computer_sessions WHERE pc_id=? AND status='active' AND billing_type='prepaid' ORDER BY started_at DESC LIMIT 1",
            )
            .get(destinationPcId);
          if (!destination)
            throw Object.assign(
              new Error(
                "The destination PC needs an active prepaid member or guest session.",
              ),
              {
                status: 404,
                code: "DESTINATION_SESSION_NOT_FOUND",
                expose: true,
              },
            );
        }
        const timestamp = nowIso(),
          delta = kind === "add" ? seconds : -seconds;
        const newRemaining = remaining + delta;
        const valueDelta =
          kind === "add"
            ? Number(amount || 0)
            : prepaidValueForSeconds(session, seconds);
        const newAmount = Math.max(
          0,
          Math.round(
            (Number(session.amount_paid || 0) +
              (kind === "add" ? valueDelta : -valueDelta)) *
              100,
          ) / 100,
        );
        const sourcePause = activeSessionPause(session.id);
        const sourceAnchor = sourcePause
          ? new Date(sourcePause.paused_at).getTime()
          : Date.now();
        const newExpires = new Date(
          sourceAnchor + newRemaining * 1000,
        ).toISOString();
        db.prepare(
          "UPDATE computer_sessions SET amount_paid=?,expires_at=?,prepaid_seconds=? WHERE id=?",
        ).run(
          newAmount,
          newExpires,
          Math.max(0, Number(session.prepaid_seconds || 0) + delta),
          session.id,
        );
        if (session.member_id)
          db.prepare(
            "UPDATE members SET session_seconds_remaining=?,updated_at=? WHERE id=?",
          ).run(newRemaining, timestamp, session.member_id);
        const adjustmentId = id();
        if (kind === "add" && amount) {
          db.prepare(
            `INSERT INTO session_extensions (id,computer_session_id,member_id,amount,minutes_added,payment_method,status,requested_at,confirmed_at,confirmed_by) VALUES (?,?,?,?,?,'cash','approved',?,?,?)`,
          ).run(
            adjustmentId,
            session.id,
            session.member_id,
            amount,
            Math.round(seconds / 60),
            timestamp,
            timestamp,
            req.auth.userId,
          );
          recordRevenue(
            "session_extension",
            "session_extension",
            adjustmentId,
            amount,
            req.auth.userId,
            timestamp,
          );
        }
        if (destination) {
          const destinationRemaining =
            remainingSecondsForSession(destination) + seconds;
          const destinationPause = activeSessionPause(destination.id);
          const destinationAnchor = destinationPause
            ? new Date(destinationPause.paused_at).getTime()
            : Date.now();
          const destinationAmount =
            Math.round(
              (Number(destination.amount_paid || 0) + valueDelta) * 100,
            ) / 100;
          db.prepare(
            "UPDATE computer_sessions SET amount_paid=?,expires_at=?,prepaid_seconds=? WHERE id=?",
          ).run(
            destinationAmount,
            new Date(
              destinationAnchor + destinationRemaining * 1000,
            ).toISOString(),
            Number(destination.prepaid_seconds || 0) + seconds,
            destination.id,
          );
          if (destination.member_id)
            db.prepare(
              "UPDATE members SET session_seconds_remaining=?,updated_at=? WHERE id=?",
            ).run(destinationRemaining, timestamp, destination.member_id);
          if (session.member_id)
            db.prepare(
              "INSERT INTO session_time_transactions(id,type,member_id,counterparty_member_id,computer_session_id,seconds,reference_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            ).run(
              adjustmentId,
              "session_transfer_out",
              session.member_id,
              destination.member_id ?? null,
              session.id,
              seconds,
              adjustmentId,
              req.auth.userId,
              timestamp,
            );
          if (destination.member_id)
            db.prepare(
              "INSERT INTO session_time_transactions(id,type,member_id,counterparty_member_id,computer_session_id,seconds,reference_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            ).run(
              id(),
              "session_transfer_in",
              destination.member_id,
              session.member_id ?? null,
              destination.id,
              seconds,
              adjustmentId,
              req.auth.userId,
              timestamp,
            );
          destination = {
            ...destination,
            remainingSeconds: destinationRemaining,
            amount: destinationAmount,
          };
        } else if (session.member_id) {
          db.prepare(
            "INSERT INTO session_time_transactions(id,type,member_id,counterparty_member_id,computer_session_id,seconds,reference_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
          ).run(
            adjustmentId,
            `session_${kind}`,
            session.member_id,
            null,
            session.id,
            Math.abs(seconds),
            adjustmentId,
            req.auth.userId,
            timestamp,
          );
        }
        log(
          req.auth.userId,
          `session.time_${kind}`,
          "computer_session",
          session.id,
          session.pc_id,
          {
            seconds,
            destinationPcId: destination?.pc_id ?? null,
            destinationSessionId: destination?.id ?? null,
          },
        );
        return {
          session,
          remainingSeconds: newRemaining,
          amount: newAmount,
          valueChanged: valueDelta,
          destination,
        };
      });
      emitSessionUpdated(result.session.id, {
        pcId: result.session.pc_id,
        memberId: result.session.member_id,
        reason: `session_time_${kind}`,
        remainingSeconds: result.remainingSeconds,
        amount: result.amount,
      });
      if (result.destination)
        emitSessionUpdated(result.destination.id, {
          pcId: result.destination.pc_id,
          memberId: result.destination.member_id,
          reason: "time_transfer_received",
          remainingSeconds: result.destination.remainingSeconds,
          amount: result.destination.amount,
        });
      emitDataChanged({
        method: "POST",
        path: `/sessions/${req.params.id}/time-adjustments`,
        pcId: result.session.pc_id,
        memberId: result.session.member_id,
      });
      res
        .status(201)
        .json({
          success: true,
          remainingSeconds: result.remainingSeconds,
          amount: result.amount,
          valueChanged: result.valueChanged,
          destinationPcId: result.destination?.pc_id ?? null,
          destinationRemainingSeconds:
            result.destination?.remainingSeconds ?? null,
          destinationAmount: result.destination?.amount ?? null,
        });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/members/:id/session-time-transfers",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const sourceId = String(req.params.id),
        destinationId = String(req.body?.destinationMemberId || ""),
        seconds = positiveTransferSeconds(req.body?.seconds);
      if (!destinationId || sourceId === destinationId || !seconds)
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_SESSION_TIME_TRANSFER",
            error:
              "Choose a different member and a positive whole number of seconds.",
          });
      const result = transaction(() => {
        const sourceMember = db
          .prepare(
            "SELECT id,session_seconds_remaining FROM members WHERE id=? AND status='active'",
          )
          .get(sourceId);
        const destinationMember = db
          .prepare(
            "SELECT id,session_seconds_remaining FROM members WHERE id=? AND status='active'",
          )
          .get(destinationId);
        if (!sourceMember || !destinationMember)
          throw Object.assign(new Error("Both members must be active."), {
            status: 404,
            code: "MEMBER_NOT_FOUND",
            expose: true,
          });
        const sourceSession = db
          .prepare(
            "SELECT * FROM computer_sessions WHERE member_id=? AND status='active' AND billing_type='prepaid' ORDER BY started_at DESC LIMIT 1",
          )
          .get(sourceId);
        const destinationSession = db
          .prepare(
            "SELECT * FROM computer_sessions WHERE member_id=? AND status='active' AND billing_type='prepaid' ORDER BY started_at DESC LIMIT 1",
          )
          .get(destinationId);
        const sourceRemaining = sourceSession
          ? remainingSecondsForSession(sourceSession)
          : Number(sourceMember.session_seconds_remaining || 0);
        if (sourceRemaining < seconds)
          throw Object.assign(
            new Error(
              "The source member does not have enough remaining session time.",
            ),
            { status: 409, code: "INSUFFICIENT_SESSION_TIME", expose: true },
          );
        const destinationRemaining =
          (destinationSession
            ? remainingSecondsForSession(destinationSession)
            : Number(destinationMember.session_seconds_remaining || 0)) +
          seconds;
        const timestamp = nowIso();
        const updateSession = (session, remaining) => {
          if (!session) return;
          const pause = activeSessionPause(session.id);
          const anchor = pause
            ? new Date(pause.paused_at).getTime()
            : Date.now();
          db.prepare(
            "UPDATE computer_sessions SET expires_at=?,prepaid_seconds=? WHERE id=?",
          ).run(
            new Date(anchor + remaining * 1000).toISOString(),
            Math.max(
              0,
              Number(session.prepaid_seconds || 0) +
                (remaining - remainingSecondsForSession(session)),
            ),
            session.id,
          );
        };
        updateSession(sourceSession, sourceRemaining - seconds);
        updateSession(destinationSession, destinationRemaining);
        db.prepare(
          "UPDATE members SET session_seconds_remaining=?,updated_at=? WHERE id=?",
        ).run(sourceRemaining - seconds, timestamp, sourceId);
        db.prepare(
          "UPDATE members SET session_seconds_remaining=?,updated_at=? WHERE id=?",
        ).run(destinationRemaining, timestamp, destinationId);
        const transferId = id(),
          insert = db.prepare(
            "INSERT INTO session_time_transactions(id,type,member_id,counterparty_member_id,computer_session_id,seconds,reference_id,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
          );
        insert.run(
          transferId,
          "member_session_transfer_out",
          sourceId,
          destinationId,
          sourceSession?.id ?? null,
          seconds,
          transferId,
          req.auth.userId,
          timestamp,
        );
        insert.run(
          id(),
          "member_session_transfer_in",
          destinationId,
          sourceId,
          destinationSession?.id ?? null,
          seconds,
          transferId,
          req.auth.userId,
          timestamp,
        );
        log(
          req.auth.userId,
          "member.session_time_transfer",
          "member",
          sourceId,
          null,
          { sourceId, destinationId, seconds },
        );
        return {
          transferId,
          sourceRemainingSeconds: sourceRemaining - seconds,
          destinationRemainingSeconds: destinationRemaining,
          sourceSessionId: sourceSession?.id ?? null,
          destinationSessionId: destinationSession?.id ?? null,
          sourcePcId: sourceSession?.pc_id ?? null,
          destinationPcId: destinationSession?.pc_id ?? null,
        };
      });
      if (result.sourceSessionId)
        emitSessionUpdated(result.sourceSessionId, {
          reason: "session_time_transfer_out",
          memberId: sourceId,
          pcId: result.sourcePcId,
          remainingSeconds: result.sourceRemainingSeconds,
        });
      if (result.destinationSessionId)
        emitSessionUpdated(result.destinationSessionId, {
          reason: "session_time_transfer_in",
          memberId: destinationId,
          pcId: result.destinationPcId,
          remainingSeconds: result.destinationRemainingSeconds,
        });
      emitDataChanged({
        method: "POST",
        path: `/members/${sourceId}/session-time-transfers`,
        memberId: sourceId,
      });
      res.status(201).json({ success: true, ...result });
    } catch (error) {
      next(error);
    }
  },
);

router.get("/rate-plans", auth, (req, res) => {
  const includeInactive =
    req.auth.role === "admin";
  if (req.auth.role === "customer") {
    const member = db
      .prepare("SELECT tier,birthdate FROM members WHERE id=?")
      .get(req.auth.memberId);
    const tier = member?.tier ?? "Regular";
    const rows = db
      .prepare(
        `SELECT * FROM rate_plans WHERE is_active=1 AND customer_self_service=1 ORDER BY name`,
      )
      .all();
    const ratePlans = rows.map((row) => {
      const eligibility = ratePlanEligibility(row, member);
      return {
        ...planView(row),
        ...eligibility,
        promo:
          (row.promo_kind ?? "none") !== "none" ||
          (row.customer_tier === tier && tier !== "Regular"),
        tierLabel: tier,
      };
    });
    return res.json({ success: true, ratePlans, customerTier: tier });
  }
  const rows = db
    .prepare(
      `SELECT * FROM rate_plans ${includeInactive ? "" : "WHERE is_active=1"} ORDER BY name`,
    )
    .all();
  res.json({ success: true, ratePlans: rows.map(planView) });
});

function validateRatePlanInput(input, existing = null) {
  const mode = String(input.mode ?? existing?.mode ?? "");
  const name = String(input.name ?? existing?.name ?? "").trim();
  const customerTier = String(
    input.customerTier ?? existing?.customer_tier ?? "Regular",
  );
  const promoKind = String(input.promoKind ?? existing?.promo_kind ?? "none");
  const timeStart = input.timeStart !== undefined ? (input.timeStart || null) : (existing?.time_start ?? null);
  const timeEnd = input.timeEnd !== undefined ? (input.timeEnd || null) : (existing?.time_end ?? null);
  const daysOfWeek = input.daysOfWeek !== undefined ? (Array.isArray(input.daysOfWeek) ? input.daysOfWeek.map(Number).filter(Number.isInteger).filter(v=>v>=0&&v<=6) : null) : parseJson(existing?.days_of_week, null);
  const graceMinutes = Math.max(0, Math.floor(Number(input.graceMinutes ?? existing?.grace_minutes ?? 0)));
  const startsDate = input.startsAt ? new Date(input.startsAt) : null;
  const endsDate = input.endsAt ? new Date(input.endsAt) : null;
  if (
    (input.startsAt && Number.isNaN(startsDate.getTime())) ||
    (input.endsAt && Number.isNaN(endsDate.getTime()))
  )
    return [
      null,
      {
        status: 400,
        code: "RATE_PLAN_INVALID",
        message: "Choose a valid promotion schedule.",
      },
    ];
  // startsAt/endsAt are optional. A real Date means "set it"; an explicit
  // empty value (null, "", or undefined-but-key-present on create) means
  // "clear it" — it should NOT fall back to the previous value. Only when
  // the key is entirely absent from the input (edit payload didn't touch
  // the field) do we keep whatever the existing plan already had.
  const startsAt = startsDate
    ? startsDate.toISOString()
    : "startsAt" in input
      ? null
      : (existing?.starts_at ?? null);
  const endsAt = endsDate
    ? endsDate.toISOString()
    : "endsAt" in input
      ? null
      : (existing?.ends_at ?? null);
  if (!["Regular", "Gold", "VIP"].includes(customerTier))
    return [
      null,
      {
        status: 400,
        code: "RATE_PLAN_INVALID",
        message: "Customer tier must be Regular, Gold, or VIP.",
      },
    ];
  if (!["none", "midnight", "birthday", "holiday", "just_because"].includes(promoKind))
    return [
      null,
      {
        status: 400,
        code: "RATE_PLAN_INVALID",
        message: "Invalid promotion type.",
      },
    ];
  if ((timeStart && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(timeStart))) || (timeEnd && !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(timeEnd))))
    return [null,{status:400,code:'RATE_PLAN_INVALID',message:'Promo time window must use HH:MM.'}];
  if ((timeStart && !timeEnd) || (!timeStart && timeEnd))
    return [null,{status:400,code:'RATE_PLAN_INVALID',message:'Promo time window requires both a start and end time.'}];
  if (graceMinutes > 1440) return [null,{status:400,code:'RATE_PLAN_INVALID',message:'Promo grace period cannot exceed 24 hours.'}];
  if (startsAt && endsAt && startsAt > endsAt)
    return [
      null,
      {
        status: 400,
        code: "RATE_PLAN_INVALID",
        message: "Choose a valid promotion schedule.",
      },
    ];
  if (!name)
    return [
      null,
      {
        status: 400,
        code: "RATE_PLAN_INVALID",
        message: "Rate plan name is required.",
      },
    ];
  if (name.length > 80)
    return [
      null,
      {
        status: 400,
        code: "RATE_PLAN_INVALID",
        message: "Rate plan name must be 80 characters or fewer.",
      },
    ];
  if (!["linear", "package"].includes(mode))
    return [
      null,
      {
        status: 400,
        code: "RATE_PLAN_INVALID",
        message: "Rate plan mode must be linear or package.",
      },
    ];
  if (mode === "linear") {
    const peso = Number(input.pesoUnit ?? existing?.peso_unit);
    const minutes = Number(input.minutesPerUnit ?? existing?.minutes_per_unit);
    const min = Number(input.minAmount ?? existing?.min_amount);
    if (!(peso > 0) || !(minutes > 0) || !(min >= 1))
      return [
        null,
        {
          status: 400,
          code: "RATE_PLAN_INVALID",
          message:
            "Linear plans require a positive peso unit, positive minutes per unit, and a minimum amount of at least ₱1.",
        },
      ];
    if (min < peso)
      return [
        null,
        {
          status: 400,
          code: "RATE_PLAN_INVALID",
          message: "Minimum amount cannot be lower than the peso unit.",
        },
      ];
    return [
      {
        name,
        mode,
        pesoUnit: peso,
        minutesPerUnit: Math.floor(minutes),
        minAmount: min,
        amount: null,
        minutes: null,
        baseMinutes: null,
        bonusMinutes: null,
        description: input.description ?? existing?.description ?? null,
        customerTier,
        customerSelfService: boolInt(
          input.customerSelfService ?? Boolean(existing?.customer_self_service),
        ),
        isActive: boolInt(input.isActive ?? Boolean(existing?.is_active ?? 1)),
        promoKind,
        startsAt,
        endsAt,
        timeStart,
        timeEnd,
        daysOfWeek,
        graceMinutes,
      },
    ];
  }
  const amount = Number(input.amount ?? existing?.amount);
  const minutes = Number(input.minutes ?? existing?.minutes);
  if (!(amount > 0) || !Number.isInteger(minutes) || minutes <= 0)
    return [
      null,
      {
        status: 400,
        code: "RATE_PLAN_INVALID",
        message:
          "Package plans require a positive price and whole-number minutes greater than zero.",
      },
    ];
  return [
    {
      name,
      mode,
      pesoUnit: null,
      minutesPerUnit: null,
      minAmount: null,
      amount,
      minutes,
      baseMinutes: null,
      bonusMinutes: null,
      description: input.description ?? existing?.description ?? null,
      customerTier,
      customerSelfService: boolInt(
        input.customerSelfService ?? Boolean(existing?.customer_self_service),
      ),
      isActive: boolInt(input.isActive ?? Boolean(existing?.is_active ?? 1)),
      promoKind,
      startsAt,
      endsAt,
      timeStart,
      timeEnd,
      daysOfWeek,
      graceMinutes,
    },
  ];
}

router.post("/rate-plans", auth, requireRole("admin"), (req, res, next) => {
  try {
    const [plan, error] = validateRatePlanInput(req.body ?? {});
    if (error)
      return res
        .status(error.status)
        .json({ success: false, code: error.code, error: error.message });
    const duplicate = db
      .prepare("SELECT id FROM rate_plans WHERE lower(name)=lower(?)")
      .get(plan.name);
    if (duplicate)
      return res
        .status(409)
        .json({
          success: false,
          code: "RATE_PLAN_EXISTS",
          error: "A rate plan with this name already exists.",
        });
    let ratePlanId = String(req.body?.id ?? "").trim();
    if (!ratePlanId)
      ratePlanId = `rate-${
        plan.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 48) || "plan"
      }-${Date.now().toString(36)}`;
    if (db.prepare("SELECT id FROM rate_plans WHERE id=?").get(ratePlanId))
      return res
        .status(409)
        .json({
          success: false,
          code: "RATE_PLAN_ID_EXISTS",
          error: "That rate plan ID already exists.",
        });
    const now = nowIso();
    db.prepare(
      `INSERT INTO rate_plans (id,name,mode,peso_unit,minutes_per_unit,min_amount,amount,minutes,base_minutes,bonus_minutes,description,customer_tier,customer_self_service,is_active,promo_kind,starts_at,ends_at,time_start,time_end,days_of_week,grace_minutes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      ratePlanId,
      plan.name,
      plan.mode,
      plan.pesoUnit,
      plan.minutesPerUnit,
      plan.minAmount,
      plan.amount,
      plan.minutes,
      plan.baseMinutes,
      plan.bonusMinutes,
      plan.description,
      plan.customerTier,
      plan.customerSelfService,
      plan.isActive,
      plan.promoKind,
      plan.startsAt,
      plan.endsAt,
      plan.timeStart,
      plan.timeEnd,
      plan.daysOfWeek ? JSON.stringify(plan.daysOfWeek) : null,
      plan.graceMinutes,
      now,
      now,
    );
    log(
      req.auth.userId,
      "rate_plan.create",
      "rate_plan",
      ratePlanId,
      null,
      plan,
    );
    emitRatePlansUpdated({ method: "POST", path: "/rate-plans", ratePlanId });
    emitDataChanged({ method: "POST", path: "/rate-plans" });
    res
      .status(201)
      .json({
        success: true,
        ratePlan: planView(
          db.prepare("SELECT * FROM rate_plans WHERE id=?").get(ratePlanId),
        ),
      });
  } catch (e) {
    next(e);
  }
});

router.patch(
  "/rate-plans/:id",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const p = db
        .prepare("SELECT * FROM rate_plans WHERE id=?")
        .get(req.params.id);
      if (!p)
        return res
          .status(404)
          .json({
            success: false,
            code: "RATE_PLAN_NOT_FOUND",
            error: "Rate plan not found.",
          });
      const [plan, error] = validateRatePlanInput(req.body ?? {}, p);
      if (error)
        return res
          .status(error.status)
          .json({ success: false, code: error.code, error: error.message });
      const duplicate = db
        .prepare(
          "SELECT id FROM rate_plans WHERE lower(name)=lower(?) AND id<>?",
        )
        .get(plan.name, p.id);
      if (duplicate)
        return res
          .status(409)
          .json({
            success: false,
            code: "RATE_PLAN_EXISTS",
            error: "A rate plan with this name already exists.",
          });
      db.prepare(
        `UPDATE rate_plans SET name=?,mode=?,peso_unit=?,minutes_per_unit=?,min_amount=?,amount=?,minutes=?,base_minutes=?,bonus_minutes=?,description=?,customer_tier=?,customer_self_service=?,is_active=?,promo_kind=?,starts_at=?,ends_at=?,time_start=?,time_end=?,days_of_week=?,grace_minutes=?,updated_at=? WHERE id=?`,
      ).run(
        plan.name,
        plan.mode,
        plan.pesoUnit,
        plan.minutesPerUnit,
        plan.minAmount,
        plan.amount,
        plan.minutes,
        plan.baseMinutes,
        plan.bonusMinutes,
        plan.description,
        plan.customerTier,
        plan.customerSelfService,
        plan.isActive,
        plan.promoKind,
        plan.startsAt,
        plan.endsAt,
        plan.timeStart,
        plan.timeEnd,
        plan.daysOfWeek ? JSON.stringify(plan.daysOfWeek) : null,
        plan.graceMinutes,
        nowIso(),
        p.id,
      );
      log(req.auth.userId, "rate_plan.update", "rate_plan", p.id, null, plan);
      emitRatePlansUpdated({
        method: "PATCH",
        path: `/rate-plans/${p.id}`,
        ratePlanId: p.id,
        isActive: Boolean(plan.isActive),
      });
      emitDataChanged({ method: "PATCH", path: `/rate-plans/${p.id}` });
      res.json({
        success: true,
        ratePlan: planView(
          db.prepare("SELECT * FROM rate_plans WHERE id=?").get(p.id),
        ),
      });
    } catch (e) {
      next(e);
    }
  },
);
router.delete(
  "/rate-plans/:id",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const p = db
        .prepare("SELECT * FROM rate_plans WHERE id=?")
        .get(req.params.id);
      if (!p)
        return res
          .status(404)
          .json({
            success: false,
            code: "RATE_PLAN_NOT_FOUND",
            error: "Rate plan not found.",
          });
      const usage = db
        .prepare(
          `SELECT count(*) c FROM computer_sessions WHERE rate_plan_id=? AND status='active'`,
        )
        .get(req.params.id).c;
      if (usage)
        return res
          .status(409)
          .json({
            success: false,
            code: "RATE_PLAN_IN_USE",
            error: `Rate plan is in use by ${usage} active session(s).`,
          });
      db.prepare(
        "UPDATE rate_plans SET is_active=0,updated_at=? WHERE id=?",
      ).run(nowIso(), req.params.id);
      log(
        req.auth.userId,
        "rate_plan.deactivate",
        "rate_plan",
        req.params.id,
        null,
      );
      emitRatePlansUpdated({
        method: "DELETE",
        path: `/rate-plans/${req.params.id}`,
        ratePlanId: req.params.id,
        isActive: false,
      });
      emitDataChanged({
        method: "DELETE",
        path: `/rate-plans/${req.params.id}`,
      });
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  },
);

router.get("/announcements", auth, (req, res, next) => {
  try {
    const now = nowIso();
    const isAdmin = ["admin"].includes(req.auth.role);
    const rows = isAdmin
      ? db
          .prepare(
            `SELECT * FROM announcements ORDER BY is_active DESC, created_at DESC`,
          )
          .all()
      : db
          .prepare(
            `SELECT * FROM announcements WHERE is_active=1 AND (audience='all' OR audience='customers') AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?) ORDER BY created_at DESC`,
          )
          .all(now, now);
    res.json({ success: true, announcements: rows.map(announcementView) });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/announcements",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const title = String(req.body?.title ?? "")
        .trim()
        .slice(0, 120);
      const message = String(req.body?.message ?? "")
        .trim()
        .slice(0, 1000);
      const kind = ["promo", "update", "notice"].includes(req.body?.kind)
        ? req.body.kind
        : "update";
      const audience = ["all", "customers", "staff"].includes(
        req.body?.audience,
      )
        ? req.body.audience
        : "all";
      const startsDate = req.body?.startsAt
        ? new Date(req.body.startsAt)
        : null;
      const endsDate = req.body?.endsAt ? new Date(req.body.endsAt) : null;
      if (
        (startsDate && Number.isNaN(startsDate.getTime())) ||
        (endsDate && Number.isNaN(endsDate.getTime()))
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "ANNOUNCEMENT_INVALID_SCHEDULE",
            error: "Choose valid announcement dates.",
          });
      const startsAt = startsDate ? startsDate.toISOString() : null;
      const endsAt = endsDate ? endsDate.toISOString() : null;
  if (startsAt && endsAt && startsAt > endsAt)
        return res
          .status(400)
          .json({
            success: false,
            error: "Schedule end must be after the start.",
          });
      if (!title || !message)
        return res
          .status(400)
          .json({
            success: false,
            code: "ANNOUNCEMENT_FIELDS_REQUIRED",
            error: "Title and message are required.",
          });
      const now = nowIso(),
        announcementId = id();
      db.prepare(
        "INSERT INTO announcements(id,title,message,kind,audience,is_active,starts_at,ends_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?,?,?,?)",
      ).run(
        announcementId,
        title,
        message,
        kind,
        audience,
        startsAt,
        endsAt,
        req.auth.userId,
        now,
        now,
      );
      log(
        req.auth.userId,
        "announcement.create",
        "announcement",
        announcementId,
        null,
        { title, kind, audience },
      );
      emitAnnouncementsUpdated({
        method: "POST",
        path: "/announcements",
        announcementId,
        audience,
      });
      emitDataChanged({ method: "POST", path: "/announcements" });
      res
        .status(201)
        .json({
          success: true,
          announcement: announcementView(
            db
              .prepare("SELECT * FROM announcements WHERE id=?")
              .get(announcementId),
          ),
        });
    } catch (err) {
      next(err);
    }
  },
);

router.patch(
  "/announcements/:id",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const existing = db
        .prepare("SELECT * FROM announcements WHERE id=?")
        .get(req.params.id);
      if (!existing)
        return res
          .status(404)
          .json({ success: false, error: "Announcement not found." });
      const title = String(req.body?.title ?? existing.title)
          .trim()
          .slice(0, 120),
        message = String(req.body?.message ?? existing.message)
          .trim()
          .slice(0, 1000);
      const kind = ["promo", "update", "notice"].includes(req.body?.kind)
        ? req.body.kind
        : existing.kind;
      const audience = ["all", "customers", "staff"].includes(
        req.body?.audience,
      )
        ? req.body.audience
        : existing.audience;
      const active =
        req.body?.isActive === undefined
          ? existing.is_active
          : req.body.isActive
            ? 1
            : 0;
      const startsDate = req.body?.startsAt
        ? new Date(req.body.startsAt)
        : null;
      const endsDate = req.body?.endsAt ? new Date(req.body.endsAt) : null;
      if (
        (startsDate && Number.isNaN(startsDate.getTime())) ||
        (endsDate && Number.isNaN(endsDate.getTime()))
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "ANNOUNCEMENT_INVALID_SCHEDULE",
            error: "Choose valid announcement dates.",
          });
      const startsAt = startsDate
        ? startsDate.toISOString()
        : "startsAt" in (req.body || {})
          ? null
          : existing.starts_at;
      const endsAt = endsDate
        ? endsDate.toISOString()
        : "endsAt" in (req.body || {})
          ? null
          : existing.ends_at;
  if (startsAt && endsAt && startsAt > endsAt)
        return res
          .status(400)
          .json({
            success: false,
            error: "Schedule end must be after the start.",
          });
      if (!title || !message)
        return res
          .status(400)
          .json({
            success: false,
            code: "ANNOUNCEMENT_FIELDS_REQUIRED",
            error: "Title and message are required.",
          });
      const now = nowIso();
      db.prepare(
        "UPDATE announcements SET title=?,message=?,kind=?,audience=?,is_active=?,starts_at=?,ends_at=?,updated_at=? WHERE id=?",
      ).run(
        title,
        message,
        kind,
        audience,
        active,
        startsAt,
        endsAt,
        now,
        existing.id,
      );
      log(
        req.auth.userId,
        "announcement.update",
        "announcement",
        existing.id,
        null,
        { title, kind, audience, isActive: Boolean(active) },
      );
      emitAnnouncementsUpdated({
        method: "PATCH",
        path: `/announcements/${existing.id}`,
        announcementId: existing.id,
        audience,
        isActive: Boolean(active),
      });
      emitDataChanged({
        method: "PATCH",
        path: `/announcements/${existing.id}`,
      });
      res.json({
        success: true,
        announcement: announcementView(
          db.prepare("SELECT * FROM announcements WHERE id=?").get(existing.id),
        ),
      });
    } catch (err) {
      next(err);
    }
  },
);

router.delete(
  "/announcements/:id",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const existing = db
        .prepare("SELECT * FROM announcements WHERE id=?")
        .get(req.params.id);
      if (!existing)
        return res
          .status(404)
          .json({ success: false, error: "Announcement not found." });
      db.prepare("DELETE FROM announcements WHERE id=?").run(existing.id);
      log(
        req.auth.userId,
        "announcement.delete",
        "announcement",
        existing.id,
        null,
        { title: existing.title },
      );
      emitAnnouncementsUpdated({
        method: "DELETE",
        path: `/announcements/${existing.id}`,
        announcementId: existing.id,
      });
      emitDataChanged({
        method: "DELETE",
        path: `/announcements/${existing.id}`,
      });
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  },
);

router.get(
  "/settings",
  auth,
  requireRole("admin", "customer"),
  (req, res) => {
    res.set("Cache-Control", "no-store");
    const adminPinReady = Boolean(
      db
        .prepare(
          "SELECT 1 ok FROM users WHERE role='admin' AND is_active=1 AND pin_hash IS NOT NULL LIMIT 1",
        )
        .get(),
    );
    const settings = settingsView();
    const logo = localLogoMeta();
    if (req.auth.role === "customer") {
      delete settings.numberFormat;
      delete settings.decimalPlaces;
    }
    // The versioned URL is part of the shared branding contract. Omitting it
    // here left authenticated headers/sidebar logos stuck on their fallback
    // asset after a successful upload.
    res.json({
      success: true,
      settings: {
        ...settings,
        adminPinReady,
        logoUrl: logo
          ? `/api/public/branding/logo?v=${encodeURIComponent(logo.updated_at)}`
          : null,
        logoVersion: logo?.updated_at ?? null,
      },
    });
  },
);
router.get(
  "/dashboard/overview",
  auth,
  requireRole("admin"),
  (req, res) => {
    const today = manilaStart(0),
      week = manilaStart(6);
    const pcRows = db
      .prepare("SELECT status,COUNT(*) count FROM pcs GROUP BY status")
      .all();
    const statuses = Object.fromEntries(
      pcRows.map((row) => [row.status, Number(row.count)]),
    );
    const active = db
      .prepare(
        `SELECT cs.id,cs.pc_id,cs.customer_name,cs.billing_type,cs.started_at,cs.expires_at,m.username,m.name member_name,p.label pc_label FROM computer_sessions cs LEFT JOIN members m ON m.id=cs.member_id LEFT JOIN pcs p ON p.id=cs.pc_id WHERE cs.status='active' ORDER BY cs.started_at`,
      )
      .all();
    const incomeToday =
      Number(
        db
          .prepare(
            "SELECT COALESCE(SUM(amount_centavos),0) cents FROM revenue_events WHERE occurred_at>=?",
          )
          .get(today).cents,
      ) / 100;
    const analytics = db
      .prepare(
        `SELECT date(datetime(occurred_at,'+8 hours')) day,COALESCE(SUM(amount_centavos),0)/100.0 revenue FROM revenue_events WHERE occurred_at>=? GROUP BY day ORDER BY day`,
      )
      .all(week);
    const feedback = db
      .prepare(
        "SELECT id,customer_name,message,status,created_at FROM customer_feedback WHERE archived_at IS NULL AND status='unresolved' ORDER BY created_at DESC LIMIT 3",
      )
      .all();
    const overviewNow = nowIso();
    const announcements = db
      .prepare(
        "SELECT * FROM announcements WHERE is_active=1 AND (starts_at IS NULL OR starts_at<=?) AND (ends_at IS NULL OR ends_at>=?) ORDER BY created_at DESC LIMIT 3",
      )
      .all(overviewNow, overviewNow)
      .map(announcementView);
    const topCustomers = db
      .prepare(
        "SELECT m.id,m.username,m.name,ROUND(SUM(w.amount),2) total_top_up FROM wallet_transactions w JOIN members m ON m.id=w.member_id WHERE w.type='top_up' AND w.amount>0 GROUP BY m.id ORDER BY total_top_up DESC LIMIT 5",
      )
      .all();
    const birthdays = db
      .prepare(
        "SELECT id,username,name,birthdate FROM members WHERE status=\'active\' AND birthdate IS NOT NULL AND strftime(\'%m\',birthdate)=strftime(\'%m\',?) ORDER BY CASE WHEN strftime(\'%m-%d\',birthdate)=strftime(\'%m-%d\',?) THEN 0 ELSE 1 END, strftime(\'%d\',birthdate), name LIMIT 31",
      )
      .all(overviewNow, overviewNow);
    res.json({
      success: true,
      summary: {
        available: statuses.available || 0,
        inUse: statuses.occupied || 0,
        maintenance: statuses.maintenance || 0,
        incomeToday,
      },
      active,
      analytics,
      feedback,
      announcements,
      topCustomers,
      birthdays,
    });
  },
);

router.get("/analytics", auth, requireRole("admin"), (req, res) => {
  const range = String(req.query.range || "30d");
  const todayParts = manilaDateParts();
  const start =
    range === "year"
      ? manilaIso(todayParts.year, 1, 1)
      : range === "all"
        ? "0000-01-01T00:00:00.000Z"
        : manilaStart(range === "today" ? 0 : range === "7d" ? 6 : 29);
  const revenue =
    Number(
      db
        .prepare(
          "SELECT COALESCE(SUM(amount_centavos),0) cents FROM revenue_events WHERE occurred_at>=?",
        )
        .get(start).cents,
    ) / 100;
  const activity = db
    .prepare(
      "SELECT COUNT(*) visits,SUM(CASE WHEN member_id IS NULL THEN 1 ELSE 0 END) guests,SUM(CASE WHEN member_id IS NOT NULL THEN 1 ELSE 0 END) members,COALESCE(AVG((julianday(COALESCE(ended_at,?))-julianday(started_at))*86400),0) avg_seconds FROM computer_sessions WHERE started_at>=?",
    )
    .get(nowIso(), start);
  const series = db
    .prepare(
      "SELECT date(datetime(started_at,'+8 hours')) day,COUNT(*) visits,SUM(CASE WHEN member_id IS NULL THEN 1 ELSE 0 END) guests,SUM(CASE WHEN member_id IS NOT NULL THEN 1 ELSE 0 END) members FROM computer_sessions WHERE started_at>=? GROUP BY day ORDER BY day",
    )
    .all(start);
  const revenueSeries = db
    .prepare(
      "SELECT date(datetime(occurred_at,'+8 hours')) day,SUM(amount_centavos)/100.0 revenue FROM revenue_events WHERE occurred_at>=? GROUP BY day ORDER BY day",
    )
    .all(start);
  const expenseSeries = db
    .prepare(
      "SELECT date(datetime(recorded_at,'+8 hours')) day,SUM(COALESCE(signed_amount,amount)) expenses FROM expense_records WHERE voided_at IS NULL AND recorded_at>=? GROUP BY day ORDER BY day",
    )
    .all(start);
  const rateMix = db
    .prepare(
      "SELECT COALESCE(rp.name,cs.billing_type) label,COUNT(*) value FROM computer_sessions cs LEFT JOIN rate_plans rp ON rp.id=cs.rate_plan_id WHERE cs.started_at>=? GROUP BY label ORDER BY value DESC",
    )
    .all(start);
  const adminSeconds = Number(
    db
      .prepare(
        "SELECT COALESCE(SUM(CASE WHEN julianday(COALESCE(a.ended_at,a.revoked_at,a.last_seen_at))>julianday(a.created_at) THEN (julianday(COALESCE(a.ended_at,a.revoked_at,a.last_seen_at))-julianday(a.created_at))*86400 ELSE 0 END),0) seconds FROM auth_sessions a JOIN users u ON u.id=a.user_id WHERE u.role IN ('admin') AND a.created_at>=?",
      )
      .get(start).seconds || 0,
  );
  res.json({
    success: true,
    range,
    metrics: {
      revenue,
      visits: Number(activity.visits || 0),
      members: Number(activity.members || 0),
      guests: Number(activity.guests || 0),
      averageSessionSeconds: Math.round(Number(activity.avg_seconds || 0)),
      adminSessionSeconds: Math.round(adminSeconds),
    },
    series,
    revenueSeries,
    expenseSeries,
    rateMix,
  });
});
router.get(
  "/billing-policy",
  auth,
  requireRole("admin"),
  (req, res) => {
    const settings = settingsView();
    res.json({
      success: true,
      billingPolicy: {
        defaultBilling: settings.defaultBilling ?? "prepaid",
        postpaidMinutesPerPeso: Number(settings.postpaidMinutesPerPeso ?? 0),
        lowTimeWarningMinutes: Number(settings.lowTimeWarningMinutes ?? 5),
        defaultAddTimeRatePlanId: settings.defaultAddTimeRatePlanId ?? null,
      },
    });
  },
);
router.patch(
  "/billing-policy",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const defaultBilling = String(req.body?.defaultBilling ?? "");
      const postpaidPesoPerMinute = Number(req.body?.postpaidPesoPerMinute);
      const lowTimeWarningMinutes = Number(req.body?.lowTimeWarningMinutes);
      if (!["prepaid", "postpaid"].includes(defaultBilling))
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_BILLING",
            error: "Choose prepaid or postpaid as the default.",
          });
      if (
        !(postpaidPesoPerMinute > 0) ||
        !Number.isFinite(postpaidPesoPerMinute)
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_POSTPAID_RATE",
            error: "Postpaid rate must be positive.",
          });
      if (
        !(lowTimeWarningMinutes > 0) ||
        !Number.isFinite(lowTimeWarningMinutes)
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_LOW_TIME_WARNING",
            error: "Low-time warning must be positive.",
          });
      const values = {
        defaultBilling,
        postpaidPesoPerMinute,
        lowTimeWarningMinutes,
      };
      const stmt = db.prepare(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      );
      transaction(() => {
        for (const [key, value] of Object.entries(values))
          stmt.run(key, JSON.stringify(value));
        log(
          req.auth.userId,
          "billing_policy.update",
          "settings",
          null,
          null,
          values,
        );
      });
      emitDataChanged({ method: "PATCH", path: "/billing-policy" });
      res.json({ success: true, billingPolicy: values });
    } catch (error) {
      next(error);
    }
  },
);
router.patch(
  "/billing-policy/session",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const defaultBilling = String(req.body?.defaultBilling || "");
      const low = Number(req.body?.lowTimeWarningMinutes);
      const defaultAddTimeRatePlanId = req.body?.defaultAddTimeRatePlanId
        ? String(req.body.defaultAddTimeRatePlanId)
        : null;
      if (
        !["prepaid", "postpaid"].includes(defaultBilling) ||
        !Number.isFinite(low) ||
        low < 1
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_SESSION_POLICY",
            error:
              "Choose a billing mode and a low-time warning of at least one minute.",
          });
      if (
        defaultAddTimeRatePlanId &&
        !db
          .prepare("SELECT id FROM rate_plans WHERE id=? AND is_active=1")
          .get(defaultAddTimeRatePlanId)
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_DEFAULT_RATE",
            error: "Choose an active rate plan for Add Time.",
          });
      const stmt = db.prepare(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      );
      transaction(() => {
        stmt.run("defaultBilling", JSON.stringify(defaultBilling));
        stmt.run("lowTimeWarningMinutes", JSON.stringify(low));
        stmt.run(
          "defaultAddTimeRatePlanId",
          JSON.stringify(defaultAddTimeRatePlanId),
        );
        log(req.auth.userId, "billing_policy.session", "settings", null, null, {
          defaultBilling,
          lowTimeWarningMinutes: low,
          defaultAddTimeRatePlanId,
        });
      });
      emitDataChanged({ method: "PATCH", path: "/billing-policy/session" });
      res.json({
        success: true,
        billingPolicy: {
          ...taxPolicyView(),
          defaultBilling,
          lowTimeWarningMinutes: low,
          defaultAddTimeRatePlanId,
          postpaidMinutesPerPeso: Number(
            settingsView().postpaidMinutesPerPeso || 0,
          ),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);
router.patch(
  "/billing-policy/postpaid-rate",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const minutesPerPeso = Number(req.body?.postpaidMinutesPerPeso);
      if (!Number.isFinite(minutesPerPeso) || minutesPerPeso <= 0)
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_POSTPAID_RATE",
            error: "Minutes per peso must be a positive number.",
          });
      db.prepare(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      ).run("postpaidMinutesPerPeso", JSON.stringify(minutesPerPeso));
      log(
        req.auth.userId,
        "billing_policy.postpaid_rate",
        "settings",
        null,
        null,
        { postpaidMinutesPerPeso: minutesPerPeso },
      );
      emitDataChanged({
        method: "PATCH",
        path: "/billing-policy/postpaid-rate",
      });
      res.json({ success: true, postpaidMinutesPerPeso: minutesPerPeso });
    } catch (error) {
      next(error);
    }
  },
);
router.patch("/settings", auth, requireRole("admin"), (req, res, next) => {
  try {
    const incoming = req.body ?? {};
    if (
      incoming.gcashNumber != null &&
      incoming.gcashNumber !== "" &&
      !/^09\d{9}$/.test(String(incoming.gcashNumber))
    ) {
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_GCASH_NUMBER",
          error:
            "GCash number must be an 11-digit Philippine mobile number starting with 09.",
        });
    }
    if (
      incoming.lowTimeWarningMinutes != null &&
      (!(Number(incoming.lowTimeWarningMinutes) >= 1) ||
        !Number.isFinite(Number(incoming.lowTimeWarningMinutes)))
    ) {
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_LOW_TIME_WARNING",
          error: "Low-time warning must be at least 1 minute.",
        });
    }
    if (
      incoming.postpaidPesoPerMinute != null &&
      (!(Number(incoming.postpaidPesoPerMinute) > 0) ||
        !Number.isFinite(Number(incoming.postpaidPesoPerMinute)))
    ) {
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_POSTPAID_RATE",
          error: "Postpaid rate must be a positive peso amount per minute.",
        });
    }
    if (
      incoming.numberFormat != null &&
      !["decimal", "whole"].includes(String(incoming.numberFormat))
    ) {
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_NUMBER_FORMAT",
          error: "Number format must be decimal or whole.",
        });
    }
    if (
      incoming.decimalPlaces != null &&
      (!Number.isInteger(Number(incoming.decimalPlaces)) ||
        Number(incoming.decimalPlaces) < 1 ||
        Number(incoming.decimalPlaces) > 3)
    ) {
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_DECIMAL_PLACES",
          error: "Decimal places must be between 1 and 3.",
        });
    }
    const allowed = new Set([
      "cafeName",
      "branch",
      "branchLocation",
      "gcashName",
      "gcashNumber",
      "numberFormat",
      "decimalPlaces",
    ]);
    const entries = Object.entries(incoming).filter(([key]) =>
      allowed.has(key),
    );
    if (entries.length !== Object.keys(incoming).length)
      return res
        .status(400)
        .json({
          success: false,
          code: "UNSUPPORTED_SETTING",
          error: "One or more settings do not belong on this page.",
        });
    const stmt = db.prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    );
    transaction(() => {
      for (const [k, v] of entries) stmt.run(k, JSON.stringify(v));
      log(
        req.auth.userId,
        "settings.update",
        "settings",
        null,
        null,
        Object.fromEntries(entries),
      );
    });
    emitDataChanged({ method: "PATCH", path: "/settings" });
    res.json({ success: true, settings: settingsView() });
  } catch (e) {
    next(e);
  }
});

router.post("/branding/logo", auth, requireRole("admin"), (req, res, next) => {
  try {
    const dataUrl = String(req.body?.dataUrl || "");
    const match = dataUrl.match(
      /^data:(image\/(?:png|svg\+xml));base64,([A-Za-z0-9+/=]+)$/,
    );
    if (!match)
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_LOGO",
          error: "Upload a PNG or SVG logo.",
        });
    const buffer = Buffer.from(match[2], "base64");
    if (!buffer.length || buffer.length > 512 * 1024)
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_LOGO_SIZE",
          error: "Logo must be no larger than 512 KB.",
        });
    if (
      match[1] === "image/png" &&
      buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a"
    )
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_LOGO",
          error: "The PNG file is invalid.",
        });
    if (match[1] === "image/svg+xml") {
      const svg = buffer.toString("utf8");
      if (
        !/<svg[\s>]/i.test(svg) ||
        /<script|\son\w+\s*=|javascript:/i.test(svg)
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "UNSAFE_SVG",
            error: "The SVG contains unsupported active content.",
          });
    }
    const updatedAt = nowIso();
    const paths = localLogoPaths();
    mkdirSync(paths.brandingDir, { recursive: true });
    const target = match[1] === "image/svg+xml" ? paths.svg : paths.png;
    const other = match[1] === "image/svg+xml" ? paths.png : paths.svg;
    writeFileSync(target, buffer);
    if (existsSync(other)) unlinkSync(other);
    // Keep the database copy as a compatibility fallback for older installations,
    // but the local branding file is now the authoritative installed asset.
    db.prepare(
      "INSERT INTO brand_assets(id,mime_type,data,updated_at,updated_by) VALUES('primary',?,?,?,?) ON CONFLICT(id) DO UPDATE SET mime_type=excluded.mime_type,data=excluded.data,updated_at=excluded.updated_at,updated_by=excluded.updated_by",
    ).run(match[1], buffer, updatedAt, req.auth.userId);
    emitDataChanged({ method: "POST", path: "/branding/logo" });
    res.json({
      success: true,
      logoUrl: `/api/public/branding/logo?v=${encodeURIComponent(updatedAt)}`,
      logoVersion: updatedAt,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/wallet", auth, (req, res) => {
  if (req.auth.role !== "customer" && !req.auth.memberId && !req.query.memberId)
    return res
      .status(400)
      .json({ success: false, error: "Member id is required." });
  const memberId =
    req.auth.role === "customer" ? req.auth.memberId : req.query.memberId;
  const m = db
    .prepare("SELECT wallet_balance FROM members WHERE id=?")
    .get(memberId);
  if (!m)
    return res.status(404).json({ success: false, error: "Member not found." });
  res.json({ success: true, balance: Number(m.wallet_balance) });
});
router.get("/wallet/transactions", auth, (req, res) => {
  const memberId =
    req.auth.role === "customer" ? req.auth.memberId : req.query.memberId;
  const rows = db
    .prepare(
      "SELECT * FROM wallet_transactions WHERE member_id=? ORDER BY created_at DESC",
    )
    .all(memberId);
  res.json({ success: true, transactions: rows });
});
router.post(
  "/wallet/adjustments",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const {
        memberId,
        amount,
        type = "adjustment",
        username,
        birthdate,
      } = req.body;
      const result = transaction(() => {
        const m = db
          .prepare("SELECT wallet_balance FROM members WHERE id=?")
          .get(memberId);
        if (!m)
          throw Object.assign(new Error("Member not found."), {
            status: 404,
            expose: true,
          });
        const delta = Number(amount);
        if (!Number.isFinite(delta) || delta === 0)
          throw Object.assign(
            new Error("Wallet adjustment amount must be a non-zero number."),
            { status: 400, code: "INVALID_AMOUNT", expose: true },
          );
        const nextBalance = Number(m.wallet_balance) + delta;
        if (nextBalance < 0)
          throw Object.assign(new Error("Wallet cannot become negative."), {
            status: 400,
            code: "INVALID_AMOUNT",
            expose: true,
          });
        db.prepare(
          "UPDATE members SET wallet_balance=?,updated_at=? WHERE id=?",
        ).run(nextBalance, nowIso(), memberId);
        db.prepare(
          `INSERT INTO wallet_transactions (id,member_id,type,amount,balance_before,balance_after,reference_type,created_at) VALUES (?,?,?,?,?,?,?,?)`,
        ).run(
          id(),
          memberId,
          type,
          delta,
          Number(m.wallet_balance),
          nextBalance,
          "admin",
          nowIso(),
        );
        if (delta > 0 && ["top_up", "paid_deposit"].includes(type))
          recordRevenue(
            "wallet_top_up",
            "wallet_adjustment",
            `${memberId}:${nowIso()}`,
            delta,
            req.auth.userId,
            nowIso(),
            {
              paymentMethod: "cash",
              memberId,
              metadata: { adjustmentType: type },
            },
          );
        log(req.auth.userId, "wallet.adjust", "member", memberId, null, {
          amount: delta,
          type,
        });
        return nextBalance;
      });
      emitWalletUpdated(memberId, {
        balance: result,
        reason: "wallet_adjustment",
      });
      res.json({ success: true, balance: result });
    } catch (e) {
      next(e);
    }
  },
);

router.get("/top-ups", auth, requireRole("admin"), (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*,m.name customer_name,p.label pc_label,p.ip_address pc_ip FROM top_up_requests t JOIN members m ON m.id=t.member_id LEFT JOIN pcs p ON p.id=t.pc_id WHERE t.archived_at IS NULL ORDER BY t.requested_at DESC`,
    )
    .all();
  res.json({
    success: true,
    topUpRequests: rows.map((r) => ({
      id: r.id,
      status: r.status,
      createdAt: new Date(r.requested_at).getTime(),
      customerId: r.member_id,
      customerName: r.customer_name,
      pcId: r.pc_id,
      pcLabel: r.pc_label ?? "Unknown PC",
      pcIp: r.pc_ip,
      amount: Number(r.amount),
      method: r.payment_method,
      gcashNumber: r.ref_no,
    })),
  });
});
router.post("/top-ups", auth, topUpLimiter, (req, res, next) => {
  try {
    const memberId =
      req.auth.role === "customer" ? req.auth.memberId : req.body.memberId;
    const {
      amount,
      method = "cash",
      gcashNumber = null,
      pcId = null,
    } = req.body;
    if (!memberId)
      return res
        .status(400)
        .json({
          success: false,
          code: "MEMBER_REQUIRED",
          error: "Member id is required.",
        });
    if (
      !db
        .prepare("SELECT id FROM members WHERE id=? AND status='active'")
        .get(memberId)
    )
      return res
        .status(404)
        .json({
          success: false,
          code: "MEMBER_NOT_FOUND",
          error: "Member not found.",
        });
    if (
      !(Number(amount) > 0) ||
      !Number.isFinite(Number(amount)) ||
      !["cash", "gcash"].includes(method)
    )
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_AMOUNT",
          error: "Valid amount and payment method are required.",
        });
    const effectivePcId = pcId ?? req.auth.pcId ?? null;
    if (req.auth.role === "customer" && effectivePcId !== req.auth.pcId)
      return res
        .status(403)
        .json({
          success: false,
          code: "SESSION_PC_MISMATCH",
          error: "Top-up requests must come from this PC.",
        });
    const request = {
      id: id(),
      memberId,
      pcId: effectivePcId,
      amount: Number(amount),
      method,
      gcashNumber: method === "gcash" ? String(gcashNumber || "").trim() : null,
    };
    if (method === "gcash" && !request.gcashNumber)
      return res
        .status(400)
        .json({
          success: false,
          code: "GCASH_NUMBER_REQUIRED",
          error: "Your GCash number is required.",
        });
    if (method === "gcash") {
      const configured = settingsView();
      if (!/^09\d{9}$/.test(String(configured.gcashNumber || "")))
        return res
          .status(400)
          .json({
            success: false,
            code: "GCASH_NOT_CONFIGURED",
            error:
              "GCash is not available until the cafe GCash number is configured.",
          });
    }
    db.prepare(
      `INSERT INTO top_up_requests (id,member_id,pc_id,amount,payment_method,ref_no,status,requested_at) VALUES (?,?,?,?,?,?,?,?)`,
    ).run(
      request.id,
      request.memberId,
      request.pcId,
      request.amount,
      request.method,
      request.gcashNumber,
      "pending",
      nowIso(),
    );
    log(
      req.auth.userId,
      "topup.request",
      "top_up_request",
      request.id,
      request.pcId,
      request,
    );
    emitTopUpRequest({
      id: request.id,
      memberId: request.memberId,
      pcId: request.pcId,
      amount: request.amount,
      method: request.method,
      gcashNumber: request.gcashNumber,
      customerName:
        db.prepare("SELECT name FROM members WHERE id=?").get(request.memberId)
          ?.name ?? "Customer",
      pcLabel:
        (request.pcId
          ? db.prepare("SELECT label FROM pcs WHERE id=?").get(request.pcId)
              ?.label
          : null) ?? "Unknown PC",
    });
    res.status(201).json({ success: true, request });
  } catch (e) {
    next(e);
  }
});
router.patch(
  "/top-ups/:id/approve",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const result = transaction(() => {
        const r = db
          .prepare("SELECT * FROM top_up_requests WHERE id=?")
          .get(req.params.id);
        if (!r || r.status !== "pending")
          throw Object.assign(new Error("Top-up request is not pending."), {
            status: 409,
            expose: true,
          });
        const m = db
          .prepare(
            "SELECT wallet_balance FROM members WHERE id=? AND status='active'",
          )
          .get(r.member_id);
        if (!m)
          throw Object.assign(new Error("Member not found or inactive."), {
            status: 404,
            code: "MEMBER_NOT_FOUND",
            expose: true,
          });
        db.prepare(
          "UPDATE members SET wallet_balance=?,updated_at=? WHERE id=?",
        ).run(
          Number(m.wallet_balance) + Number(r.amount),
          nowIso(),
          r.member_id,
        );
        db.prepare(
          `INSERT INTO wallet_transactions (id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        ).run(
          id(),
          r.member_id,
          "top_up",
          Number(r.amount),
          Number(m.wallet_balance),
          Number(m.wallet_balance) + Number(r.amount),
          "top_up",
          r.id,
          nowIso(),
        );
        const topUpChanged = db.prepare(
          "UPDATE top_up_requests SET status=?,processed_at=?,processed_by=? WHERE id=? AND status='pending'",
        ).run("approved", nowIso(), req.auth.userId, r.id);
        if (topUpChanged.changes !== 1) throw Object.assign(new Error("Top-up request state changed while processing."), { status:409, code:"TOPUP_STATE_CONFLICT", expose:true });
        recordRevenue(
          "wallet_top_up",
          "top_up_request",
          r.id,
          Number(r.amount),
          req.auth.userId,
          nowIso(),
          {
            paymentMethod: r.payment_method,
            memberId: r.member_id,
            pcId: r.pc_id,
          },
        );
        log(req.auth.userId, "topup.approve", "top_up_request", r.id, r.pc_id, {
          amount: r.amount,
        });
        return r;
      });
      emitTopUpUpdated({
        id: result.id,
        memberId: result.member_id,
        pcId: result.pc_id,
        status: "approved",
        amount: Number(result.amount),
      });
      const approvedBalance = db
        .prepare("SELECT wallet_balance FROM members WHERE id=?")
        .get(result.member_id)?.wallet_balance;
      emitWalletUpdated(result.member_id, {
        balance: Number(approvedBalance ?? 0),
        reason: "topup_approved",
        topUpId: result.id,
      });
      emitDataChanged({
        method: "PATCH",
        path: `/top-ups/${result.id}/approve`,
        memberId: result.member_id,
      });
      res.json({ success: true, request: result });
    } catch (e) {
      next(e);
    }
  },
);
router.patch(
  "/top-ups/:id/reject",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const r = transaction(() => {
        const request = db.prepare("SELECT * FROM top_up_requests WHERE id=? AND status='pending'").get(req.params.id);
        if (!request) throw Object.assign(new Error("Top-up request is not pending."), { status:409, code:"TOPUP_STATE_CONFLICT", expose:true });
        const changed = db.prepare("UPDATE top_up_requests SET status=?,processed_at=?,processed_by=? WHERE id=? AND status='pending'")
          .run("rejected", nowIso(), req.auth.userId, request.id);
        if (changed.changes !== 1) throw Object.assign(new Error("Top-up request state changed while processing."), { status:409, code:"TOPUP_STATE_CONFLICT", expose:true });
        return request;
      });
      emitTopUpUpdated({ id:r.id, memberId:r.member_id, pcId:r.pc_id, status:"rejected", amount:Number(r.amount) });
      emitDataChanged({ method:"PATCH", path:`/top-ups/${r.id}/reject`, memberId:r.member_id });
      res.json({ success:true });
    } catch (e) { next(e); }
  },
);
router.delete(
  "/top-ups/resolved",
  auth,
  requireRole("admin"),
  (req, res) => {
    db.prepare(
      `UPDATE top_up_requests SET archived_at=? WHERE status != 'pending' AND archived_at IS NULL`,
    ).run(nowIso());
    res.json({ success: true });
  },
);

router.get("/sessions/current", auth, (req, res) => {
  const memberId =
    req.auth.role === "customer" ? req.auth.memberId : req.query.memberId;
  const pcId = req.auth.role === "customer" ? req.auth.pcId : req.query.pcId;
  const s = db
    .prepare(
      `SELECT cs.*,p.label pc_label,p.ip_address pc_ip,p.spec,rp.name rate_plan_name FROM computer_sessions cs JOIN pcs p ON p.id=cs.pc_id LEFT JOIN rate_plans rp ON rp.id=cs.rate_plan_id WHERE cs.status='active' AND ${memberId ? "cs.member_id=?" : "cs.pc_id=?"} ORDER BY cs.started_at DESC LIMIT 1`,
    )
    .get(memberId ?? pcId);
  res.json({ success: true, session: s ?? null });
});

router.get("/sessions/:id/settlement-preview", auth, (req, res) => {
  let s = db
    .prepare("SELECT * FROM computer_sessions WHERE id=? AND status='active'")
    .get(req.params.id);
  if (!s)
    return res
      .status(404)
      .json({
        success: false,
        code: "NO_ACTIVE_SESSION",
        error: "Active session not found.",
      });
  if (req.auth.role === "customer" && s.member_id !== req.auth.memberId)
    return res
      .status(403)
      .json({
        success: false,
        code: "FORBIDDEN",
        error: "You can only view your own session.",
      });
  if (s.billing_type === "prepaid" && s.member_id) {
    checkpointMemberSession(s.member_id, s.id);
    s = db
      .prepare("SELECT * FROM computer_sessions WHERE id=? AND status='active'")
      .get(s.id);
  }
  const elapsedSeconds = elapsedBillableSeconds(s);
  const remainingSeconds = remainingSecondsForSession(s);
  const paid = Math.max(0, Number(s.amount_paid || 0));
  const purchasedSeconds = Math.max(0, Number(s.prepaid_seconds || 0));
  const refundAmount =
    s.billing_type === "prepaid"
      ? Math.min(
          paid,
          Math.round(
            (purchasedSeconds > 0
              ? paid * (remainingSeconds / purchasedSeconds)
              : 0) * 100,
          ) / 100,
        )
      : 0;
  const postpaidRatePerMinute = Number(s.postpaid_rate_per_minute || 0);
  const amountDue =
    s.billing_type === "postpaid"
      ? Math.round((elapsedSeconds / 60) * postpaidRatePerMinute * 100) / 100
      : 0;
  res.json({
    success: true,
    sessionId: s.id,
    billing: s.billing_type,
    memberId: s.member_id,
    elapsedSeconds,
    remainingSeconds,
    refundAmount,
    postpaidRatePerMinute,
    postpaidMinutesPerPeso:
      postpaidRatePerMinute > 0 ? 1 / postpaidRatePerMinute : null,
    amountDue,
  });
});

router.post("/sessions/start", auth, (req, res, next) => {
  try {
    const {
      pcId: requestedPcId = null,
      pcIp = null,
      customerId = null,
      customerName,
      billing = "prepaid",
      ratePlanId = null,
      amount = null,
    } = req.body;
    if (!["prepaid", "postpaid"].includes(billing))
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_BILLING",
          error: "Billing must be prepaid or postpaid.",
        });
    const pcId =
      requestedPcId ||
      (pcIp
        ? db
            .prepare("SELECT id FROM pcs WHERE ip_address = ?")
            .get(String(pcIp).trim())?.id
        : null);
    if (!pcId)
      return res
        .status(400)
        .json({
          success: false,
          code: "PC_REQUIRED",
          error: "A registered PC id or client IP address is required.",
        });
    if (req.auth.role === "customer") {
      if (customerId !== req.auth.memberId)
        return res
          .status(403)
          .json({
            success: false,
            code: "FORBIDDEN",
            error: "You can only start your own session.",
          });
      if (pcId !== req.auth.pcId)
        return res
          .status(403)
          .json({
            success: false,
            code: "SESSION_PC_MISMATCH",
            error: "You can only start a session on this PC.",
          });
      if (billing !== "prepaid")
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_BILLING",
            error: "Customer sessions must be prepaid.",
          });
    }
    const result = transaction(() => {
      const pc = db.prepare("SELECT * FROM pcs WHERE id=?").get(pcId);
      if (!pc || pc.status !== "available")
        throw Object.assign(new Error("This PC is not available."), {
          status: 409,
          code: "PC_NOT_AVAILABLE",
          expose: true,
        });
      const memberId =
        customerId ?? (req.auth.role === "customer" ? req.auth.memberId : null);
      let member = memberId
        ? db
            .prepare("SELECT * FROM members WHERE id=? AND status='active'")
            .get(memberId)
        : null;
      if (memberId && !member)
        throw Object.assign(
          new Error("Member account not found or inactive."),
          { status: 404, code: "MEMBER_NOT_FOUND", expose: true },
        );
      if (memberId) {
        const activeMemberSession = db
          .prepare(
            "SELECT * FROM computer_sessions WHERE member_id=? AND status='active' ORDER BY started_at DESC LIMIT 1",
          )
          .get(memberId);
        if (activeMemberSession) {
          if (activeMemberSession.pc_id !== pcId)
            throw Object.assign(
              new Error("This member already has an active computer session."),
              { status: 409, code: "ACCOUNT_ALREADY_ACTIVE", expose: true },
            );
          const rem = remainingSecondsForSession(activeMemberSession);
          if (rem > 0)
            throw Object.assign(
              new Error("This member already has an active session."),
              { status: 409, code: "ACCOUNT_ALREADY_ACTIVE", expose: true },
            );
          closeSessionAndSaveRemaining(activeMemberSession.id);
          member = db.prepare("SELECT * FROM members WHERE id=?").get(memberId);
        }
      }

      const savedSeconds = memberId
        ? Number(member?.session_seconds_remaining ?? 0)
        : 0;
      let plan = null;
      let effectiveAmount = 0;
      let seconds = savedSeconds;
      let resumed = savedSeconds > 0;
      let effectiveBilling = resumed ? "prepaid" : billing;
      let postpaidRatePerMinute = null;
      if (!resumed && billing === "postpaid") {
        const minutesPerPeso = Number(
          settingsView().postpaidMinutesPerPeso || 0,
        );
        postpaidRatePerMinute = minutesPerPeso > 0 ? 1 / minutesPerPeso : 0;
        if (
          !(postpaidRatePerMinute > 0) ||
          !Number.isFinite(postpaidRatePerMinute)
        )
          throw Object.assign(
            new Error(
              "Configure a valid postpaid rate in Settings before starting a postpaid session.",
            ),
            { status: 409, code: "POSTPAID_RATE_NOT_CONFIGURED", expose: true },
          );
        seconds = 0;
      } else if (!resumed) {
        if (!ratePlanId)
          throw Object.assign(
            new Error(
              "A rate plan is required when the member has no saved session time.",
            ),
            { status: 400, code: "RATE_PLAN_REQUIRED", expose: true },
          );
        plan = db
          .prepare("SELECT * FROM rate_plans WHERE id=? AND is_active=1")
          .get(ratePlanId);
        if (!plan)
          throw Object.assign(new Error("Rate plan not found or inactive."), {
            status: 404,
            code: "RATE_PLAN_NOT_FOUND",
            expose: true,
          });
        if (req.auth.role === "customer") {
          const eligibility = ratePlanEligibility(plan, member);
          if (!eligibility.eligible)
            throw Object.assign(
              new Error(
                "This rate plan is not currently available to this customer.",
              ),
              {
                status: 403,
                code: `RATE_PLAN_${String(eligibility.reason || "INELIGIBLE").toUpperCase()}`,
                expose: true,
              },
            );
        } else if (
          !tierAllowsPlan(member?.tier ?? "Regular", plan.customer_tier)
        ) {
          throw Object.assign(
            new Error(
              `This rate plan is for ${plan.customer_tier} members only.`,
            ),
            { status: 403, code: "RATE_PLAN_TIER_MISMATCH", expose: true },
          );
        }
        effectiveAmount =
          plan.mode === "package" ? Number(plan.amount) : Number(amount || 0);
        const minimum =
          plan.mode === "package"
            ? Number(plan.amount)
            : Number(plan.min_amount || 0);
        if (!(effectiveAmount > 0))
          throw Object.assign(
            new Error("A valid session amount is required."),
            { status: 400, code: "INVALID_AMOUNT", expose: true },
          );
        if (plan.mode === "linear" && effectiveAmount < minimum)
          throw Object.assign(
            new Error(`Minimum amount is ₱${minimum.toFixed(2)}.`),
            { status: 400, code: "INVALID_AMOUNT", expose: true },
          );
        seconds = Number(minutesForAmount(plan, effectiveAmount) * 60);
        if (!(seconds > 0))
          throw Object.assign(new Error("This amount does not add any time."), {
            status: 400,
            code: "INVALID_AMOUNT",
            expose: true,
          });
      } else {
        // Saved account time always wins. No rate selection or wallet deduction is required.
        plan =
          db
            .prepare("SELECT * FROM rate_plans WHERE id=?")
            .get(member?.last_rate_plan_id ?? ratePlanId) ?? null;
        effectiveAmount = 0;
      }

      let promoCheck = { isPromo:false, nameFlag:false };
      if (!resumed && effectiveBilling === 'prepaid' && plan && String(plan.promo_kind || 'none') !== 'none') {
        promoCheck = validatePromoRedemption({ plan, memberId, pcId, customerName, amount: effectiveAmount, anchorAt: new Date(), now: new Date() });
      }
      const started = nowIso();
      const expires =
        effectiveBilling === "prepaid"
          ? new Date(Date.now() + seconds * 1000).toISOString()
          : null;
      const sid = id();
      let walletUsed = 0;
      let cashDue = effectiveAmount;
      if (!resumed && billing === "prepaid" && memberId) {
        const before = Number(member.wallet_balance);
        if (req.auth.role === "customer" && before < effectiveAmount)
          throw Object.assign(
            new Error(
              "Not enough wallet balance. Top up via GCash or at the counter first.",
            ),
            {
              status: 402,
              code: "INSUFFICIENT_BALANCE",
              expose: true,
              action: "TOP_UP",
            },
          );
        walletUsed = Math.min(Math.max(0, before), effectiveAmount);
        cashDue = Math.max(0, effectiveAmount - walletUsed);
        if (walletUsed > 0) {
          const after = before - walletUsed;
          db.prepare(
            "UPDATE members SET wallet_balance=?,session_seconds_remaining=0,updated_at=? WHERE id=?",
          ).run(after, nowIso(), memberId);
          db.prepare(
            `INSERT INTO wallet_transactions (id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
          ).run(
            id(),
            memberId,
            "session_start",
            -walletUsed,
            before,
            after,
            "computer_session",
            sid,
            nowIso(),
          );
        } else {
          db.prepare(
            "UPDATE members SET session_seconds_remaining=0,updated_at=? WHERE id=?",
          ).run(nowIso(), memberId);
        }
      }
      if (!memberId && resumed)
        throw Object.assign(
          new Error("Saved session time requires a member account."),
          { status: 400, code: "MEMBER_REQUIRED", expose: true },
        );
      const resolvedCustomerName =
        req.auth.role === "customer"
          ? member?.name || "Customer"
          : String(customerName ?? "").trim() || member?.name || "Guest";
      const rateSnapshot =
        effectiveBilling === "prepaid" && plan
          ? JSON.stringify(prepaidSnapshot(plan))
          : null;
      db.prepare(
        `INSERT INTO computer_sessions (id,member_id,pc_id,rate_plan_id,customer_name,billing_type,amount_paid,prepaid_seconds,postpaid_rate_per_minute,prepaid_rate_snapshot,started_at,expires_at,last_heartbeat_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?, 'active')`,
      ).run(
        sid,
        memberId,
        pcId,
        plan?.id ?? null,
        resolvedCustomerName,
        effectiveBilling,
        effectiveBilling === "prepaid" ? effectiveAmount : null,
        effectiveBilling === "prepaid" ? seconds : null,
        postpaidRatePerMinute,
        rateSnapshot,
        started,
        expires,
        started,
      );
      if (!resumed && effectiveBilling === 'prepaid' && plan && String(plan.promo_kind || 'none') !== 'none') {
        recordPromoRedemption({ plan, memberId, pcId, sessionId: sid, customerName: resolvedCustomerName, redeemedAt: started });
      }
      if (!resumed && effectiveBilling === "prepaid" && cashDue > 0)
        recordRevenue(
          "session_start",
          "computer_session",
          sid,
          cashDue,
          req.auth.userId,
          started,
          { paymentMethod: "cash", memberId, pcId, metadata: { walletUsed } },
        );
      db.prepare(
        "UPDATE pcs SET status='occupied',updated_at=? WHERE id=?",
      ).run(nowIso(), pcId);
      if (memberId)
        db.prepare(
          "UPDATE members SET session_seconds_remaining=?,updated_at=? WHERE id=?",
        ).run(effectiveBilling === "prepaid" ? seconds : 0, nowIso(), memberId);
      log(req.auth.userId, "session.start", "computer_session", sid, pcId, {
        customerId: memberId,
        customerName: resolvedCustomerName,
        billing: effectiveBilling,
        walletUsed,
        cashDue,
        resumed,
        savedSeconds: seconds,
        postpaidRatePerMinute,
      });
      return {
        sessionId: sid,
        billing: effectiveBilling,
        walletUsed,
        cashDue,
        resumed,
        seconds: effectiveBilling === "prepaid" ? seconds : null,
        expiresAt: expires,
        postpaidRatePerMinute,
        memberId,
        promoNameFlag: Boolean(promoCheck.nameFlag),
      };
    });
    emitSessionUpdated(result.sessionId, {
      pcId,
      memberId: result.memberId ?? null,
      reason: result.resumed ? "session_resumed" : "session_started",
      walletUsed: result.walletUsed,
      cashDue: result.cashDue,
      remainingSeconds: result.seconds,
    });
    emitDataChanged({
      method: "POST",
      path: "/sessions/start",
      pcId,
      memberId: result.memberId ?? null,
    });
    if (result.memberId) {
      const balance = db
        .prepare("SELECT wallet_balance FROM members WHERE id=?")
        .get(result.memberId)?.wallet_balance;
      emitWalletUpdated(result.memberId, {
        balance: Number(balance ?? 0),
        reason: result.resumed ? "session_resumed" : "session_started",
        walletUsed: result.walletUsed,
      });
    }
    res.status(201).json({ success: true, ...result });
  } catch (e) {
    next(e);
  }
});

router.post("/sessions/:id/end", auth, (req, res, next) => {
  try {
    const s = db
      .prepare("SELECT * FROM computer_sessions WHERE id=? AND status='active'")
      .get(req.params.id);
    if (!s)
      return res
        .status(404)
        .json({
          success: false,
          code: "NO_ACTIVE_SESSION",
          error: "Active session not found.",
        });
    if (req.auth.role === "customer" && s.member_id !== req.auth.memberId)
      return res
        .status(403)
        .json({
          success: false,
          code: "FORBIDDEN",
          error: "You can only end your own session.",
        });
    const disposition = String(req.body?.disposition || "save").toLowerCase();
    if (!["save", "forfeit", "settle"].includes(disposition))
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_DISPOSITION",
          error: "Choose a valid session disposition.",
        });
    if (s.billing_type === "postpaid" && disposition !== "settle")
      return res
        .status(409)
        .json({
          success: false,
          code: "SETTLEMENT_REQUIRED",
          error: "Postpaid sessions must be settled before they can end.",
        });
    if (s.billing_type === "prepaid" && disposition === "settle")
      return res
        .status(409)
        .json({
          success: false,
          code: "PREPAID_ALREADY_PAID",
          error: "Prepaid sessions do not require settlement.",
        });
    const paymentMethod = String(req.body?.paymentMethod || "").toLowerCase();
    if (disposition === "settle" && !["cash", "wallet"].includes(paymentMethod))
      return res
        .status(400)
        .json({
          success: false,
          code: "PAYMENT_METHOD_REQUIRED",
          error: "Choose cash or member wallet to settle this session.",
        });
    const result = transaction(() => {
      let closed;
      let amountDue = 0;
      let walletBalance = null;
      if (disposition === "settle") {
        const endedAt = nowIso();
        const elapsedSeconds = elapsedBillableSeconds(s);
        amountDue =
          Math.round(
            (elapsedSeconds / 60) *
              Number(s.postpaid_rate_per_minute || 0) *
              100,
          ) / 100;
        if (paymentMethod === "wallet") {
          if (!s.member_id)
            throw Object.assign(
              new Error("Guest postpaid sessions must be settled with cash."),
              { status: 400, code: "MEMBER_REQUIRED", expose: true },
            );
          const member = db
            .prepare("SELECT wallet_balance FROM members WHERE id=?")
            .get(s.member_id);
          const before = Number(member?.wallet_balance || 0);
          if (before < amountDue)
            throw Object.assign(
              new Error("The member wallet does not have enough balance."),
              { status: 402, code: "INSUFFICIENT_BALANCE", expose: true },
            );
          walletBalance = before - amountDue;
          db.prepare(
            "UPDATE members SET wallet_balance=?,session_seconds_remaining=0,updated_at=? WHERE id=?",
          ).run(walletBalance, endedAt, s.member_id);
          if (amountDue > 0)
            db.prepare(
              "INSERT INTO wallet_transactions(id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
            ).run(
              id(),
              s.member_id,
              "postpaid_settlement",
              -amountDue,
              before,
              walletBalance,
              "computer_session",
              s.id,
              endedAt,
            );
        } else if (s.member_id)
          db.prepare(
            "UPDATE members SET session_seconds_remaining=0,updated_at=? WHERE id=?",
          ).run(endedAt, s.member_id);
        const changed = db
          .prepare(
            "UPDATE computer_sessions SET status='ended',ended_at=?,amount_paid=?,settlement_method=? WHERE id=? AND status='active'",
          )
          .run(endedAt, amountDue, paymentMethod, s.id);
        if (!changed.changes)
          throw Object.assign(new Error("This session was already settled."), {
            status: 409,
            code: "SESSION_ALREADY_ENDED",
            expose: true,
          });
        const paymentId = id();
        db.prepare(
          "INSERT INTO payments(id,reference,member_id,amount,method,status,created_at,confirmed_at,confirmed_by) VALUES(?,?,?,?,?,'confirmed',?,?,?)",
        ).run(
          paymentId,
          `SESSION-${s.id}`,
          s.member_id,
          amountDue,
          paymentMethod,
          endedAt,
          endedAt,
          req.auth.userId,
        );
        if (paymentMethod !== "wallet")
          recordRevenue(
            "postpaid_settlement",
            "computer_session",
            s.id,
            amountDue,
            req.auth.userId,
            endedAt,
            { paymentMethod, memberId: s.member_id, pcId: s.pc_id },
          );
        closed = { ...s, remainingSeconds: 0, endedAt };
      } else if (disposition === "forfeit") {
        const endedAt = nowIso();
        const changed = db
          .prepare(
            "UPDATE computer_sessions SET status='ended',ended_at=? WHERE id=? AND status='active'",
          )
          .run(endedAt, s.id);
        if (!changed.changes)
          throw Object.assign(new Error("This session was already ended."), {
            status: 409,
            code: "SESSION_ALREADY_ENDED",
            expose: true,
          });
        if (s.member_id)
          db.prepare(
            "UPDATE members SET session_seconds_remaining=0,updated_at=? WHERE id=?",
          ).run(endedAt, s.member_id);
        closed = { ...s, remainingSeconds: 0, endedAt };
      } else {
        closed = closeSessionAndSaveRemaining(s.id);
        if (!closed)
          throw Object.assign(new Error("This session was already ended."), {
            status: 409,
            code: "SESSION_ALREADY_ENDED",
            expose: true,
          });
      }
      db.prepare(
        "UPDATE pcs SET status='available',updated_at=? WHERE id=? AND status='occupied'",
      ).run(nowIso(), s.pc_id);
      const expiredByTime = Number(closed?.remainingSeconds ?? 0) <= 0;
      log(
        req.auth.userId,
        disposition === "forfeit"
          ? "session.forfeit"
          : disposition === "settle"
            ? "session.settle"
            : "session.end",
        "computer_session",
        s.id,
        s.pc_id,
        {
          disposition,
          expiredByTime,
          remainingSeconds: Number(closed?.remainingSeconds ?? 0),
          amount: amountDue,
          paymentMethod: disposition === "settle" ? paymentMethod : null,
        },
      );
      return { ...closed, amountDue, walletBalance };
    });
    if (disposition === "settle" && s.member_id && paymentMethod === "wallet")
      emitWalletUpdated(s.member_id, {
        balance: Number(result.walletBalance || 0),
        reason: "postpaid_settlement",
        amount: result.amountDue,
      });
    emitSessionUpdated(s.id, {
      pcId: s.pc_id,
      memberId: s.member_id,
      reason:
        disposition === "settle"
          ? "session_settled"
          : disposition === "forfeit"
            ? "session_forfeited"
            : result.remainingSeconds > 0
              ? "session_paused"
              : "session_expired",
      remainingSeconds: result.remainingSeconds,
      amountDue: result.amountDue,
      paymentMethod: disposition === "settle" ? paymentMethod : null,
    });
    if (s.member_id)
      emitDataChanged({
        method: "PATCH",
        path: `/members/${s.member_id}/session-time`,
      });
    res.json({
      success: true,
      disposition,
      remainingSeconds: result.remainingSeconds,
      sessionId: s.id,
      amountDue: result.amountDue,
      paymentMethod: disposition === "settle" ? paymentMethod : null,
    });
  } catch (e) {
    next(e);
  }
});

router.post(
  "/sessions/:id/refund",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      let s = db
        .prepare(
          `SELECT * FROM computer_sessions WHERE id=? AND status='active'`,
        )
        .get(req.params.id);
      if (!s)
        return res
          .status(404)
          .json({ success: false, error: "Active session not found." });
      if (s.billing_type !== "prepaid")
        return res
          .status(409)
          .json({
            success: false,
            code: "REFUND_NOT_PREPAID",
            error: "Only prepaid remaining time can be refunded.",
          });
      if (s.member_id) {
        checkpointMemberSession(s.member_id, s.id);
        s = db
          .prepare(
            `SELECT * FROM computer_sessions WHERE id=? AND status='active'`,
          )
          .get(s.id);
      }
      const remainingSeconds = remainingSecondsForSession(s);
      const paid = Math.max(0, Number(s.amount_paid || 0));
      const purchasedSeconds = Math.max(0, Number(s.prepaid_seconds || 0));
      const refundAmount = Math.min(
        paid,
        Math.round(
          (purchasedSeconds > 0
            ? paid * (remainingSeconds / purchasedSeconds)
            : 0) * 100,
        ) / 100,
      );
      const result = transaction(() => {
        const endedAt = nowIso();
        const changed = db
          .prepare(
            "UPDATE computer_sessions SET status='ended',ended_at=? WHERE id=? AND status='active'",
          )
          .run(endedAt, s.id);
        if (!changed.changes)
          throw Object.assign(
            new Error("This session was already refunded or ended."),
            { status: 409, code: "SESSION_ALREADY_ENDED", expose: true },
          );
        let balance = null;
        if (s.member_id) {
          const m = db
            .prepare("SELECT wallet_balance FROM members WHERE id=?")
            .get(s.member_id);
          const before = Number(m?.wallet_balance || 0);
          balance = before + refundAmount;
          db.prepare(
            "UPDATE members SET wallet_balance=?,session_seconds_remaining=0,updated_at=? WHERE id=?",
          ).run(balance, endedAt, s.member_id);
          if (refundAmount > 0)
            db.prepare(
              `INSERT INTO wallet_transactions (id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
            ).run(
              id(),
              s.member_id,
              "refund",
              refundAmount,
              before,
              balance,
              "computer_session",
              s.id,
              endedAt,
            );
        }
        db.prepare("UPDATE pcs SET status=?,updated_at=? WHERE id=?").run(
          "available",
          endedAt,
          s.pc_id,
        );
        log(
          req.auth.userId,
          "session.refund",
          "computer_session",
          s.id,
          s.pc_id,
          {
            refundAmount,
            remainingSeconds,
            destination: s.member_id ? "wallet" : "cash",
          },
        );
        const receivedCents = Number(
          db
            .prepare(
              "SELECT COALESCE(SUM(amount_centavos),0) cents FROM revenue_events WHERE source_type='computer_session' AND source_id=?",
            )
            .get(s.id)?.cents || 0,
        );
        const cashRefund = Math.min(
          refundAmount,
          Math.max(0, receivedCents / 100),
        );
        if (cashRefund > 0)
          recordRevenue(
            "session_refund",
            "computer_session_refund",
            s.id,
            -cashRefund,
            req.auth.userId,
            endedAt,
            {
              category: "refund",
              memberId: s.member_id,
              pcId: s.pc_id,
              metadata: { walletRefund: refundAmount },
            },
          );
        return { balance };
      });
      if (s.member_id)
        emitWalletUpdated(s.member_id, {
          balance: Number(result.balance ?? 0),
          reason: "session_refund",
          refundAmount,
        });
      emitSessionUpdated(s.id, {
        pcId: s.pc_id,
        memberId: s.member_id,
        reason: "session_refunded",
        remainingSeconds: 0,
        refundAmount,
      });
      emitDataChanged({
        method: "POST",
        path: `/sessions/${s.id}/refund`,
        pcId: s.pc_id,
        memberId: s.member_id,
      });
      res.json({
        success: true,
        sessionId: s.id,
        remainingSeconds: 0,
        refundAmount,
        destination: s.member_id ? "wallet" : "cash",
        balance: result.balance,
      });
    } catch (e) {
      next(e);
    }
  },
);

router.post("/public/session-extensions", requirePairedStation, (req, res, next) => {
  try {
    const pc = req.pc;
    if (!pc) return res.status(404).json({ success:false, code:'PC_NOT_REGISTERED', error:'This PC is not registered with the cafe server.' });
    if (pc.station_token_hash && !req.stationAuthenticated)
      return res.status(403).json({ success:false, code:'STATION_NOT_PAIRED', error:'Station enrollment credential is missing or invalid.' });
    const s = db.prepare("SELECT * FROM computer_sessions WHERE pc_id=? AND member_id IS NULL AND status='active' ORDER BY started_at DESC LIMIT 1").get(pc.id);
    if (!s) return res.status(404).json({ success:false, code:'NO_ACTIVE_SESSION', error:'No active guest session is running on this station.' });
    if (s.billing_type !== 'prepaid') return res.status(409).json({ success:false, code:'PREPAID_SESSION_REQUIRED', error:'Only prepaid sessions can be extended with purchased time.' });
    const { amount, ratePlanId=null, paymentMethod='cash', refNo=null } = req.body || {};
    if (!['cash','gcash'].includes(paymentMethod)) return res.status(400).json({ success:false, code:'INVALID_PAYMENT_METHOD', error:'Guest extensions support cash or GCash only.' });
    const plan = ratePlanId
      ? db.prepare("SELECT * FROM rate_plans WHERE id=? AND is_active=1").get(String(ratePlanId))
      : sessionRatePlan(s);
    if (!plan) return res.status(404).json({ success:false, code:'RATE_PLAN_NOT_FOUND', error:'Rate plan not found or inactive.' });
    if (!plan.customer_self_service) return res.status(403).json({ success:false, code:'RATE_PLAN_NOT_AVAILABLE', error:'This rate plan is not available for customer extensions.' });
    const eligibility = ratePlanEligibility(plan, null);
    if (!eligibility.eligible) return res.status(403).json({ success:false, code:`RATE_PLAN_${String(eligibility.reason || 'INELIGIBLE').toUpperCase()}`, error:'This rate plan is not currently available to this customer.' });
    const numeric=Number(amount);
    if (!(numeric>0)) return res.status(400).json({success:false,error:'Enter a valid amount.'});
    if (plan.mode==='package' && numeric<Number(plan.amount||0)) return res.status(400).json({success:false,code:'INVALID_AMOUNT',error:`Minimum amount is ₱${Number(plan.amount||0).toFixed(2)}.`});
    const minutes=minutesForAmount(plan,numeric);
    if (!(minutes>0)) return res.status(400).json({success:false,code:'INVALID_AMOUNT',error:'This amount does not add any time.'});
    if (String(plan.promo_kind || 'none') !== 'none') validatePromoRedemption({ plan, memberId:null, pcId:s.pc_id, customerName:s.customer_name, amount:numeric, anchorAt:s.expires_at ? new Date(s.expires_at) : new Date(), now:new Date() });
    if (paymentMethod==='gcash' && !/^09\d{9}$/.test(String(settingsView().gcashNumber||''))) return res.status(400).json({success:false,code:'GCASH_NOT_CONFIGURED',error:'GCash is not available until the cafe GCash number is configured.'});
    if (paymentMethod==='gcash' && !/^09\d{9}$/.test(String(refNo||''))) return res.status(400).json({success:false,code:'GCASH_NUMBER_REQUIRED',error:'Your GCash number is required.'});
    const extId=id(); const requestedAt=nowIso();
    transaction(() => {
      db.prepare(`INSERT INTO session_extensions (id,computer_session_id,member_id,rate_plan_id,amount,minutes_added,payment_method,status,requested_at) VALUES (?,?,?,?,?,?,?,'pending',?)`)
        .run(extId,s.id,null,plan.id,numeric,minutes,paymentMethod,requestedAt);
      if (paymentMethod==='gcash') {
        db.prepare(`INSERT INTO payments (id,reference,member_id,amount,method,status,external_reference,created_at) VALUES (?,?,?,?,?,'pending',?,?)`)
          .run(id(),`EXT-${extId}`,null,numeric,'gcash',refNo,requestedAt);
      }
    });
    const request={ id:extId, sessionId:s.id, memberId:null, pcId:s.pc_id, pcLabel:pc.label, customerName:s.customer_name || 'Guest', ratePlanId:plan.id, amount:numeric, minutesAdded:minutes, paymentMethod, gcashNumber:paymentMethod==='gcash'?String(refNo):null, status:'pending', requestedAt };
    emitSessionExtensionRequest(request);
    emitSessionUpdated(s.id,{pcId:s.pc_id,memberId:null,reason:'extension_requested',extensionId:extId});
    emitDataChanged({method:'POST',path:'/public/session-extensions',pcId:s.pc_id});
    return res.status(201).json({success:true,status:'pending',extensionId:extId,ratePlanId:plan.id,minutesAdded:minutes});
  } catch (e) { next(e); }
});

router.post("/session-extensions", auth, (req, res, next) => {
  try {
    const {
      sessionId,
      amount,
      ratePlanId = null,
      paymentMethod = "cash",
      refNo = null,
      username,
      birthdate,
    } = req.body;
    const s = db
      .prepare(`SELECT * FROM computer_sessions WHERE id=? AND status='active'`)
      .get(sessionId);
    if (!s)
      return res
        .status(404)
        .json({ success: false, error: "Active session not found." });
    if (req.auth.role === "customer" && s.member_id !== req.auth.memberId)
      return res
        .status(403)
        .json({
          success: false,
          error: "You can only extend your own session.",
        });
    if (s.billing_type !== "prepaid")
      return res.status(409).json({ success:false, code:"PREPAID_SESSION_REQUIRED", error:"Only prepaid sessions can be extended with purchased time." });
    const selectedRatePlanId = ratePlanId ? String(ratePlanId) : null;
    const plan = selectedRatePlanId
      ? db.prepare("SELECT * FROM rate_plans WHERE id=? AND is_active=1").get(selectedRatePlanId)
      : sessionRatePlan(s);
    if (!plan)
      return res
        .status(404)
        .json({
          success: false,
          code: "RATE_PLAN_NOT_FOUND",
          error: "Rate plan not found or inactive.",
        });

    // The selected extension plan must be a customer-facing self-service plan.
    // This keeps the new UI selector from accidentally exposing admin-only rates.
    if (!plan.customer_self_service)
      return res
        .status(403)
        .json({
          success: false,
          code: "RATE_PLAN_NOT_AVAILABLE",
          error: "This rate plan is not available for customer extensions.",
        });

    let extensionMember = null;
    if (req.auth.role === "customer") {
      extensionMember = db
        .prepare("SELECT * FROM members WHERE id=? AND status='active'")
        .get(req.auth.memberId);
      if (!extensionMember)
        return res.status(404).json({
          success: false,
          code: "MEMBER_NOT_FOUND",
          error: "Member account not found or inactive.",
        });
    } else if (s.member_id) {
      extensionMember = db
        .prepare("SELECT * FROM members WHERE id=? AND status='active'")
        .get(s.member_id);
    }

    // Use the same source-of-truth eligibility rules for members and guests.
    // Guests have no member record, so only plans that are valid for Regular
    // eligibility (including the normal Regular rate) can be selected.
    const eligibility = ratePlanEligibility(plan, extensionMember);
    if (!eligibility.eligible)
      return res
        .status(403)
        .json({
          success: false,
          code: `RATE_PLAN_${String(eligibility.reason || "INELIGIBLE").toUpperCase()}`,
          error:
            "This rate plan is not currently available to this customer.",
        });

    const numeric = Number(amount);
    if (!(numeric > 0))
      return res
        .status(400)
        .json({ success: false, error: "Enter a valid amount." });
    if (plan.mode === "package" && numeric < Number(plan.amount || 0))
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_AMOUNT",
          error: `Minimum amount is ₱${Number(plan.amount || 0).toFixed(2)}.`,
        });
    const minutes = minutesForAmount(plan, numeric);
    if (!(minutes > 0))
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_AMOUNT",
          error: "This amount does not add any time.",
        });

    if (String(plan.promo_kind || 'none') !== 'none') {
      validatePromoRedemption({
        plan,
        memberId: s.member_id,
        pcId: s.pc_id,
        customerName: s.customer_name,
        amount: numeric,
        anchorAt: s.expires_at ? new Date(s.expires_at) : new Date(),
        now: new Date(),
      });
    }

    if (paymentMethod === "wallet") {
      const result = transaction(() => {
        const m = db
          .prepare("SELECT wallet_balance FROM members WHERE id=?")
          .get(s.member_id);
        if (!m || Number(m.wallet_balance) < numeric)
          throw Object.assign(
            new Error("Not enough wallet balance for that amount."),
            { status: 400, expose: true },
          );
        const before = Number(m.wallet_balance),
          after = before - numeric;
        db.prepare(
          "UPDATE members SET wallet_balance=?,updated_at=? WHERE id=?",
        ).run(after, nowIso(), s.member_id);
        db.prepare(
          `INSERT INTO wallet_transactions (id,member_id,type,amount,balance_before,balance_after,reference_type,reference_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)`,
        ).run(
          id(),
          s.member_id,
          "session_extension",
          -numeric,
          before,
          after,
          "session_extension",
          s.id,
          nowIso(),
        );
        const extended = extendPrepaidSession(s, minutes * 60);
        db.prepare("UPDATE computer_sessions SET amount_paid=? WHERE id=?").run(
          Number(s.amount_paid || 0) + numeric, s.id,
        );
        const extId = id();
        db.prepare(
          `INSERT INTO session_extensions (id,computer_session_id,member_id,rate_plan_id,amount,minutes_added,payment_method,status,requested_at,confirmed_at,confirmed_by) VALUES (?,?,?,?,?,?,?, 'approved',?,?,?)`,
        ).run(
          extId,
          s.id,
          s.member_id,
          plan.id,
          numeric,
          minutes,
          "wallet",
          nowIso(),
          nowIso(),
          req.auth.userId,
        );
        if (String(plan.promo_kind || 'none') !== 'none') {
          recordPromoRedemption({ plan, memberId:s.member_id, pcId:s.pc_id, sessionId:s.id, customerName:s.customer_name });
        }
        log(
          req.auth.userId,
          "session.extend.wallet",
          "session_extension",
          extId,
          s.pc_id,
          { amount: numeric, minutes, ratePlanId: plan.id },
        );
        return extId;
      });
      const balance = db
        .prepare("SELECT wallet_balance FROM members WHERE id=?")
        .get(s.member_id)?.wallet_balance;
      emitWalletUpdated(s.member_id, {
        balance: Number(balance ?? 0),
        reason: "session_extension",
      });
      emitSessionUpdated(s.id, {
        pcId: s.pc_id,
        memberId: s.member_id,
        reason: "session_extended",
        minutesAdded: minutes,
      });
      emitDataChanged({
        method: "POST",
        path: "/session-extensions",
        pcId: s.pc_id,
        memberId: s.member_id,
      });
      return res
        .status(201)
        .json({
          success: true,
          status: "approved",
          extensionId: result,
          ratePlanId: plan.id,
          minutesAdded: minutes,
        });
    }

    if (!["cash", "gcash"].includes(paymentMethod))
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_PAYMENT_METHOD",
          error: "Unsupported payment method.",
        });
    if (
      paymentMethod === "gcash" &&
      !/^09\d{9}$/.test(String(settingsView().gcashNumber || ""))
    )
      return res
        .status(400)
        .json({
          success: false,
          code: "GCASH_NOT_CONFIGURED",
          error:
            "GCash is not available until the cafe GCash number is configured.",
        });
    if (paymentMethod === "gcash" && !/^09\d{9}$/.test(String(refNo || "")))
      return res
        .status(400)
        .json({
          success: false,
          code: "GCASH_NUMBER_REQUIRED",
          error: "Your GCash number is required.",
        });
    const extId = id();
    const requestedAt = nowIso();
    transaction(() => {
      db.prepare(
        `INSERT INTO session_extensions (id,computer_session_id,member_id,rate_plan_id,amount,minutes_added,payment_method,status,requested_at) VALUES (?,?,?,?,?,?,?,'pending',?)`,
      ).run(extId, s.id, s.member_id, plan.id, numeric, minutes, paymentMethod, requestedAt);
      if (paymentMethod === "gcash") {
        db.prepare(
          `INSERT INTO payments (id,reference,member_id,amount,method,status,external_reference,created_at) VALUES (?,?,?,?,?,'pending',?,?)`,
        ).run(id(), `EXT-${extId}`, s.member_id, numeric, "gcash", refNo, requestedAt);
      }
    });
    log(
      req.auth.userId,
      "session.extend.request",
      "session_extension",
      extId,
      s.pc_id,
      { amount: numeric, minutes, paymentMethod, refNo, ratePlanId: plan.id },
    );
    emitSessionExtensionRequest({ id:extId, sessionId:s.id, memberId:s.member_id, pcId:s.pc_id, customerName:s.customer_name, ratePlanId:plan.id, amount:numeric, minutesAdded:minutes, paymentMethod, gcashNumber:paymentMethod === 'gcash' ? String(refNo) : null, status:'pending', requestedAt });
    emitSessionUpdated(s.id, {
      pcId: s.pc_id,
      memberId: s.member_id,
      reason: "extension_requested",
      extensionId: extId,
    });
    emitDataChanged({
      method: "POST",
      path: "/session-extensions",
      pcId: s.pc_id,
      memberId: s.member_id,
    });
    res
      .status(201)
      .json({
        success: true,
        status: "pending",
        extensionId: extId,
        ratePlanId: plan.id,
        minutesAdded: minutes,
      });
  } catch (e) {
    next(e);
  }
});

router.get("/session-extensions", auth, (req, res) => {
  const where = req.auth.role === "customer" ? "WHERE se.member_id = ?" : "";
  const params = req.auth.role === "customer" ? [req.auth.memberId] : [];
  const rows = db.prepare(`
    SELECT se.*,p.label pc_label,p.ip_address pc_ip,cs.pc_id,m.name customer_name,
           pay.external_reference gcash_number
    FROM session_extensions se
    LEFT JOIN computer_sessions cs ON cs.id=se.computer_session_id
    LEFT JOIN pcs p ON p.id=cs.pc_id
    LEFT JOIN members m ON m.id=se.member_id
    LEFT JOIN payments pay ON pay.reference=('EXT-' || se.id)
    ${where}
    ORDER BY CASE se.status WHEN 'pending' THEN 0 ELSE 1 END,se.requested_at DESC
  `).all(...params);
  res.json({ success:true, extensions:rows });
});

router.post("/session-extensions/:id/confirm", auth, requireRole("admin"), (req,res,next) => {
  try {
    const result=transaction(() => {
      const ext=db.prepare("SELECT * FROM session_extensions WHERE id=? AND status='pending'").get(req.params.id);
      if(!ext) throw Object.assign(new Error('Extension is no longer pending.'),{status:409,code:'EXTENSION_STATE_CONFLICT',expose:true});
      const s=db.prepare("SELECT * FROM computer_sessions WHERE id=? AND status='active'").get(ext.computer_session_id);
      if(!s) throw Object.assign(new Error('The computer session is no longer active.'),{status:409,code:'NO_ACTIVE_SESSION',expose:true});
      if(s.billing_type!=='prepaid') throw Object.assign(new Error('Only prepaid sessions can be extended with purchased time.'),{status:409,code:'PREPAID_SESSION_REQUIRED',expose:true});
      const promoPlan = ext.rate_plan_id
        ? db.prepare("SELECT * FROM rate_plans WHERE id=?").get(ext.rate_plan_id)
        : sessionRatePlan(s);
      if(String(promoPlan?.promo_kind || 'none') !== 'none') {
        validatePromoRedemption({ plan:promoPlan, memberId:s.member_id, pcId:s.pc_id, customerName:s.customer_name, amount:Number(ext.amount), anchorAt:s.expires_at ? new Date(s.expires_at) : new Date(), now:new Date() });
      }
      extendPrepaidSession(s, Number(ext.minutes_added) * 60);
      db.prepare("UPDATE computer_sessions SET amount_paid=? WHERE id=?").run(Number(s.amount_paid||0)+Number(ext.amount),s.id);
      const approvedAt=nowIso();
      const changed=db.prepare("UPDATE session_extensions SET status='approved',confirmed_at=?,confirmed_by=? WHERE id=? AND status='pending'")
        .run(approvedAt,req.auth.userId,ext.id);
      if(changed.changes!==1) throw Object.assign(new Error('Extension is no longer pending.'),{status:409,code:'EXTENSION_STATE_CONFLICT',expose:true});
      if(String(promoPlan?.promo_kind || 'none') !== 'none') recordPromoRedemption({plan:promoPlan,memberId:s.member_id,pcId:s.pc_id,sessionId:s.id,customerName:s.customer_name});
      if(ext.payment_method!=='wallet') recordRevenue('session_extension','session_extension',ext.id,Number(ext.amount),req.auth.userId,approvedAt,{paymentMethod:ext.payment_method,memberId:ext.member_id,pcId:s.pc_id});
      if(ext.payment_method==='gcash') {
        const payment=db.prepare("SELECT id FROM payments WHERE reference=? AND status='pending'").get(`EXT-${ext.id}`);
        if(payment) db.prepare("UPDATE payments SET status='confirmed',confirmed_at=?,confirmed_by=? WHERE id=? AND status='pending'").run(approvedAt,req.auth.userId,payment.id);
      }
      log(req.auth.userId,'session.extend.confirm','session_extension',ext.id,s.pc_id);
      return {...ext,pc_id:s.pc_id,status:'approved'};
    });
    emitSessionUpdated(result.computer_session_id,{pcId:result.pc_id,memberId:result.member_id,reason:'session_extended',minutesAdded:Number(result.minutes_added),extensionId:result.id});
    emitSessionExtensionUpdated({id:result.id,sessionId:result.computer_session_id,pcId:result.pc_id,memberId:result.member_id,status:'approved',minutesAdded:Number(result.minutes_added),paymentMethod:result.payment_method});
    emitDataChanged({method:'POST',path:`/session-extensions/${result.id}/confirm`,pcId:result.pc_id,memberId:result.member_id});
    res.json({success:true,extension:result});
  } catch(e){ next(e); }
});

router.post("/session-extensions/:id/reject", auth, requireRole("admin"), (req,res,next) => {
  try {
    const result=transaction(() => {
      const ext=db.prepare("SELECT se.*,cs.pc_id FROM session_extensions se LEFT JOIN computer_sessions cs ON cs.id=se.computer_session_id WHERE se.id=? AND se.status='pending'").get(req.params.id);
      if(!ext) throw Object.assign(new Error('Extension is no longer pending.'),{status:409,code:'EXTENSION_STATE_CONFLICT',expose:true});
      const at=nowIso();
      const changed=db.prepare("UPDATE session_extensions SET status='rejected',confirmed_at=?,confirmed_by=? WHERE id=? AND status='pending'").run(at,req.auth.userId,ext.id);
      if(changed.changes!==1) throw Object.assign(new Error('Extension is no longer pending.'),{status:409,code:'EXTENSION_STATE_CONFLICT',expose:true});
      if(ext.payment_method==='gcash') db.prepare("UPDATE payments SET status='rejected',confirmed_at=?,confirmed_by=? WHERE reference=? AND status='pending'").run(at,req.auth.userId,`EXT-${ext.id}`);
      log(req.auth.userId,'session.extend.reject','session_extension',ext.id,ext.pc_id);
      return {...ext,status:'rejected'};
    });
    emitSessionExtensionUpdated({id:result.id,sessionId:result.computer_session_id,pcId:result.pc_id,memberId:result.member_id,status:'rejected',paymentMethod:result.payment_method});
    emitDataChanged({method:'POST',path:`/session-extensions/${result.id}/reject`,pcId:result.pc_id,memberId:result.member_id});
    res.json({success:true,extension:result});
  } catch(e){next(e)}
});

router.get('/transfer-requests', auth, requireRole('admin'), (req,res) => {
  const rows=db.prepare(`SELECT tr.*, fp.label from_pc_label, tp.label to_pc_label, cs.customer_name FROM transfer_requests tr JOIN pcs fp ON fp.id=tr.from_pc_id JOIN pcs tp ON tp.id=tr.to_pc_id JOIN computer_sessions cs ON cs.id=tr.session_id ORDER BY CASE tr.status WHEN 'pending' THEN 0 ELSE 1 END, tr.requested_at DESC LIMIT 200`).all();
  res.json({success:true,requests:rows});
});

router.post('/public/transfer-requests', requirePairedStation, (req,res,next) => {
  try {
    const pcId=req.pc?.id;
    if(!pcId) return res.status(400).json({success:false,code:'PC_REQUIRED',error:'This station is not registered.'});
    if(req.pc?.station_token_hash && !req.stationAuthenticated) return res.status(403).json({success:false,code:'STATION_NOT_PAIRED',error:'Station enrollment credential is missing or invalid.'});
    const result=transaction(()=>{
      const session=db.prepare("SELECT * FROM computer_sessions WHERE pc_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(pcId);
      if(!session) throw Object.assign(new Error('No active session is running on this PC.'),{status:404,code:'NO_ACTIVE_SESSION',expose:true});
      const toPcId=String(req.body?.toPcId||'');
      if(!toPcId || toPcId===pcId) throw Object.assign(new Error('Choose another PC.'),{status:400,code:'INVALID_TRANSFER_TARGET',expose:true});
      const target=db.prepare("SELECT * FROM pcs WHERE id=?").get(toPcId);
      if(!target || target.status!=='available') throw Object.assign(new Error('That PC is no longer available.'),{status:409,code:'PC_NOT_AVAILABLE',expose:true});
      const pending=db.prepare("SELECT id FROM transfer_requests WHERE session_id=? AND status='pending'").get(session.id);
      if(pending) throw Object.assign(new Error('A transfer request is already pending.'),{status:409,code:'TRANSFER_ALREADY_PENDING',expose:true});
      const requestId=id(); const at=nowIso();
      try { db.prepare("INSERT INTO transfer_requests(id,session_id,from_pc_id,to_pc_id,requested_at,status) VALUES(?,?,?,?,?,'pending')").run(requestId,session.id,pcId,toPcId,at); }
      catch(error){ if(String(error?.message||'').includes('UNIQUE')) throw Object.assign(new Error('A transfer request is already pending.'),{status:409,code:'TRANSFER_ALREADY_PENDING',expose:true}); throw error; }
      return {requestId,sessionId:session.id,fromPcId:pcId,toPcId,customerName:session.customer_name};
    });
    emitToStaff('transfer:request',result);
    res.status(201).json({success:true,requestId:result.requestId,status:'pending'});
  }catch(e){next(e)}
});

router.post('/transfer-requests', auth, (req,res,next) => {
  try {
    const result=transaction(()=>{
      const sessionId=String(req.body?.sessionId||''); const toPcId=String(req.body?.toPcId||'');
      const s=db.prepare("SELECT * FROM computer_sessions WHERE id=? AND status='active'").get(sessionId);
      if(!s) throw Object.assign(new Error('Active session not found.'),{status:404,code:'NO_ACTIVE_SESSION',expose:true});
      if(req.auth.role==='customer' && s.member_id!==req.auth.memberId) throw Object.assign(new Error('You can only transfer your own session.'),{status:403,code:'FORBIDDEN',expose:true});
      if(!toPcId || toPcId===s.pc_id) throw Object.assign(new Error('Choose another PC.'),{status:400,code:'INVALID_TRANSFER_TARGET',expose:true});
      const target=db.prepare("SELECT * FROM pcs WHERE id=?").get(toPcId);
      if(!target || target.status!=='available') throw Object.assign(new Error('That PC is no longer available.'),{status:409,code:'PC_NOT_AVAILABLE',expose:true});
      if(db.prepare("SELECT id FROM transfer_requests WHERE session_id=? AND status='pending'").get(sessionId)) throw Object.assign(new Error('A transfer request is already pending.'),{status:409,code:'TRANSFER_ALREADY_PENDING',expose:true});
      const requestId=id(); const at=nowIso();
      try { db.prepare("INSERT INTO transfer_requests(id,session_id,from_pc_id,to_pc_id,requested_at,status) VALUES(?,?,?,?,?,'pending')").run(requestId,sessionId,s.pc_id,toPcId,at); }
      catch(error){ if(String(error?.message||'').includes('UNIQUE')) throw Object.assign(new Error('A transfer request is already pending.'),{status:409,code:'TRANSFER_ALREADY_PENDING',expose:true}); throw error; }
      return {requestId,sessionId,fromPcId:s.pc_id,toPcId,customerName:s.customer_name};
    });
    emitToStaff('transfer:request',result);
    res.status(201).json({success:true,requestId:result.requestId,status:'pending'});
  } catch(e){next(e)}
});

router.patch('/transfer-requests/:id/:decision', auth, requireRole('admin'), (req,res,next) => {
  try {
    const decision=String(req.params.decision);
    if(!['approve','reject'].includes(decision)) return res.status(400).json({success:false,error:'Invalid transfer decision.'});
    const result=transaction(()=>{
      const tr=db.prepare("SELECT * FROM transfer_requests WHERE id=? AND status='pending'").get(req.params.id);
      if(!tr) throw Object.assign(new Error('Transfer request is no longer pending.'),{status:409,code:'TRANSFER_NOT_PENDING',expose:true});
      const at=nowIso();
      if(decision==='reject'){
        const changed=db.prepare("UPDATE transfer_requests SET status='rejected',resolved_by=?,resolved_at=? WHERE id=? AND status='pending'").run(req.auth.userId,at,tr.id);
        if(changed.changes!==1) throw Object.assign(new Error('Transfer request is no longer pending.'),{status:409,code:'TRANSFER_NOT_PENDING',expose:true});
        return {tr,status:'rejected'};
      }
      const session=db.prepare("SELECT * FROM computer_sessions WHERE id=? AND status='active'").get(tr.session_id);
      const target=db.prepare("SELECT * FROM pcs WHERE id=?").get(tr.to_pc_id);
      if(!session || session.pc_id!==tr.from_pc_id) throw Object.assign(new Error('The session is no longer on the requested source PC.'),{status:409,code:'TRANSFER_SOURCE_CHANGED',expose:true});
      if(!target || target.status!=='available') throw Object.assign(new Error('The destination PC is no longer available.'),{status:409,code:'PC_NOT_AVAILABLE',expose:true});
      db.prepare("UPDATE computer_sessions SET pc_id=? WHERE id=? AND status='active' AND pc_id=?").run(target.id,session.id,tr.from_pc_id);
      db.prepare("UPDATE pcs SET status='available',updated_at=? WHERE id=?").run(at,tr.from_pc_id);
      db.prepare("UPDATE pcs SET status='occupied',updated_at=? WHERE id=?").run(at,tr.to_pc_id);
      const changed=db.prepare("UPDATE transfer_requests SET status='approved',resolved_by=?,resolved_at=? WHERE id=? AND status='pending'").run(req.auth.userId,at,tr.id);
      if(changed.changes!==1) throw Object.assign(new Error('Transfer request is no longer pending.'),{status:409,code:'TRANSFER_NOT_PENDING',expose:true});
      return {tr,status:'approved',sessionId:session.id,fromPcId:tr.from_pc_id,toPcId:tr.to_pc_id,memberId:session.member_id};
    });
    if(result.status==='approved') emitSessionUpdated(result.sessionId,{pcId:result.toPcId,memberId:result.memberId,reason:'session_transferred',fromPcId:result.fromPcId,toPcId:result.toPcId});
    emitDataChanged({method:'PATCH',path:`/transfer-requests/${req.params.id}`});
    res.json({success:true,status:result.status,sessionId:result.sessionId||result.tr?.session_id});
  }catch(e){next(e)}
});

router.get('/promos/:id/recent-redeemers', auth, requireRole('admin'), (req,res)=>{
  res.json({success:true,redeemers:recentPromoRedeemers(req.params.id,req.query.limit)});
});

router.get("/logs", auth, requireRole("admin"), (req, res) => {
  const rows = db
    .prepare("SELECT * FROM logs ORDER BY created_at DESC LIMIT 500")
    .all();
  res.json({
    success: true,
    logs: rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      action: r.action,
      entityType: r.entity_type,
      entityId: r.entity_id,
      pcId: r.pc_id,
      details: parseJson(r.details, r.details),
      createdAt: r.created_at,
    })),
  });
});

router.get(
  "/earnings",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const period = ["daily", "monthly", "yearly", "ytd"].includes(
        String(req.query.period),
      )
        ? String(req.query.period)
        : "monthly";
      res.json({ success: true, ...earningsSnapshot(period, req.query.date) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/tax-estimate",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const rate = req.query.rate == null ? null : Number(req.query.rate);
      if (rate != null && (!Number.isFinite(rate) || rate < 0 || rate > 100))
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_TAX_RATE",
            error: "Tax rate must be between 0 and 100 percent.",
          });
      res.json({ success: true, estimate: taxEstimate(req.query.date, rate) });
    } catch (error) {
      next(error);
    }
  },
);

router.patch("/tax-policy", auth, requireRole("admin"), (req, res, next) => {
  try {
    const rate = Number(req.body?.ratePercent);
    const regimeState = String(req.body?.regimeState || "eligible");
    if (!Number.isFinite(rate) || rate < 0 || rate > 100)
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_TAX_RATE",
          error: "Tax rate must be between 0 and 100 percent.",
        });
    if (
      !["eligible", "manual_required", "manual_confirmed"].includes(regimeState)
    )
      return res
        .status(400)
        .json({
          success: false,
          code: "INVALID_TAX_REGIME",
          error: "Invalid tax regime state.",
        });
    const stmt = db.prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    );
    transaction(() => {
      stmt.run("taxRatePercent", JSON.stringify(rate));
      stmt.run("taxRegimeState", JSON.stringify(regimeState));
      log(req.auth.userId, "tax_policy.update", "settings", null, null, {
        ratePercent: rate,
        regimeState,
      });
    });
    emitDataChanged({ method: "PATCH", path: "/tax-policy" });
    res.json({ success: true, policy: taxPolicyView() });
  } catch (error) {
    next(error);
  }
});

router.post(
  "/earnings/reports",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const period = ["monthly", "yearly", "ytd"].includes(
        String(req.body?.period),
      )
        ? String(req.body.period)
        : "monthly";
      const snapshot = earningsSnapshot(period, req.body?.date);
      const estimate = taxEstimate(req.body?.date);
      const createdAt = nowIso();
      const day = createdAt.slice(0, 10).replaceAll("-", "");
      const result = transaction(() => {
        const count =
          Number(
            db
              .prepare(
                "SELECT COUNT(*) count FROM financial_reports WHERE report_number LIKE ?",
              )
              .get(`AEZ-${day}-%`).count || 0,
          ) + 1;
        const reportNumber = `AEZ-${day}-${String(count).padStart(6, "0")}`;
        const report = {
          ...snapshot,
          taxEstimate: estimate,
          reportNumber,
          createdAt,
          createdBy: req.auth.userId,
        };
        const reportId = id();
        db.prepare(
          "INSERT INTO financial_reports(id,report_number,period_type,period_start,period_end,snapshot_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",
        ).run(
          reportId,
          reportNumber,
          period,
          snapshot.bounds.start,
          snapshot.bounds.end,
          JSON.stringify(report),
          req.auth.userId,
          createdAt,
        );
        return { id: reportId, ...report };
      });
      res.status(201).json({ success: true, report: result });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  "/earnings/reports/:id",
  auth,
  requireRole("admin"),
  (req, res) => {
    const row = db
      .prepare("SELECT * FROM financial_reports WHERE id=?")
      .get(req.params.id);
    if (!row)
      return res
        .status(404)
        .json({ success: false, error: "Report not found." });
    res.json({
      success: true,
      report: { id: row.id, ...parseJson(row.snapshot_json, {}) },
    });
  },
);
router.get(
  "/earnings/reports/:id/pdf-data",
  auth,
  requireRole("admin"),
  (req, res) => {
    const row = db
      .prepare("SELECT * FROM financial_reports WHERE id=?")
      .get(req.params.id);
    if (!row)
      return res
        .status(404)
        .json({ success: false, error: "Report not found." });
    const asset = db
      .prepare("SELECT mime_type,data FROM brand_assets WHERE id='primary'")
      .get();
    res.json({
      success: true,
      report: { id: row.id, ...parseJson(row.snapshot_json, {}) },
      branding: {
        cafeName: settingsView().cafeName || "Aezakmi Cafe",
        branch: settingsView().branch || "Davao Branch",
        branchLocation: settingsView().branchLocation || "",
        logoDataUrl: asset
          ? `data:${asset.mime_type};base64,${Buffer.from(asset.data).toString("base64")}`
          : null,
      },
    });
  },
);

router.get("/expenses", auth, requireRole("admin"), (req, res) => {
  const from = String(req.query?.from || "0000-01-01");
  const to = String(req.query?.to || "9999-12-31");
  const rows = db
    .prepare(
      "SELECT * FROM expense_records WHERE voided_at IS NULL AND date(recorded_at) BETWEEN date(?) AND date(?) ORDER BY recorded_at DESC",
    )
    .all(from, to);
  const expenses = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    category: row.category,
    description: row.description || "",
    amount: Number(row.signed_amount ?? row.amount),
    recordedAt: row.recorded_at,
    recurrence: row.recurrence || "one_time",
    sourceKey: row.source_key || null,
    periodKey: row.period_key || null,
    annualAmount: row.annual_amount == null ? null : Number(row.annual_amount),
    monthlyAmount:
      row.monthly_amount == null ? null : Number(row.monthly_amount),
    taxRatePercent:
      row.tax_rate_percent == null ? null : Number(row.tax_rate_percent),
    taxableBase: row.taxable_base == null ? null : Number(row.taxable_base),
    taxYear: row.tax_year,
    formulaSnapshot: parseJson(row.formula_snapshot, null),
    createdAt: row.created_at,
  }));
  res.json({
    success: true,
    expenses,
    fixedProvisions: expenses.filter((expense) => expense.kind === "fixed"),
    customExpenses: expenses.filter((expense) => expense.kind === "custom"),
  });
});

router.get(
  "/expenses/fixed-definitions",
  auth,
  requireRole("admin"),
  (req, res) => {
    const definitions = db
      .prepare("SELECT * FROM fixed_expense_definitions ORDER BY category")
      .all()
      .map((row) => ({
        id: row.id,
        sourceKey: row.source_key,
        category: row.category,
        monthlyAmount: Number(row.monthly_amount),
        dueDay: Number(row.due_day),
        effectiveFrom: row.effective_from,
        effectiveUntil: row.effective_until || null,
        isActive: Boolean(row.is_active),
        updatedAt: row.updated_at,
      }));
    res.json({ success: true, definitions });
  },
);

router.put(
  "/expenses/fixed-definitions/isp",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const monthlyAmount = Number(req.body?.monthlyAmount);
      const dueDay = Number(req.body?.dueDay);
      const effectiveFrom = String(req.body?.effectiveFrom || "").slice(0, 10);
      const effectiveUntil = req.body?.effectiveUntil
        ? String(req.body.effectiveUntil).slice(0, 10)
        : null;
      if (
        !Number.isFinite(monthlyAmount) ||
        monthlyAmount < 0 ||
        !Number.isInteger(dueDay) ||
        dueDay < 1 ||
        dueDay > 28 ||
        !/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) ||
        (effectiveUntil && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveUntil)) ||
        (effectiveUntil && effectiveUntil < effectiveFrom)
      ) {
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_FIXED_EXPENSE_DEFINITION",
            error:
              "Provide a non-negative ISP amount, a due day from 1 to 28, and a valid effective date range.",
          });
      }
      const timestamp = nowIso();
      const existing = db
        .prepare(
          "SELECT id FROM fixed_expense_definitions WHERE source_key='fixed:isp'",
        )
        .get();
      if (existing)
        db.prepare(
          "UPDATE fixed_expense_definitions SET monthly_amount=?,due_day=?,effective_from=?,effective_until=?,is_active=1,updated_at=? WHERE id=?",
        ).run(
          monthlyAmount,
          dueDay,
          effectiveFrom,
          effectiveUntil,
          timestamp,
          existing.id,
        );
      else
        db.prepare(
          "INSERT INTO fixed_expense_definitions(id,source_key,category,monthly_amount,due_day,effective_from,effective_until,is_active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          id(),
          "fixed:isp",
          "ISP Bill",
          monthlyAmount,
          dueDay,
          effectiveFrom,
          effectiveUntil,
          1,
          req.auth.userId,
          timestamp,
          timestamp,
        );
      const definition = db
        .prepare(
          "SELECT * FROM fixed_expense_definitions WHERE source_key='fixed:isp'",
        )
        .get();
      log(
        req.auth.userId,
        "expense.fixed_definition",
        "fixed_expense_definition",
        definition.id,
        null,
        { monthlyAmount, dueDay, effectiveFrom, effectiveUntil },
      );
      res.json({
        success: true,
        definition: {
          id: definition.id,
          sourceKey: definition.source_key,
          category: definition.category,
          monthlyAmount: Number(definition.monthly_amount),
          dueDay: Number(definition.due_day),
          effectiveFrom: definition.effective_from,
          effectiveUntil: definition.effective_until || null,
          isActive: Boolean(definition.is_active),
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/expenses/fixed-provisions",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const periodKey = String(req.body?.month || "").trim();
      const definition = db
        .prepare(
          "SELECT * FROM fixed_expense_definitions WHERE source_key='fixed:isp' AND is_active=1",
        )
        .get();
      const ispMonthly =
        req.body?.ispMonthly === "" || req.body?.ispMonthly == null
          ? Number(definition?.monthly_amount ?? 0)
          : Number(req.body.ispMonthly);
      const taxRatePercent = Number(
        req.body?.taxRatePercent ?? taxPolicyView().ratePercent,
      );
      if (
        !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodKey) ||
        !Number.isFinite(ispMonthly) ||
        ispMonthly < 0 ||
        !Number.isFinite(taxRatePercent) ||
        taxRatePercent < 0 ||
        taxRatePercent > 100
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_FIXED_EXPENSE",
            error:
              "Provide a valid month, ISP amount, and tax rate from 0 to 100 percent.",
          });
      const [year, month] = periodKey.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const estimate = taxEstimate(
        `${periodKey}-${String(lastDay).padStart(2, "0")}`,
        taxRatePercent,
      );
      if (
        estimate.regimeState === "manual_required" &&
        !req.body?.confirmManual
      )
        return res
          .status(409)
          .json({
            success: false,
            code: "MANUAL_TAX_REGIME_REQUIRED",
            error:
              "Annual gross exceeded ₱3,000,000. Confirm a custom tax estimate before provisioning.",
            estimate,
          });
      if (
        estimate.regimeState === "manual_required" &&
        req.body?.confirmManual &&
        req.auth.role !== "admin"
      )
        return res
          .status(403)
          .json({
            success: false,
            code: "ADMIN_CONFIRMATION_REQUIRED",
            error:
              "Only an Admin can confirm a custom tax estimate after the 8% threshold is exceeded.",
            estimate,
          });
      const effectiveMonthDate = `${periodKey}-01`;
      const definitionIsEffective =
        !definition ||
        (definition.effective_from <= effectiveMonthDate &&
          (!definition.effective_until ||
            definition.effective_until >= effectiveMonthDate));
      const dueDay = definitionIsEffective ? Number(definition.due_day) : 1;
      const recordedAt = new Date(
        `${periodKey}-${String(dueDay).padStart(2, "0")}T12:00:00+08:00`,
      ).toISOString();
      const createdAt = nowIso();
      const provision = (sourceKey, category, signedAmount, details = {}) => {
        if (!signedAmount) return null;
        const existing = db
          .prepare(
            "SELECT id FROM expense_records WHERE source_key=? AND period_key=? AND voided_at IS NULL",
          )
          .get(sourceKey, periodKey);
        if (existing) return { id: existing.id, duplicate: true };
        const expense = {
          id: id(),
          kind: "fixed",
          category,
          description: `${category} provision for ${periodKey}`,
          amount: Math.abs(signedAmount),
          signedAmount,
          recordedAt,
          recurrence: "monthly",
          sourceKey,
          periodKey,
          createdAt,
          ...details,
        };
        db.prepare(
          "INSERT INTO expense_records(id,kind,category,description,amount,signed_amount,recorded_at,recurrence,source_key,period_key,monthly_amount,tax_rate_percent,taxable_base,formula_snapshot,tax_year,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        ).run(
          expense.id,
          expense.kind,
          expense.category,
          expense.description,
          expense.amount,
          expense.signedAmount,
          expense.recordedAt,
          expense.recurrence,
          expense.sourceKey,
          expense.periodKey,
          expense.monthlyAmount ?? null,
          expense.taxRatePercent ?? null,
          expense.taxableBase ?? null,
          expense.formulaSnapshot
            ? JSON.stringify(expense.formulaSnapshot)
            : null,
          expense.taxYear ?? null,
          req.auth.userId,
          expense.createdAt,
        );
        return expense;
      };
      const provisions = transaction(() => [
        provision(
          "fixed:isp",
          "ISP Bill",
          definitionIsEffective ? ispMonthly : 0,
          { monthlyAmount: ispMonthly },
        ),
        provision(
          "fixed:business-tax",
          estimate.exceedsThreshold
            ? "Custom Tax Estimate"
            : "Estimated Tax Provision",
          estimate.proposedProvision,
          {
            taxRatePercent,
            taxableBase: estimate.taxableGross,
            taxYear: estimate.taxYear,
            formulaSnapshot: estimate,
          },
        ),
      ]).filter(Boolean);
      if (!provisions.length)
        return res
          .status(400)
          .json({
            success: false,
            code: "NO_PROVISION_DUE",
            error: "There is no ISP or incremental tax provision to record.",
            estimate,
          });
      if (provisions.every((item) => item.duplicate))
        return res
          .status(409)
          .json({
            success: false,
            code: "FIXED_PROVISION_EXISTS",
            error: "Fixed expenses were already provisioned for this month.",
          });
      const stmt = db.prepare(
        "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      );
      stmt.run("taxRatePercent", JSON.stringify(taxRatePercent));
      if (estimate.exceedsThreshold && req.body?.confirmManual)
        stmt.run("taxRegimeState", JSON.stringify("manual_confirmed"));
      log(
        req.auth.userId,
        "expense.fixed_provision",
        "expense_record",
        periodKey,
        null,
        { periodKey, ispMonthly, taxRatePercent, estimate },
      );
      res.status(201).json({ success: true, provisions, estimate });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  "/expenses",
  auth,
  requireRole("admin"),
  (req, res, next) => {
    try {
      const kind = String(req.body?.kind || "custom");
      const category = String(req.body?.category || "").trim();
      const description = String(req.body?.description || "")
        .trim()
        .slice(0, 300);
      const amount = Number(req.body?.amount);
      const recordedDate = req.body?.recordedAt
        ? new Date(req.body.recordedAt)
        : null;
      if (
        kind !== "custom" ||
        !category ||
        !Number.isFinite(amount) ||
        amount <= 0 ||
        (recordedDate && Number.isNaN(recordedDate.getTime()))
      )
        return res
          .status(400)
          .json({
            success: false,
            code: "INVALID_EXPENSE",
            error:
              "Provide a category, positive amount, and valid date for a custom expense.",
          });
      const recordedAt = recordedDate ? recordedDate.toISOString() : nowIso();
      const expense = {
        id: id(),
        kind,
        category,
        description,
        amount,
        recordedAt,
        createdAt: nowIso(),
      };
      db.prepare(
        "INSERT INTO expense_records(id,kind,category,description,amount,signed_amount,recorded_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
      ).run(
        expense.id,
        expense.kind,
        expense.category,
        expense.description,
        expense.amount,
        expense.amount,
        expense.recordedAt,
        req.auth.userId,
        expense.createdAt,
      );
      log(
        req.auth.userId,
        "expense.create",
        "expense_record",
        expense.id,
        null,
        { kind, category, amount },
      );
      res.status(201).json({ success: true, expense });
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/expenses/:id", auth, requireRole("admin"), (req, res) => {
  const row = db
    .prepare("SELECT id,voided_at FROM expense_records WHERE id=?")
    .get(req.params.id);
  if (!row)
    return res
      .status(404)
      .json({ success: false, error: "Expense not found." });
  if (row.voided_at) return res.json({ success: true, alreadyVoided: true });
  db.prepare("UPDATE expense_records SET voided_at=? WHERE id=?").run(
    nowIso(),
    row.id,
  );
  log(req.auth.userId, "expense.void", "expense_record", row.id, null);
  emitDataChanged({ method: "DELETE", path: `/expenses/${row.id}` });
  res.json({ success: true });
});

export default router;
