import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, CloudDownload, Download, Loader2, RefreshCw, ShieldCheck, TimerReset, XCircle } from 'lucide-react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import { apiGet, apiPost, apiUrl } from '../../lib/api.js'
import { isCloudAdmin } from '../../lib/cloudClient.js'
import { showToast } from '../../lib/toast.js'

const CLOUD_SOURCE_KEY='aezakmi.customer.update.manifest.url'
const UPDATE_COMMANDS={
  check:'customer_update_check',
  download:'customer_update_download',
  idle:'customer_update_install_when_idle',
  cancel:'customer_update_cancel',
}

function parseVersion(value){const text=String(value||'0.0.0').trim().replace(/^v/i,'').split('+')[0],parts=text.split('-',2),core=parts[0].split('.').map((part)=>Number.parseInt(part,10)||0),pre=parts.length>1?parts[1].split('.'):[];return{core:[core[0]||0,core[1]||0,core[2]||0],pre}}
function compareVersions(a,b){const av=parseVersion(a),bv=parseVersion(b);for(let i=0;i<3;i++){if(av.core[i]!==bv.core[i])return av.core[i]>bv.core[i]?1:-1}if(!av.pre.length&&!bv.pre.length)return 0;if(!av.pre.length)return 1;if(!bv.pre.length)return-1;for(let i=0;i<Math.max(av.pre.length,bv.pre.length);i++){const x=av.pre[i],y=bv.pre[i];if(x==null)return-1;if(y==null)return 1;if(x===y)continue;const xn=/^\d+$/.test(x),yn=/^\d+$/.test(y);if(xn&&yn)return Number(x)>Number(y)?1:-1;if(xn!==yn)return xn?-1:1;return x>y?1:-1}return 0}
function validHttpUrl(value){try{const parsed=new URL(String(value||''));if(parsed.protocol==='https:')return true;if(parsed.protocol!=='http:')return false;const host=parsed.hostname.toLowerCase();if(host==='localhost'||host==='127.0.0.1'||host==='::1')return true;if(/^10\./.test(host)||/^192\.168\./.test(host))return true;const match=host.match(/^172\.(\d+)\./);return Boolean(match&&Number(match[1])>=16&&Number(match[1])<=31)}catch{return false}}
function releaseNotesText(value){if(Array.isArray(value))return value.join('\n');return String(value||'')}
function statusLabel(pc){
  const state=String(pc.customerUpdateState||'').toLowerCase()
  if(state==='downloading')return `Downloading${Number.isFinite(Number(pc.customerUpdateProgress))?` ${Math.round(Number(pc.customerUpdateProgress))}%`:''}`
  if(state==='waiting_idle')return 'Waiting for idle'
  if(state==='ready')return 'Ready to install'
  if(state==='installing')return 'Installing'
  if(state==='available')return `Update ${pc.customerUpdateVersion||'available'}`
  if(state==='queued')return pc.status==='offline'?'Queued for reconnect':'Queued'
  if(state==='cancel_queued')return pc.status==='offline'?'Cancel queued':'Cancelling'
  if(state==='checking')return 'Checking'
  if(state==='current')return 'Current'
  if(state==='error')return 'Update error'
  if(state==='cancelled')return 'Cancelled'
  if(state==='managed')return 'Admin managed'
  if(state==='development')return 'Developer build'
  return pc.status==='offline'?'Offline':'Connected'
}
function statusTone(pc){const state=String(pc.customerUpdateState||'').toLowerCase();if(state==='error')return'border-ember/25 bg-ember/5 text-ember-dim';if(['current','ready'].includes(state))return'border-teal/25 bg-teal/5 text-teal-dim';if(['queued','cancel_queued','waiting_idle','downloading','installing','checking','available'].includes(state))return'border-gold/25 bg-gold/5 text-gold-dim';return'border-surface-line bg-surface-raised/50 text-slate-soft'}

export default function CustomerUpdateCenter({ open, onClose, pcs = [], onCommand }) {
  const cloud=isCloudAdmin()
  const [sourceUrl,setSourceUrl]=useState('')
  const [manifest,setManifest]=useState(null)
  const [deploymentUrl,setDeploymentUrl]=useState('')
  const [cacheReady,setCacheReady]=useState(false)
  const [loading,setLoading]=useState(false)
  const [busyKey,setBusyKey]=useState('')
  const [error,setError]=useState('')

  const latest=String(manifest?.version||'')
  const stationRows=useMemo(()=>pcs.map((pc)=>({
    ...pc,
    updateNeeded:latest?!pc.customerVersion||compareVersions(latest,pc.customerVersion)>0:false,
  })),[pcs,latest])
  const outdatedCount=stationRows.filter((pc)=>pc.updateNeeded).length
  const waitingCount=stationRows.filter((pc)=>pc.customerUpdateInstallWhenIdle||pc.customerUpdateState==='waiting_idle').length

  useEffect(()=>{
    if(!open)return
    let cancelled=false
    setError('')
    ;(async()=>{
      setLoading(true)
      try{
        if(cloud){
          const configured=String(localStorage.getItem(CLOUD_SOURCE_KEY)||import.meta.env.VITE_AEZAKMI_CUSTOMER_UPDATE_MANIFEST_URL||'').trim()
          if(cancelled)return
          setSourceUrl(configured);setDeploymentUrl(configured);setCacheReady(false)
          if(configured)await refreshCloudManifest(configured,cancelled)
        }else{
          const status=await apiGet('/customer-updates/status')
          if(cancelled)return
          const configured=String(status.sourceUrl||'')
          setSourceUrl(configured)
          setManifest(status.cachedManifest||null)
          setCacheReady(Boolean(status.cacheReady))
          setDeploymentUrl(status.cacheReady?apiUrl(status.localManifestPath||'/public/customer-updates/latest.json'):'')
        }
      }catch(e){if(!cancelled)setError(e?.message||'Unable to load Customer update status.')}
      finally{if(!cancelled)setLoading(false)}
    })()
    return()=>{cancelled=true}
  },[open,cloud])

  async function refreshCloudManifest(url=sourceUrl,cancelled=false){
    if(!validHttpUrl(url))throw new Error('Enter a valid Customer release manifest URL.')
    const response=await fetch(url,{cache:'no-store',headers:{Accept:'application/json'}})
    if(!response.ok)throw new Error(`Release manifest request failed (${response.status}).`)
    const next=await response.json()
    if(!next?.version||!next?.file||!next?.sha256)throw new Error('Release manifest is incomplete.')
    if(!cancelled){setManifest({...next,releaseNotes:releaseNotesText(next.releaseNotes)});setDeploymentUrl(url)}
    return next
  }

  async function saveSource(){
    if(!validHttpUrl(sourceUrl)){setError('Enter a valid Customer release manifest URL.');return}
    setBusyKey('source');setError('')
    try{
      if(cloud){localStorage.setItem(CLOUD_SOURCE_KEY,sourceUrl.trim());await refreshCloudManifest(sourceUrl.trim())}
      else{await apiPost('/customer-updates/source',{manifestUrl:sourceUrl.trim()});showToast({title:'Update source saved',message:'Café Edge will use this release feed when caching Customer updates.'})}
    }catch(e){setError(e?.message||'Unable to save the update source.')}
    finally{setBusyKey('')}
  }

  async function refreshRelease(){
    if(!validHttpUrl(sourceUrl)){setError('Enter a valid Customer release manifest URL.');return}
    setBusyKey('refresh');setError('')
    try{
      if(cloud){
        localStorage.setItem(CLOUD_SOURCE_KEY,sourceUrl.trim())
        await refreshCloudManifest(sourceUrl.trim())
        showToast({title:'Release refreshed',message:'Cloud Admin is using the latest published Customer release.'})
      }else{
        const result=await apiPost('/customer-updates/cache',{manifestUrl:sourceUrl.trim()})
        setManifest(result.manifest||null);setCacheReady(true);setDeploymentUrl(apiUrl(result.localManifestPath||'/public/customer-updates/latest.json'))
        showToast({title:'Customer update cached',message:`${result.manifest?.version?`v${result.manifest.version} `:''}is ready for LAN deployment.`})
      }
    }catch(e){setError(e?.message||'Unable to refresh the Customer release.')}
    finally{setBusyKey('')}
  }

  function commandPayload(){
    const url=String(deploymentUrl||sourceUrl||'').trim()
    if(!url)throw new Error(cloud?'Load a release feed first.':'Cache a release on Café Edge first.')
    return{manifestUrl:url,targetVersion:latest||undefined,allowInsecure:url.startsWith('http://')}
  }

  async function runStationCommand(pc,command,{silent=false}={}){
    const payload=command===UPDATE_COMMANDS.cancel?{}:commandPayload()
    await onCommand?.(pc,command,payload)
    if(!silent)showToast({title:'Update command queued',message:`${pc.label}: ${command===UPDATE_COMMANDS.check?'check release':command===UPDATE_COMMANDS.download?'download release':command===UPDATE_COMMANDS.idle?'install when idle':'cancel update'}.`})
  }

  async function runBulk(command){
    if(!pcs.length)return
    const key=`bulk:${command}`;setBusyKey(key);setError('')
    try{
      const targets=[UPDATE_COMMANDS.cancel,UPDATE_COMMANDS.check].includes(command)?stationRows:stationRows.filter((pc)=>latest?!pc.customerVersion||compareVersions(latest,pc.customerVersion)>0:true)
      if(!targets.length){showToast({title:'Customer Stations are current',message:'No station needs this update.'});return}
      const results=await Promise.allSettled(targets.map((pc)=>runStationCommand(pc,command,{silent:true})))
      const ok=results.filter((item)=>item.status==='fulfilled').length,failed=results.length-ok
      showToast({title:command===UPDATE_COMMANDS.idle?'Update deployment queued':command===UPDATE_COMMANDS.download?'Downloads queued':command===UPDATE_COMMANDS.check?'Update checks queued':'Update queue cleared',message:`${ok} station${ok===1?'':'s'} accepted${failed?`; ${failed} failed`:'.'}`,tone:failed?'warning':'success'})
    }catch(e){setError(e?.message||'Unable to queue Customer updates.')}
    finally{setBusyKey('')}
  }

  const footer=<><Button variant="ghost" onClick={onClose}>Close</Button></>
  return <Modal open={open} onClose={onClose} eyebrow="Customer Station software" title="Software Updates" description="Admin controls release checks, downloads, and installation. Active paid sessions are protected; Install When Idle waits for a safe login-screen boundary." maxWidth="max-w-6xl" footer={footer} busy={Boolean(busyKey)}>
    <div className="space-y-5">
      {error&&<div className="rounded-xl border border-ember/30 bg-ember/5 px-3 py-2.5 text-xs text-ember-dim">{error}</div>}

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,.6fr)]">
        <div className="overview-soft-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Release source</p><h3 className="mt-1 text-sm font-semibold text-ink-900">{cloud?'Public stable feed':'Café Edge cache'}</h3><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-soft">{cloud?'Cloud Admin sends the approved public manifest to paired Customer Stations.':'Edge downloads the release once, verifies SHA-256, then every Customer Station downloads it over the café LAN.'}</p></div>{!cloud&&<span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${cacheReady?'border-teal/25 bg-teal/5 text-teal-dim':'border-gold/25 bg-gold/5 text-gold-dim'}`}>{cacheReady?'LAN cache ready':'Cache required'}</span>}</div>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={sourceUrl} onChange={(event)=>setSourceUrl(event.target.value)} placeholder="https://updates.example.com/customer/stable/latest.json" className="min-w-0 flex-1 rounded-lg border border-surface-line bg-ink px-3 py-2 text-xs text-ink-900 outline-none focus:border-gold/50"/><Button size="sm" variant="ghost" disabled={Boolean(busyKey)} onClick={saveSource}>Save source</Button><Button size="sm" icon={cloud?RefreshCw:CloudDownload} disabled={Boolean(busyKey)||!sourceUrl} onClick={refreshRelease}>{busyKey==='refresh'?'Working…':cloud?'Refresh release':'Cache on Edge'}</Button></div>
          {!cloud&&deploymentUrl&&<p className="stat-figure mt-2 break-all text-[10px] text-slate-soft">LAN manifest: {deploymentUrl}</p>}
        </div>
        <div className="overview-card p-4">
          <p className="eyebrow">Approved release</p>
          {loading?<div className="mt-4 flex items-center gap-2 text-xs text-slate-soft"><Loader2 size={15} className="animate-spin"/>Loading release…</div>:manifest?<><div className="mt-2 flex items-end justify-between gap-3"><div><p className="stat-figure text-2xl font-semibold text-ink-900">v{manifest.version}</p><p className="mt-1 text-[11px] text-slate-soft">{manifest.channel||'stable'} · {manifest.size?`${(Number(manifest.size)/1024/1024).toFixed(1)} MB`:'verified package'}</p></div><ShieldCheck size={24} className="text-teal-dim"/></div>{manifest.releaseNotes&&<p className="mt-3 line-clamp-3 whitespace-pre-line text-[11px] leading-5 text-slate-soft">{releaseNotesText(manifest.releaseNotes)}</p>}</>:<p className="mt-3 text-xs text-slate-soft">No release loaded yet.</p>}
        </div>
      </section>

      <section className="overview-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="eyebrow">Branch deployment</p><h3 className="mt-1 text-sm font-semibold text-ink-900">{outdatedCount} station{outdatedCount===1?'':'s'} need the approved release</h3><p className="mt-1 text-xs text-slate-soft">{waitingCount} currently waiting for a safe idle boundary. Offline stations can keep a durable queued update and receive it when they reconnect.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="ghost" icon={RefreshCw} disabled={!manifest||Boolean(busyKey)} onClick={()=>runBulk(UPDATE_COMMANDS.check)}>Check all</Button><Button size="sm" variant="subtle" icon={Download} disabled={!manifest||Boolean(busyKey)} onClick={()=>runBulk(UPDATE_COMMANDS.download)}>Download outdated</Button><Button size="sm" icon={TimerReset} disabled={!manifest||Boolean(busyKey)} onClick={()=>runBulk(UPDATE_COMMANDS.idle)}>Update all when idle</Button></div></div>
      </section>

      <section className="overflow-hidden rounded-xl border border-surface-line">
        <div className="grid grid-cols-[minmax(150px,1.2fr)_minmax(90px,.65fr)_minmax(130px,1fr)_minmax(250px,1.35fr)] gap-3 border-b border-surface-line bg-surface-raised/60 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft"><span>Station</span><span>Version</span><span>Status</span><span>Actions</span></div>
        <div className="max-h-[40vh] overflow-y-auto">
          {stationRows.length?stationRows.map((pc)=>{
            const rowBusy=busyKey===`pc:${pc.id}`
            return <div key={pc.id} className="grid grid-cols-[minmax(150px,1.2fr)_minmax(90px,.65fr)_minmax(130px,1fr)_minmax(250px,1.35fr)] items-center gap-3 border-b border-surface-line/70 px-3 py-2.5 last:border-b-0">
              <div className="min-w-0"><p className="truncate text-xs font-semibold text-ink-900">{pc.label}</p><p className="truncate text-[10px] text-slate-soft">{pc.ipAddress||pc.cloudConnectionStatus||'Customer Station'}</p></div>
              <div><p className="stat-figure text-xs text-ink-900">{pc.customerVersion?`v${pc.customerVersion}`:'—'}</p>{latest&&<p className={`mt-0.5 text-[10px] ${pc.updateNeeded?'text-gold-dim':'text-teal-dim'}`}>{pc.updateNeeded?`→ v${latest}`:'Current'}</p>}</div>
              <div><span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold ${statusTone(pc)}`}>{statusLabel(pc)}</span>{pc.customerUpdateState==='error'&&pc.customerUpdateVersion&&<p className="mt-1 text-[10px] text-ember-dim">Target v{pc.customerUpdateVersion}</p>}</div>
              <div className="flex flex-wrap gap-1.5"><Button size="sm" variant="ghost" disabled={!manifest||rowBusy||Boolean(busyKey&& !rowBusy)} onClick={async()=>{setBusyKey(`pc:${pc.id}`);try{await runStationCommand(pc,UPDATE_COMMANDS.check)}catch(e){setError(e?.message||'Update check failed.')}finally{setBusyKey('')}}}>Check</Button><Button size="sm" variant="subtle" disabled={!manifest||rowBusy||Boolean(busyKey&& !rowBusy)} onClick={async()=>{setBusyKey(`pc:${pc.id}`);try{await runStationCommand(pc,UPDATE_COMMANDS.download)}catch(e){setError(e?.message||'Download command failed.')}finally{setBusyKey('')}}}>Download</Button><Button size="sm" disabled={!manifest||rowBusy||Boolean(busyKey&& !rowBusy)} onClick={async()=>{setBusyKey(`pc:${pc.id}`);try{await runStationCommand(pc,UPDATE_COMMANDS.idle)}catch(e){setError(e?.message||'Install command failed.')}finally{setBusyKey('')}}}>When idle</Button>{['queued','cancel_queued','waiting_idle','downloading','ready','available','error'].includes(String(pc.customerUpdateState||''))&&<button type="button" title="Cancel queued update" onClick={async()=>{setBusyKey(`pc:${pc.id}`);try{await runStationCommand(pc,UPDATE_COMMANDS.cancel)}catch(e){setError(e?.message||'Cancel command failed.')}finally{setBusyKey('')}}} className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-surface-line text-slate-soft hover:text-ember-dim"><XCircle size={14}/></button>}</div>
            </div>
          }):<div className="px-4 py-8 text-center text-xs text-slate-soft">No Customer Stations are registered in this branch.</div>}
        </div>
      </section>

      <div className="flex gap-3 rounded-xl border border-teal/20 bg-teal/5 p-3 text-[11px] leading-5 text-slate-soft"><CheckCircle2 className="mt-0.5 shrink-0 text-teal-dim" size={16}/><p><b className="text-ink-900">Session protection:</b> Customer Station downloads can happen in the background, but installation is blocked while a member/guest session, paused paid session, session-start transition, or protected kiosk state is active. “When idle” installs only after the station safely returns to the login screen.</p></div>
    </div>
  </Modal>
}
