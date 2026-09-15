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

  async function executeLocally() {
    const executed = await window.aezakmiClient?.executeEmergencyCommand?.(command)
    if (executed === false) throw new Error(`${LABEL[command] || 'Station command'} could not be executed.`)
    setCommand(null)
    return true
  }

  async function confirm() {
    if (!command || !pin || busy) return
    setBusy(true); setError('')
    try {
      // The Station Setup Master PIN is deliberately a local recovery authority.
      // Once Electron verifies it, Café Edge/Cloud availability must never be able
      // to block Quit, Lock, or Unlock. This mirrors the emergency Quit behavior.
      const verified = await window.aezakmiClient?.verifyStationSetupMasterPin?.(pin)
      if (!verified?.verified) throw Object.assign(new Error('Incorrect Station Setup Master PIN.'), { code:'STATION_SETUP_MASTER_PIN_INVALID' })

      if (command === 'quit') {
        await executeLocally()
        return
      }

      const requestedCommand = command
      // Apply Lock/Unlock locally first so a dead/misconfigured Café Edge cannot
      // trap the operator. The accounting checkpoint/ACK is best effort and is
      // reconciled when authority is reachable again.
      await executeLocally()

      if (!stationPairingRequired) {
        void (async () => {
          try {
            const authorization = await apiPost('/public/station-control', { command:requestedCommand, pin })
            await apiPatch(`/public/station-control/${authorization.controlId}/ack`, {
              status:'completed',
              result:{ executed:true, authorization:'station_setup_master_pin', localOverride:true },
            })
          } catch (edgeError) {
            console.warn(`[station-control] ${requestedCommand} completed locally; Café Edge checkpoint unavailable:`, edgeError?.message || edgeError)
          }
        })()
      }
    } catch (err) {
      setError(err?.message || 'Unable to verify Station Setup Master PIN.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={!!command}
      onClose={() => !busy && setCommand(null)}
      busy={busy}
      onSubmit={confirm}
      eyebrow="Emergency station control"
      title={LABEL[command] || 'Station Control'}
      maxWidth="max-w-sm"
      zIndexClass="z-[600]"
      footer={(
        <>
          <Button variant="ghost" disabled={busy} onClick={() => setCommand(null)}>Cancel</Button>
          <Button variant={command === 'quit' ? 'danger' : 'primary'} disabled={!pin || busy} onClick={confirm}>
            {busy ? 'Verifying…' : 'Confirm with Master PIN'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <p className="text-sm leading-6 text-slate-soft">
          This hidden shortcut requires the Station Setup Master PIN. Admin login and management PINs are not accepted here.
        </p>
        <input
          autoFocus
          type="password"
          inputMode="numeric"
          value={pin}
          onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 8))}
          placeholder="Master PIN"
          autoComplete="off"
          className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"
        />
        {error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">{error}</p>}
      </div>
    </Modal>
  )
}
