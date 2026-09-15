import { useEffect, useRef, useState } from 'react'
import { PlayCircle, Wallet } from 'lucide-react'
import Modal from '../common/Modal.jsx'
import NumericInput from '../common/NumericInput.jsx'
import Button from '../common/Button.jsx'
import { useAppData } from '../../context/AppDataContext.jsx'
import { minutesForAmount, minAmountFor, rateForId, isTierPromo, eligibleWalletStartPlans } from '../../lib/rates.js'
import { formatDuration } from '../../lib/duration.js'
import { createOperationKey } from '../../lib/api.js'

function peso(n) {
  return `₱${Math.floor(Number(n ?? 0))}`
}

function startPresets(plan, wallet) {
  if (!plan || plan.mode === 'package') return []
  const balance = Math.max(0, Math.floor(Number(wallet || 0)))
  const minimum = Math.max(1, Math.ceil(Number(minAmountFor(plan) || 1)))
  // Keep Customer quick-spend choices intentionally small and predictable.
  // Rate minimums and wallet balance still decide which of these presets are valid;
  // custom amount remains available for plans that require another amount.
  const candidates = [5, 10, 15, 20]
  return [...new Set(candidates.filter((value) => Number.isFinite(value) && value >= minimum && value <= balance && value > 0))]
    .sort((a, b) => a - b)
}

function initialSpend(plan, wallet) {
  if (!plan) return ''
  if (plan.mode === 'package') return String(Math.floor(Number(plan.amount || 0)))
  const presets = startPresets(plan, wallet)
  if (presets.length) return String(presets[0])
  const minimum = Math.max(1, Math.ceil(Number(minAmountFor(plan) || 1)))
  const balance = Math.max(0, Math.floor(Number(wallet || 0)))
  return balance >= minimum ? String(minimum) : ''
}

// Wallet-funded Start Session: active plans allowed by the member tier are
// offered even when the legacy Customer Self-Service toggle is off. The
// backend remains authoritative for schedule/promo eligibility and balance.
export default function StartSessionModal({ open, onClose, pc, memberId, wallet, ratePlans, tier = 'Regular', savedSeconds = 0 }) {
  const { startSelfServiceSession } = useAppData()
  const visibleRatePlans = eligibleWalletStartPlans(ratePlans, tier)
  const [ratePlanId, setRatePlanId] = useState(visibleRatePlans?.[0]?.id ?? null)
  const [customAmount, setCustomAmount] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const operationKeyRef=useRef(null)
  const resetTimerRef=useRef(null)
  const hasSavedTime = Number(savedSeconds) > 0

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
  }, [])

  useEffect(() => {
    if (!open) return
    // visibleRatePlans is intentionally NOT a dependency here: it's a fresh
    // array reference every time rate plans refresh in the background
    // (socket push / poll), even when its contents are unchanged. Depending
    // on it made this effect refire mid-session and stomp the customer's tap
    // on another rate plan a moment after they made it — same bug already
    // fixed in ExtendSessionModal.
    const firstPlan = visibleRatePlans?.[0] ?? null
    const first = firstPlan?.id ?? null
    setRatePlanId(first)
    setCustomAmount(initialSpend(firstPlan, wallet))
    setResult(null)
    setBusy(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => { if (open) operationKeyRef.current=createOperationKey() }, [open, ratePlanId, customAmount, hasSavedTime])

  if (!open) return null

  const plan = rateForId(visibleRatePlans, ratePlanId)
  const isPackage = plan?.mode === 'package'
  const amount = Math.floor(isPackage ? Number(plan.amount || 0) : Number(customAmount || 0))
  const minAmount = plan ? minAmountFor(visibleRatePlans, ratePlanId) : 1
  const minutes = plan ? minutesForAmount(visibleRatePlans, ratePlanId, amount) : 0
  const presets = plan ? startPresets(plan, wallet) : []
  const affordable = !!plan && amount >= minAmount && amount <= wallet && minutes > 0

  function handleClose() {
    if (busy) return
    onClose()
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(() => setResult(null), 200)
  }

  async function submit() {
    if (busy) return
    if (!hasSavedTime && !affordable) return
    setBusy(true)
    window.aezakmiClient?.beginSessionStart?.()
    const outcome = await startSelfServiceSession(pc.id, memberId, hasSavedTime ? null : ratePlanId, hasSavedTime ? null : amount, { operationKey:operationKeyRef.current || createOperationKey() })
    setResult(outcome)
    setBusy(false)
    if (!outcome.ok) window.aezakmiClient?.cancelSessionStart?.()
    // Do not minimize while the start modal is merely open or validation is in
    // progress. Once the backend confirms a real session has started (new
    // prepaid session or saved-time resume), complete the Electron transition
    // and switch the station from fullscreen idle mode to the 960x680 active dashboard.
    if (outcome.ok) {
      window.aezakmiClient?.completeSessionStart?.()
      onClose()
    }
  }



  return (
    <Modal
      open={open}
      onClose={handleClose}
      eyebrow={pc ? `${pc.label} · ${pc.ipAddress}` : 'Start Session'}
      title="Start Session"
      description={hasSavedTime ? "Resume saved time." : "Choose a rate and amount."}
      busy={busy}
      onSubmit={submit}
      footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={handleClose}>Cancel</Button>
            <Button
              variant="primary"
              icon={PlayCircle}
              autoFocus
              disabled={(!hasSavedTime && !affordable) || busy}
              onClick={submit}
            >
              {hasSavedTime ? 'Resume Saved Time' : `Start — ${peso(amount)}`}
            </Button>
          </>
      }
    >
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5 text-sm">
            <span className="flex items-center gap-1.5 text-slate-soft">
              <Wallet size={13} /> Wallet balance
            </span>
            <span className="stat-figure font-semibold text-ink-900">{peso(wallet)}</span>
          </div>

          {hasSavedTime ? (
            <div className="rounded-lg border border-teal/30 bg-teal/10 px-3 py-3">
              <p className="text-sm font-semibold text-ink-900">Resume saved session time</p>
              <p className="mt-1 text-xs text-slate-soft">{formatDuration(Math.ceil(Number(savedSeconds) / 60))} is already saved to your account. No rate selection or wallet payment is required to resume it.</p>
            </div>
          ) : null}

          {!hasSavedTime && <div>
            <div className="mb-1.5 flex items-center justify-between"><label className="eyebrow block">Choose a Rate</label><span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-semibold text-teal-dim">{tier} member</span></div>
            {!visibleRatePlans.length ? (
              <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-3 text-xs text-gold-dim">
                No active rate plan is currently available for your membership tier. Please ask the counter to check Rates.
              </div>
            ) : (
            <div className={`grid gap-2 ${visibleRatePlans.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {visibleRatePlans.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setRatePlanId(p.id)
                    setCustomAmount(initialSpend(p, wallet))
                  }}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                    ratePlanId === p.id
                      ? 'border-gold/50 bg-gold/10 text-gold-dim'
                      : 'border-surface-line text-slate-soft hover:text-ink-900'
                  }`}
                >
                  <span className="flex items-center justify-center gap-1">{p.name}{isTierPromo(p, tier) && <span className="rounded-full bg-teal/10 px-1.5 py-0.5 text-[9px] font-semibold text-teal-dim">PROMO</span>}</span>
                  <span className="mt-1 block text-[10px] font-normal opacity-80">{p.mode === 'package' ? `${peso(p.amount)} · ${formatDuration(p.minutesPerUnit || p.minutes)}` : `${peso(p.pesoUnit)} / ${formatDuration(p.minutesPerUnit || p.minutes)}`}</span>
                </button>
              ))}
            </div>
            )}
          </div>}

          {!hasSavedTime && isPackage && plan ? (
            <div className="flex items-center justify-between rounded-lg border border-gold/30 bg-gold/10 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-ink-900">{peso(plan.amount)} package</p>
                <p className="text-xs text-slate-soft">{plan.description}</p>
              </div>
              <span className="stat-figure text-sm font-semibold text-gold-dim">{formatDuration(plan.minutes)}</span>
            </div>
          ) : !hasSavedTime && plan ? (
            <div>
              <label className="eyebrow mb-1.5 block">Choose an amount</label>
              {presets.length > 0 && (
                <div className={`mb-2 grid gap-2 ${presets.length >= 4 ? 'grid-cols-4' : presets.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {presets.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setCustomAmount(String(preset))}
                      className={`rounded-lg border px-2 py-2 text-sm font-semibold transition-colors ${
                        amount === preset
                          ? 'border-gold/50 bg-gold/10 text-gold-dim'
                          : 'border-surface-line text-slate-soft hover:text-ink-900'
                      }`}
                    >
                      {peso(preset)}
                    </button>
                  ))}
                </div>
              )}
              <NumericInput
                min={minAmount}
                max={wallet}
                inputMode="numeric"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                placeholder={`Custom amount · minimum ${peso(minAmount)}`}
                className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 placeholder:text-slate-soft focus:outline-none focus:border-gold/50"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-soft">
                <span>Custom amounts use the selected rate proportionally.</span>
                <span className="shrink-0 font-semibold text-ink-900">Max {peso(wallet)}</span>
              </div>
              {!affordable && amount > wallet && (
                <p className="mt-1.5 text-xs text-ember-dim">That's more than your current wallet balance.</p>
              )}
              {!affordable && amount > 0 && amount < minAmount && (
                <p className="mt-1.5 text-xs text-ember-dim">Minimum spend for this rate is {peso(minAmount)}.</p>
              )}
            </div>
          ) : null}

          {!hasSavedTime && !plan && <p className="text-xs text-slate-soft">Your wallet is ready, but no active rate is available for this account yet.</p>}

          {!hasSavedTime && <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2">
            <span className="text-xs text-slate-soft">Time you get</span>
            <span className="stat-figure text-sm font-semibold text-ink-900">{formatDuration(minutes)}</span>
          </div>}

          {result?.error && <p className="text-xs text-ember-dim">{result.error}</p>}
        </div>
    </Modal>
  )
}
