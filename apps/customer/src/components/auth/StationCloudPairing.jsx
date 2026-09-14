import { useState } from 'react'
import { CheckCircle2, Cloud, Link2, Monitor, RotateCw, ShieldCheck, WifiOff } from 'lucide-react'
import Button from '../common/Button.jsx'
import Modal from '../common/Modal.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import logo from '../../assets/aktura-logo.svg'

export default function StationCloudPairing() {
  const { pairStationToCloud, stationPairingError, stationRestartRequired } = useAuth()
  const [pairingCode,setPairingCode]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [restarting,setRestarting]=useState(false)

  async function submit(event){
    event.preventDefault();if(busy||stationRestartRequired||!pairingCode.trim())return
    setBusy(true);setError('')
    const result=await pairStationToCloud(pairingCode.trim().toUpperCase())
    if(!result.ok)setError(result.error)
    setBusy(false)
  }

  async function restartStation(){
    if(restarting)return
    setRestarting(true)
    try {
      if(window.aezakmiClient?.restartCustomerStation) await window.aezakmiClient.restartCustomerStation()
      else window.location.reload()
    } catch (restartError) {
      setRestarting(false)
      setError(restartError?.message || 'Unable to restart Customer Station. Close and reopen the app manually.')
    }
  }

  return <><main className="customer-pairing-shell">
    <div className="customer-pairing-container">
      <section className="flex min-h-0 flex-col bg-midnight p-6 text-soft-white sm:p-8">
        <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft-white/10 p-2"><img src={logo} className="h-full w-full object-contain" alt=""/></span><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-new-wool">Aezakmi Cloud</p><h1 className="font-display text-xl font-semibold">Customer Station</h1></div></div>
        <div className="mt-10 max-w-sm"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-new-wool">First-time setup</p><h2 className="mt-2 font-display text-3xl font-semibold leading-tight">Connect this PC to the correct café.</h2><p className="mt-3 text-sm leading-6 text-dance">Cloud primary · Edge fallback.</p></div>
        <div className="mt-8 space-y-3 text-sm">
          <div className="flex gap-3 rounded-2xl border border-soft-white/10 bg-soft-white/[.06] p-4"><Cloud className="mt-0.5 shrink-0" size={18}/><div><p className="font-semibold">Cloud first</p><p className="mt-1 text-xs leading-5 text-new-wool">Supabase while online.</p></div></div>
          <div className="flex gap-3 rounded-2xl border border-soft-white/10 bg-soft-white/[.06] p-4"><WifiOff className="mt-0.5 shrink-0" size={18}/><div><p className="font-semibold">Edge fallback</p><p className="mt-1 text-xs leading-5 text-new-wool">Automatic LAN fallback.</p></div></div>
        </div>
        <div className="mt-auto pt-8 text-[11px] text-new-wool"><ShieldCheck className="mr-2 inline" size={14}/>Pairing binds this installation to one branch and PC.</div>
      </section>

      <section className="flex min-h-0 items-center p-6 sm:p-8">
        <form onSubmit={submit} className="mx-auto w-full max-w-md">
          <div className="mb-6"><p className="eyebrow">Pair this computer</p><h2 className="mt-1 font-display text-2xl font-semibold text-ink-900">Customer Station setup</h2><p className="mt-2 text-sm leading-6 text-slate-soft">Generate a pairing code in Cloud Admin → Clients.</p></div>
          {(error||stationPairingError)&&<div className="mb-4 rounded-xl border border-ember/20 bg-ember/10 px-3 py-2.5 text-sm text-ember-dim">{error||stationPairingError}</div>}
          <div className="space-y-4">
            <label className="block"><span className="eyebrow mb-2 block">Station pairing code</span><input value={pairingCode} onChange={e=>setPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,9))} placeholder="ABCD-1234" maxLength={9} autoComplete="off" className="min-h-12 w-full rounded-xl border border-surface-line bg-ink px-4 font-mono text-base font-semibold tracking-[.16em] text-ink-900 uppercase focus:border-teal focus:outline-none"/></label>
          </div>
          <Button type="submit" variant="teal" className="mt-5 min-h-12 w-full" disabled={busy||stationRestartRequired||!pairingCode.trim()}>{busy?'Connecting…':<><Link2 size={16}/>Connect this PC</>}</Button>
          <div className="mt-5 flex gap-3 rounded-xl bg-surface-raised p-3"><Monitor size={16} className="mt-0.5 shrink-0 text-teal-dim"/><p className="text-xs leading-5 text-slate-soft">The pairing code identifies the branch and PC.</p></div>
        </form>
      </section>
    </div>
  </main>

  <Modal
    open={stationRestartRequired}
    onClose={() => {}}
    eyebrow="Pairing complete"
    title="Restart Customer Station"
    description="Restart once to load the new station identity."
    showCloseButton={false}
    closeOnBackdrop={false}
    closeOnEscape={false}
    busy={restarting}
    footer={<Button variant="teal" className="min-w-48" disabled={restarting} onClick={restartStation}><RotateCw size={16}/>{restarting?'Restarting…':'Restart Customer Station'}</Button>}
  >
    <div className="flex gap-3 rounded-xl border border-teal/20 bg-teal/10 p-4">
      <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-dim"/>
      <div>
        <p className="font-semibold text-ink-900">Pairing was saved successfully.</p>
        <p className="mt-1 text-xs leading-5 text-slate-soft">Only Customer Station restarts; Windows stays running.</p>
      </div>
    </div>
  </Modal>
  </>
}
