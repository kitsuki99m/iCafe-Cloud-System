import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Wallet,
  Banknote,
  QrCode,
  PlusCircle,
} from "lucide-react";
import Modal from "../common/Modal.jsx";
import NumericInput from "../common/NumericInput.jsx";
import Button from "../common/Button.jsx";
import { useAppData } from "../../context/AppDataContext.jsx";
import { minAmountFor, minutesForAmount, eligibleCustomerPlans } from "../../lib/rates.js";
import { formatDuration } from "../../lib/duration.js";
import { createOperationKey } from "../../lib/api.js";

const PRESETS = [5, 10, 15, 20];
function peso(n) {
  return `₱${Math.floor(Number(n || 0))}`;
}

const METHODS = [
  { id: "cash", label: "Pay at Counter", icon: Banknote },
  { id: "gcash", label: "Pay via GCash", icon: CreditCard },
];

export default function ExtendSessionModal({
  open,
  onClose,
  pc,
  memberId,
  wallet,
  ratePlan,
  tier = "Regular",
  ratePlans = [],
}) {
  const { requestSessionExtension, settings } = useAppData();
  const [method, setMethod] = useState("cash");
  const [customAmount, setCustomAmount] = useState("");
  const [preset, setPreset] = useState(PRESETS[0]);
  const [gcashNumber, setGcashNumber] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState(ratePlan?.id ?? null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const operationKeyRef = useRef(null);
  const resetTimerRef = useRef(null);

  const visiblePlans = useMemo(() => {
    // The same tier rule is used for every customer-facing rate selector.
    // Guest is represented by the Regular tier, so guests only see Regular
    // customer-self-service plans. Gold inherits Regular + Gold; VIP sees all.
    return eligibleCustomerPlans(ratePlans, tier);
  }, [ratePlans, tier]);

  const effectivePlan =
    visiblePlans.find((plan) => String(plan.id) === String(selectedPlanId)) ??
    visiblePlans.find((plan) => String(plan.id) === String(ratePlan?.id)) ??
    visiblePlans[0] ??
    null;

  const isPackage = effectivePlan?.mode === "package";
  const amount = Math.floor(
    isPackage
      ? Number(effectivePlan.amount || 0)
      : Number(customAmount || preset),
  );
  const minimum = effectivePlan ? minAmountFor(effectivePlan) : 0;
  const minutes = effectivePlan ? minutesForAmount(effectivePlan, amount) : 0;
  const validAmount =
    Number.isFinite(amount) && amount > 0 && amount >= minimum && minutes > 0;
  const affordable =
    !!effectivePlan && validAmount && amount <= Number(wallet || 0);
  const validOwnGcash = /^09\d{9}$/.test(gcashNumber.trim());
  const validCafeGcash = /^09\d{9}$/.test(
    String(settings.gcashNumber || "").trim(),
  );
  const availableMethods = memberId
    ? [...METHODS, { id: "wallet", label: "Use Wallet", icon: Wallet }]
    : METHODS;
  const canSubmit =
    validAmount &&
    (method !== "wallet" || affordable) &&
    (method !== "gcash" || (validOwnGcash && validCafeGcash));

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
  }, []);

  useEffect(() => {
    if (!open || !visiblePlans.length) return;
    if (!visiblePlans.some((plan) => String(plan.id) === String(selectedPlanId))) {
      const fallback = visiblePlans.find((plan) => String(plan.id) === String(ratePlan?.id)) ?? visiblePlans[0];
      setSelectedPlanId(fallback?.id ?? null);
      setCustomAmount("");
      setPreset(PRESETS[0]);
    }
  }, [open, visiblePlans, selectedPlanId, ratePlan?.id]);

  useEffect(() => {
    if (!open) return;
    operationKeyRef.current = createOperationKey();
  }, [open, selectedPlanId, method, customAmount, preset, gcashNumber]);

  useEffect(() => {
    if (!open) return;
    // Only reseed the form when the modal actually opens (or the caller
    // hands us a different default plan). `visiblePlans` is intentionally
    // NOT a dependency here: it's a fresh array reference every time the
    // rate plans refresh in the background (socket push / poll), even when
    // its contents are unchanged. Depending on it made this effect refire
    // mid-session and stomp the customer's tap on another rate plan a
    // moment after they made it.
    const nextId = ratePlan?.id ?? visiblePlans[0]?.id ?? null;
    setSelectedPlanId(nextId);
    setMethod("cash");
    setCustomAmount("");
    setPreset(PRESETS[0]);
    setGcashNumber("");
    setResult(null);
    setBusy(false);
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ratePlan?.id]);

  if (!open) return null;

  function close() {
    if (busy) return;
    onClose();
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    resetTimerRef.current = setTimeout(() => setResult(null), 200);
  }

  async function submit() {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    const outcome = await requestSessionExtension(
      pc.id,
      memberId,
      amount,
      method,
      method === "gcash" ? gcashNumber.trim() : null,
      effectivePlan?.id ?? null,
      { operationKey:operationKeyRef.current || createOperationKey() },
    );
    setResult(outcome?.ok === false ? null : outcome);
    if (outcome?.ok === false)
      setError(outcome.error || "Unable to add time to this session.");
    setBusy(false);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      eyebrow={pc ? `${pc.label} · ${pc.ipAddress}` : "Add Time"}
      title="Add Time"
      description="Choose rate, amount, and payment."
      busy={busy}
      onSubmit={submit}
      footer={
        !result?.ok && (
          <>
            <Button variant="ghost" disabled={busy} onClick={close}>
              Cancel
            </Button>
            <Button
              variant={method === "wallet" ? "teal" : "primary"}
              icon={PlusCircle}
              disabled={!canSubmit || busy}
              onClick={submit}
            >
              {busy
                ? "Submitting…"
                : method === "cash"
                  ? `Request ${peso(amount)}`
                  : method === "gcash"
                    ? `Submit ${peso(amount)}`
                    : `Add ${peso(amount)}`}
            </Button>
          </>
        )
      }
    >
      {result?.ok ? (
        <div className="flex flex-col items-center gap-3 py-5 text-center">
          <CheckCircle2 size={24} className="text-teal-dim" />
          <div>
            <p className="text-sm font-semibold text-ink-900">
              {result.status === "approved"
                ? "Time added"
                : "Add Time request sent"}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-soft">
              {result.status === "approved"
                ? `${formatDuration(result.minutesAdded ?? minutes)} was added and ${peso(amount)} was deducted from your wallet.`
                : method === "cash"
                  ? "Please pay at the counter. Staff will confirm the extension."
                  : "Your payment is pending staff confirmation before time is added."}
            </p>
          </div>
          <Button variant="ghost" onClick={close}>
            Done
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {error && (
            <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">
              {error}
            </p>
          )}
          {visiblePlans.some(
            (plan) =>
              String(plan.customerTier || plan.customer_tier || "Regular") !==
              "Regular",
          ) && (
            <p className="rounded-lg border border-teal/25 bg-teal/10 px-3 py-2 text-xs text-teal-dim">
              {tier} member rates are available. Only rates you can use are shown below.
            </p>
          )}
          {visiblePlans.length > 0 && (
            <div>
              <label className="eyebrow mb-1.5 block">
                Choose a Rate
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {visiblePlans.map((plan) => (
                  <button
                    key={plan.id}
                    type="button"
                    onClick={() => setSelectedPlanId(String(plan.id))}
                    className={`rounded-lg border px-2.5 py-2 text-left transition-colors ${
                      String(selectedPlanId) === String(plan.id)
                        ? "border-gold/50 bg-gold/10 text-gold-dim"
                        : "border-surface-line text-slate-soft hover:text-ink-900"
                    }`}
                  >
                    <span className="block text-[11px] font-semibold">
                      {plan.name}
                    </span>
                    <span className="mt-1 block text-[10px] opacity-80">
                      {plan.customerTier || "Regular"} ·{" "}
                      {plan.mode === "package"
                        ? `${peso(plan.amount)} package`
                        : `${peso(plan.pesoUnit || plan.amount || 0)} / ${formatDuration(plan.minutesPerUnit || plan.minutes)}`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-2.5">
            <p className="text-xs font-semibold text-ink-900">
              Pay at Counter is selected by default.
            </p>
            <p className="mt-0.5 text-[11px] leading-relaxed text-slate-soft">
              Cash and GCash requests stay pending until staff confirms payment.
              Wallet payment is available to signed-in members.
            </p>
          </div>

          <div>
            <label className="eyebrow mb-1.5 block">Payment Method</label>
            <div className="grid gap-2">
              {availableMethods.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setMethod(id)}
                  className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                    method === id
                      ? "border-gold/50 bg-gold/10 text-gold-dim"
                      : "border-surface-line text-slate-soft hover:text-ink-900"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Icon size={15} />
                    {label}
                  </span>
                  {id === "wallet" && (
                    <span className="stat-figure text-xs">{peso(wallet)}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {isPackage ? (
            <div className="rounded-lg border border-surface-line bg-surface-raised px-3 py-3">
              <p className="text-sm font-semibold text-ink-900">
                {peso(effectivePlan.amount)} package
              </p>
              <p className="mt-0.5 text-xs text-slate-soft">
                Adds another {formatDuration(effectivePlan.minutes)}.
              </p>
            </div>
          ) : (
            <div>
              <label className="eyebrow mb-1.5 block">How much do you want to spend?</label>
              <div className="grid grid-cols-3 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPreset(p);
                      setCustomAmount("");
                    }}
                    className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                      preset === p && !customAmount
                        ? "border-gold/50 bg-gold/10 text-gold-dim"
                        : "border-surface-line text-slate-soft hover:text-ink-900"
                    }`}
                  >
                    ₱{p}
                  </button>
                ))}
              </div>
              <NumericInput
                min={minimum}
                inputMode="numeric"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={`Custom amount · minimum ₱${minimum}`}
                className="mt-2 w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 placeholder:text-slate-soft focus:outline-none focus:border-gold/50"
              />
            </div>
          )}

          {method === "wallet" && !affordable && (
            <p className="text-xs font-medium text-ember-dim">
              Your wallet balance is not enough for this amount.
            </p>
          )}

          {method === "gcash" && (
            <div className="space-y-3 rounded-lg border border-surface-line bg-surface-raised px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-ink text-slate-soft">
                  <QrCode size={26} />
                </div>
                <div className="text-xs leading-relaxed">
                  <p className="font-medium text-ink-900">
                    Send your GCash payment to
                  </p>
                  {settings.gcashName || settings.gcashNumber ? (
                    <>
                      <p className="font-semibold text-ink-900">
                        {settings.gcashName || "GCash Account"}
                      </p>
                      <p className="stat-figure text-slate-soft">
                        {settings.gcashNumber || "GCash number not configured"}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-ember-dim">
                      GCash account not configured. Ask the counter for the
                      GCash number.
                    </p>
                  )}
                </div>
              </div>
              <label className="eyebrow mb-1.5 block">Your GCash Number</label>
              {!validCafeGcash && (
                <p className="mb-2 text-[11px] font-medium text-ember-dim">
                  GCash requests are unavailable until the cafe GCash
                  number is configured.
                </p>
              )}
              <input
                value={gcashNumber}
                onChange={(e) =>
                  setGcashNumber(e.target.value.replace(/\D/g, "").slice(0, 11))
                }
                placeholder="e.g. 09171234567"
                inputMode="numeric"
                className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 placeholder:text-slate-soft focus:outline-none focus:border-gold/50"
              />
              {!validOwnGcash && gcashNumber.length > 0 && (
                <p className="mt-1 text-[11px] font-medium text-ember-dim">
                  Enter your valid 11-digit GCash number starting with 09.
                </p>
              )}
            </div>
          )}

          <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5">
            <span className="text-xs text-slate-soft">You will receive</span>
            <span className="stat-figure text-sm font-semibold text-ink-900">
              {formatDuration(minutes)}
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
