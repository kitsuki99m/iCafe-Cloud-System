import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, QrCode } from 'lucide-react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import NumericInput from '../common/NumericInput.jsx'
import { useAppData } from '../../context/AppDataContext.jsx'
import { createOperationKey } from '../../lib/api.js'

const PRESETS = [5, 10, 15, 20]


export default function TopUpModal({ open, onClose, pc, customerId, customerName, tier = 'Regular', ratePlans = [] }) {
  const { requestTopUp, settings } = useAppData()
  const [method, setMethod] = useState('counter')
  const [amount, setAmount] = useState(PRESETS[0])
  const [customAmount, setCustomAmount] = useState('')
  const [gcashNumber, setGcashNumber] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const operationKeyRef = useRef(null)
  const resetTimerRef=useRef(null)

  useEffect(() => () => {
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
  }, [])

  useEffect(() => { if (open) operationKeyRef.current=createOperationKey() }, [open, method, amount, customAmount, gcashNumber])

  if (!open) return null

  const finalAmount = Math.floor(customAmount ? Number(customAmount) : Number(amount))
  const validOwnGcash = /^09\d{9}$/.test(gcashNumber.trim())
  const validCafeGcash = /^09\d{9}$/.test(String(settings.gcashNumber || '').trim())
  const canSubmit = Number.isFinite(finalAmount) && finalAmount > 0 && (method === 'counter' || (validOwnGcash && validCafeGcash))

  function reset() {
    setSent(false)
    setBusy(false)
    setError('')
    setGcashNumber('')
    setCustomAmount('')
    setAmount(PRESETS[0])
    setMethod('counter')
  }

  function handleClose() {
    if (busy) return;
    onClose()
    // Let the close transition finish before wiping the form.
    if (resetTimerRef.current) clearTimeout(resetTimerRef.current)
    resetTimerRef.current = setTimeout(reset, 200)
  }

  async function submit() {
    if (!canSubmit || busy) return
    setBusy(true)
    setError('')
    try {
      await requestTopUp({
      customerId,
      customerName,
      pcId: pc?.id ?? null,
      pcLabel: pc?.label ?? 'Unknown PC',
      pcIp: pc?.ipAddress ?? null,
      amount: finalAmount,
      method,
        gcashNumber: method === 'gcash' ? gcashNumber.trim() : null,
      }, { operationKey:operationKeyRef.current || createOperationKey() })
      setSent(true)
    } catch (e) {
      setError(e?.message || 'Unable to send the top-up request.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      eyebrow={pc ? `${pc.label} · ${pc.ipAddress}` : 'Top Up'}
      title="Top Up Wallet"
      description="Choose an amount and payment method. Staff will add the approved amount to your wallet."
      busy={busy}
      onSubmit={submit}
      footer={
        !sent && (
          <>
            <Button variant="ghost" disabled={busy} onClick={handleClose}>Cancel</Button>
            <Button variant="primary" disabled={!canSubmit || busy} onClick={submit}>
              {busy ? 'Sending…' : (method === 'gcash' ? 'Send GCash Request' : 'Pay at Counter')}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 size={22} className="text-teal-dim" />
          <p className="text-sm font-medium text-ink-900">
            {method === 'gcash' ? 'Staff notified' : 'Request sent to the counter'}
          </p>
          <p className="text-xs text-slate-soft">
            Staff will approve and credit your balance shortly.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {error && <div className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{error}</div>}
          {ratePlans.some((plan) => String(plan.customerTier) === String(tier) && tier !== 'Regular') && <div className="rounded-lg border border-teal/25 bg-teal/10 px-3 py-2 text-xs text-teal-dim">{tier} member promos are available after your wallet is credited.</div>}
          <div>
            <label className="eyebrow mb-1.5 block">How will you pay?</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMethod('gcash')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  method === 'gcash'
                    ? 'border-gold/50 bg-gold/10 text-gold-dim'
                    : 'border-surface-line text-slate-soft hover:text-ink-900'
                }`}
              >
                GCash
              </button>
              <button
                onClick={() => setMethod('counter')}
                className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  method === 'counter'
                    ? 'border-gold/50 bg-gold/10 text-gold-dim'
                    : 'border-surface-line text-slate-soft hover:text-ink-900'
                }`}
              >
                Pay at Counter
              </button>
            </div>
          </div>

          <div>
            <label className="eyebrow mb-1.5 block">Top-Up Amount</label>
            <div className="grid grid-cols-4 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setAmount(p)
                    setCustomAmount('')
                  }}
                  className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                    amount === p && !customAmount
                      ? 'border-gold/50 bg-gold/10 text-gold-dim'
                      : 'border-surface-line text-slate-soft hover:text-ink-900'
                  }`}
                >
                  ₱{p}
                </button>
              ))}
            </div>
            <NumericInput
              min="1"
              inputMode="numeric"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="Custom amount"
              className="mt-2 w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 placeholder:text-slate-soft focus:outline-none focus:border-gold/50"
            />
          </div>

          {method === 'gcash' && (
            <div className="space-y-3 rounded-lg border border-surface-line bg-surface-raised px-3 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-ink text-slate-soft">
                  <QrCode size={28} />
                </div>
                <div className="text-xs leading-relaxed">
                  <p className="font-medium text-ink-900">Send your GCash payment to</p>
                  {settings.gcashName || settings.gcashNumber ? (
                    <>
                      <p className="font-semibold text-ink-900">{settings.gcashName || 'GCash Account'}</p>
                      <p className="stat-figure text-slate-soft">{settings.gcashNumber || 'GCash number not configured'}</p>
                      {!validCafeGcash && <p className="mt-1 text-[11px] font-medium text-ember-dim">GCash payments are unavailable until the cafe GCash number is configured.</p>}
                    </>
                  ) : (
                    <p className="text-xs text-ember-dim">GCash account not configured. Ask the counter for the GCash number.</p>
                  )}
                </div>
              </div>
              <div>
                <label className="eyebrow mb-1.5 block">Your GCash Number</label>
                <input
                  value={gcashNumber}
                  onChange={(e) => setGcashNumber(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="e.g. 09171234567"
                  inputMode="numeric"
                  className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 placeholder:text-slate-soft focus:outline-none focus:border-gold/50"
                />
                {!validOwnGcash && gcashNumber.length > 0 && <p className="mt-1 text-[11px] font-medium text-ember-dim">Enter your valid 11-digit GCash number starting with 09.</p>}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
