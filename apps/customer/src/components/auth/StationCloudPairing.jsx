import { useState } from 'react'
import { Cloud, Link2, Monitor, ShieldCheck, WifiOff } from 'lucide-react'
import Button from '../common/Button.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import logo from '../../assets/aktura-logo.svg'

export default function StationCloudPairing() {
  const { pairStationToCloud, stationPairingError } = useAuth()
  const [ownerEmail,setOwnerEmail]=useState('')
  const [pairingCode,setPairingCode]=useState('')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')

  async function submit(event){
    event.preventDefault();if(busy||!ownerEmail.trim()||!pairingCode.trim())return
    setBusy(true);setError('')
    const result=await pairStationToCloud(ownerEmail.trim(),pairingCode.trim().toUpperCase())
    if(!result.ok)setError(result.error)
    setBusy(false)
  }

  return <main className="min-h-screen bg-surface px-4 py-6 sm:px-6">
    <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-5xl overflow-hidden rounded-[28px] border border-surface-line bg-soft-white shadow-card lg:grid-cols-[.9fr_1.1fr]">
      <section className="flex flex-col bg-midnight p-6 text-soft-white sm:p-8 lg:p-10">
        <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft-white/10 p-2"><img src={logo} className="h-full w-full object-contain" alt=""/></span><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-new-wool">Aezakmi Cloud</p><h1 className="font-display text-xl font-semibold">Customer Station</h1></div></div>
        <div className="mt-10 max-w-sm"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-new-wool">First-time setup</p><h2 className="mt-2 font-display text-3xl font-semibold leading-tight">Connect this PC to the correct café.</h2><p className="mt-3 text-sm leading-6 text-dance">Cloud is the normal connection. Café Edge stays ready as the LAN fallback when the internet is unavailable.</p></div>
        <div className="mt-8 space-y-3 text-sm">
          <div className="flex gap-3 rounded-2xl border border-soft-white/10 bg-soft-white/[.06] p-4"><Cloud className="mt-0.5 shrink-0" size={18}/><div><p className="font-semibold">Cloud first</p><p className="mt-1 text-xs leading-5 text-new-wool">Live commands and station traffic go through Supabase while online.</p></div></div>
          <div className="flex gap-3 rounded-2xl border border-soft-white/10 bg-soft-white/[.06] p-4"><WifiOff className="mt-0.5 shrink-0" size={18}/><div><p className="font-semibold">Edge fallback</p><p className="mt-1 text-xs leading-5 text-new-wool">If Cloud is unreachable, this PC automatically uses the cashier/admin PC over LAN.</p></div></div>
        </div>
        <div className="mt-auto pt-8 text-[11px] text-new-wool"><ShieldCheck className="mr-2 inline" size={14}/>Owner email is used only for enrollment. The permanent security boundary is organization + branch + station.</div>
      </section>

      <section className="flex items-center p-6 sm:p-8 lg:p-10">
        <form onSubmit={submit} className="mx-auto w-full max-w-md">
          <div className="mb-6"><p className="eyebrow">Pair this computer</p><h2 className="mt-1 font-display text-2xl font-semibold text-ink-900">Customer Station setup</h2><p className="mt-2 text-sm leading-6 text-slate-soft">In Cloud Admin, choose the PC under Clients and generate a Customer Station pairing code.</p></div>
          {(error||stationPairingError)&&<div className="mb-4 rounded-xl border border-ember/20 bg-ember/10 px-3 py-2.5 text-sm text-ember-dim">{error||stationPairingError}</div>}
          <div className="space-y-4">
            <label className="block"><span className="eyebrow mb-2 block">Business owner email</span><input type="email" autoComplete="email" value={ownerEmail} onChange={e=>setOwnerEmail(e.target.value)} placeholder="owner@yourcafe.com" className="min-h-12 w-full rounded-xl border border-surface-line bg-ink px-4 text-sm text-ink-900 focus:border-teal focus:outline-none"/></label>
            <label className="block"><span className="eyebrow mb-2 block">Station pairing code</span><input value={pairingCode} onChange={e=>setPairingCode(e.target.value.toUpperCase())} placeholder="ABCD-1234" maxLength={9} className="min-h-12 w-full rounded-xl border border-surface-line bg-ink px-4 font-mono text-base font-semibold tracking-[.16em] text-ink-900 uppercase focus:border-teal focus:outline-none"/></label>
          </div>
          <Button type="submit" variant="teal" className="mt-5 min-h-12 w-full" disabled={busy||!ownerEmail.trim()||!pairingCode.trim()}>{busy?'Connecting…':<><Link2 size={16}/>Connect this PC</>}</Button>
          <div className="mt-5 flex gap-3 rounded-xl bg-surface-raised p-3"><Monitor size={16} className="mt-0.5 shrink-0 text-teal-dim"/><p className="text-xs leading-5 text-slate-soft">The pairing code already identifies the logical PC, organization, and branch. After pairing, only that business can see this station in Cloud Admin.</p></div>
        </form>
      </section>
    </div>
  </main>
}
