import { useState, useEffect, useRef, useId } from 'react'
import { createPortal } from 'react-dom'
import { X, Clock, DollarSign, AlertTriangle, CheckCircle2, History, ArrowRight, Banknote, Sparkles } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { showToast } from '../../lib/toast.js'
import Button from '../common/Button.jsx'
import { formatAdminPeso } from '../../lib/numeric.js'

const inputClass = 'w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2.5 text-sm text-ink-900 focus:outline-none focus:border-gold/50'

const FLOAT_PRESETS = [0, 500, 1000, 2000, 3000, 5000]

export default function ShiftManagementModal({ isOpen, onClose }) {
  const { currentShift, openShift, closeShift, fetchShiftHistory, settings } = useAppData()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('current') // 'current' | 'history'
  const [openingFloat, setOpeningFloat] = useState('1000')
  const [closingCounted, setClosingCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)
  const dialogRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      setLoadingHistory(true)
      fetchShiftHistory()
        .then((res) => {
          if (res?.shifts) setHistory(res.shifts)
          else if (res?.history) setHistory(res.history)
        })
        .catch(() => {})
        .finally(() => setLoadingHistory(false))
    }
  }, [isOpen, activeTab, fetchShiftHistory])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) {
        e.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, submitting, onClose])

  if (!isOpen) return null

  const expectedCash = currentShift ? Number(currentShift.expectedCash || currentShift.openingFloat || 0) : 0
  const countedNum = Number(closingCounted) || 0
  const variance = closingCounted !== '' ? countedNum - expectedCash : 0

  async function handleOpenShift(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await openShift({ openingFloat: Number(openingFloat) || 0, notes })
      showToast({ title: 'Shift Started', message: `Clocked in with float of ₱${Number(openingFloat || 0).toFixed(2)}` })
      setOpeningFloat('')
      setNotes('')
      onClose?.()
    } catch (err) {
      showToast({ title: 'Failed to start shift', message: err.message, tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleCloseShift(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await closeShift({ closingCounted: Number(closingCounted) || 0, notes })
      const summary = res?.shiftSummary
      showToast({
        title: 'Shift Closed & Reconciled',
        message: `Counted ₱${Number(closingCounted || 0).toFixed(2)} (Variance: ₱${Number(summary?.variance || variance).toFixed(2)})`,
        tone: summary?.variance !== 0 ? 'warning' : 'success',
      })
      setClosingCounted('')
      setNotes('')
      onClose?.()
    } catch (err) {
      showToast({ title: 'Failed to close shift', message: err.message, tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-6 overflow-hidden overscroll-contain" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      {/* Non-blurred solid/translucent dark backdrop to eliminate GPU lag */}
      <div
        className="admin-modal-backdrop absolute inset-0 bg-midnight/70"
        onMouseDown={() => !submitting && onClose?.()}
      />

      <div
        ref={dialogRef}
        tabIndex={-1}
        className="admin-modal-shell relative flex max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-surface-line bg-surface shadow-2xl animate-fade-in"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="admin-modal-header flex items-start justify-between gap-4 border-b border-surface-line px-6 py-5 bg-surface-raised/40 shrink-0">
          <div className="flex items-center gap-3.5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold/10 border border-gold/20 text-gold shadow-xs">
              <Clock size={20} strokeWidth={2.2} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="eyebrow">STAFF OPERATIONS</p>
                {currentShift && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-teal/10 border border-teal/30 px-2 py-0.5 text-[10px] font-bold text-teal-dim">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal animate-pulse" />
                    Shift Active
                  </span>
                )}
              </div>
              <h2 id={titleId} className="admin-modal-title text-h2 font-display font-semibold text-ink-900 mt-0.5">
                Staff Shift & Cash Reconciliation
              </h2>
              <p className="admin-modal-description text-xs text-slate-soft mt-0.5">
                Staff: <span className="font-semibold text-ink-900">{user?.name || user?.username || user?.email || 'Staff'}</span> ({user?.role || 'cashier'})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => !submitting && onClose?.()}
            className="admin-modal-close rounded-full p-2 text-slate-soft transition-colors hover:text-ink-900 hover:bg-surface-raised"
            aria-label="Close modal"
            disabled={submitting}
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-surface-line bg-surface px-6 pt-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('current')}
            className={`pb-2.5 px-3.5 font-semibold text-xs border-b-2 transition-all cursor-pointer ${
              activeTab === 'current'
                ? 'border-gold text-ink-900 font-bold'
                : 'border-transparent text-slate-soft hover:text-ink-900'
            }`}
          >
            Current Shift
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`pb-2.5 px-3.5 font-semibold text-xs border-b-2 flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'history'
                ? 'border-gold text-ink-900 font-bold'
                : 'border-transparent text-slate-soft hover:text-ink-900'
            }`}
          >
            <History size={13} />
            <span>Shift History</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="admin-modal-body min-h-0 flex-1 max-h-[calc(100dvh-10rem)] sm:max-h-[calc(100vh-12rem)] overflow-y-auto p-6 space-y-6 overscroll-contain">
          {activeTab === 'current' ? (
            currentShift ? (
              /* Active Shift Reconciliation Form */
              <form onSubmit={handleCloseShift} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-surface-line bg-surface-raised p-3.5 shadow-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-soft">Opening Float</span>
                    <p className="text-xl font-bold stat-figure text-ink-900 mt-1">
                      ₱{Number(currentShift.openingFloat || 0).toFixed(2)}
                    </p>
                    <span className="text-[10px] text-slate-soft">Starting drawer change</span>
                  </div>
                  <div className="rounded-xl border border-surface-line bg-surface-raised p-3.5 shadow-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-soft">Cash Inflow</span>
                    <p className="text-xl font-bold stat-figure text-teal-dim mt-1">
                      +₱{Number(currentShift.cashInflow || 0).toFixed(2)}
                    </p>
                    <span className="text-[10px] text-slate-soft">Top-ups + Orders + Time</span>
                  </div>
                  <div className="rounded-xl border border-gold/30 bg-gold/10 p-3.5 shadow-xs">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-gold">Expected In Drawer</span>
                    <p className="text-xl font-bold stat-figure text-gold mt-1">
                      ₱{expectedCash.toFixed(2)}
                    </p>
                    <span className="text-[10px] text-gold/80">Float + Cash Collections</span>
                  </div>
                </div>

                <div className="rounded-2xl border border-surface-line bg-surface-raised/60 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <DollarSign size={16} className="text-gold" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-ink-900">
                      Cash Drawer Count & Reconciliation
                    </h3>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-900 mb-1.5">
                      Actual Counted Cash in Drawer (₱) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-soft text-base">₱</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={closingCounted}
                        onChange={(e) => setClosingCounted(e.target.value)}
                        placeholder="0.00"
                        className={`${inputClass} pl-8 font-mono text-base font-bold`}
                      />
                    </div>
                  </div>

                  {closingCounted !== '' && (
                    <div
                      className={`rounded-xl border p-3 flex items-center justify-between text-xs font-semibold ${
                        variance === 0
                          ? 'bg-teal/10 border-teal/30 text-teal-dim'
                          : variance > 0
                          ? 'bg-sky-500/10 border-sky-500/30 text-sky-400'
                          : 'bg-ember/10 border-ember/30 text-ember-dim'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {variance === 0 ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        <span>
                          {variance === 0 ? 'Exact Match (Drawer Balanced)' : variance > 0 ? 'Cash Over (Surplus)' : 'Cash Short (Deficit)'}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-bold">
                        {variance >= 0 ? `+₱${variance.toFixed(2)}` : `-₱${Math.abs(variance).toFixed(2)}`}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-soft mb-1">Shift Remarks / Turnover Notes</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Reason for variance, cash turnover notes, shift summary..."
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={onClose} disabled={submitting}>
                    Keep Shift Active
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={submitting || closingCounted === ''}
                  >
                    {submitting ? 'Reconciling…' : 'Reconcile & Clock Out'}
                  </Button>
                </div>
              </form>
            ) : (
              /* Clock-In / Open Shift Form */
              <form onSubmit={handleOpenShift} className="space-y-6">
                <div className="rounded-2xl border border-surface-line bg-surface-raised/40 p-6 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-gold/10 border border-gold/20 text-gold mx-auto flex items-center justify-center mb-3 shadow-xs">
                    <Banknote size={24} />
                  </div>
                  <h3 className="text-sm font-bold text-ink-900">Start Cashier Shift</h3>
                  <p className="text-xs text-slate-soft max-w-sm mx-auto mt-1">
                    Clock in and input your starting cash drawer float to begin tracking cash collections, top-ups, and snack orders.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-ink-900 mb-1.5">
                      Starting Cash Float in Drawer (₱) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-slate-soft text-base">₱</span>
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={openingFloat}
                        onChange={(e) => setOpeningFloat(e.target.value)}
                        placeholder="1000.00"
                        className={`${inputClass} pl-8 font-mono text-base font-bold`}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <span className="text-[10px] text-slate-soft self-center mr-1">Presets:</span>
                      {FLOAT_PRESETS.map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => setOpeningFloat(String(preset))}
                          className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                            openingFloat === String(preset)
                              ? 'border-gold bg-gold/10 text-gold'
                              : 'border-surface-line bg-surface-raised text-slate-soft hover:text-ink-900'
                          }`}
                        >
                          {preset === 0 ? '₱0 (No Cash)' : `₱${preset.toLocaleString()}`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-soft mb-1">Shift Notes / Cashier Name</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional notes, opening register status, handover remarks..."
                      className={inputClass}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={onClose} disabled={submitting}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" disabled={submitting}>
                    <Clock size={15} />
                    <span>{submitting ? 'Clocking In…' : 'Clock In & Open Register'}</span>
                  </Button>
                </div>
              </form>
            )
          ) : (
            /* Shift History */
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="py-12 text-center text-slate-soft text-xs">Loading completed shifts…</div>
              ) : history.length === 0 ? (
                <div className="rounded-xl border border-dashed border-surface-line py-12 text-center text-slate-soft text-xs">
                  No completed shifts recorded yet.
                </div>
              ) : (
                <div className="divide-y divide-surface-line border border-surface-line rounded-xl overflow-hidden bg-surface-raised/40">
                  {history.map((s) => (
                    <div key={s.id} className="p-4 hover:bg-surface-raised transition flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-ink-900">{s.user_name || s.userName || 'Staff'}</span>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface border border-surface-line text-slate-soft font-mono">
                            Float: ₱{Number(s.opening_float || s.openingFloat || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-soft mt-1">
                          {new Date(s.opened_at || s.openedAt).toLocaleDateString()} {new Date(s.opened_at || s.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {' → '}
                          {s.closed_at || s.closedAt ? new Date(s.closed_at || s.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing'}
                        </div>
                        {(s.notes) && <div className="text-[11px] text-slate-soft/80 italic mt-0.5">"{s.notes}"</div>}
                      </div>
                      <div className="sm:text-right flex sm:flex-col justify-between items-end gap-1">
                        <div className="text-[11px] text-slate-soft">Counted: ₱{Number(s.closing_counted || s.closingCounted || 0).toFixed(2)}</div>
                        <div className={`text-xs font-bold font-mono ${
                          Number(s.variance || 0) === 0 ? 'text-teal-dim' : Number(s.variance || 0) > 0 ? 'text-sky-400' : 'text-ember-dim'
                        }`}>
                          Variance: {Number(s.variance || 0) >= 0 ? `+₱${Number(s.variance || 0).toFixed(2)}` : `-₱${Math.abs(Number(s.variance || 0)).toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}