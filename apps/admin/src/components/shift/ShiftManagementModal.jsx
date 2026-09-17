import { useState, useEffect } from 'react'
import { X, Clock, DollarSign, AlertTriangle, CheckCircle2, History, ArrowRight } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { showToast } from '../../lib/toast.js'
import Button from '../common/Button.jsx'

export default function ShiftManagementModal({ isOpen, onClose }) {
  const { currentShift, openShift, closeShift, fetchShiftHistory, refresh } = useAppData()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('current') // 'current' | 'history'
  const [openingFloat, setOpeningFloat] = useState('')
  const [closingCounted, setClosingCounted] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [history, setHistory] = useState([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  useEffect(() => {
    if (isOpen && activeTab === 'history') {
      setLoadingHistory(true)
      fetchShiftHistory()
        .then((res) => {
          if (res?.shifts) setHistory(res.shifts)
        })
        .catch(() => {})
        .finally(() => setLoadingHistory(false))
    }
  }, [isOpen, activeTab, fetchShiftHistory])

  if (!isOpen) return null

  const expectedCash = currentShift ? Number(currentShift.expectedCash || 0) : 0
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
      onClose()
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
      onClose()
    } catch (err) {
      showToast({ title: 'Failed to close shift', message: err.message, tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                Staff Shift & Cash Reconciliation
                {currentShift && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-medium">
                    Shift Active
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400">
                Staff: <span className="text-slate-200 font-semibold">{user?.name || user?.username || 'Staff'}</span> ({user?.role || 'cashier'})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-900/60 px-6 pt-2">
          <button
            onClick={() => setActiveTab('current')}
            className={`pb-3 px-4 font-semibold text-sm border-b-2 transition ${
              activeTab === 'current'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Current Shift
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`pb-3 px-4 font-semibold text-sm border-b-2 flex items-center gap-2 transition ${
              activeTab === 'history'
                ? 'border-sky-500 text-sky-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-4 h-4" /> Shift History
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'current' ? (
            currentShift ? (
              <form onSubmit={handleCloseShift} className="space-y-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
                    <span className="text-xs font-medium text-slate-400">Opening Float</span>
                    <p className="text-xl font-bold text-white mt-1">₱{Number(currentShift.openingFloat || 0).toFixed(2)}</p>
                    <span className="text-[11px] text-slate-500">Clock-in cash base</span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/60 border border-slate-700/60">
                    <span className="text-xs font-medium text-slate-400">Cash Inflow</span>
                    <p className="text-xl font-bold text-emerald-400 mt-1">+₱{Number(currentShift.cashInflow || 0).toFixed(2)}</p>
                    <span className="text-[11px] text-slate-500">Top-ups + Orders + Time</span>
                  </div>
                  <div className="p-4 rounded-xl bg-sky-950/40 border border-sky-800/60">
                    <span className="text-xs font-medium text-sky-300">Expected In Drawer</span>
                    <p className="text-xl font-bold text-sky-400 mt-1">₱{expectedCash.toFixed(2)}</p>
                    <span className="text-[11px] text-sky-400/70">Float + Cash Collections</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-amber-400" /> Cash Drawer Reconciliation & Clock-Out
                  </h3>
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Actual Counted Cash in Drawer (₱) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={closingCounted}
                      onChange={(e) => setClosingCounted(e.target.value)}
                      placeholder="0.00"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-lg focus:outline-none focus:border-sky-500"
                    />
                  </div>

                  {closingCounted !== '' && (
                    <div
                      className={`p-3 rounded-lg border flex items-center justify-between ${
                        variance === 0
                          ? 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300'
                          : variance > 0
                          ? 'bg-sky-950/30 border-sky-800/50 text-sky-300'
                          : 'bg-rose-950/30 border-rose-800/50 text-rose-300'
                      }`}
                    >
                      <span className="text-xs font-medium">
                        {variance === 0 ? 'Exact Match (Balanced)' : variance > 0 ? 'Cash Over' : 'Cash Short'}
                      </span>
                      <span className="text-sm font-bold font-mono">
                        {variance >= 0 ? `+₱${variance.toFixed(2)}` : `-₱${Math.abs(variance).toFixed(2)}`}
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Shift Notes / Remarks</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Reason for variance, turnover notes, etc."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={onClose}>Cancel</Button>
                  <Button type="submit" disabled={submitting || closingCounted === ''} className="bg-rose-600 hover:bg-rose-500 text-white font-semibold">
                    {submitting ? 'Reconciling…' : 'Close Shift & Clock Out'}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleOpenShift} className="space-y-6">
                <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-700 text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-sky-500/10 border border-sky-500/30 text-sky-400 mx-auto flex items-center justify-center mb-3">
                    <Clock className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-white">No Active Shift</h3>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                    Clock in and enter your starting drawer float to start tracking cash transactions and sales.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Opening Drawer Float (₱)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={openingFloat}
                      onChange={(e) => setOpeningFloat(e.target.value)}
                      placeholder="e.g. 1000.00"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white font-mono text-lg focus:outline-none focus:border-sky-500"
                    />
                    <span className="text-[11px] text-slate-500 mt-1 block">
                      Initial cash change provided in the cash drawer.
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">Shift Notes</label>
                    <textarea
                      rows={2}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Optional notes for this shift..."
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={onClose}>Cancel</Button>
                  <Button type="submit" disabled={submitting} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold">
                    {submitting ? 'Starting…' : 'Start Shift & Clock In'}
                  </Button>
                </div>
              </form>
            )
          ) : (
            <div className="space-y-3">
              {loadingHistory ? (
                <div className="py-12 text-center text-slate-400 text-sm">Loading shift history…</div>
              ) : history.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">No completed shifts recorded yet.</div>
              ) : (
                <div className="divide-y divide-slate-800 border border-slate-800 rounded-xl overflow-hidden">
                  {history.map((s) => (
                    <div key={s.id} className="p-4 bg-slate-900/40 hover:bg-slate-800/40 transition flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white">{s.user_name || 'Staff'}</span>
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                            Float: ₱{Number(s.opening_float || 0).toFixed(2)}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 mt-1">
                          {new Date(s.opened_at).toLocaleDateString()} {new Date(s.opened_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {' → '}
                          {s.closed_at ? new Date(s.closed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Ongoing'}
                        </div>
                        {s.notes && <div className="text-xs text-slate-400 italic mt-1">"{s.notes}"</div>}
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400">Counted: ₱{Number(s.closing_counted || 0).toFixed(2)}</div>
                        <div className={`text-xs font-bold font-mono mt-0.5 ${
                          Number(s.variance || 0) === 0 ? 'text-emerald-400' : Number(s.variance || 0) > 0 ? 'text-sky-400' : 'text-rose-400'
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
    </div>
  )
}
