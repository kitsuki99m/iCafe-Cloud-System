import { useState } from 'react'
import { Ticket, Sparkles, CheckCircle2 } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'
import { showToast } from '../../lib/toast.js'
import Button from '../common/Button.jsx'
import Modal from '../common/Modal.jsx'

export default function VoucherRedemptionModal({ isOpen, onClose }) {
  const { redeemVoucher } = useAppData()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [redeemedResult, setRedeemedResult] = useState(null)

  async function handleRedeem() {
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
    <Modal
      open={isOpen}
      onClose={onClose}
      eyebrow="Promo gift"
      title="Redeem Promo Voucher"
      description="Enter a voucher or event redemption code to claim bonus balance or time."
      maxWidth="max-w-md"
      busy={submitting}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleRedeem}
            disabled={submitting || !code.trim()}
          >
            {submitting ? 'Verifying…' : 'Redeem Code'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="eyebrow mb-1.5 block">Voucher / Event Code</label>
          <input
            type="text"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="e.g. SUMMER-2026"
            className="w-full rounded-xl border border-surface-line customer-neutral-surface px-4 py-2.5 text-center font-mono text-base font-bold uppercase tracking-widest text-ink-900 focus:outline-none focus:border-gold/50"
          />
        </div>

        {redeemedResult && (
          <div className="rounded-xl border border-teal/30 bg-teal/10 p-3.5 flex items-center gap-3 text-teal-dim">
            <CheckCircle2 size={20} className="shrink-0 text-teal-dim" />
            <div>
              <p className="text-xs font-semibold text-ink-900">Success!</p>
              <p className="text-xs text-teal-dim">{redeemedResult.message}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
