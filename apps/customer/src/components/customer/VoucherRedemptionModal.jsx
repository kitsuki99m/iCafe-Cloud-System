import { useState, useEffect } from 'react'
import { Ticket, Sparkles, CheckCircle2, ShieldAlert } from 'lucide-react'
import { useAppData } from '../../context/AppDataContext.jsx'
import { showToast } from '../../lib/toast.js'
import Button from '../common/Button.jsx'
import Modal from '../common/Modal.jsx'

export default function VoucherRedemptionModal({ isOpen, onClose }) {
  const { redeemVoucher } = useAppData()
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [redeemedResult, setRedeemedResult] = useState(null)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) {
          setFailedAttempts(0)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [cooldown])

  async function handleRedeem() {
    if (!code.trim() || cooldown > 0) return
    setSubmitting(true)
    setRedeemedResult(null)
    try {
      const res = await redeemVoucher(code.trim().toUpperCase())
      setRedeemedResult(res)
      setFailedAttempts(0)
      setCooldown(0)
      showToast({
        title: 'Voucher Redeemed!',
        message: res?.message || 'Promotional reward credited successfully.',
        tone: 'success',
      })
      setCode('')
    } catch (err) {
      const nextAttempts = failedAttempts + 1
      setFailedAttempts(nextAttempts)
      if (nextAttempts >= 3) {
        setCooldown(15)
        showToast({
          title: 'Too Many Attempts',
          message: 'Please wait 15 seconds before trying another voucher code.',
          tone: 'warning',
        })
      } else {
        showToast({
          title: 'Redemption Failed',
          message: `${err.message || 'Invalid code.'} (${3 - nextAttempts} attempt${3 - nextAttempts === 1 ? '' : 's'} remaining)`,
          tone: 'error',
        })
      }
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
            disabled={submitting || !code.trim() || cooldown > 0}
          >
            {submitting ? 'Verifying…' : cooldown > 0 ? `Wait (${cooldown}s)` : 'Redeem Code'}
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
            disabled={cooldown > 0}
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={cooldown > 0 ? `Locked for ${cooldown}s` : "e.g. SUMMER-2026"}
            className="w-full rounded-xl border border-surface-line customer-neutral-surface px-4 py-2.5 text-center font-mono text-base font-bold uppercase tracking-widest text-ink-900 focus:outline-none focus:border-gold/50 disabled:opacity-50"
          />
        </div>

        {cooldown > 0 && (
          <div className="rounded-xl border border-ember/30 bg-ember/10 p-3 flex items-center gap-2 text-ember-dim text-xs">
            <ShieldAlert size={16} className="shrink-0 text-ember-dim" />
            <span>Anti-spam protection active. You can try again in {cooldown} second{cooldown === 1 ? '' : 's'}.</span>
          </div>
        )}

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
