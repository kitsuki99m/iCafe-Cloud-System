import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Server } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import {
  getServerConnectionDefaults,
  saveRuntimeServerConfig,
  testServerConfig,
} from '../../lib/serverConfig.js'

export default function ServerConnectionModal({ open, onClose }) {
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
    const current = getServerConnectionDefaults()
    setHost(current.host || '')
    setPort(String(current.port || 3000))
    setSource(current.source || '')
    setStatus(null)
    setVerifiedDraft('')
    setAction(null)
    return () => {
      abortRef.current?.abort()
      abortRef.current = null
    }
  }, [open])

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
      eyebrow="Runtime configuration"
      title="Server Connection"
      description="Change the backend server without rebuilding the Admin app. Tests stop after 4 seconds so a bad address never traps the login screen."
      maxWidth="max-w-lg"
      busy={isSaving}
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
        <div className="rounded-xl border border-surface-line bg-dance/25 px-3.5 py-3 text-xs text-slate-soft">
          <div className="flex items-center gap-2 font-semibold text-ink-900"><Server size={15} /> Current source</div>
          <p className="mt-1">{source || 'Not configured'}</p>
        </div>
        {status && (
          <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs ${status.tone === 'success' ? 'border-teal/30 bg-teal/10 text-teal-dim' : 'border-ember/30 bg-ember/10 text-ember-dim'}`}>
            {status.tone === 'success' ? <CheckCircle2 className="mt-0.5 shrink-0" size={14} /> : <AlertCircle className="mt-0.5 shrink-0" size={14} />}
            <span>{status.message}</span>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <div>
            <label className="eyebrow mb-2 block">Server IP / Hostname</label>
            <input
              autoFocus
              value={host}
              onChange={(event) => { setHost(event.target.value); clearVerification() }}
              placeholder="192.168.254.126"
              autoComplete="off"
              spellCheck="false"
              className="min-h-11 w-full rounded-xl border border-surface-line bg-surface px-3.5 text-sm text-ink-900 placeholder:text-slate-soft focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/10"
            />
          </div>
          <div>
            <label className="eyebrow mb-2 block">Port</label>
            <input
              value={port}
              onChange={(event) => { setPort(event.target.value.replace(/\D/g, '').slice(0, 5)); clearVerification() }}
              placeholder="3000"
              inputMode="numeric"
              className="min-h-11 w-full rounded-xl border border-surface-line bg-surface px-3.5 text-sm text-ink-900 placeholder:text-slate-soft focus:border-gold/50 focus:outline-none focus:ring-2 focus:ring-gold/10"
            />
          </div>
        </div>
        <p className="text-[11px] leading-5 text-slate-soft">
          Example: <span className="font-semibold text-ink-900">192.168.254.126</span> on port <span className="font-semibold text-ink-900">3000</span>. Test the connection before Save & Reload becomes available.
        </p>
      </div>
    </Modal>
  )
}
