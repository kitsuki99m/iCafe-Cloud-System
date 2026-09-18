import { useState, useRef, useEffect } from 'react'
import { ShieldAlert, KeyRound } from 'lucide-react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import { apiPost } from '../../lib/api.js'
import { isCloudAdmin, cloudVerifyPassword } from '../../lib/cloudClient.js'

export default function ManagerApprovalModal({
  open,
  onClose,
  onApproved,
  title = 'Manager Authorization Required',
  description = 'Cashier accounts require manager or admin authorization for this action.',
  actionLabel = 'Authorize & Proceed'
}) {
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)
  const cloud = isCloudAdmin()

  useEffect(() => {
    if (open) {
      setPin('')
      setPassword('')
      setError('')
      setBusy(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open])

  async function handleSubmit(e) {
    if (e && e.preventDefault) e.preventDefault()
    setError('')
    if (cloud) {
      if (!password) {
        setError('Admin password is required.')
        return
      }
    } else {
      if (!pin && !password) {
        setError('Admin PIN or password is required.')
        return
      }
    }

    setBusy(true)
    try {
      if (cloud) {
        const ok = await cloudVerifyPassword(password)
        if (!ok) throw new Error('Incorrect Admin password.')
      } else {
        await apiPost('/auth/verify-manager-override', { pin, password })
      }
      onClose()
      onApproved()
    } catch (err) {
      setError(err.message || 'Authorization failed. Check manager credentials.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      busy={busy}
      onSubmit={handleSubmit}
      title={title}
      eyebrow="Security Override"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={busy || (cloud ? !password : (!pin && !password))}
            icon={KeyRound}
          >
            {busy ? 'Verifying…' : actionLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-700 dark:text-amber-300">
          <ShieldAlert size={18} className="shrink-0 text-amber-500 mt-0.5" />
          <p>{description}</p>
        </div>

        {error && (
          <div className="rounded-xl border border-ember/30 bg-ember/10 p-3 text-xs text-ember-dim">
            {error}
          </div>
        )}

        <div className="space-y-3">
          {cloud ? (
            <label className="block">
              <span className="eyebrow mb-1.5 block">Admin Password</span>
              <input
                ref={inputRef}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter Admin Password"
                className="w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50"
                disabled={busy}
              />
            </label>
          ) : (
            <>
              <label className="block">
                <span className="eyebrow mb-1.5 block">Manager / Admin PIN</span>
                <input
                  ref={inputRef}
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  placeholder="••••"
                  className="w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-center text-lg tracking-[0.3em] text-ink-900 focus:outline-none focus:border-gold/50"
                  disabled={busy}
                />
              </label>
              <div className="text-center text-[10px] text-slate-soft">or enter Admin password</div>
              <label className="block">
                <span className="eyebrow mb-1.5 block">Admin Password (Optional)</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter Password"
                  className="w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50"
                  disabled={busy}
                />
              </label>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}
