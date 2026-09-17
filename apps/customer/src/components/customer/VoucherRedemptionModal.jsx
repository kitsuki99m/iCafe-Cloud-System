import { useState } from 'react'
import { X, Ticket, Sparkles, CheckCircle2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'
import { showToast } from '../../lib/toast.js'
import Button from '../common/Button.jsx'

export default function VoucherRedemptionModal({ isOpen, onClose }) {
  const { redeemVoucher } = useAppData()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [redeemedResult, setRedeemedResult] = useState(null)

  if (!isOpen) return null

  async function handleRedeem(e) {
    e.preventDefault()
    if (!code.trim()) return
    setSubmitting(true)
    setRedeemedResult(null)
    try {
      const res = await redeemVoucher(code.trim().toUpperCase())
      setRedeemedResult(res)
      showToast({
        title: 'Voucher Redeemed!',
        message: res?.message || 'Promotional reward credited successfully.',
        tone: 'success',
      })
      setCode('')
    } catch (err) {
      showToast({ title: 'Redemption Failed', message: err.message, tone: 'error' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Ticket className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Redeem Promo Voucher</h3>
              <p className="text-xs text-slate-400">Enter code for free wallet balance or session time</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleRedeem} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">Voucher / Event Code</label>
            <input
              type="text"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="e.g. SUMMER-2026"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono uppercase text-center tracking-widest text-lg font-black focus:outline-none focus:border-indigo-500"
            />
          </div>

          {redeemedResult && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center gap-3 text-emerald-300">
              <CheckCircle2 className="w-6 h-6 text-emerald-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">Success!</p>
                <p className="text-xs text-emerald-300">{redeemedResult.message}</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            <Button
              type="submit"
              disabled={submitting || !code.trim()}
              className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6"
            >
              {submitting ? 'Verifying…' : 'Redeem Code'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
