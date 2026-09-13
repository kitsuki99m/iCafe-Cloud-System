import { useEffect, useMemo, useRef, useState } from 'react'
import { Zap, User, Users, Wrench, CheckCircle2, Power, RotateCw, Loader2, Banknote } from 'lucide-react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import NumericInput from '../common/NumericInput.jsx'
import { minutesForAmount, amountForMinutes, minAmountFor, rateForId } from '../../lib/rates.js'
import { getStationSessionActionMode } from '../../lib/stationActions.js'
import { elapsedSessionSeconds, remainingSessionSeconds } from '../../lib/sessionTime.js'

const QUICK_AMOUNTS = [5, 10, 15]
const TIER_RANK = { Regular: 0, Gold: 1, VIP: 2 }
const planTierRank = (plan) => TIER_RANK[String(plan?.customerTier ?? 'Regular')] ?? 0

function peso(value) {
  const number = Number(value)
  return `₱${(Number.isFinite(number) ? number : 0).toFixed(2)}`
}

function formatDuration(totalMinutes) {
  const h = Math.floor(totalMinutes / 60)
  const m = Math.round(totalMinutes % 60)
  if (h <= 0) return `${m} min`
  if (m === 0) return `${h} hr`
  return `${h} hr ${m} min`
}

function PowerControl({ pc, onPowerCommand }) {
  const [armed, setArmed] = useState(null) // 'restart' | 'shutdown' | null
  const [sending, setSending] = useState(false)
  const [sentLabel, setSentLabel] = useState(null)
  const [error, setError] = useState('')
  const sentTimerRef = useRef(null)

  useEffect(() => () => {
    if (sentTimerRef.current) clearTimeout(sentTimerRef.current)
  }, [])

  async function fire(command) {
    if (armed !== command) {
      setArmed(command)
      return
    }
    setArmed(null)
    setSending(true)
    setError('')
    try {
      await onPowerCommand(pc, command)
      setSentLabel(command)
      if (sentTimerRef.current) clearTimeout(sentTimerRef.current)
      sentTimerRef.current = setTimeout(() => {
        sentTimerRef.current = null
        setSentLabel(null)
      }, 3000)
    } catch (cause) { setError(cause?.message || 'Unable to send command.') }
    finally { setSending(false) }
  }

  return (
    <div className="rounded-lg border border-surface-line bg-surface-raised px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">Machine Power</span>
        {sentLabel && (
          <span className="text-[10px] text-teal-dim">
            {sentLabel === 'restart' ? 'Restart' : 'Shutdown'} command sent
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => fire('restart')}
          disabled={sending}
          className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
            armed === 'restart'
              ? 'border-gold/50 bg-gold/10 text-gold-dim'
              : 'border-surface-line text-slate-soft hover:text-ink-900'
          }`}
        >
          {sending ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
          {armed === 'restart' ? 'Confirm Restart' : 'Restart'}
        </button>
        <button
          onClick={() => fire('shutdown')}
          disabled={sending}
          className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-50 ${
            armed === 'shutdown'
              ? 'border-ember/50 bg-ember/10 text-ember-dim'
              : 'border-surface-line text-slate-soft hover:text-ink-900'
          }`}
        >
          <Power size={13} />
          {armed === 'shutdown' ? 'Confirm Shutdown' : 'Shutdown'}
        </button>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-soft/70">
        Sends a remote command to {pc.ipAddress}. Click once to arm, again to confirm.
      </p>
      {error && <p className="mt-1 text-[10px] text-ember-dim">{error}</p>}
    </div>
  )
}

// Rate plan tabs + amount entry. Linear plans (Standard/Midnight) take any typed or
// tapped peso amount above their minimum; the Promo plan is a fixed package, so it
// just needs to be selected — there's nothing to type.
function RateAndAmount({ ratePlans, ratePlanId, setRatePlanId, amount, setAmount, allowPromo }) {
  const activePlans = (ratePlans ?? []).filter((p) => p.isActive !== false)
  const plan = rateForId(activePlans, ratePlanId)
  const visiblePlans = allowPromo ? activePlans : activePlans.filter((p) => p.mode !== 'package')
  const minutes = plan ? minutesForAmount(ratePlans, ratePlanId, amount) : 0

  if (!activePlans.length) {
    return <div className="rounded-lg border border-gold/30 bg-gold/10 px-3 py-3 text-xs text-gold-dim">No active rate plans are configured. Add a rate plan from Tariffs before starting a session.</div>
  }
  if (!plan) {
    return <div className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-3 text-xs text-ember-dim">Select an active rate plan to continue.</div>
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="eyebrow mb-1.5 block">Rate Plan</label>
        <div className={`grid gap-2 ${visiblePlans.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {visiblePlans.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setRatePlanId(p.id)
                if (p.mode === 'linear') setAmount(String(p.minAmount))
              }}
              className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors ${
                ratePlanId === p.id
                  ? 'border-gold/50 bg-gold/10 text-gold-dim'
                  : 'border-surface-line text-slate-soft hover:text-ink-900'
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {plan.mode === 'package' ? (
        <div className="flex items-center justify-between rounded-lg border border-gold/30 bg-gold/10 px-3 py-2.5">
          <div>
            <p className="text-sm font-semibold text-ink-900">{peso(plan.amount)} package</p>
            <p className="text-xs text-slate-soft">{plan.description}</p>
          </div>
          <span className="stat-figure text-sm font-semibold text-gold-dim">{formatDuration(plan.minutes)}</span>
        </div>
      ) : (
        <div>
          <label className="eyebrow mb-1.5 block">Amount (₱)</label>
          <div className="mb-2 flex items-center gap-2 rounded-lg border border-surface-line bg-ink px-3 py-2">
            <Banknote size={15} className="text-slate-soft" />
            <NumericInput
              min={plan.minAmount}
              step={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full bg-transparent text-sm text-ink-900 placeholder:text-slate-soft focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_AMOUNTS.map((v) => (
              <button
                key={v}
                disabled={v < plan.minAmount}
                onClick={() => setAmount(String(v))}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                  Number(amount) === v
                    ? 'border-teal/50 bg-teal/10 text-teal-dim'
                    : 'border-surface-line text-slate-soft hover:text-ink-900'
                }`}
              >
                ₱{v}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-soft/80">
            {peso(plan.pesoUnit)} = {plan.minutesPerUnit} mins · minimum ₱{plan.minAmount}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2">
        <span className="text-xs text-slate-soft">Buys</span>
        <span className="stat-figure text-sm font-semibold text-ink-900">{formatDuration(minutes)}</span>
      </div>
    </div>
  )
}

function RefundControl({ pc, refundableAmount, onRefund }) {
  const [armed, setArmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const hasMember = !!pc.session?.customerId
  const disabled = refundableAmount <= 0

  return (
    <div className="rounded-lg border border-surface-line bg-surface-raised px-3 py-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">Refund Remaining Time</span>
        <span className="stat-figure text-sm font-semibold text-ink-900">{peso(refundableAmount)}</span>
      </div>
      <button
        disabled={disabled || submitting}
        onClick={async () => {
          if (!armed) {
            setArmed(true)
            return
          }
          setSubmitting(true)
          setError('')
          try { await onRefund(pc) }
          catch (cause) { setError(cause?.message || 'Unable to refund this session.'); setArmed(false) }
          finally { setSubmitting(false) }
        }}
        className={`flex w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
          armed
            ? 'border-teal/50 bg-teal/10 text-teal-dim'
            : 'border-surface-line text-slate-soft hover:text-ink-900'
        }`}
      >
        {submitting ? 'Processing refund…' : armed
          ? hasMember
            ? `Confirm — credit ${peso(refundableAmount)} to wallet & end session`
            : `Confirm — hand back ${peso(refundableAmount)} cash & end session`
          : hasMember
            ? 'Refund to Wallet & End Session'
            : 'Refund Cash & End Session'}
      </button>
      {error && <p className="mt-1.5 text-[10px] text-ember-dim">{error}</p>}
      <p className="mt-1.5 text-[10px] text-slate-soft/70">
        {hasMember
          ? 'Linked member — refund credits their wallet directly.'
          : 'Walk-in, no member on file — refund is a cash hand-back at the counter.'}
        {' '}Click once to arm, again to confirm.
      </p>
    </div>
  )
}

function SettlementControl({ pc, amountDue, walletBalance, onSettle }) {
  const [paymentMethod, setPaymentMethod] = useState('cash')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const walletAllowed = !!pc.session?.customerId
  const walletEnough = walletAllowed && Number(walletBalance || 0) >= Number(amountDue || 0)
  async function submit() {
    if (submitting || (paymentMethod === 'wallet' && !walletEnough)) return
    setSubmitting(true); setError('')
    try { await onSettle(paymentMethod) }
    catch (cause) { setError(cause?.message || 'Unable to settle this session.') }
    finally { setSubmitting(false) }
  }
  return <div className="rounded-lg border border-surface-line bg-surface-raised px-3 py-3">
    <div className="mb-2 flex items-center justify-between"><span className="eyebrow">End & Settle</span><span className="stat-figure font-semibold text-ink-900">{peso(amountDue)}</span></div>
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => setPaymentMethod('cash')} className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${paymentMethod==='cash'?'border-teal/50 bg-teal/10 text-teal-dim':'border-surface-line text-slate-soft'}`}>Cash</button>
      <button type="button" disabled={!walletAllowed} onClick={() => setPaymentMethod('wallet')} className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:opacity-40 ${paymentMethod==='wallet'?'border-teal/50 bg-teal/10 text-teal-dim':'border-surface-line text-slate-soft'}`}>Member Wallet</button>
    </div>
    {paymentMethod==='wallet' && <p className={`mt-2 text-[11px] ${walletEnough?'text-slate-soft':'text-ember-dim'}`}>Wallet balance: {peso(walletBalance)}{walletEnough?'':' · insufficient balance'}</p>}
    <Button className="mt-3 w-full" variant="primary" disabled={submitting || (paymentMethod==='wallet' && !walletEnough)} onClick={submit}>{submitting?'Settling…':`Settle ${peso(amountDue)}`}</Button>
    {error && <p className="mt-2 text-[11px] text-ember-dim">{error}</p>}
  </div>
}

export default function SessionModal({ pc, ratePlans, members, onClose, onStart, onEnd, onRefund, onPreview, onSetMaintenance, onPowerCommand }) {
  const [customerMode, setCustomerMode] = useState('walkin') // 'walkin' | 'member'
  const [customerName, setCustomerName] = useState('Guest')
  const [memberId, setMemberId] = useState('')
  const billing = 'prepaid'
  const allActiveRatePlans = useMemo(() => (ratePlans ?? []).filter((p) => p.isActive !== false), [ratePlans])
  const selectedMember = members?.find((m) => String(m.id) === String(memberId))
  const memberTierRank = TIER_RANK[String(selectedMember?.tier ?? 'Regular')] ?? 0
  const visibleRatePlans = useMemo(() => customerMode === 'member' && selectedMember
    ? allActiveRatePlans.filter((p) => planTierRank(p) <= memberTierRank)
    : allActiveRatePlans.filter((p) => String(p.customerTier ?? 'Regular') === 'Regular'),
  [allActiveRatePlans, customerMode, selectedMember, memberTierRank])
  const [ratePlanId, setRatePlanId] = useState(() => allActiveRatePlans.find((p) => String(p.customerTier ?? 'Regular') === 'Regular')?.id ?? allActiveRatePlans[0]?.id ?? null)
  const manualRateSelectionRef = useRef(false)
  const [amount, setAmount] = useState('1')
  const [sessionAction, setSessionAction] = useState(null)
  const [startBusy, setStartBusy] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [preview, setPreview] = useState(null)

  async function runSessionAction(disposition, options = {}) {
    if (sessionAction) return
    setSessionAction(disposition)
    setLocalError('')
    try { await onEnd(pc, disposition, options) }
    catch (cause) { setLocalError(cause?.message || 'Unable to update this session.') }
    finally { setSessionAction(null) }
  }


  async function runStart(sessionInput) {
    if (startBusy || statusBusy) return
    setStartBusy(true)
    setLocalError('')
    try { await onStart(pc, sessionInput) }
    catch (cause) { setLocalError(cause?.message || 'Unable to start this session.') }
    finally { setStartBusy(false) }
  }

  async function runStatus(toMaintenance) {
    if (startBusy || statusBusy) return
    setStatusBusy(true)
    setLocalError('')
    try { await onSetMaintenance(pc, toMaintenance) }
    catch (cause) { setLocalError(cause?.message || 'Unable to update this PC status.') }
    finally { setStatusBusy(false) }
  }


  async function runRefund() {
    if (sessionAction) return
    setSessionAction('refund')
    setLocalError('')
    try { await onRefund(pc) }
    catch (cause) {
      setLocalError(cause?.message || 'Unable to refund this session.')
      throw cause
    } finally { setSessionAction(null) }
  }

  // Reset the form each time a different (available) PC is opened.
  useEffect(() => {
    if (pc?.status === 'available') {
      const defaultId = allActiveRatePlans.find((p) => String(p.customerTier ?? 'Regular') === 'Regular')?.id ?? allActiveRatePlans[0]?.id ?? null
      setCustomerMode('walkin')
      setCustomerName('Guest')
      setMemberId('')
      manualRateSelectionRef.current = false
      setRatePlanId(defaultId)
      setAmount(String(minAmountFor(allActiveRatePlans, defaultId)))
      setLocalError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pc?.id, pc?.status])

  useEffect(() => {
    let active = true
    setPreview(null)
    if (pc?.session?.id && onPreview) onPreview(pc).then((result) => { if (active) setPreview(result) }).catch(() => {})
    return () => { active = false }
  }, [pc?.session?.id, onPreview])

  // If the selected plan gets deleted/edited away out from under the form, fall
  // back to whatever's first available instead of pointing at a missing plan.
  useEffect(() => {
    if (visibleRatePlans.length && !visibleRatePlans.some((p) => String(p.id) === String(ratePlanId))) {
      const nextId = visibleRatePlans[0].id
      manualRateSelectionRef.current = false
      setRatePlanId(nextId)
      setAmount(String(minAmountFor(visibleRatePlans, nextId)))
    }
  }, [visibleRatePlans, ratePlanId])

  // Choose a sensible member default once. Realtime refreshes may replace
  // members/rates array identities, but must never stomp a manual selection.
  useEffect(() => {
    manualRateSelectionRef.current = false
    if (customerMode !== 'member' || !memberId || !selectedMember) return
    const tierPlan = visibleRatePlans.find((p) => (p.customerTier ?? 'Regular') === (selectedMember.tier ?? 'Regular')) || visibleRatePlans[0]
    if (!tierPlan) return
    setRatePlanId(tierPlan.id)
    setAmount(String(minAmountFor(visibleRatePlans, tierPlan.id)))
    // The member identity is the initialization boundary; array refreshes are not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId, customerMode])

  if (!pc) return null

  const eyebrow = `${pc.label} · ${pc.ipAddress}`
  const sessionActionMode = getStationSessionActionMode(pc)

  if (sessionActionMode === 'start') {
    const memberWallet = Number(selectedMember?.wallet ?? selectedMember?.walletBalance ?? 0)
    const savedSeconds = customerMode === 'member' ? Number(selectedMember?.sessionSecondsRemaining ?? 0) : 0
    const plan = rateForId(visibleRatePlans, ratePlanId)
    const effectiveAmount = plan?.mode === 'package' ? plan.amount : Number(amount || 0)
    const minutes = minutesForAmount(visibleRatePlans, ratePlanId, effectiveAmount)
    const walletApplied = customerMode === 'member' ? Math.min(Math.max(0, memberWallet), Math.max(0, Number(effectiveAmount) || 0)) : 0
    const cashDue = Math.max(0, (Number(effectiveAmount) || 0) - walletApplied)
    const resolvedName = customerMode === 'member' ? selectedMember?.name ?? '' : (customerName.trim() || 'Guest')
    const amountValid = plan?.mode === 'package' ? Number(plan.amount) > 0 : Number(effectiveAmount) >= Number(plan?.minAmount || 0)
    const canStart =
      (savedSeconds > 0 || !!plan) &&
      !!resolvedName &&
      (customerMode === 'walkin' || !!selectedMember) &&
      (savedSeconds > 0 || (amountValid && minutes > 0))

    return (
      <Modal
        open
        onClose={onClose}
        eyebrow={eyebrow}
        title="Start Session"
        busy={startBusy || statusBusy}
        footer={
          <>
            <Button variant="ghost" disabled={startBusy || statusBusy} onClick={onClose}>Cancel</Button>
            <Button
              variant="ghost"
              size="md"
              icon={Wrench}
              disabled={startBusy || statusBusy}
              onClick={() => runStatus(true)}
              className="mr-auto"
            >
              {statusBusy ? 'Updating…' : 'Mark Maintenance'}
            </Button>
            <Button
              variant="primary"
              disabled={!canStart || startBusy || statusBusy}
              onClick={() =>
                runStart({
                  customerName: resolvedName,
                  customerId: customerMode === 'member' ? selectedMember?.id ?? null : null,
                  billing: 'prepaid',
                  ...(savedSeconds > 0 ? {} : { ratePlanId }),
                  amount: savedSeconds > 0 ? null : effectiveAmount,
                  prepaidSeconds: savedSeconds > 0 ? savedSeconds : minutes * 60,
                })
              }
            >
              {startBusy ? 'Starting…' : 'Start Session'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="eyebrow mb-1.5 block">Customer</label>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <button
                onClick={() => { manualRateSelectionRef.current=false; setMemberId(''); setCustomerMode('walkin') }}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  customerMode === 'walkin'
                    ? 'border-gold/50 bg-gold/10 text-gold-dim'
                    : 'border-surface-line text-slate-soft hover:text-ink-900'
                }`}
              >
                <User size={13} /> Guest
              </button>
              <button
                onClick={() => setCustomerMode('member')}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                  customerMode === 'member'
                    ? 'border-gold/50 bg-gold/10 text-gold-dim'
                    : 'border-surface-line text-slate-soft hover:text-ink-900'
                }`}
              >
                <Users size={13} /> Member
              </button>
            </div>

            {customerMode === 'walkin' ? (
              <div className="flex items-center gap-2 rounded-lg border border-surface-line bg-ink px-3 py-2">
                <User size={15} className="text-slate-soft" />
                <input
                  autoFocus
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Guest name (optional)"
                  className="w-full bg-transparent text-sm text-ink-900 placeholder:text-slate-soft focus:outline-none"
                />
              </div>
            ) : (
              <select
                value={memberId}
                onChange={(e) => { manualRateSelectionRef.current=false; setMemberId(e.target.value) }}
                className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50"
              >
                <option value="">Select a member…</option>
                {members?.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} — wallet {peso(m.wallet)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="rounded-lg border border-gold/25 bg-gold/5 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <Zap size={14} className="text-gold-dim" />
              <div>
                <p className="text-xs font-semibold text-ink-900">Prepaid session</p>
                <p className="text-[10px] text-slate-soft">This production build uses prepaid billing only.</p>
              </div>
            </div>
          </div>

          <RateAndAmount
            ratePlans={visibleRatePlans}
            ratePlanId={ratePlanId}
            setRatePlanId={(nextId) => { manualRateSelectionRef.current=true; setRatePlanId(nextId) }}
            amount={amount}
            setAmount={setAmount}
            allowPromo
          />

          {customerMode === 'member' && selectedMember && (
            <div className="rounded-lg border border-teal/20 bg-teal/5 px-3 py-2.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-soft">Wallet applied</span>
                <span className="stat-figure font-semibold text-teal-dim">{peso(walletApplied)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-soft">Cash due at counter</span>
                <span className="stat-figure font-semibold text-ink-900">{peso(cashDue)}</span>
              </div>
              <p className="mt-1.5 text-[10px] text-slate-soft">The member wallet is automatically used first for prepaid session time. Any remaining amount is collected at the counter.</p>
            </div>
          )}

          {customerMode === 'member' && !selectedMember && (
            <div className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2.5 text-xs text-ember-dim">Select a member account before starting the session.</div>
          )}

          {localError && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{localError}</p>}

          <PowerControl pc={pc} onPowerCommand={onPowerCommand} />
        </div>
      </Modal>
    )
  }

  if (sessionActionMode === 'manage') {
    const s = pc.session
    const plan = rateForId(ratePlans, s.ratePlanId)
    const sessionFrozen = pc.stationOnline === false || pc.isOnline === false || s.isPaused === true || s.isLocked === true
    const elapsedSec = elapsedSessionSeconds(s, Date.now())

    let amountDue = 0
    let refundableAmount = 0
    let remainingLabel = null

    if (s.billing === 'prepaid') {
      const remainingSec = remainingSessionSeconds(s, Date.now())
      amountDue = s.amount ?? 0
      refundableAmount = s.prepaidSeconds > 0 ? Math.max(0, amountDue * (remainingSec / s.prepaidSeconds)) : 0
      remainingLabel = formatDuration(remainingSec / 60)
    } else {
      amountDue = Number(s.accruedAmount ?? preview?.amountDue ?? ((elapsedSec / 60) * Number(s.postpaidRatePerMinute || 0)))
    }

    return (
      <Modal
        open
        onClose={onClose}
        eyebrow={eyebrow}
        title="Manage Session"
        busy={!!sessionAction}
        footer={
          <>
            <Button variant="ghost" disabled={!!sessionAction} onClick={onClose}>Close</Button>
            {s.billing === 'prepaid' && <Button variant="danger" disabled={!!sessionAction} onClick={() => runSessionAction('forfeit')}>{sessionAction==='forfeit'?'Forfeiting…':'Forfeit Time'}</Button>}
            {s.billing === 'prepaid' && <Button variant="primary" disabled={!!sessionAction || sessionFrozen} onClick={() => runSessionAction('save')}>{sessionFrozen ? 'Session Paused' : sessionAction==='save' ? 'Saving…' : 'Pause & Save'}</Button>}
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-soft">Customer</span>
            <span className="font-medium text-ink-900">
              {s.customerName}
              {s.customerId && <span className="ml-1.5 text-[10px] text-teal-dim">(member)</span>}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-soft">Billing</span>
            <span className="font-medium text-ink-900">{s.billing === 'prepaid' ? `Prepaid · ${plan?.name ?? '—'}` : 'Legacy session · staff checkout'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-soft">Started</span>
            <span className="stat-figure text-ink-900">
              {new Date(s.startedAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {remainingLabel && (
            <div className="flex items-center justify-between">
              <span className="text-slate-soft">{sessionFrozen ? 'Paused time' : 'Time remaining'}</span>
              <span className="stat-figure text-ink-900">{remainingLabel}</span>
            </div>
          )}
          <div className="my-2 h-px bg-surface-line" />
          <div className="flex items-center justify-between rounded-lg bg-surface-raised px-3 py-2.5">
            <span className="text-xs text-slate-soft">
              {s.billing === 'prepaid' ? 'Prepaid amount' : 'Legacy amount due'}
            </span>
            <span className="stat-figure text-base font-semibold text-ink-900">{peso(amountDue)}</span>
          </div>

          {s.billing === 'prepaid' && (
            <RefundControl pc={pc} refundableAmount={Number(preview?.refundAmount ?? refundableAmount)} onRefund={runRefund} />
          )}

          {s.billing === 'postpaid' && <SettlementControl pc={pc} amountDue={amountDue} walletBalance={members?.find((member) => String(member.id)===String(s.customerId))?.wallet ?? 0} onSettle={(paymentMethod) => runSessionAction('settle', { paymentMethod })} />}

          {localError && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{localError}</p>}
          <PowerControl pc={pc} onPowerCommand={onPowerCommand} />
        </div>
      </Modal>
    )
  }

  if (sessionActionMode === 'reservation') {
    const reservationMember = pc.session?.customerId
      ? members?.find((member) => String(member.id) === String(pc.session.customerId))
      : null
    const reservationTierRank = TIER_RANK[String(reservationMember?.tier ?? 'Regular')] ?? 0
    const reservationPlans = allActiveRatePlans.filter((plan) =>
      reservationMember
        ? planTierRank(plan) <= reservationTierRank
        : String(plan.customerTier ?? 'Regular') === 'Regular'
    )
    const reservationPlan = rateForId(reservationPlans, ratePlanId) || reservationPlans[0] || null
    const reservationRatePlanId = reservationPlan?.id || null
    const reservationAmount = reservationPlan?.mode === 'package'
      ? Number(reservationPlan.amount || 0)
      : Math.max(Number(amount || 0), Number(reservationPlan?.minAmount || 0))
    const reservationMinutes = reservationRatePlanId
      ? minutesForAmount(reservationPlans, reservationRatePlanId, reservationAmount)
      : 0
    const canCheckIn = Boolean(reservationPlan && reservationAmount > 0 && reservationMinutes > 0)

    return (
      <Modal
        open
        onClose={onClose}
        eyebrow={eyebrow}
        title="Reservation"
        busy={startBusy}
        footer={
          <>
            <Button variant="ghost" disabled={startBusy} onClick={onClose}>Close</Button>
            <Button
              variant="primary"
              icon={CheckCircle2}
              disabled={startBusy || !canCheckIn}
              onClick={() =>
                runStart({
                  customerName: pc.session.customerName,
                  customerId: pc.session.customerId ?? null,
                  billing: 'prepaid',
                  ratePlanId: reservationRatePlanId,
                  amount: reservationAmount,
                  prepaidSeconds: reservationMinutes * 60,
                })
              }
            >
              {startBusy ? 'Checking in…' : 'Check In & Start Prepaid'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-soft">
            Reserved for <span className="font-medium text-ink-900">{pc.session.customerName}</span>.
            Choose prepaid time before checking them in.
          </p>
          <RateAndAmount
            ratePlans={reservationPlans}
            ratePlanId={reservationRatePlanId}
            setRatePlanId={(nextId) => { manualRateSelectionRef.current=true; setRatePlanId(nextId) }}
            amount={String(reservationAmount || amount)}
            setAmount={setAmount}
            allowPromo
          />
          {localError && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{localError}</p>}
          <PowerControl pc={pc} onPowerCommand={onPowerCommand} />
        </div>
      </Modal>
    )
  }

  if (pc.status === 'maintenance') {
    return (
      <Modal
        open
        onClose={onClose}
        eyebrow={eyebrow}
        title="Under Maintenance"
        busy={statusBusy}
        footer={
          <>
            <Button variant="ghost" disabled={statusBusy} onClick={onClose}>Close</Button>
            <Button variant="teal" disabled={statusBusy} onClick={() => runStatus(false)}>
              {statusBusy ? 'Updating…' : 'Return to Floor'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-soft">
            This unit is marked unavailable and hidden from session start options.
          </p>
          {localError && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{localError}</p>}
          <PowerControl pc={pc} onPowerCommand={onPowerCommand} />
        </div>
      </Modal>
    )
  }

  return null
}
