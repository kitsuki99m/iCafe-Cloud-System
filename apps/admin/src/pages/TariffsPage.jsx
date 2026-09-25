import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Tags,
  Ticket,
  Pencil,
  Trash2,
  Plus,
  Moon,
  Sparkles,
  Clock3,
  Smartphone,
  AlertCircle,
  Search,
  Radio,
  SlidersHorizontal,
} from "lucide-react";
import Button from "../components/common/Button.jsx";
import Modal from "../components/common/Modal.jsx";
import NumericInput from "../components/common/NumericInput.jsx";
import DurationInput from "../components/common/DurationInput.jsx";
import { useAppData } from "../context/AppDataContext.jsx";
import { makeRatePlanId } from "../lib/rates.js";
import { formatAdminPeso, positiveNumber } from "../lib/numeric.js";
import { formatDuration } from "../lib/duration.js";
import { AdminEmptyState, AdminPageWorkspace, AdminRailCard } from "../components/layout/AdminPageWorkspace.jsx";
import { showToast } from "../lib/toast.js";
import VouchersPage from "./VouchersPage.jsx";

const BLANK_LINEAR = {
  mode: "linear",
  name: "",
  pesoUnit: "1",
  minutesPerUnit: 4,
  minAmount: "1",
  amount: null,
  minutes: null,
  description: "",
  customerSelfService: true,
  customerTier: "Regular",
  promoKind: "none",
  // Schedule is optional and should start blank — a plan with no dates
  // simply never expires and is available immediately.
  startsAt: "",
  endsAt: "",
};

const BLANK_PACKAGE = {
  mode: "package",
  name: "",
  pesoUnit: null,
  minutesPerUnit: null,
  minAmount: null,
  amount: "",
  minutes: null,
  description: "",
  customerSelfService: false,
  customerTier: "Regular",
  promoKind: "none",
  startsAt: "",
  endsAt: "",
};

function numberValue(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDraft(plan = {}) {
  return {
    ...plan,
    mode: plan.mode === "package" ? "package" : "linear",
    name: plan.name ?? "",
    pesoUnit: plan.pesoUnit ?? null,
    minutesPerUnit: numberValue(plan.minutesPerUnit, 0),
    minAmount: plan.minAmount ?? null,
    amount: plan.amount ?? null,
    minutes: numberValue(plan.minutes, 0),
    description: plan.description ?? "",
    customerSelfService: Boolean(
      plan.customerSelfService ?? plan.customer_self_service,
    ),
    customerTier: plan.customerTier ?? plan.customer_tier ?? "Regular",
    promoKind: plan.promoKind ?? plan.promo_kind ?? "none",
    startsAt: plan.startsAt ?? plan.starts_at ?? "",
    endsAt: plan.endsAt ?? plan.ends_at ?? "",
  };
}


function ratePlanPayload(draft = {}) {
  return normalizeDraft(draft);
}

function formatPeso(value, settings) {
  return formatAdminPeso(numberValue(value), settings);
}

function formatPlan(plan, settings) {
  if (plan.mode === "package") {
    return {
      headline: formatPeso(plan.amount, settings),
      sub: formatDuration(numberValue(plan.minutes)),
      detail: plan.description?.trim() || "Fixed-time package",
    };
  }
  return {
    headline: formatPeso(plan.pesoUnit, settings),
    sub: `= ${formatDuration(numberValue(plan.minutesPerUnit))}`,
    detail: `Minimum ${formatPeso(plan.minAmount, settings)}`,
  };
}

function validateDraft(draft, existingPlans, editingId = null) {
  const errors = {};
  const name = String(draft?.name ?? "").trim();
  if (!name) errors.name = "Plan name is required.";
  if (name.length > 80)
    errors.name = "Plan name must be 80 characters or fewer.";

  const duplicate = existingPlans.some(
    (p) =>
      p.id !== editingId &&
      String(p.name ?? "")
        .trim()
        .toLowerCase() === name.toLowerCase(),
  );
  if (duplicate) errors.name = "A rate plan with this name already exists.";

  if (!["Regular", "Gold", "VIP"].includes(draft.customerTier))
    errors.customerTier = "Choose Regular, Gold, or VIP.";
  if (
    !["none", "birthday", "holiday", "just_because"].includes(
      draft.promoKind ?? "none",
    )
  )
    errors.promoKind = "Choose a valid promotion type.";
  if (draft.startsAt && Number.isNaN(new Date(draft.startsAt).getTime()))
    errors.startsAt = "Enter a valid promotion start.";
  if (draft.endsAt && Number.isNaN(new Date(draft.endsAt).getTime()))
    errors.endsAt = "Enter a valid promotion end.";
  if (
    draft.startsAt &&
    draft.endsAt &&
    new Date(draft.endsAt) <= new Date(draft.startsAt)
  )
    errors.endsAt = "The end must be after the start.";

  if (draft.mode === "linear") {
    if (!(numberValue(draft.pesoUnit) > 0))
      errors.pesoUnit = "Peso amount must be greater than ₱0.";
    if (!(numberValue(draft.minutesPerUnit) > 0))
      errors.minutesPerUnit = "Duration must be greater than 0 minutes.";
    if (!(numberValue(draft.minAmount) >= 1))
      errors.minAmount = "Minimum amount must be at least ₱1.";
    if (numberValue(draft.minAmount) < numberValue(draft.pesoUnit)) {
      errors.minAmount = "Minimum amount cannot be lower than the peso unit.";
    }
  } else {
    if (!(numberValue(draft.amount) > 0))
      errors.amount = "Package price must be greater than ₱0.";
    if (!(numberValue(draft.minutes) > 0)) {
      errors.minutes = "Package duration must be greater than 0 minutes.";
    }
  }

  return errors;
}

function FieldError({ children }) {
  return (
    <p className={`mt-1 min-h-[16px] text-[11px] font-medium ${children ? "text-ember-dim" : "text-transparent"}`} aria-live="polite">
      {children || "No error"}
    </p>
  );
}

function RatePlanFields({ draft, setDraft, errors = {} }) {
  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const selectedPreset = draft.promoKind ?? "none";

  function applyPreset(value) {
    update({
      promoKind: value,
      customerSelfService: value === "none" ? draft.customerSelfService : true,
    });
  }

  function switchMode(mode) {
    // Pricing style only changes which fields are shown.  Keep every entered
    // value (including schedule, tier, and the other style's values) so a
    // staff can compare styles without losing work or remounting the modal.
    setDraft((current) =>
      current.mode === mode ? current : { ...current, mode },
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="eyebrow mb-1.5 block">Plan Name</label>
        <input
          type="text"
          autoFocus
          value={draft.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="e.g. Regular Rate"
          className={`w-full rounded-lg border bg-ink px-3 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-gold/50 ${errors.name ? "border-ember/60" : "border-surface-line"}`}
        />
        <FieldError>{errors.name}</FieldError>
      </div>

      <div>
        <label className="eyebrow mb-1.5 block">Customer Tier</label>
        <select
          value={draft.customerTier ?? "Regular"}
          onChange={(e) => update({ customerTier: e.target.value })}
          className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-gold/50"
        >
          <option value="Regular">Regular</option>
          <option value="Gold">Gold Promo</option>
          <option value="VIP">VIP Promo</option>
        </select>
        <FieldError>{errors.customerTier}</FieldError>
      </div>

      <div className="rounded-xl border border-surface-line bg-surface-raised/40 p-3.5">
        <div className="mb-3">
          <p className="text-sm font-semibold text-ink-900">
            Promotion and schedule
          </p>
          <p className="mt-0.5 text-xs text-slate-soft">
            Schedules use Philippine time. Birthday promos are available only on
            the member’s birthday.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="eyebrow mb-1.5 block">Preset</span>
            <select
              value={selectedPreset}
              onChange={(e) => applyPreset(e.target.value)}
              className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"
            >
              <option value="none">Standard plan</option>
              <option value="birthday">Birthday promo</option>
              <option value="holiday">Holiday promo</option>
              <option value="just_because">Just Because promo</option>
            </select>
            <FieldError>{errors.promoKind}</FieldError>
          </label>
          <div className="text-xs leading-5 text-slate-soft pt-5">
            {selectedPreset === "birthday"
              ? "Birthday promos use the member birthday and the selected tier schedule."
              : selectedPreset === "holiday" ||
                  selectedPreset === "just_because"
                ? "Gold-tier promos are visible to Gold and VIP. VIP-tier promos stay VIP-only."
                : "Plan tiers cascade: VIP sees Regular, Gold, and VIP plans; Gold sees Regular and Gold plans; Regular sees Regular only."}
          </div>
          <label>
            <span className="eyebrow mb-1.5 block">Starts</span>
            <input
              type="datetime-local"
              value={draft.startsAt ?? ""}
              onChange={(e) => update({ startsAt: e.target.value })}
              className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"
            />
            <FieldError>{errors.startsAt}</FieldError>
          </label>
          <label>
            <span className="eyebrow mb-1.5 block">Ends</span>
            <input
              type="datetime-local"
              value={draft.endsAt ?? ""}
              onChange={(e) => update({ endsAt: e.target.value })}
              className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"
            />
            <FieldError>{errors.endsAt}</FieldError>
          </label>
        </div>
      </div>

      <div>
        <label className="eyebrow mb-1.5 block">Pricing Style</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => switchMode("linear")}
            className={`rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
              draft.mode === "linear"
                ? "border-gold/50 bg-gold/10 text-gold-dim"
                : "border-surface-line text-slate-soft hover:bg-surface-raised hover:text-ink-900"
            }`}
          >
            <span className="block font-semibold">Scales</span>
            <span className="mt-0.5 block opacity-80">
              Peso amount → minutes
            </span>
          </button>
          <button
            type="button"
            onClick={() => switchMode("package")}
            className={`rounded-lg border px-3 py-2.5 text-left text-xs font-medium transition-colors ${
              draft.mode === "package"
                ? "border-gold/50 bg-gold/10 text-gold-dim"
                : "border-surface-line text-slate-soft hover:bg-surface-raised hover:text-ink-900"
            }`}
          >
            <span className="block font-semibold">Fixed Package</span>
            <span className="mt-0.5 block opacity-80">
              One price → fixed time
            </span>
          </button>
        </div>
      </div>

      {draft.mode === "linear" ? (
        <div className="rounded-xl border border-surface-line bg-surface-raised/40 p-3.5">
          <div className="mb-3">
            <p className="text-sm font-semibold text-ink-900">Linear pricing</p>
            <p className="mt-0.5 text-xs text-slate-soft">
              Customers receive the configured minutes for each peso unit.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="eyebrow mb-1.5 block">Peso amount (₱)</label>
              <NumericInput
                min="1"
                step="0.001"
                value={draft.pesoUnit ?? ""}
                onChange={(e) => update({ pesoUnit: e.target.value })}
                placeholder="0"
                className={`w-full rounded-lg border bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50 ${errors.pesoUnit ? "border-ember/60" : "border-surface-line"}`}
              />
              <FieldError>{errors.pesoUnit}</FieldError>
            </div>
            <div>
              <DurationInput
                label="Duration per unit"
                valueMinutes={numberValue(draft.minutesPerUnit)}
                onChange={(minutesPerUnit) => update({ minutesPerUnit })}
                error={Boolean(errors.minutesPerUnit)}
              />
              <FieldError>{errors.minutesPerUnit}</FieldError>
            </div>
          </div>
          <div className="mt-3">
            <label className="eyebrow mb-1.5 block">Minimum amount (₱)</label>
            <NumericInput
              min="0.01"
              step="0.001"
              value={draft.minAmount ?? ""}
              onChange={(e) => update({ minAmount: e.target.value })}
              placeholder="0"
              className={`w-full rounded-lg border bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50 ${errors.minAmount ? "border-ember/60" : "border-surface-line"}`}
            />
            <FieldError>{errors.minAmount}</FieldError>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-surface-line bg-surface-raised/40 p-3.5">
          <div className="mb-3">
            <p className="text-sm font-semibold text-ink-900">Fixed package</p>
            <p className="mt-0.5 text-xs text-slate-soft">
              One package price grants the configured total time.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="eyebrow mb-1.5 block">Package price (₱)</label>
              <NumericInput
                min="1"
                step="0.001"
                value={draft.amount ?? ""}
                onChange={(e) => update({ amount: e.target.value })}
                placeholder="0"
                className={`w-full rounded-lg border bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50 ${errors.amount ? "border-ember/60" : "border-surface-line"}`}
              />
              <FieldError>{errors.amount}</FieldError>
            </div>
            <div>
              <DurationInput
                label="Package duration"
                valueMinutes={numberValue(draft.minutes)}
                onChange={(minutes) => update({ minutes })}
                error={Boolean(errors.minutes)}
              />
              <FieldError>{errors.minutes}</FieldError>
            </div>
          </div>
          <div className="mt-3">
            <label className="eyebrow mb-1.5 block">
              Description{" "}
              <span className="font-normal normal-case tracking-normal">
                (optional)
              </span>
            </label>
            <input
              type="text"
              maxLength={160}
              value={draft.description ?? ""}
              onChange={(e) => update({ description: e.target.value })}
              placeholder="e.g. 3 hrs + 1 hr free"
              className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50"
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl border border-surface-line bg-surface-raised px-3.5 py-3">
        <div className="min-w-0 pr-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-ink-900">
            <Smartphone size={13} className="shrink-0 text-slate-soft" />{" "}
            Customer Self-Service
          </p>
          <p className="mt-0.5 text-xs leading-5 text-slate-soft">
            Allow customers to choose this plan when adding time to an active session.
            Wallet-funded Start Session can use any active rate allowed by the member tier.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!draft.customerSelfService}
          onClick={() =>
            update({ customerSelfService: !draft.customerSelfService })
          }
          aria-label="Toggle customer self-service"
          className={`relative flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors focus:outline-none focus:ring-2 focus:ring-gold/40 focus:ring-offset-2 ${draft.customerSelfService ? "bg-teal" : "bg-slate-soft/40"}`}
        >
          <span
            aria-hidden="true"
            className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-sm transition-transform duration-200 ease-out ${draft.customerSelfService ? "translate-x-5" : "translate-x-0"}`}
          />
        </button>
      </div>
    </div>
  );
}

export default function TariffsPage({ initialTab }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || initialTab || 'rates';
  const {
    ratePlans = [],
    settings,
    updateSessionPolicy,
    addRatePlan,
    updateRatePlan,
    deleteRatePlan,
    planUsageCount,
  } = useAppData();
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [policy, setPolicy] = useState({
    defaultBilling: "prepaid",
    lowTimeWarningMinutes: "",
    defaultAddTimeRatePlanId: "",
  });
  const [policySaving, setPolicySaving] = useState(false);
  const [policyModal, setPolicyModal] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [busyPlanIds, setBusyPlanIds] = useState(() => new Set());
  const busyPlanIdsRef = useRef(new Set());

  async function runPlanMutation(planId, action) {
    const key=String(planId)
    if (busyPlanIdsRef.current.has(key)) return
    busyPlanIdsRef.current.add(key)
    setBusyPlanIds(new Set(busyPlanIdsRef.current))
    try { await action() }
    finally {
      busyPlanIdsRef.current.delete(key)
      setBusyPlanIds(new Set(busyPlanIdsRef.current))
    }
  }
  useEffect(
    () =>
      setPolicy({
        defaultBilling: "prepaid",
        lowTimeWarningMinutes: String(settings.lowTimeWarningMinutes ?? ""),
        defaultAddTimeRatePlanId: settings.defaultAddTimeRatePlanId ?? "",
      }),
    [settings],
  );
  const policyValid = Boolean(positiveNumber(policy.lowTimeWarningMinutes));
  const policyDirty =
    (settings.defaultBilling ?? "prepaid") !== "prepaid" ||
    policy.lowTimeWarningMinutes !==
      String(settings.lowTimeWarningMinutes ?? "") ||
    policy.defaultAddTimeRatePlanId !==
      (settings.defaultAddTimeRatePlanId ?? "");
  const resetPolicy = () =>
    setPolicy({
      defaultBilling: "prepaid",
      lowTimeWarningMinutes: String(settings.lowTimeWarningMinutes ?? ""),
      defaultAddTimeRatePlanId: settings.defaultAddTimeRatePlanId ?? "",
    });

  async function savePolicy() {
    if (!policyValid || policySaving) return;
    setPolicySaving(true);
    try {
      await updateSessionPolicy({
        defaultBilling: "prepaid",
        lowTimeWarningMinutes: positiveNumber(policy.lowTimeWarningMinutes),
        defaultAddTimeRatePlanId: policy.defaultAddTimeRatePlanId || null,
      });
      showToast({ title: "Policy Saved", message: "Session policy updated successfully." });
      setPolicyModal(null);
    } catch (err) {
      const msg = err?.message || "Unable to save the session policy.";
      setError(msg);
      showToast({ title: "Policy Error", message: msg, tone: "error" });
    } finally {
      setPolicySaving(false);
    }
  }

  const sortedPlans = useMemo(
    () =>
      [...ratePlans].sort((a, b) =>
        String(a.name ?? "").localeCompare(String(b.name ?? "")),
      ),
    [ratePlans],
  );
  const visiblePlans = useMemo(
    () =>
      sortedPlans.filter((plan) => {
        const matchesFilter =
          filter === "all" ||
          (filter === "active"
            ? plan.isActive !== false
            : plan.isActive === false);
        return (
          matchesFilter &&
          String(plan.name ?? "")
            .toLowerCase()
            .includes(query.trim().toLowerCase())
        );
      }),
    [sortedPlans, filter, query],
  );
  const activeCount = ratePlans.filter(
    (plan) => plan.isActive !== false,
  ).length;
  const selfServiceCount = ratePlans.filter(
    (plan) => plan.isActive !== false && plan.customerSelfService,
  ).length;
  const tierCounts = ratePlans.reduce((acc, plan) => {
    const tier = String(plan.customerTier ?? "Regular");
    acc[tier] = (acc[tier] || 0) + 1;
    return acc;
  }, { Regular:0, Gold:0, VIP:0 });

  function openCreate() {
    setError("");
    setCreating({ ...BLANK_LINEAR });
  }

  function openEdit(plan) {
    setError("");
    setEditing(normalizeDraft(plan));
  }

  function closeEditor() {
    if (saving) return;
    setEditing(null);
    setCreating(null);
  }

  async function saveEdit() {
    if (!editing) return;
    const errors = validateDraft(editing, ratePlans, editing.id);
    if (Object.keys(errors).length) {
      const firstErr = Object.values(errors)[0];
      setError(firstErr);
      showToast({ title: "Validation Error", message: firstErr, tone: "error" });
      return;
    }
    setSaving(true);
    setError("");
    try {
      await updateRatePlan(editing.id, ratePlanPayload(editing));
      showToast({ title: "Rate Plan Updated", message: `Updated ${editing.name || "plan"}.` });
      setEditing(null);
    } catch (err) {
      const msg = err?.message || "Unable to update the rate plan.";
      setError(msg);
      showToast({ title: "Update Failed", message: msg, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function saveCreate() {
    if (!creating) return;
    const errors = validateDraft(creating, ratePlans);
    if (Object.keys(errors).length) {
      const firstErr = Object.values(errors)[0];
      setError(firstErr);
      showToast({ title: "Validation Error", message: firstErr, tone: "error" });
      return;
    }
    setSaving(true);
    setError("");
    try {
      const plan = ratePlanPayload(creating);
      await addRatePlan({ ...plan, id: makeRatePlanId(plan.name) });
      showToast({ title: "Rate Plan Created", message: `Created ${creating.name}.` });
      setCreating(null);
    } catch (err) {
      const msg = err?.message || "Unable to create the rate plan.";
      setError(msg);
      showToast({ title: "Creation Failed", message: msg, tone: "error" });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    try {
      await deleteRatePlan(deleteTarget.id);
      showToast({ title: "Rate Plan Deleted", message: deleteTarget.name, tone: "warning" });
      setDeleteTarget(null);
    } catch (err) {
      const msg = err?.message || "Unable to delete the rate plan.";
      setError(msg);
      showToast({ title: "Delete Failed", message: msg, tone: "error" });
    } finally {
      setDeleting(false);
    }
  }

  const editor = editing ?? creating;
  const editorErrors = editor
    ? validateDraft(editor, ratePlans, editing?.id ?? null)
    : {};

  const premiumCount = (tierCounts.Gold || 0) + (tierCounts.VIP || 0);
  const rateStatusCards = [
    { label: "Active plans", value: activeCount, hint: "Available for billing", icon: Radio, tone: "text-teal-dim bg-teal/10" },
    { label: "Customer-ready", value: selfServiceCount, hint: "Self-service eligible", icon: Smartphone, tone: "text-gold-dim bg-surface-raised" },
    { label: "Total plans", value: ratePlans.length, hint: "Includes inactive plans", icon: Tags, tone: "text-gold-dim bg-surface-raised" },
    { label: "Premium plans", value: premiumCount, hint: "Gold + VIP", icon: Sparkles, tone: "text-gold-dim bg-gold/10" },
  ];

  const renderTabSwitcher = () => (
    <div className="mb-4 flex items-center gap-2 border-b border-[var(--line,#26314A)] pb-3">
      <button
        type="button"
        onClick={() => setSearchParams({})}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
          activeTab === 'rates'
            ? 'bg-[var(--brand,#7B61FF)] text-white shadow-xs'
            : 'text-slate-soft hover:text-ink-900 hover:bg-surface-raised'
        }`}
      >
        <Tags size={14} />
        <span>Hourly & Package Rates</span>
      </button>
      <button
        type="button"
        onClick={() => setSearchParams({ tab: 'vouchers' })}
        className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
          activeTab === 'vouchers'
            ? 'bg-[var(--brand,#7B61FF)] text-white shadow-xs'
            : 'text-slate-soft hover:text-ink-900 hover:bg-surface-raised'
        }`}
      >
        <Ticket size={14} />
        <span>Promo Vouchers</span>
      </button>
    </div>
  );

  if (activeTab === 'vouchers') {
    return <VouchersPage headerSlot={renderTabSwitcher()} />;
  }

  return (
    <AdminPageWorkspace>
      <h1 className="sr-only">Rates</h1>
      {renderTabSwitcher()}
      <div className="rates-settings-layout grid items-start gap-5 xl:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rates-sticky-rail space-y-4 xl:sticky xl:top-[140px]">
          <section className="overview-card p-3">
            <div className="px-1 pb-2">
              <p className="eyebrow">Plan status</p>
            </div>
            <div className="space-y-2">
              {rateStatusCards.map(({ label, value, hint, icon: Icon, tone }) => (
                <div key={label} className="overview-soft-card flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">{label}</p>
                    <p className="stat-figure mt-1 text-xl font-bold tracking-[-0.03em] text-ink-900">{value}</p>
                    <p className="mt-0.5 truncate text-[9px] text-slate-soft">{hint}</p>
                  </div>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon size={15}/></span>
                </div>
              ))}
            </div>
          </section>
          <AdminRailCard title="Session controls" subtitle="Pricing rules used by staff and customer stations.">
            <div className="space-y-2">
              <button type="button" className="admin-rail-action" onClick={()=>{setError("");resetPolicy();setPolicyModal("session")}}><span>Session Policy<small>Defaults, Add Time, and session rules</small></span><SlidersHorizontal size={15}/></button>
            </div>
          </AdminRailCard>
          <AdminRailCard title="Tier coverage" subtitle="Plan inventory by customer level.">
            <div className="space-y-2">
              {["Regular","Gold","VIP"].map(tier=><div key={tier} className="admin-rail-stat"><span className="text-slate-soft">{tier}</span><b className="stat-figure text-ink-900">{tierCounts[tier]||0}</b></div>)}
            </div>
          </AdminRailCard>
        </aside>
        <main className="min-w-0">

      {error && !editor && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2.5 text-sm text-ember-dim">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Pricing catalog</p>
          <h2 className="mt-1 text-base font-semibold tracking-[-0.015em] text-ink-900">Rate plans</h2>
        </div>
      </div>

      {sortedPlans.length === 0 ? (
        <AdminEmptyState icon={Tags} title="No rate plans configured" description="Add your first rate before starting customer or guest sessions. There are no built-in/mock rates." action={<Button icon={Plus} onClick={openCreate}>Create Rate Plan</Button>}/>
      ) : (
        <>
          <div className="admin-page-toolbar mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="admin-segmented-control">
              {["all", "active", "inactive"].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${filter === value ? "bg-midnight text-soft-white" : "text-slate-soft hover:text-ink-900"}`}
                >
                  {value}{" "}
                  {value === "all"
                    ? ratePlans.length
                    : value === "active"
                      ? activeCount
                      : ratePlans.length - activeCount}
                </button>
              ))}
            </div>
            <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
              <div className="admin-search-field sm:w-64">
                <Search size={14} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search rate plans"
                  className="w-full bg-transparent text-xs text-ink-900 outline-none"
                />
              </div>
              <Button icon={Plus} onClick={openCreate}>New Rate Plan</Button>
            </div>
          </div>
          {visiblePlans.length === 0 ? (
            <div className="admin-empty-state-stage min-h-[260px] py-6">
              <div className="admin-empty-state-card max-w-md py-8">
                <p className="text-sm font-semibold text-ink-900">No matching rate plans</p>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visiblePlans.map((p) => {
                const { headline, sub, detail } = formatPlan(p, settings);
                const usage = planUsageCount?.(p.id) ?? 0;
                const Icon = p.mode === "package" ? Sparkles : Clock3;
                return (
                  <div key={p.id} className="overview-card flex min-h-[238px] flex-col p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-raised text-gold-dim">
                        <Icon size={16} />
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${p.isActive === false ? "bg-surface-raised text-slate-soft" : "bg-teal/10 text-teal-dim"}`}
                        >
                          {p.isActive === false ? "Inactive" : "Active"}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={busyPlanIds.has(String(p.id))}
                            onClick={() => openEdit(p)}
                            className="rounded-md p-1.5 text-slate-soft transition-colors hover:bg-surface-raised hover:text-ink-900 disabled:cursor-wait disabled:opacity-40"
                            title="Edit rate plan"
                            aria-label={`Edit ${p.name}`}
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={busyPlanIds.has(String(p.id))}
                            onClick={() => runPlanMutation(p.id, async () => {
                              setError("");
                              try {
                                await updateRatePlan(p.id, {
                                  ...p,
                                  isActive: p.isActive === false,
                                });
                              } catch (err) {
                                setError(err?.message || "Unable to change rate-plan status.");
                              }
                            })}
                            className="rounded-md p-1.5 text-slate-soft transition-colors hover:bg-surface-raised hover:text-ink-900 disabled:cursor-wait disabled:opacity-40"
                            title={
                              p.isActive === false
                                ? "Activate rate plan"
                                : "Deactivate rate plan"
                            }
                            aria-label={
                              p.isActive === false
                                ? `Activate ${p.name}`
                                : `Deactivate ${p.name}`
                            }
                          >
                            <Moon size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={busyPlanIds.has(String(p.id))}
                            onClick={() => {
                              setError("");
                              setDeleteTarget(p);
                            }}
                            className="rounded-md p-1.5 text-slate-soft transition-colors hover:bg-ember/10 hover:text-ember-dim disabled:cursor-wait disabled:opacity-40"
                            title="Delete rate plan"
                            aria-label={`Delete ${p.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p
                          className="truncate font-display text-base font-semibold text-ink-900"
                          title={p.name}
                        >
                          {p.name}
                        </p>
                        <span className="shrink-0 rounded-full bg-surface-raised px-2 py-0.5 text-[10px] font-medium text-slate-soft">
                          {p.customerTier ?? "Regular"}
                        </span>
                      </div>
                      <p className="stat-figure mt-1 text-xl font-semibold text-gold-dim">
                        {headline}
                        <span className="ml-1 text-xs font-normal text-slate-soft">
                          {sub}
                        </span>
                      </p>
                      <p
                        className="mt-2 truncate border-t border-surface-line pt-2 text-xs leading-5 text-slate-soft"
                        title={detail}
                      >
                        {detail}
                      </p>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2 pt-3">
                      <button
                        type="button"
                        disabled={busyPlanIds.has(String(p.id))}
                        onClick={() => runPlanMutation(p.id, () =>
                          updateRatePlan(p.id, {
                            ...p,
                            customerSelfService: !p.customerSelfService,
                          }).catch((err) => {
                            setError(err?.message || "Unable to update self-service availability.")
                            throw err
                          })
                        )}
                        title="Toggle customer Add Time availability"
                        className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                          p.customerSelfService
                            ? "bg-teal/10 text-teal-dim hover:bg-teal/20"
                            : "bg-surface-raised text-slate-soft hover:text-ink-900"
                        } disabled:cursor-wait disabled:opacity-40`}
                      >
                        <Smartphone size={11} />
                        {p.customerSelfService
                          ? "Add Time Enabled"
                          : "Add Time Off"}
                      </button>
                      <span
                        className={`shrink-0 text-[11px] ${usage > 0 ? "font-medium text-gold-dim" : "text-slate-soft"}`}
                      >
                        {usage > 0 ? `${usage} active` : "No sessions"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

        </main>
      </div>

      <Modal
        open={policyModal === "session"}
        onClose={() => !policySaving && setPolicyModal(null)}
        busy={policySaving}
        canSubmit={policyDirty && policyValid}
        onSubmit={savePolicy}
        eyebrow="Session policy"
        title="Session defaults"
        maxWidth="max-w-md"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={policySaving}
              onClick={() => setPolicyModal(null)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!policyDirty || !policyValid || policySaving}
              onClick={savePolicy}
            >
              {policySaving ? "Saving…" : "Save policy"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-xs leading-5 text-slate-soft">
            These defaults are snapshotted when a new session begins. Existing
            sessions are unchanged.
          </p>
          <div>
            <label className="eyebrow mb-1.5 block">Billing mode</label>
            <div className="rounded-lg border border-surface-line bg-surface-raised px-3 py-2.5 text-xs font-semibold text-ink-900">Prepaid only</div>
          </div>
          <label className="block">
            <span className="eyebrow mb-1.5 block">Default Add Time rate</span>
            <select
              value={policy.defaultAddTimeRatePlanId}
              onChange={(e) =>
                setPolicy({
                  ...policy,
                  defaultAddTimeRatePlanId: e.target.value,
                })
              }
              className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 outline-none focus:border-gold/50"
            >
              <option value="">Choose active rate</option>
              {ratePlans
                .filter((plan) => plan.isActive !== false)
                .map((plan) => (
                  <option value={plan.id} key={plan.id}>
                    {plan.name}
                  </option>
                ))}
            </select>
            <span className="mt-1 block text-[11px] text-slate-soft">
              Used when staff chooses Add Time from a Client card.
            </span>
          </label>
          <label className="block">
            <span className="eyebrow mb-1.5 block">
              Low-time warning (minutes)
            </span>
            <NumericInput
              autoFocus
              value={policy.lowTimeWarningMinutes}
              onChange={(e) =>
                setPolicy({ ...policy, lowTimeWarningMinutes: e.target.value })
              }
              placeholder="0"
              className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 outline-none focus:border-gold/50"
            />
          </label>
        </div>
      </Modal>



      <Modal
        open={!!editor}
        onClose={closeEditor}
        onSubmit={editing ? saveEdit : saveCreate}
        canSubmit={Object.keys(editorErrors).length === 0}
        busy={saving}
        eyebrow="Rate Plan"
        title={
          editing ? `Edit ${editing.name || "Rate Plan"}` : "New Rate Plan"
        }
        maxWidth="max-w-2xl"
        footer={
          <>
            <Button variant="ghost" disabled={saving} onClick={closeEditor}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={saving || Object.keys(editorErrors).length > 0}
              onClick={editing ? saveEdit : saveCreate}
            >
              {saving ? "Saving…" : editing ? "Save Changes" : "Add Rate Plan"}
            </Button>
          </>
        }
      >
        {editor && (
          <>
            {error && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2.5 text-xs text-ember-dim">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <RatePlanFields
              draft={editor}
              setDraft={editing ? setEditing : setCreating}
              errors={editorErrors}
            />
          </>
        )}
      </Modal>

      <Modal
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        busy={deleting}
        eyebrow="Delete Rate Plan"
        title="Remove this rate?"
        maxWidth="max-w-md"
        footer={
          <>
            <Button
              variant="ghost"
              disabled={deleting}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? "Deleting…" : "Delete Rate Plan"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm leading-6 text-ink-900">
            Delete <strong>{deleteTarget?.name}</strong> from the active tariff
            list?
          </p>
          <p className="text-xs leading-5 text-slate-soft">
            Existing completed logs remain intact. An active rate plan cannot be
            deleted while it is being used by an active session.
          </p>
        </div>
      </Modal>
    </AdminPageWorkspace>
  );
}
