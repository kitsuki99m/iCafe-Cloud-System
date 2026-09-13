import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Server } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import {
  getServerConnectionDefaults,
  saveRuntimeServerConfig,
  testServerConfig,
} from '../../lib/serverConfig.js'

export default function ServerConnectionModal({ open, onClose, initialConfig = null }) {
  const [host, setHost] = useState('')
  const [port, setPort] = useState('3000')
  const [source, setSource] = useState('')
  const [action, setAction] = useState(null)
  const [status, setStatus] = useState(null)
  const [verifiedDraft, setVerifiedDraft] = useState('')
  const abortRef = useRef(null)

  const isTesting = action === 'testing'
  const isSaving = action === 'saving'
  const draftKey = `${host.trim()}:${Number(port)}`

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      abortRef.current = null
      return undefined
    }
    const current = initialConfig?.host ? { ...initialConfig, source:'PIN-verified candidate' } : getServerConnectionDefaults()
    setHost(current.host || '')
    setPort(String(current.port || 3000))
    setSource(current.source || '')
    setStatus(initialConfig?.verified ? { tone:'success', message:`Admin PIN verified on ${current.host}:${current.port}. You can save this server now.` } : null)
    setVerifiedDraft(initialConfig?.verified ? `${current.host}:${Number(current.port)}` : '')
    setAction(null)
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [open, initialConfig])

  function clearVerification() {
    setStatus(null)
    setVerifiedDraft('')
  }

  function closeModal() {
    if (isSaving) return
    abortRef.current?.abort()
    abortRef.current = null
    onClose?.()
  }

  async function testConnection() {
    if (action) return
    const controller = new AbortController()
    abortRef.current = controller
    setAction('testing')
    setStatus(null)
    setVerifiedDraft('')
    try {
      const result = await testServerConfig(host, port, { signal: controller.signal })
      setVerifiedDraft(`${result.host}:${result.port}`)
      setStatus({ tone: 'success', message: `Connected to ${result.host}:${result.port}. You can save this server now.` })
    } catch (error) {
      if (error?.code !== 'SERVER_CONNECTION_CANCELLED') {
        setStatus({ tone: 'error', message: `${error.message || 'Unable to reach the server.'} You can try again or close this window.` })
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setAction(null)
    }
  }

  async function saveConnection() {
    if (action || verifiedDraft !== draftKey) return
    setAction('saving')
    setStatus(null)
    try {
      await saveRuntimeServerConfig(host, port)
      setStatus({ tone: 'success', message: 'Server connection saved. Reloading…' })
      window.setTimeout(() => window.location.reload(), 150)
    } catch (error) {
      setStatus({ tone: 'error', message: error.message || 'Unable to save the server connection.' })
      setAction(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={closeModal}
      eyebrow="Station setup"
      title="Server Connection"
      description="Choose this PC for standalone/local Café Edge, or point the station to another café server on the LAN. Local mode uses 127.0.0.1:3000 and starts the bundled backend automatically."
      maxWidth="max-w-lg"
      busy={isSaving}
      zIndexClass="z-[900]"
      footer={(
        <>
          <Button variant="ghost" disabled={isSaving} onClick={closeModal}>Close</Button>
          <Button variant="subtle" disabled={Boolean(action) || !host.trim()} onClick={testConnection}>
            {isTesting ? 'Checking…' : status?.tone === 'error' ? 'Try Again' : 'Test Connection'}
          </Button>
          <Button variant="primary" disabled={Boolean(action) || !host.trim() || verifiedDraft !== draftKey} onClick={saveConnection}>Save & Reload</Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-surface-line bg-surface-raised/60 px-3.5 py-3 text-xs text-slate-soft">
          <div className="flex items-center gap-2 font-semibold text-ink-900"><Server size={15} /> Current source</div>
          <p className="mt-1">{source || 'Not configured'}</p>
        </div>
        {status && (
          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${status.tone === 'success' ? 'border-teal/30 bg-teal/10 text-teal-dim' : 'border-ember/30 bg-ember/10 text-ember-dim'}`}>
            {status.tone === 'success' ? <CheckCircle2 className="mt-0.5 shrink-0" size={14} /> : <AlertCircle className="mt-0.5 shrink-0" size={14} />}
            <span>{status.message}</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-line bg-surface-raised/50 px-3.5 py-3">
          <div>
            <p className="text-xs font-semibold text-ink-900">Use this Customer PC as the server</p>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-soft">Standalone mode · 127.0.0.1:3000</p>
          </div>
          <Button
            variant="subtle"
            disabled={Boolean(action)}
            onClick={() => { setHost('127.0.0.1'); setPort('3000'); clearVerification() }}
          >
            Use This PC
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <div>
            <label className="eyebrow mb-2 block">Server IP / Hostname</label>
            <input
              autoFocus
              value={host}
              onChange={(event) => { setHost(event.target.value); clearVerification() }}
              placeholder="127.0.0.1 or 192.168.1.10"
              autoComplete="off"
              spellCheck="false"
              className="min-h-11 w-full rounded-xl border border-surface-line customer-neutral-surface px-3.5 text-sm text-ink-900 placeholder:text-slate-soft outline-none focus:border-gold/50"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block">Port</label>
            <input
              value={port}
              onChange={(event) => { setPort(event.target.value.replace(/\D/g, '').slice(0, 5)); clearVerification() }}
              placeholder="3000"
              inputMode="numeric"
              className="min-h-11 w-full rounded-xl border border-surface-line customer-neutral-surface px-3.5 text-sm text-ink-900 placeholder:text-slate-soft outline-none focus:border-gold/50"
            />
          </div>
        </div>
        <p className="text-[11px] leading-5 text-slate-soft">
          Local server: <span className="font-semibold text-ink-900">127.0.0.1</span> on port <span className="font-semibold text-ink-900">3000</span>. For a separate server PC, enter its LAN IP instead. Test the connection before Save & Reload becomes available.
        </p>
      </div>
    </Modal>
  )
}
