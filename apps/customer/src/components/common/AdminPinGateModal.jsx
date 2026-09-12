import { useEffect, useRef, useState } from 'react'
import { KeyRound, Server } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import {
  verifyAdminPinAtCurrentServer,
  verifyAdminPinAtServer,
} from '../../lib/serverConfig.js'

const RECOVERY_CODES = new Set([
  'SERVER_CONFIG_REQUIRED',
  'SERVER_CONNECTION_TIMEOUT',
  'SERVER_CONNECTION_FAILED',
])

export default function AdminPinGateModal({ open, onClose, onVerified, forceRecovery = false }) {
  const [pin, setPin] = useState('')
  const [recoveryMode, setRecoveryMode] = useState(Boolean(forceRecovery))
  const [host, setHost] = useState('')
  const [port, setPort] = useState('3000')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const abortRef = useRef(null)

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      return undefined
    }
    setPin('')
    setRecoveryMode(Boolean(forceRecovery))
    setHost('')
    setPort('3000')
    setError('')
    setBusy(false)
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [open, forceRecovery])

  function closeGate() {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
    onClose?.()
  }

  async function verify() {
    if (busy || !pin) return
    if (recoveryMode && !host.trim()) {
      setError('Enter the new server IP address or hostname.')
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    setError('')
    try {
      if (recoveryMode) {
        const result = await verifyAdminPinAtServer(host, port, pin, { signal: controller.signal })
        onVerified?.({ host: result.host, port: result.port, verified: true })
        return
      }
      await verifyAdminPinAtCurrentServer(pin, { signal: controller.signal })
      onVerified?.(null)
    } catch (err) {
      if (!recoveryMode && RECOVERY_CODES.has(err?.code)) {
        setRecoveryMode(true)
        setHost('')
        setPort('3000')
        setError('The saved server is unavailable. Enter the new server address and the same Admin management PIN.')
      } else if (err?.code !== 'SERVER_CONNECTION_CANCELLED') {
        setError(err?.message || 'Unable to verify the Admin management PIN.')
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeGate}
      onSubmit={verify}
      canSubmit={Boolean(pin) && (!recoveryMode || Boolean(host.trim()))}
      busy={false}
      eyebrow="Protected station setting"
      title="Admin PIN Required"
      description={recoveryMode
        ? 'The saved server could not be reached. Verify the management PIN against the new server before its connection settings can be opened.'
        : 'Server details are hidden until the current Admin management PIN is verified.'}
      maxWidth="max-w-md"
      zIndexClass="z-[950]"
      footer={(
        <>
          <Button variant="ghost" onClick={closeGate}>Close</Button>
          <Button variant="primary" disabled={busy || !pin || (recoveryMode && !host.trim())} onClick={verify}>
            {busy ? 'Verifying…' : recoveryMode ? 'Verify New Server' : 'Unlock Server Settings'}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        {recoveryMode && (
          <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
            <label className="block">
              <span className="eyebrow mb-1.5 block">Server IP / Hostname</span>
              <div className="relative">
                <Server className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-soft" size={15} />
                <input
                  autoFocus
                  value={host}
                  onChange={(event) => setHost(event.target.value)}
                  placeholder="192.168.1.105"
                  autoComplete="off"
                  spellCheck="false"
                  className="w-full rounded-xl border border-surface-line customer-neutral-surface py-2 pl-9 pr-3 text-sm text-ink-900 outline-none placeholder:text-slate-soft focus:border-gold/50"
                />
              </div>
            </label>
            <label className="block">
              <span className="eyebrow mb-1.5 block">Port</span>
              <input
                value={port}
                onChange={(event) => setPort(event.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="3000"
                inputMode="numeric"
                className="w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-sm text-ink-900 outline-none placeholder:text-slate-soft focus:border-gold/50"
              />
            </label>
          </div>
        )}
        <label className="block">
          <span className="eyebrow mb-1.5 block">Management PIN</span>
          <div className="relative">
            <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-dim" size={15} />
            <input
              autoFocus={!recoveryMode}
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="Admin PIN"
              autoComplete="off"
              className="w-full rounded-xl border border-surface-line customer-neutral-surface py-2 pl-9 pr-3 text-center text-base tracking-[0.22em] text-ink-900 outline-none placeholder:tracking-normal placeholder:text-slate-soft focus:border-gold/50"
            />
          </div>
        </label>
        {error && <p className="rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium leading-5 text-ember-dim">{error}</p>}
        <p className="text-[11px] leading-5 text-slate-soft">The PIN is verified by the cafe server and is never stored on this station.</p>
      </div>
    </Modal>
  )
}
