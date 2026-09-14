import { useEffect, useRef, useState } from 'react'
import AnchoredPopover from '../common/AnchoredPopover.jsx'
import ConfirmModal from '../common/ConfirmModal.jsx'
import { Bell, CheckCircle2, XCircle, Wallet, History, Trash2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'
import { connectSocket } from '../../lib/socket.js'
import { isCloudAdmin } from '../../lib/cloudClient.js'
import { useLocation } from 'react-router-dom'
import { initAdminSound, playAdminSound } from '../../lib/sound.js'

function methodLabel(method) {
  return method === 'gcash' ? 'GCash' : 'Cash at Counter'
}

export default function AdminNotificationCenter() {
  const { topUpRequests, supportRequests, sessionExtensions, approveTopUp, rejectTopUp, confirmSessionExtension, rejectSessionExtension, clearResolvedTopUps, resolveSupport } = useAppData()
  const [open, setOpen] = useState(false)
  const location=useLocation()
  const [tab, setTab] = useState('pending') // 'pending' | 'support' | 'history'
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearHistoryBusy, setClearHistoryBusy] = useState(false)
  const [toasts, setToasts] = useState([])
  const [actionBusyIds, setActionBusyIds] = useState(() => new Set())
  const triggerRef = useRef(null)
  const seenIds = useRef(new Set())
  const seenSupportIds = useRef(new Set())
  const seenExtensionIds = useRef(new Set())
  const primed = useRef(false)
  const actionBusyRef = useRef(new Set())
  const toastTimersRef = useRef(new Set())

  useEffect(() => { initAdminSound() }, [])

  function scheduleToastRemoval(id, delay) {
    const timer=setTimeout(() => {
      toastTimersRef.current.delete(timer)
      setToasts((t) => t.filter((x) => x.id !== id))
    }, delay)
    toastTimersRef.current.add(timer)
  }

  async function runRequestAction(id, action, { removeToast=true } = {}) {
    const key=String(id)
    if(actionBusyRef.current.has(key))return
    actionBusyRef.current.add(key)
    setActionBusyIds(new Set(actionBusyRef.current))
    try {
      await action()
      if(removeToast)setToasts((t)=>t.filter((x)=>String(x.id)!==key))
    } finally {
      actionBusyRef.current.delete(key)
      setActionBusyIds(new Set(actionBusyRef.current))
    }
  }

  const pending = topUpRequests.filter((r) => r.status === 'pending')
  const resolved = topUpRequests.filter((r) => r.status !== 'pending')
  const pendingExtensions = sessionExtensions.filter((r) => r.status === 'pending')
  const openSupport = supportRequests.filter((r) => r.status === 'open')
  const pendingKey = pending.map((r) => r.id).join(',')
  const supportKey = openSupport.map((r) => r.id).join(',')

  useEffect(() => {
    // First render (or a fresh admin tab) shouldn't re-toast requests that were
    // already pending before this tab opened — only genuinely new ones.
    if (!primed.current) {
      pending.forEach((r) => seenIds.current.add(r.id))
      openSupport.forEach((r) => seenSupportIds.current.add(r.id))
      pendingExtensions.forEach((r) => seenExtensionIds.current.add(r.id))
      primed.current = true
      return
    }
    const fresh = pending.filter((r) => !seenIds.current.has(r.id))
    if (fresh.length === 0) return
    fresh.forEach((r) => {
      seenIds.current.add(r.id)
      playAdminSound('payment', { dedupeKey:`topup:${r.id}` })
    })
    setToasts((t) => [...fresh, ...t])
    fresh.forEach((r) => scheduleToastRemoval(r.id, 7000))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey])

  useEffect(() => {
    if (!primed.current) return
    const fresh = openSupport.filter((r) => !seenSupportIds.current.has(r.id))
    fresh.forEach((r) => {
      seenSupportIds.current.add(r.id)
      playAdminSound('help', { dedupeKey:`support:${r.id}` })
      const support = { ...r, support:true, customerName:r.customerName || 'Customer', pcLabel:r.pcLabel || 'Unknown PC' }
      setToasts((t) => [support, ...t])
      scheduleToastRemoval(r.id, 9000)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supportKey])

  const extensionKey = pendingExtensions.map((r) => r.id).join(',')
  useEffect(() => {
    if (!primed.current) return
    pendingExtensions.forEach((r) => {
      if (seenExtensionIds.current.has(r.id)) return
      seenExtensionIds.current.add(r.id)
      playAdminSound('payment', { dedupeKey:`extension:${r.id}` })
    })
  }, [extensionKey, pendingExtensions])

  useEffect(() => {
    if (isCloudAdmin()) return undefined
    const socket = connectSocket()
    const onTopUpRequest = (request) => {
      seenIds.current.add(request.id)
      playAdminSound('payment', { dedupeKey:`topup:${request.id}` })
      setToasts((t) => [{ ...request, customerName: request.customerName || 'Customer', pcLabel: request.pcLabel || 'Unknown PC' }, ...t])
      scheduleToastRemoval(request.id, 7000)
    }
    const onSupportRequest = (request) => {
      seenSupportIds.current.add(request.id)
      playAdminSound('help', { dedupeKey:`support:${request.id}` })
      const support = { ...request, support:true, customerName:request.customerName || 'Customer', pcLabel:request.pcLabel || 'Unknown PC' }
      setToasts((t) => [support, ...t])
      scheduleToastRemoval(request.id, 9000)
    }
    socket.on('topup:new_request', onTopUpRequest)
    socket.on('support:new_request', onSupportRequest)
    const onRatePlansUpdated = () => playAdminSound('broadcast', { dedupeKey:'rate-plans' })
    const onAnnouncementsUpdated = () => playAdminSound('broadcast', { dedupeKey:'announcements' })
    socket.on('rate-plans:updated', onRatePlansUpdated)
    socket.on('announcements:updated', onAnnouncementsUpdated)
    return () => { socket.off('topup:new_request', onTopUpRequest); socket.off('support:new_request', onSupportRequest); socket.off('rate-plans:updated', onRatePlansUpdated); socket.off('announcements:updated', onAnnouncementsUpdated) }
  }, [])

  useEffect(()=>()=>{toastTimersRef.current.forEach((timer)=>clearTimeout(timer));toastTimersRef.current.clear()},[])

  useEffect(()=>{setOpen(false)},[location.pathname])
  useEffect(()=>{const close=(event)=>{if(event.key==='Escape')setOpen(false)};const layerClose=()=>setOpen(false);window.addEventListener('keydown',close);window.addEventListener('aezakmi:overlay-open',layerClose);return()=>{window.removeEventListener('keydown',close);window.removeEventListener('aezakmi:overlay-open',layerClose)}},[])

  function handleApprove(id) {
    return runRequestAction(id, () => approveTopUp(id))
  }

  function handleReject(id) {
    return runRequestAction(id, () => rejectTopUp(id))
  }

  async function confirmClearHistory() {
    if (clearHistoryBusy) return
    setClearHistoryBusy(true)
    try {
      await clearResolvedTopUps()
      setClearConfirmOpen(false)
    } finally {
      setClearHistoryBusy(false)
    }
  }

  return (
    <>
      <div className="relative">
        <button
          ref={triggerRef}
          onClick={() => setOpen((o) => !o)}
          className="relative rounded-md p-1.5 text-slate-soft transition-colors hover:bg-surface-raised hover:text-ink-900"
          aria-label="Top-up requests"
          title="Top-up requests"
        >
          <Bell size={16} />
          {(pending.length + pendingExtensions.length + openSupport.length) > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-ember px-1 text-[9px] font-semibold text-soft-white">
              {pending.length + pendingExtensions.length + openSupport.length}
            </span>
          )}
        </button>

        <AnchoredPopover open={open} anchorRef={triggerRef} onClose={() => setOpen(false)} className="w-[min(23rem,calc(100vw-2rem))]" ariaLabel="Top-up and support requests">
            <div className="mb-1.5 flex items-center justify-between px-1">
              <p className="eyebrow">Top-Up Requests</p>
              <div className="flex items-center gap-0.5 rounded-md bg-surface-raised p-0.5">
                <button
                  onClick={() => setTab('pending')}
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                    tab === 'pending' ? 'bg-surface text-ink-900 shadow-sm' : 'text-slate-soft'
                  }`}
                >
                  Pending{(pending.length + pendingExtensions.length) > 0 ? ` (${pending.length + pendingExtensions.length})` : ''}
                </button>
                <button
                  onClick={() => setTab('support')}
                  className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold transition-colors ${
                    tab === 'support' ? 'bg-surface text-ink-900 shadow-sm' : 'text-slate-soft'
                  }`}
                >
                  Support{openSupport.length > 0 ? ` (${openSupport.length})` : ''}
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
              (pending.length + pendingExtensions.length) === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-slate-soft">No pending requests.</p>
              ) : (
                <div className="max-h-80 space-y-1.5 overflow-y-auto">
                  {pendingExtensions.map((r) => (
                    <SessionExtensionRow key={r.id} request={r} busy={actionBusyIds.has(`extension:${r.id}`)} onApprove={() => runRequestAction(`extension:${r.id}`, () => confirmSessionExtension(r.id))} onReject={() => runRequestAction(`extension:${r.id}`, () => rejectSessionExtension(r.id))} />
                  ))}
                  {pending.map((r) => (
                    <RequestRow key={r.id} request={r} busy={actionBusyIds.has(String(r.id))} onApprove={handleApprove} onReject={handleReject} />
                  ))}
                </div>
              )
            ) : tab === 'support' ? (
              openSupport.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-slate-soft">No open help requests.</p>
              ) : (
                <div className="max-h-80 space-y-1.5 overflow-y-auto">
                  {openSupport.map((r) => (
                    <SupportRow key={r.id} request={r} busy={actionBusyIds.has(`support:${r.id}`)} onResolve={() => runRequestAction(`support:${r.id}`, () => resolveSupport(r.id))} />
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
                  type="button"
                  onClick={() => setClearConfirmOpen(true)}
                  className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-md border border-surface-line px-2 py-1.5 text-[11px] font-medium text-slate-soft transition-colors hover:border-ember/40 hover:bg-ember/10 hover:text-ember-dim"
                >
                  <Trash2 size={11} /> Clear history
                </button>
              </>
            )}
          </AnchoredPopover>
      </div>

      <ConfirmModal
        open={clearConfirmOpen}
        onClose={() => !clearHistoryBusy && setClearConfirmOpen(false)}
        onConfirm={confirmClearHistory}
        busy={clearHistoryBusy}
        eyebrow="Notification history"
        title="Clear resolved history?"
        message="Remove all resolved top-up notifications from this history view? This does not reverse any completed wallet credit."
        confirmLabel="Clear history"
        variant="danger"
      />

      <div className="pointer-events-none fixed right-4 top-4 z-[1100] flex w-80 flex-col gap-2">
        {toasts.map((r) => r.support ? (
          <div key={r.id} className="panel pointer-events-auto border-gold/40 p-3 shadow-glow">
            <div className="mb-2 flex items-start gap-2">
              <Bell size={14} className="mt-0.5 shrink-0 text-gold-dim" />
              <p className="text-xs font-medium leading-snug text-ink-900">[{r.pcLabel}] Customer Help Request</p>
            </div>
            <p className="text-[11px] font-semibold text-ink-900">{r.customerName}</p>
            <p className="mb-2 mt-1 text-[11px] text-slate-soft">{r.message}</p>
            <button type="button" disabled={actionBusyIds.has(`support:${r.id}`)} onClick={() => runRequestAction(`support:${r.id}`, () => resolveSupport(r.id))} className="w-full rounded-md bg-teal px-2 py-1.5 text-xs font-semibold text-ink-900 disabled:opacity-40">Staff Notified</button>
          </div>
        ) : (
          <div key={r.id} className="panel pointer-events-auto border-gold/40 p-3 shadow-glow">
            <div className="mb-2 flex items-start gap-2">
              <Wallet size={14} className="mt-0.5 shrink-0 text-gold-dim" />
              <p className="text-xs font-medium leading-snug text-ink-900">
                [{r.pcLabel}] Top-up Request: ₱{r.amount} via {methodLabel(r.method)}
                {r.gcashNumber ? ` (GCash: ${r.gcashNumber})` : ''}
              </p>
            </div>
            <p className="mb-2 text-[11px] text-slate-soft">{r.customerName}</p>
            <div className="flex gap-2">
              <button type="button" disabled={actionBusyIds.has(String(r.id))} onClick={() => handleApprove(r.id)} className="flex flex-1 disabled:opacity-40 items-center justify-center gap-1 rounded-md bg-teal px-2 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:bg-teal-soft"><CheckCircle2 size={13} /> Approve & Credit</button>
              <button type="button" disabled={actionBusyIds.has(String(r.id))} onClick={() => handleReject(r.id)} className="flex flex-1 disabled:opacity-40 items-center justify-center gap-1 rounded-md border border-surface-line px-2 py-1.5 text-xs font-medium text-slate-soft transition-colors hover:text-ink-900"><XCircle size={13} /> Reject</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function SupportRow({ request, onResolve, busy=false }) {
  return (
    <div className="rounded-md border border-gold/30 bg-gold/5 px-2.5 py-2">
      <p className="text-xs font-semibold text-ink-900">{request.customerName || 'Customer'} · {request.pcLabel || 'Unknown PC'}</p>
      <p className="mt-1 text-[10px] leading-relaxed text-slate-soft">{request.message}</p>
      <button type="button" disabled={busy} onClick={onResolve} className="mt-2 w-full disabled:opacity-40 rounded-md bg-teal px-2 py-1.5 text-[11px] font-semibold text-ink-900">Mark Staff Notified</button>
    </div>
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
        {request.gcashNumber ? ` · GCash ${request.gcashNumber}` : ''}
      </p>
    </div>
  )
}

function SessionExtensionRow({ request, onApprove, onReject, busy=false }) {
  return (
    <div className="rounded-md border border-gold/30 bg-gold/5 px-2.5 py-2">
      <p className="text-xs font-semibold text-ink-900">[{request.pcLabel}] Extend session · ₱{Number(request.amount || 0).toFixed(2)}</p>
      <p className="text-[10px] text-slate-soft">{request.customerName} · +{Number(request.minutesAdded || 0)} min · {methodLabel(request.paymentMethod)}</p>
      <div className="mt-1.5 flex gap-1.5">
        <button type="button" disabled={busy} onClick={onApprove} className="flex-1 rounded-md bg-teal disabled:opacity-40 px-2 py-1 text-[11px] font-semibold text-ink-900">Approve time</button>
        <button type="button" disabled={busy} onClick={onReject} className="flex-1 rounded-md border disabled:opacity-40 border-surface-line px-2 py-1 text-[11px] font-medium text-slate-soft">Reject</button>
      </div>
    </div>
  )
}

function RequestRow({ request, onApprove, onReject, busy=false }) {
  return (
    <div className="rounded-md border border-surface-line px-2.5 py-2">
      <p className="text-xs font-medium text-ink-900">
        [{request.pcLabel}] ₱{request.amount} · {methodLabel(request.method)}
      </p>
      <p className="text-[10px] text-slate-soft">
        {request.customerName}
        {request.gcashNumber ? ` · GCash ${request.gcashNumber}` : ''}
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <button
          type="button"
          disabled={busy}
          onClick={() => onApprove(request.id)}
          className="flex-1 rounded-md bg-teal px-2 py-1 text-[11px] font-semibold text-ink-900 transition-colors hover:bg-teal-soft disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onReject(request.id)}
          className="flex-1 rounded-md border border-surface-line px-2 py-1 text-[11px] font-medium text-slate-soft transition-colors hover:text-ink-900 disabled:opacity-40"
        >
          Reject
        </button>
      </div>
    </div>
  )
}
