import { useState } from 'react'
import { Ticket, Plus, Trash2, Calendar, Clock, DollarSign, CheckCircle, AlertCircle, Copy, Check } from 'lucide-react'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { showToast } from '../lib/toast.js'
import Button from '../components/common/Button.jsx'
import ConfirmModal from '../components/common/ConfirmModal.jsx'

export default function VouchersPage() {
  const { vouchers, createVoucher, deleteVoucher } = useAppData()
  const { user } = useAuth()
  const isCashier = user?.role === 'cashier'
  const [modalOpen, setModalOpen] = useState(false)
  const [deleteTargetVoucher, setDeleteTargetVoucher] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [code, setCode] = useState('')
  const [benefitType, setBenefitType] = useState('wallet_credit') // 'wallet_credit' | 'session_time'
  const [valueAmount, setValueAmount] = useState('')
  const [maxRedemptions, setMaxRedemptions] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  function handleCopy(c, id) {
    navigator.clipboard.writeText(c)
    setCopiedId(id)
    showToast({ title: 'Code Copied', message: `Copied "${c}" to clipboard.` })
    setTimeout(() => setCopiedId(null), 2000)
  }

  function generateRandomCode() {
    const prefix = 'PROMO'
    const random = Math.random().toString(36).substring(2, 7).toUpperCase()
    setCode(`${prefix}-${random}`)
  }

  async function handleCreateVoucher(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await createVoucher({
        code: code.trim().toUpperCase(),
        benefitType,
        valueAmount: Number(valueAmount),
        maxRedemptions: maxRedemptions ? Number(maxRedemptions) : null,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      })
      showToast({ title: 'Voucher Created', message: `Code ${code.toUpperCase()} is active.` })
      setCode('')
      setValueAmount('')
      setMaxRedemptions('')
      setExpiresAt('')
      setModalOpen(false)
    } catch (err) {
      showToast({ title: 'Failed to create voucher', message: err.message, tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  function promptDeleteVoucher(v) {
    if (isCashier) {
      showToast({ title: 'Restricted Action', message: 'Cashiers cannot delete promo vouchers.', tone: 'error' })
      return
    }
    setDeleteTargetVoucher(v)
  }

  async function confirmDeleteVoucher() {
    if (!deleteTargetVoucher) return
    setActionBusy(true)
    try {
      await deleteVoucher(deleteTargetVoucher.id)
      showToast({ title: 'Voucher Deactivated', message: deleteTargetVoucher.code, tone: 'warning' })
      setDeleteTargetVoucher(null)
    } catch (err) {
      showToast({ title: 'Deactivation Failed', message: err.message, tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <Ticket className="w-7 h-7 text-indigo-400" />
            Promo Vouchers & Redemption Codes
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Issue discount codes and promotional balance/time gifts for events, tournaments, and social campaigns.
          </p>
        </div>
        {!isCashier && (
          <Button
            onClick={() => {
              generateRandomCode()
              setModalOpen(true)
            }}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Create Promo Voucher
          </Button>
        )}
      </div>

      {/* Vouchers List */}
      {vouchers.length === 0 ? (
        <div className="p-12 text-center border border-slate-800 rounded-2xl bg-slate-900/40">
          <Ticket className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No Active Promo Vouchers</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            Create codes that customers can enter on their station kiosk to claim free wallet credits or session time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {vouchers.map((v) => {
            const isTime = v.benefit_type === 'session_time' || v.benefitType === 'session_time'
            const value = Number(v.value_amount || v.valueAmount || 0)
            const redemptions = Number(v.current_redemptions || v.currentRedemptions || 0)
            const max = v.max_redemptions || v.maxRedemptions
            const isExhausted = max != null && redemptions >= Number(max)
            const isExpired = v.expires_at && new Date(v.expires_at).getTime() < Date.now()

            return (
              <div
                key={v.id}
                className={`p-5 rounded-2xl border transition flex flex-col justify-between ${
                  isExhausted || isExpired
                    ? 'bg-slate-950/60 border-slate-800/80 opacity-60'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-black text-base text-white tracking-wider bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700">
                        {v.code}
                      </span>
                      <button
                        onClick={() => handleCopy(v.code, v.id)}
                        className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
                        title="Copy Code"
                      >
                        {copiedId === v.id ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <span
                      className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase ${
                        isExpired
                          ? 'bg-rose-950/60 text-rose-400 border border-rose-800'
                          : isExhausted
                          ? 'bg-amber-950/60 text-amber-400 border border-amber-800'
                          : 'bg-emerald-950/60 text-emerald-400 border border-emerald-800'
                      }`}
                    >
                      {isExpired ? 'Expired' : isExhausted ? 'Exhausted' : 'Active'}
                    </span>
                  </div>

                  <div className="py-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Benefit Gift:</span>
                      <span className="font-bold text-sm text-indigo-400">
                        {isTime ? `${Math.round(value / 60)} Mins Saved Time` : `+₱${value.toFixed(2)} Wallet Credit`}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Redemptions:</span>
                      <span className="font-mono text-slate-200">
                        {redemptions} / {max != null ? max : '∞ Unlimited'}
                      </span>
                    </div>

                    {v.expires_at && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Expires:</span>
                        <span className="text-slate-300">
                          {new Date(v.expires_at).toLocaleDateString()}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {!isCashier && (
                  <div className="pt-3 border-t border-slate-800/80 flex justify-end">
                    <button
                      onClick={() => promptDeleteVoucher(v)}
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 hover:text-rose-400 text-slate-400 transition"
                      title="Deactivate Voucher"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* CREATE MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Ticket className="w-5 h-5 text-indigo-400" /> Create Promo Voucher
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white p-1 rounded-lg">
                ✕
              </button>
            </div>
            <form onSubmit={handleCreateVoucher} className="p-6 space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-slate-300">Voucher Code *</label>
                  <button
                    type="button"
                    onClick={generateRandomCode}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    Generate Random
                  </button>
                </div>
                <input
                  type="text"
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="e.g. SUMMER-2026"
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Benefit Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBenefitType('wallet_credit')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition ${
                      benefitType === 'wallet_credit'
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Wallet Balance (₱)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBenefitType('session_time')}
                    className={`py-2 px-3 rounded-lg text-xs font-bold border transition ${
                      benefitType === 'session_time'
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    Session Time (Seconds)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  {benefitType === 'wallet_credit' ? 'Wallet Credit Amount (₱) *' : 'Session Time (Seconds, e.g. 3600 for 1h) *'}
                </label>
                <input
                  type="number"
                  step={benefitType === 'wallet_credit' ? '0.01' : '1'}
                  required
                  value={valueAmount}
                  onChange={(e) => setValueAmount(e.target.value)}
                  placeholder={benefitType === 'wallet_credit' ? '50.00' : '3600'}
                  className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Max Uses (Limit)</label>
                  <input
                    type="number"
                    value={maxRedemptions}
                    onChange={(e) => setMaxRedemptions(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={expiresAt}
                    onChange={(e) => setExpiresAt(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
                <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={submitting} className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold">
                  {submitting ? 'Creating…' : 'Create Voucher'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DEACTIVATE VOUCHER CONFIRMATION */}
      <ConfirmModal
        open={Boolean(deleteTargetVoucher)}
        title="Deactivate Promo Voucher"
        description={`Are you sure you want to deactivate voucher code "${deleteTargetVoucher?.code}"? Customers will no longer be able to redeem this voucher.`}
        confirmLabel={actionBusy ? 'Deactivating…' : 'Deactivate Voucher'}
        confirmTone="danger"
        disabled={actionBusy}
        onConfirm={confirmDeleteVoucher}
        onClose={() => setDeleteTargetVoucher(null)}
      />
    </div>
  )
}
