import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import { verifyStationSetupMasterPin } from '../../lib/serverConfig.js'

export default function AdminPinGateModal({ open, onClose, onVerified }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setPin('')
    setError('')
    setBusy(false)
  }, [open])

  function closeGate() {
    if (busy) return
    onClose?.()
  }

  async function verify() {
    if (busy || !pin) return
    setBusy(true)
    setError('')
    try {
      await verifyStationSetupMasterPin(pin)
      onVerified?.(null)
    } catch (err) {
      setError(err?.message || 'Unable to verify the master setup PIN.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeGate}
      onSubmit={verify}
      canSubmit={Boolean(pin)}
      busy={busy}
      eyebrow="Protected station setting"
      title="Admin PIN Required"
      description="Enter the station master setup PIN to open Server Connection. This check is local, so it still works when no server PC exists or the saved server is offline."
      maxWidth="max-w-md"
      zIndexClass="z-[950]"
      footer={(
        <>
          <Button variant="ghost" disabled={busy} onClick={closeGate}>Close</Button>
          <Button variant="primary" disabled={busy || !pin} onClick={verify}>
            {busy ? 'Verifying…' : 'Unlock Server Settings'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-surface-line bg-surface-raised/60 px-3.5 py-3 text-xs text-slate-soft">
          <div className="flex items-center gap-2 font-semibold text-ink-900"><ShieldCheck size={15} /> Offline-safe setup access</div>
          <p className="mt-1 leading-5">This PIN only protects station/server configuration. It does not depend on the currently saved server being reachable.</p>
        </div>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Master Setup PIN</span>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-dim" size={15} />
            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Master PIN"
              autoComplete="off"
              className="w-full rounded-xl border border-surface-line customer-neutral-surface py-2 pl-9 pr-3 text-center text-base tracking-[0.22em] text-ink-900 outline-none placeholder:tracking-normal placeholder:text-slate-soft focus:border-gold/50"
            />
          </div>
        </label>
        {error && <p className="rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium leading-5 text-ember-dim">{error}</p>}
      </div>
    </Modal>
  )
}
