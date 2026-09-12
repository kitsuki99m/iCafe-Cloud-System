import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import { apiPatch, apiPost } from '../../lib/api.js'

const LABEL = { quit:'Quit Customer Station', lock:'Lock Customer Station', unlock:'Unlock Customer Station' }

export default function EmergencyControlGuard() {
  const [command, setCommand] = useState(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => window.aezakmiClient?.onEmergencyCommand?.((next) => { setCommand(next); setPin(''); setError('') }), [])
  async function confirm() {
    if (!command || !pin || busy) return
    setBusy(true); setError('')
    try {
      const authorization=await apiPost('/public/station-control', { command, pin })
      const executed=await window.aezakmiClient?.executeEmergencyCommand?.(command)
      await apiPatch(`/public/station-control/${authorization.controlId}/ack`,{status:executed===false?'failed':'completed',result:{executed:executed!==false}})
      setCommand(null)
    } catch (err) { setError(err?.message || 'Unable to verify Admin PIN.') } finally { setBusy(false) }
  }
  return <Modal open={!!command} onClose={() => !busy && setCommand(null)} busy={busy} onSubmit={confirm} eyebrow="Emergency station control" title={LABEL[command] || 'Station Control'} maxWidth="max-w-sm" zIndexClass="z-[600]" footer={<><Button variant="ghost" disabled={busy} onClick={() => setCommand(null)}>Cancel</Button><Button variant={command === 'quit' ? 'danger' : 'primary'} disabled={!pin || busy} onClick={confirm}>{busy ? 'Verifying…' : 'Confirm with Admin PIN'}</Button></>}><div className="space-y-3"><p className="text-sm leading-6 text-slate-soft">This hidden shortcut requires the current Admin PIN.</p><input autoFocus type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="Admin PIN" className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"/>{error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">{error}</p>}</div></Modal>
}
