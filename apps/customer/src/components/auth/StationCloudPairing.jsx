import { useRef, useState } from 'react'
import { CheckCircle2, Cloud, Link2, Monitor, RotateCw, ShieldCheck, WifiOff } from 'lucide-react'
import Button from '../common/Button.jsx'
import Modal from '../common/Modal.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import logo from '../../assets/aktura-logo.svg'


const PAIRING_CODE_LENGTH = 8
const cleanPairingCode = value => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, PAIRING_CODE_LENGTH)
const formatPairingCode = value => {
  const clean = cleanPairingCode(value)
  return clean.length > 4 ? `${clean.slice(0,4)}-${clean.slice(4)}` : clean
}

export default function StationCloudPairing() {
  const { pairStationToCloud, stationPairingError, stationRestartRequired } = useAuth()
  const [pairingCode,setPairingCode]=useState(()=>Array(PAIRING_CODE_LENGTH).fill(''))
  const pairingInputs=useRef([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [restarting,setRestarting]=useState(false)

  const pairingComplete=pairingCode.every(Boolean)

  function writePairingCharacters(startIndex,value){
    const incoming=cleanPairingCode(value)
    if(!incoming)return
    const next=[...pairingCode]
    incoming.split('').forEach((character,offset)=>{
      const target=startIndex+offset
      if(target<PAIRING_CODE_LENGTH)next[target]=character
    })
    setPairingCode(next)
    setError('')
    const nextIndex=Math.min(startIndex+incoming.length,PAIRING_CODE_LENGTH-1)
    requestAnimationFrame(()=>pairingInputs.current[nextIndex]?.focus())
  }

  function changePairingCharacter(index,value){
    const incoming=cleanPairingCode(value)
    if(incoming.length>1){writePairingCharacters(index,incoming);return}
    const next=[...pairingCode]
    next[index]=incoming||''
    setPairingCode(next)
    setError('')
    if(incoming&&index<PAIRING_CODE_LENGTH-1)requestAnimationFrame(()=>pairingInputs.current[index+1]?.focus())
  }

  function handlePairingKeyDown(event,index){
    if(event.key==='Backspace'&&!pairingCode[index]&&index>0){
      event.preventDefault()
      const next=[...pairingCode]
      next[index-1]=''
      setPairingCode(next)
      requestAnimationFrame(()=>pairingInputs.current[index-1]?.focus())
      return
    }
    if(event.key==='ArrowLeft'&&index>0){event.preventDefault();pairingInputs.current[index-1]?.focus()}
    if(event.key==='ArrowRight'&&index<PAIRING_CODE_LENGTH-1){event.preventDefault();pairingInputs.current[index+1]?.focus()}
  }

  function handlePairingPaste(event,index=0){
    const incoming=cleanPairingCode(event.clipboardData?.getData('text'))
    if(!incoming)return
    event.preventDefault()
    writePairingCharacters(index,incoming)
  }

  async function submit(event){
    event.preventDefault();if(busy||stationRestartRequired)return
    if(!pairingComplete){setError('Enter the complete 8-character pairing code.');const firstEmpty=pairingCode.findIndex(character=>!character);pairingInputs.current[firstEmpty<0?0:firstEmpty]?.focus();return}
    setBusy(true);setError('')
    const result=await pairStationToCloud(formatPairingCode(pairingCode.join('')))
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
      <section className="customer-pairing-brand-panel flex min-h-0 flex-col p-6 text-soft-white sm:p-8">
        <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-soft-white/10 p-2"><img src={logo} className="h-full w-full object-contain" alt=""/></span><div><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-new-wool">Aezakmi Cloud</p><h1 className="font-display text-xl font-semibold">Customer Station</h1></div></div>
        <div className="mt-10 max-w-sm"><p className="text-[10px] font-semibold uppercase tracking-[.18em] text-new-wool">First-time setup</p><h2 className="mt-2 font-display text-3xl font-semibold leading-tight">Connect this PC to the correct café.</h2><p className="mt-3 text-sm leading-6 text-dance">Cloud primary · Edge fallback.</p></div>
        <div className="mt-8 space-y-3 text-sm">
          <div className="flex gap-3 rounded-2xl border border-soft-white/10 bg-soft-white/[.06] p-4"><Cloud className="mt-0.5 shrink-0" size={18}/><div><p className="font-semibold">Cloud first</p><p className="mt-1 text-xs leading-5 text-new-wool">Supabase while online.</p></div></div>
          <div className="flex gap-3 rounded-2xl border border-soft-white/10 bg-soft-white/[.06] p-4"><WifiOff className="mt-0.5 shrink-0" size={18}/><div><p className="font-semibold">Edge fallback</p><p className="mt-1 text-xs leading-5 text-new-wool">Automatic LAN fallback.</p></div></div>
        </div>
        <div className="mt-auto pt-8 text-[11px] text-new-wool"><ShieldCheck className="mr-2 inline" size={14}/>Pairing binds this installation to one branch and PC.</div>
      </section>

      <section className="customer-pairing-form-panel flex min-h-0 items-center p-6 sm:p-8">
        <form onSubmit={submit} className="mx-auto w-full max-w-md">
          <div className="mb-6"><p className="eyebrow">Pair this computer</p><h2 className="mt-1 font-display text-2xl font-semibold text-ink-900">Customer Station setup</h2><p className="mt-2 text-sm leading-6 text-slate-soft">Generate a pairing code in Cloud Admin → Clients.</p></div>
          {(error||stationPairingError)&&<div className="mb-4 rounded-xl border border-ember/20 bg-ember/10 px-3 py-2.5 text-sm text-ember-dim">{error||stationPairingError}</div>}
          <div className="space-y-4">
            <div role="group" aria-labelledby="pairing-code-label">
              <span id="pairing-code-label" className="eyebrow mb-2 block">Station pairing code</span>
              <div className="flex w-full items-center gap-2">
                {[0,1,2,3].map(index=><input
                  key={index}
                  ref={element=>{pairingInputs.current[index]=element}}
                  value={pairingCode[index]||''}
                  onChange={event=>changePairingCharacter(index,event.target.value)}
                  onKeyDown={event=>handlePairingKeyDown(event,index)}
                  onPaste={event=>handlePairingPaste(event,index)}
                  maxLength={PAIRING_CODE_LENGTH}
                  autoFocus={index===0}
                  autoComplete={index===0?'one-time-code':'off'}
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label={`Pairing code character ${index+1} of ${PAIRING_CODE_LENGTH}`}
                  className={`customer-pairing-code-input h-14 min-w-0 flex-1 rounded-xl border text-center font-mono text-xl font-bold uppercase outline-none transition ${pairingCode[index]?'customer-pairing-code-input-filled':'border-surface-line'} focus:border-teal focus:ring-2 focus:ring-teal/15`}
                />)}
                <span aria-hidden="true" className="w-3 shrink-0 text-center font-mono text-xl font-bold text-slate-soft">–</span>
                {[4,5,6,7].map(index=><input
                  key={index}
                  ref={element=>{pairingInputs.current[index]=element}}
                  value={pairingCode[index]||''}
                  onChange={event=>changePairingCharacter(index,event.target.value)}
                  onKeyDown={event=>handlePairingKeyDown(event,index)}
                  onPaste={event=>handlePairingPaste(event,index)}
                  maxLength={PAIRING_CODE_LENGTH}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  aria-label={`Pairing code character ${index+1} of ${PAIRING_CODE_LENGTH}`}
                  className={`customer-pairing-code-input h-14 min-w-0 flex-1 rounded-xl border text-center font-mono text-xl font-bold uppercase outline-none transition ${pairingCode[index]?'customer-pairing-code-input-filled':'border-surface-line'} focus:border-teal focus:ring-2 focus:ring-teal/15`}
                />)}
              </div>
            </div>
          </div>
          <Button type="submit" variant="teal" className="mt-5 min-h-12 w-full" disabled={busy||stationRestartRequired||!pairingComplete}>{busy?'Connecting…':<><Link2 size={16}/>Connect this PC</>}</Button>
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
