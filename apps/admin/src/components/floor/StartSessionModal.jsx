import { useEffect, useMemo, useState } from 'react'
import { CheckSquare, Square, User, Users, Zap, Play, Search, Crown } from 'lucide-react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import NumericInput from '../common/NumericInput.jsx'
import { minutesForAmount, minAmountFor, rateForId } from '../../lib/rates.js'
import { positiveNumber } from '../../lib/numeric.js'
import { effectivePcStatus } from '../../lib/pcStatus.js'

const QUICK_AMOUNTS = [5, 10, 15, 20, 50, 100]
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

export default function StartSessionModal({
  open,
  pcs = [],
  ratePlans = [],
  members = [],
  onClose,
  onStartSessions,
}) {
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [customerMode, setCustomerMode] = useState('walkin')
  const [customerName, setCustomerName] = useState('Guest')
  const [memberId, setMemberId] = useState('')
  const [ratePlanId, setRatePlanId] = useState('')
  const [amount, setAmount] = useState('20')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Available stations filter
  const availablePcs = useMemo(() => {
    return (pcs || []).filter((pc) => effectivePcStatus(pc) === 'available')
  }, [pcs])

  const filteredPcs = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return availablePcs
    return availablePcs.filter((pc) => {
      const label = String(pc.label || '').toLowerCase()
      const ip = String(pc.ipAddress || '').toLowerCase()
      const spec = String(pc.spec || '').toLowerCase()
      return label.includes(q) || ip.includes(q) || spec.includes(q)
    })
  }, [availablePcs, query])

  const activeRatePlans = useMemo(() => {
    return (ratePlans || []).filter((p) => p.isActive !== false)
  }, [ratePlans])

  const selectedMember = useMemo(() => {
    return (members || []).find((m) => String(m.id) === String(memberId)) || null
  }, [members, memberId])

  const eligibleRatePlans = useMemo(() => {
    if (customerMode === 'member' && selectedMember) {
      const memberTierRank = TIER_RANK[String(selectedMember.tier || 'Regular')] ?? 0
      return activeRatePlans.filter((p) => planTierRank(p) <= memberTierRank)
    }
    return activeRatePlans.filter((p) => String(p.customerTier ?? 'Regular') === 'Regular')
  }, [activeRatePlans, customerMode, selectedMember])

  // Reset states on open
  useEffect(() => {
    if (open) {
      setSelectedIds(new Set(availablePcs.length === 1 ? [availablePcs[0].id] : []))
      setCustomerMode('walkin')
      setCustomerName('Guest')
      setMemberId('')
      setQuery('')
      setError('')
      const defaultPlan = activeRatePlans.find((p) => String(p.customerTier ?? 'Regular') === 'Regular') || activeRatePlans[0]
      if (defaultPlan) {
        setRatePlanId(defaultPlan.id)
        setAmount(String(minAmountFor(activeRatePlans, defaultPlan.id) || 20))
      }
    }
  }, [open, availablePcs.length])

  // Keep ratePlanId pointing at a valid eligible plan
  useEffect(() => {
    if (open && eligibleRatePlans.length && !eligibleRatePlans.some((p) => String(p.id) === String(ratePlanId))) {
      const first = eligibleRatePlans[0]
      setRatePlanId(first.id)
      setAmount(String(minAmountFor(eligibleRatePlans, first.id) || 20))
    }
  }, [open, eligibleRatePlans, ratePlanId])

  const plan = eligibleRatePlans.find((p) => String(p.id) === String(ratePlanId)) || null
  const isPackage = plan?.mode === 'package'
  const parsedAmount = positiveNumber(amount)
  const finalAmount = isPackage ? Number(plan?.amount || 0) : parsedAmount || 0
  const minutes = useMemo(() => {
    return minutesForAmount(plan, finalAmount)
  }, [plan, finalAmount])

  const valid = selectedIds.size > 0 && plan && (isPackage ? Number(plan.amount) > 0 : parsedAmount !== null && parsedAmount >= Number(plan.minAmount || 0)) && (customerMode === 'walkin' || Boolean(selectedMember))

  const toggleSelect = (id) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const allFilteredSelected = filteredPcs.length > 0 && filteredPcs.every((pc) => selectedIds.has(pc.id))

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredPcs.map((pc) => pc.id)))
    }
  }

  async function handleSubmit() {
    if (!valid || saving) return
    setError('')
    setSaving(true)
    try {
      const targetPcs = availablePcs.filter((pc) => selectedIds.has(pc.id))
      const sessionPayload = {
        customerMode,
        customerName: customerName.trim() || 'Guest',
        customerId: customerMode === 'member' ? selectedMember?.id : null,
        ratePlanId: plan.id,
        amount: finalAmount,
      }
      await onStartSessions(targetPcs, sessionPayload)
      onClose()
    } catch (err) {
      setError(err?.message || 'Failed to start session(s).')
    } finally {
      setSaving(false)
    }
  }

  const selectedCount = selectedIds.size
  const totalDue = finalAmount * selectedCount

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      onSubmit={handleSubmit}
      eyebrow="Station Operations"
      title="Start Session"
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid || saving} onClick={handleSubmit}>
            {saving ? 'Starting…' : selectedCount > 1 ? `Start ${selectedCount} Sessions (₱${totalDue.toFixed(2)})` : `Start Session (₱${finalAmount.toFixed(2)})`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Available Stations Picker */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label className="eyebrow">
              Select Station(s) <span className="text-gold-dim">({selectedCount} selected)</span>
            </label>
            {filteredPcs.length > 0 && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-[11px] font-semibold text-teal-dim hover:underline cursor-pointer"
              >
                {allFilteredSelected ? 'Clear selection' : 'Select all available'}
              </button>
            )}
          </div>

          <div className="relative mb-2">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-soft" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search station or IP…"
              className="w-full rounded-lg border border-surface-line bg-surface pl-8 pr-3 py-1.5 text-xs text-ink-900 placeholder:text-slate-soft focus:outline-none focus:border-gold/50"
            />
          </div>

          <div className="max-h-44 overflow-y-auto rounded-xl border border-surface-line bg-surface divide-y divide-surface-line/60">
            {filteredPcs.length > 0 ? (
              filteredPcs.map((pc) => {
                const isSelected = selectedIds.has(pc.id)
                const isVip = Boolean(pc.isVip || pc.vip || pc.tier === 'VIP' || String(pc.spec || '').toLowerCase().includes('vip'))
                return (
                  <button
                    type="button"
                    key={pc.id}
                    onClick={() => toggleSelect(pc.id)}
                    className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors cursor-pointer ${
                      isSelected ? 'bg-gold/10 hover:bg-gold/15' : 'hover:bg-surface-raised'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className={isSelected ? 'text-gold-dim' : 'text-slate-soft'}>
                        {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-bold text-ink-900">{pc.label}</span>
                          {isVip && (
                            <span className="inline-flex items-center gap-0.5 rounded px-1 py-0.2 text-[9px] font-bold bg-gold/15 text-gold-dim">
                              <Crown size={9} /> VIP
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-soft font-mono">{pc.ipAddress || 'LAN Station'}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[10px] font-bold text-teal-dim">
                      Available
                    </span>
                  </button>
                )
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-soft">
                {availablePcs.length === 0 ? 'No available stations on floor.' : 'No stations match search.'}
              </div>
            )}
          </div>
        </div>

        {/* Customer Mode Selection */}
        <div>
          <label className="eyebrow mb-1.5 block">Customer Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setCustomerMode('walkin')
                setMemberId('')
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition cursor-pointer ${
                customerMode === 'walkin'
                  ? 'border-gold/50 bg-gold/10 text-gold-dim shadow-xs'
                  : 'border-surface-line bg-surface text-slate-soft hover:text-ink-900'
              }`}
            >
              <User size={14} />
              Guest / Walk-In
            </button>
            <button
              type="button"
              onClick={() => {
                setCustomerMode('member')
                if (members?.length && !memberId) setMemberId(members[0].id)
              }}
              className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition cursor-pointer ${
                customerMode === 'member'
                  ? 'border-teal/50 bg-teal/10 text-teal-dim shadow-xs'
                  : 'border-surface-line bg-surface text-slate-soft hover:text-ink-900'
              }`}
            >
              <Users size={14} />
              Registered Member
            </button>
          </div>
        </div>

        {/* Customer Input */}
        {customerMode === 'walkin' ? (
          <div>
            <label className="eyebrow mb-1 block">Guest / Group Name</label>
            <input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Guest or Team Alpha"
              className="w-full rounded-lg border border-surface-line bg-surface px-3 py-2 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
            />
          </div>
        ) : (
          <div>
            <label className="eyebrow mb-1 block">Select Member Account</label>
            <select
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              className="w-full rounded-lg border border-surface-line bg-surface px-3 py-2 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
            >
              <option value="">Choose a member…</option>
              {members?.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.tier || 'Regular'}) · Wallet: {peso(m.wallet || m.walletBalance || 0)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Rate Plan Selector */}
        <div>
          <label className="eyebrow mb-1 block">Rate Plan</label>
          <select
            value={ratePlanId}
            onChange={(e) => setRatePlanId(e.target.value)}
            className="w-full rounded-lg border border-surface-line bg-surface px-3 py-2 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
          >
            {eligibleRatePlans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} {p.mode === 'package' ? `(₱${p.amount} / ${p.minutes} mins)` : `(₱${p.pesoUnit} / ${p.minutesPerUnit} mins)`}
              </option>
            ))}
          </select>
        </div>

        {/* Amount Input */}
        {!isPackage && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="eyebrow">Amount per station</label>
              <span className="text-[11px] font-mono text-slate-soft">Min: ₱{plan?.minAmount || 1}</span>
            </div>
            <div className="mb-2 grid grid-cols-6 gap-1">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  type="button"
                  key={amt}
                  onClick={() => setAmount(String(amt))}
                  className={`rounded-lg border px-1.5 py-1 text-center text-xs font-semibold transition cursor-pointer ${
                    Number(amount) === amt
                      ? 'border-gold/50 bg-gold/10 text-gold-dim'
                      : 'border-surface-line bg-surface text-slate-soft hover:text-ink-900'
                  }`}
                >
                  ₱{amt}
                </button>
              ))}
            </div>
            <NumericInput
              min={plan?.minAmount || 1}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter amount in Pesos"
              className="w-full rounded-lg border border-surface-line bg-surface px-3 py-2 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
            />
          </div>
        )}

        {/* Calculated Time & Summary */}
        <div className="rounded-xl border border-surface-line bg-surface-raised p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-soft">Session Duration</span>
            <span className="font-bold text-teal-dim">{formatDuration(minutes)}</span>
          </div>
          {selectedCount > 1 && (
            <div className="flex items-center justify-between text-xs border-t border-surface-line/50 pt-1.5">
              <span className="text-slate-soft">Total for {selectedCount} stations</span>
              <span className="font-bold text-gold-dim">₱{totalDue.toFixed(2)}</span>
            </div>
          )}
        </div>

        {error && (
          <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
