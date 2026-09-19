import { useEffect, useMemo, useState } from 'react'
import {
  X,
  Play,
  LogOut,
  ArrowRightLeft,
  Wrench,
  RotateCcw,
  Power,
  UtensilsCrossed,
  Gamepad2,
  Maximize2,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Crown,
} from 'lucide-react'
import { elapsedSessionSeconds, remainingSessionSeconds } from '../../lib/sessionTime.js'
import { formatAdminPeso } from '../../lib/numeric.js'
import { effectivePcStatus } from '../../lib/pcStatus.js'

function formatClock(total) {
  const seconds = Math.max(0, Math.floor(total))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function StationDetailDrawer({
  pc,
  now = Date.now(),
  members = [],
  ratePlans = [],
  menuOrders = [],
  onClose,
  onOpenSessionModal,
  onOpenStartModal,
  onEndSession,
  onSetMaintenance,
  onQuickCommand,
  onTransferSession,
}) {
  const [selectedRateId, setSelectedRateId] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')

  useEffect(() => {
    if (!pc) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pc, onClose])

  const session = pc?.session
  const statusKey = pc ? effectivePcStatus(pc) : 'offline'
  const isLive = statusKey === 'occupied' && Boolean(session)
  const isDown = statusKey === 'maintenance'
  const isHold = statusKey === 'reserved'

  const member = useMemo(() => {
    if (!session?.customerId && !selectedMemberId) return null
    const id = session?.customerId || selectedMemberId
    return members.find((m) => String(m.id) === String(id)) || null
  }, [session, selectedMemberId, members])

  const ratePlan = useMemo(() => {
    if (session?.ratePlanId) {
      return ratePlans.find((r) => String(r.id) === String(session.ratePlanId)) || null
    }
    if (selectedRateId) {
      return ratePlans.find((r) => String(r.id) === String(selectedRateId)) || null
    }
    return ratePlans.find((r) => r.isDefault) || ratePlans[0] || null
  }, [session, selectedRateId, ratePlans])

  // Station Orders / Tab
  const stationOrders = useMemo(() => {
    if (!pc?.id) return []
    return (menuOrders || []).filter((o) => String(o.stationId || o.pcId) === String(pc.id))
  }, [menuOrders, pc])

  const tabTotal = useMemo(() => {
    return stationOrders.reduce((sum, o) => sum + (Number(o.totalAmount || o.total || 0) || 0), 0)
  }, [stationOrders])

  const elapsed = session ? elapsedSessionSeconds(session, now) : 0
  const remaining = session?.billing === 'prepaid' ? remainingSessionSeconds(session, now) : null
  const timerText = session
    ? formatClock(session.billing === 'prepaid' ? (remaining ?? 0) : elapsed)
    : '00:00:00'

  const timeCharge = useMemo(() => {
    if (!session) return 0
    if (session.billing === 'prepaid') {
      return Number(session.totalAmount || session.paidAmount || session.initialAmount || 0)
    }
    const ratePerHour = Number(ratePlan?.price || ratePlan?.rate || 35)
    return Math.round((elapsed / 3600) * ratePerHour)
  }, [session, ratePlan, elapsed])

  const totalDue = timeCharge + tabTotal

  const stationNumber = pc?.pcNumber != null && String(pc.pcNumber).trim() !== '' ? String(pc.pcNumber).padStart(2, '0') : null
  const stationTitle = stationNumber ? `PC-${stationNumber}` : (pc?.label || 'Station')
  const zoneLabel = pc?.zone || pc?.specs || pc?.tier || 'Standard Bay'

  if (!pc) return null

  return (
    <>
      {/* Background Scrim */}
      <div
        className="fixed inset-0 z-[160] bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Drawer */}
      <aside
        className="fixed right-0 top-0 z-[170] flex h-screen w-full max-w-[420px] flex-col border-l border-[var(--line,#26314A)] bg-[var(--surface,#131A28)] text-[var(--text,#E6EAF2)] shadow-2xl transition-transform duration-200"
        role="dialog"
        aria-label={`Station ${stationTitle} details`}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[var(--line-soft,#1E273B)] px-5 py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl font-bold tracking-tight text-[var(--text,#E6EAF2)]">
                {stationTitle}
              </h2>
              {pc.isVip && (
                <span className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400 border border-amber-500/40">
                  <Crown size={11} /> VIP
                </span>
              )}
            </div>
            <div className="mt-0.5 truncate text-xs text-[var(--muted,#8D9AB5)]">
              {zoneLabel} · {pc.specs || 'Core Gaming Rig'}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onOpenSessionModal?.(pc)}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line,#26314A)] text-[var(--muted,#8D9AB5)] transition-colors hover:bg-[var(--surface-2,#1A2233)] hover:text-[var(--text,#E6EAF2)]"
              title="Open full controls"
            >
              <Maximize2 size={15} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg border border-[var(--line,#26314A)] text-[var(--muted,#8D9AB5)] transition-colors hover:bg-[var(--surface-2,#1A2233)] hover:text-[var(--text,#E6EAF2)]"
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Body Content */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          {isLive ? (
            <>
              {/* Digital Readout Box */}
              <div className="flex flex-col gap-1 rounded-xl border border-[var(--line-soft,#1E273B)] bg-[var(--surface-2,#1A2233)] p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--live,#FFB020)]">
                  {session?.billing === 'prepaid' ? 'Time Remaining' : 'Session Running'}
                </span>
                <div className="font-mono text-4xl font-bold tracking-tight text-[var(--text,#E6EAF2)]">
                  {timerText}
                </div>
                <div className="mt-1 text-xs text-[var(--muted,#8D9AB5)]">
                  Started{' '}
                  {session?.startTime
                    ? new Date(session.startTime).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
                    : 'Earlier'}{' '}
                  · {session?.customerName || member?.name || 'Walk-in Guest'}
                </div>
              </div>

              {/* Financial Key-Values */}
              <div className="rounded-xl border border-[var(--line-soft,#1E273B)] bg-[var(--surface,#131A28)]/60 px-4 py-2">
                <div className="flex items-center justify-between border-b border-[var(--line-soft,#1E273B)] py-2.5 text-xs">
                  <span className="text-[var(--muted,#8D9AB5)]">
                    {ratePlan?.name || 'Standard'} ({formatAdminPeso(ratePlan?.price || 35)}/hr)
                  </span>
                  <b className="font-mono text-sm text-[var(--text,#E6EAF2)]">{formatAdminPeso(timeCharge)}</b>
                </div>
                <div className="flex items-center justify-between border-b border-[var(--line-soft,#1E273B)] py-2.5 text-xs">
                  <span className="text-[var(--muted,#8D9AB5)]">Food & Drinks Tab</span>
                  <b className="font-mono text-sm text-[var(--text,#E6EAF2)]">{formatAdminPeso(tabTotal)}</b>
                </div>
                <div className="flex items-center justify-between py-2.5 text-sm font-semibold">
                  <span className="text-[var(--text,#E6EAF2)]">Total Due Now</span>
                  <b className="font-mono text-base text-[var(--live,#FFB020)]">{formatAdminPeso(totalDue)}</b>
                </div>
              </div>

              {/* Tab Items */}
              {stationOrders.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted,#8D9AB5)]">
                    <UtensilsCrossed size={13} /> Active Orders Tab ({stationOrders.length})
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-[var(--line-soft,#1E273B)] bg-[var(--surface-2,#1A2233)] p-2">
                    {stationOrders.map((item, i) => (
                      <div key={i} className="flex items-center justify-between py-1 text-xs">
                        <span className="truncate text-[var(--text,#E6EAF2)]">
                          {item.itemName || item.name || 'Snack / Drink'}
                        </span>
                        <span className="font-mono text-[var(--muted,#8D9AB5)]">
                          {formatAdminPeso(item.totalAmount || item.total || 0)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Game Tag */}
              <div className="flex flex-col gap-1.5">
                <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--muted,#8D9AB5)]">
                  <Gamepad2 size={13} /> Current Activity
                </label>
                <div className="rounded-lg border border-[var(--line,#26314A)] bg-[var(--surface-2,#1A2233)] px-3 py-2 text-xs font-medium text-[var(--text,#E6EAF2)]">
                  {pc?.game || session?.game || 'Valorant / In-Game'}
                </div>
              </div>
            </>
          ) : isDown ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-center">
                <Wrench size={32} className="mx-auto text-amber-500" />
                <h3 className="mt-2 text-base font-bold text-amber-400">Station Under Maintenance</h3>
                <p className="mt-1 text-xs text-[var(--muted,#8D9AB5)]">
                  Pulled offline for hardware or peripheral servicing. Put it back in service when ready.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-[var(--line-soft,#1E273B)] bg-[var(--surface-2,#1A2233)] p-4">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--free,#2ED3A0)]">
                  {isHold ? 'Station Reserved' : 'Station Ready'}
                </span>
                <div className="mt-1 text-xs text-[var(--muted,#8D9AB5)]">
                  {isHold
                    ? `Held for ${pc.reservedFor || 'a player'}. Click start to clock in.`
                    : 'Assign a customer or launch a walk-in match on this rig.'}
                </div>
              </div>

              {/* Member Picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--muted,#8D9AB5)]">Customer</label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  className="rounded-lg border border-[var(--line,#26314A)] bg-[var(--surface-2,#1A2233)] px-3 py-2 text-xs text-[var(--text,#E6EAF2)] outline-none focus:border-[var(--brand,#7B61FF)]"
                >
                  <option value="">Walk-in Guest</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({formatAdminPeso(m.walletBalance || 0)} wallet)
                    </option>
                  ))}
                </select>
              </div>

              {/* Rate Plan Picker */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--muted,#8D9AB5)]">Pricing Plan</label>
                <div className="grid grid-cols-2 gap-2">
                  {ratePlans.slice(0, 4).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setSelectedRateId(r.id)}
                      className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                        selectedRateId === String(r.id) || (!selectedRateId && r.isDefault)
                          ? 'border-[var(--brand,#7B61FF)] bg-[var(--brand,#7B61FF)]/15 text-[var(--brand,#7B61FF)] font-bold'
                          : 'border-[var(--line,#26314A)] bg-[var(--surface-2,#1A2233)] text-[var(--text,#E6EAF2)] hover:border-[var(--line-soft,#1E273B)]'
                      }`}
                    >
                      <div className="truncate font-semibold">{r.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-[var(--muted,#8D9AB5)]">
                        {formatAdminPeso(r.price || r.rate || 35)}/hr
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <footer className="border-t border-[var(--line-soft,#1E273B)] bg-[var(--surface,#131A28)] px-5 py-3.5 flex gap-2">
          {isLive ? (
            <>
              <button
                type="button"
                onClick={() => onTransferSession?.(pc)}
                className="flex-1 rounded-xl border border-[var(--line,#26314A)] bg-[var(--surface-2,#1A2233)] px-3 py-2 text-xs font-semibold text-[var(--text,#E6EAF2)] transition-colors hover:bg-[var(--line,#26314A)] flex items-center justify-center gap-1.5"
              >
                <ArrowRightLeft size={14} /> Move Rig
              </button>
              <button
                type="button"
                onClick={() => onEndSession?.(pc, 'settle')}
                className="flex-1 rounded-xl bg-[var(--brand,#7B61FF)] px-3 py-2 text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
              >
                <LogOut size={14} /> Close & Settle
              </button>
            </>
          ) : isDown ? (
            <button
              type="button"
              onClick={() => onSetMaintenance?.(pc, false)}
              className="w-full rounded-xl bg-[var(--free,#2ED3A0)] px-3 py-2 text-xs font-bold text-black shadow-md transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 size={15} /> Back in Service
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onSetMaintenance?.(pc, true)}
                className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-400 transition-colors hover:bg-amber-500/20 flex items-center justify-center gap-1.5"
                title="Mark station down for maintenance"
              >
                <Wrench size={14} /> Repair
              </button>
              <button
                type="button"
                onClick={() => onOpenStartModal?.(pc, { memberId: selectedMemberId, ratePlanId: selectedRateId })}
                className="flex-1 rounded-xl bg-[var(--brand,#7B61FF)] px-3 py-2 text-xs font-bold text-white shadow-md transition-opacity hover:opacity-90 flex items-center justify-center gap-1.5"
              >
                <Play size={14} fill="currentColor" /> Start Session
              </button>
            </>
          )}
        </footer>
      </aside>
    </>
  )
}
