import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCircle2, XCircle, Wallet, History, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'

function playChime() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(880, ctx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.12)
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    // Audio unavailable (autoplay policy, unsupported browser) — fail silently.
  }
}

function methodLabel(method) {
  return method === 'gcash' ? 'GCash' : 'Cash at Counter'
}

export default function AdminNotificationCenter() {
  const { topUpRequests, approveTopUp, rejectTopUp, clearResolvedTopUps } = useAppData()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState('pending') // 'pending' | 'history'
  const [clearArmed, setClearArmed] = useState(false)
  const [toasts, setToasts] = useState([])
  const panelRef = useRef(null)
  const seenIds = useRef(new Set())
  const primed = useRef(false)

  const pending = topUpRequests.filter((r) => r.status === 'pending')
  const resolved = topUpRequests.filter((r) => r.status !== 'pending')
  const pendingKey = pending.map((r) => r.id).join(',')

  useEffect(() => {
    // First render (or a fresh admin tab) shouldn't re-toast requests that were
    // already pending before this tab opened — only genuinely new ones.
    if (!primed.current) {
      pending.forEach((r) => seenIds.current.add(r.id))
      primed.current = true
      return
    }
    const fresh = pending.filter((r) => !seenIds.current.has(r.id))
    if (fresh.length === 0) return
    fresh.forEach((r) => seenIds.current.add(r.id))
    playChime()
    setToasts((t) => [...fresh, ...t])
    fresh.forEach((r) => {
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== r.id)), 7000)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function handleApprove(id) {
    approveTopUp(id)
    setToasts((t) => t.filter((x) => x.id !== id))
  }

  function handleReject(id) {
    rejectTopUp(id)
    setToasts((t) => t.filter((x) => x.id !== id))
  }

  return (
    <>
      <div className="relative" ref={panelRef}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="relative rounded-md p-1.5 text-slate-soft transition-colors hover:bg-surface-raised hover:text-ink-900"
          aria-label="Top-up requests"
          title="Top-up requests"
        >
          <Bell size={16} />
          {pending.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ember px-1 text-[9px] font-semibold text-soft-white">
              {pending.length}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute left-0 bottom-full z-[1000] mb-2 w-72 rounded-lg border border-surface-line bg-surface p-2 shadow-lg">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <p className="eyebrow">Top-Up Requests</p>
              <div className="flex items-center gap-0.5 rounded-md bg-surface-raised p-0.5">
                <button
                  onClick={() => setTab('pending')}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                    tab === 'pending' ? 'bg-surface text-ink-900 shadow-sm' : 'text-slate-soft'
                  }`}
                >
                  Pending{pending.length > 0 ? ` (${pending.length})` : ''}
                </button>
                <button
                  onClick={() => setTab('history')}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                    tab === 'history' ? 'bg-surface text-ink-900 shadow-sm' : 'text-slate-soft'
                  }`}
                >
                  <History size={10} /> History
                </button>
              </div>
            </div>

            {tab === 'pending' ? (
              pending.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-slate-soft">No pending requests.</p>
              ) : (
                <div className="max-h-80 space-y-1.5 overflow-y-auto">
                  {pending.map((r) => (
                    <RequestRow key={r.id} request={r} onApprove={handleApprove} onReject={handleReject} />
                  ))}
                </div>
              )
            ) : resolved.length === 0 ? (
              <p className="px-1 py-3 text-center text-xs text-slate-soft">No resolved requests yet.</p>
            ) : (
              <>
                <div className="max-h-72 space-y-1.5 overflow-y-auto">
                  {resolved.map((r) => (
                    <HistoryRow key={r.id} request={r} />
                  ))}
                </div>
                <button
                  onBlur={() => setClearArmed(false)}
                  onClick={() => {
                    if (!clearArmed) {
                      setClearArmed(true)
                      return
                    }
                    clearResolvedTopUps()
                    setClearArmed(false)
                  }}
                  className={`mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                    clearArmed
                      ? 'border-ember/50 bg-ember/10 text-ember-dim'
                      : 'border-surface-line text-slate-soft hover:text-ember-dim'
                  }`}
                >
                  <Trash2 size={11} /> {clearArmed ? 'Click again to confirm' : 'Clear history'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="pointer-events-none fixed right-4 top-4 z-[1100] flex w-80 flex-col gap-2">
        {toasts.map((r) => (
          <div key={r.id} className="panel pointer-events-auto border-gold/40 p-3 shadow-glow">
            <div className="mb-2 flex items-start gap-2">
              <Wallet size={14} className="mt-0.5 shrink-0 text-gold-dim" />
              <p className="text-xs font-medium leading-snug text-ink-900">
                [{r.pcLabel}] Top-up Request: ₱{r.amount} via {methodLabel(r.method)}
                {r.refNo ? ` (Ref: #${r.refNo})` : ''}
              </p>
            </div>
            <p className="mb-2 text-[11px] text-slate-soft">{r.customerName}</p>
            <div className="flex gap-2">
              <button
                onClick={() => handleApprove(r.id)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md bg-teal px-2 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:bg-teal-soft"
              >
                <CheckCircle2 size={13} /> Approve & Credit
              </button>
              <button
                onClick={() => handleReject(r.id)}
                className="flex flex-1 items-center justify-center gap-1 rounded-md border border-surface-line px-2 py-1.5 text-xs font-medium text-slate-soft transition-colors hover:text-ink-900"
              >
                <XCircle size={13} /> Reject
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function HistoryRow({ request }) {
  const isApproved = request.status === 'approved'
  return (
    <div className="rounded-md border border-surface-line px-2.5 py-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-ink-900">
          [{request.pcLabel}] ₱{request.amount} · {methodLabel(request.method)}
        </p>
        <span
          className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
            isApproved ? 'bg-teal/10 text-teal-dim' : 'bg-ember/10 text-ember-dim'
          }`}
        >
          {request.status}
        </span>
      </div>
      <p className="text-[10px] text-slate-soft">
        {request.customerName}
        {request.refNo ? ` · Ref #${request.refNo}` : ''}
      </p>
    </div>
  )
}

function RequestRow({ request, onApprove, onReject }) {
  return (
    <div className="rounded-md border border-surface-line px-2.5 py-2">
      <p className="text-xs font-medium text-ink-900">
        [{request.pcLabel}] ₱{request.amount} · {methodLabel(request.method)}
      </p>
      <p className="text-[10px] text-slate-soft">
        {request.customerName}
        {request.refNo ? ` · Ref #${request.refNo}` : ''}
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <button
          onClick={() => onApprove(request.id)}
          className="flex-1 rounded-md bg-teal px-2 py-1 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-teal-soft"
        >
          Approve
        </button>
        <button
          onClick={() => onReject(request.id)}
          className="flex-1 rounded-md border border-surface-line px-2 py-1 text-[11px] font-medium text-slate-soft transition-colors hover:text-ink-900"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
