import { useEffect, useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import { apiPatch, apiPost } from '../../lib/api.js'
import { useAuth } from '../../context/AuthContext.jsx'

const LABEL = { quit:'Quit Customer Station', lock:'Lock Customer Station', unlock:'Unlock Customer Station' }

export default function EmergencyControlGuard() {
  const { stationPairingRequired } = useAuth()
  const [command, setCommand] = useState(null)
  const [pin, setPin] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => window.aezakmiClient?.onEmergencyCommand?.((next) => { setCommand(next); setPin(''); setError('') }), [])
  async function confirm() {
    if (!command || !pin || busy) return
    setBusy(true); setError('')
    try {
      // Quit is a recovery/bootstrap control. An unregistered or not-yet-cloud-
      // paired Customer Station must still be escapable without first satisfying
      // the very registration state that the operator is trying to troubleshoot.
      // In that state we verify the Electron-local setup master PIN and never send
      // it to Café Edge or Supabase.
      if (command === 'quit' && stationPairingRequired) {
        const result=await window.aezakmiClient?.verifyStationSetupMasterPin?.(pin)
        if (!result?.verified) throw Object.assign(new Error('Incorrect Station Setup Master PIN.'),{code:'SETUP_MASTER_PIN_INVALID'})
        await window.aezakmiClient?.executeEmergencyCommand?.('quit')
        setCommand(null)
        return
      }
      const authorization=await apiPost('/public/station-control', { command, pin })
      const executed=await window.aezakmiClient?.executeEmergencyCommand?.(command)
      await apiPatch(`/public/station-control/${authorization.controlId}/ack`,{status:executed===false?'failed':'completed',result:{executed:executed!==false}})
      setCommand(null)
    } catch (err) {
      // If local station identity itself is the reason Quit was rejected, fall
      // back to the offline-safe Electron setup PIN. Lock/unlock never get this
      // bypass and remain server-authorized station controls.
      if (command === 'quit' && ['PC_NOT_REGISTERED','STATION_NOT_PAIRED'].includes(String(err?.code||''))) {
        try {
          const result=await window.aezakmiClient?.verifyStationSetupMasterPin?.(pin)
          if (!result?.verified) throw new Error('Incorrect Station Setup Master PIN.')
          await window.aezakmiClient?.executeEmergencyCommand?.('quit')
          setCommand(null)
          return
        } catch (fallbackError) {
          setError(fallbackError?.message || 'Unable to verify Station Setup Master PIN.')
          return
        }
      }
      setError(err?.message || 'Unable to verify Admin PIN.')
    } finally { setBusy(false) }
  }
  const bootstrapQuit=command==='quit'&&stationPairingRequired
  return <Modal open={!!command} onClose={() => !busy && setCommand(null)} busy={busy} onSubmit={confirm} eyebrow="Emergency station control" title={LABEL[command] || 'Station Control'} maxWidth="max-w-sm" zIndexClass="z-[600]" footer={<><Button variant="ghost" disabled={busy} onClick={() => setCommand(null)}>Cancel</Button><Button variant={command === 'quit' ? 'danger' : 'primary'} disabled={!pin || busy} onClick={confirm}>{busy ? 'Verifying…' : bootstrapQuit ? 'Confirm with Setup PIN' : 'Confirm with Admin PIN'}</Button></>}><div className="space-y-3"><p className="text-sm leading-6 text-slate-soft">{bootstrapQuit?'This PC is not paired yet. Quit remains available with the Station Setup Master PIN so setup problems cannot trap the station in kiosk mode.':'This hidden shortcut requires the current Admin PIN.'}</p><input autoFocus type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))} placeholder={bootstrapQuit?'Station Setup Master PIN':'Admin PIN'} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"/>{error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">{error}</p>}</div></Modal>
}
