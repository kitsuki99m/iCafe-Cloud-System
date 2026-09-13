import { useEffect, useMemo, useState } from 'react'
import {
  Ban,
  Building2,
  CalendarClock,
  Check,
  Clock3,
  Copy,
  Link2,
  LogOut,
  Mail,
  MapPin,
  Monitor,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRoundCheck,
  UserX,
  X,
} from 'lucide-react'
import { cloudDeveloperRegistrations } from '../lib/cloudClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import Button from '../components/common/Button.jsx'
import { SUBSCRIPTION_PACKAGES, packageDefinition, packageForStations } from '../lib/subscriptionPackages.js'

const FILTERS=['all','pending','reviewing','needs_info','approved','invited','invite_cancelled','activated','rejected']
const labels={all:'All',pending:'Pending',reviewing:'Reviewing',needs_info:'Needs info',approved:'Approved',invited:'Invited',invite_cancelled:'Invite cancelled',activated:'Active',rejected:'Rejected'}
const businessLabels={active:'Active',grace_period:'Grace period',suspended:'Suspended',terminated:'Terminated'}
function badge(status){return status==='activated'?'bg-teal/10 text-teal-dim':status==='rejected'||status==='invite_cancelled'?'bg-ember/10 text-ember-dim':status==='invited'?'bg-gold/12 text-gold-dim':'bg-midnight/7 text-slate-soft'}
function businessBadge(status){return status==='active'?'bg-teal/10 text-teal-dim':status==='grace_period'?'bg-gold/12 text-gold-dim':status==='suspended'||status==='terminated'?'bg-ember/10 text-ember-dim':'bg-midnight/7 text-slate-soft'}
function formatDate(value){return value?new Date(value).toLocaleString():'—'}

const ACTION_COPY={
  cancel_invite:{title:'Cancel invitation',description:'The outstanding owner invitation and provisional Cloud tenant will be removed. The applicant can be reviewed and invited again later.',confirm:'Cancel invitation',variant:'danger'},
  grace_period:{title:'Start grace period',description:'Cloud access remains available during the grace period. The default grace period is 7 days.',confirm:'Start grace period',variant:'primary'},
  suspend:{title:'Suspend Cloud access',description:'Cloud Admin access and Cloud commands will be blocked. The café local Edge and Customer Stations will continue operating locally.',confirm:'Suspend business',variant:'danger'},
  reactivate:{title:'Reactivate business',description:'Restore Cloud Admin access for this business.',confirm:'Reactivate',variant:'primary',reasonOptional:true},
  terminate:{title:'Terminate business',description:'Cloud access is terminated, active Cloud Edge credentials are revoked, and queued Cloud commands are cancelled. Local café operation is not remotely shut down.',confirm:'Terminate business',variant:'danger'},
  delete_owner:{title:'Delete owner login',description:'Permanently remove the business owner Auth account. This is allowed only after termination. Business records are retained.',confirm:'Delete owner login',variant:'danger'},
  purge_business:{title:'Permanently delete business data',description:'This permanently deletes the Cloud organization and its tenant data after the 30-day retention period. The registration and developer audit trail are retained.',confirm:'Permanently delete',variant:'danger',requireName:true},
}

export default function DeveloperConsolePage({standalone=false}){
  const{logout}=useAuth()
  const[items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState('pending'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[notes,setNotes]=useState(''),[busy,setBusy]=useState(''),[activationLink,setActivationLink]=useState(''),[confirm,setConfirm]=useState(null),[confirmReason,setConfirmReason]=useState(''),[confirmName,setConfirmName]=useState(''),[subscriptionPlan,setSubscriptionPlan]=useState('bronze'),[ultraStationLimit,setUltraStationLimit]=useState('500')

  async function load(){setLoading(true);setError('');try{const r=await cloudDeveloperRegistrations('list');setItems(r.requests||[]);if(selected){const next=(r.requests||[]).find(x=>x.id===selected.id);setSelected(next||null)}}catch(e){setError(e.message||'Unable to load registration requests.')}finally{setLoading(false)}}
  useEffect(()=>{load()},[])
  useEffect(()=>{
    if(!selected)return
    const suggested=packageForStations(selected.expected_station_count||1)
    const next=String(selected.subscription_plan||suggested.id).toLowerCase()
    setSubscriptionPlan(next)
    setUltraStationLimit(String(next==='ultra'?(selected.subscription_max_stations||Math.max(501,Number(selected.expected_station_count)||501)):(selected.subscription_max_stations||packageDefinition(next).maxStations||500)))
  },[selected?.id,selected?.subscription_plan,selected?.subscription_max_stations,selected?.expected_station_count])
  const counts=useMemo(()=>items.reduce((acc,item)=>({...acc,[item.status]:(acc[item.status]||0)+1}),{}),[items])
  const visible=useMemo(()=>items.filter(item=>(filter==='all'||item.status===filter)&&(!query.trim()||`${item.business_name} ${item.owner_name} ${item.email} ${item.location||''} ${item.organization_status||''}`.toLowerCase().includes(query.trim().toLowerCase()))),[items,filter,query])

  async function act(action,payload={}){
    if(!selected||busy)return null
    setBusy(action);setError('');setNotice('')
    try{
      const result=await cloudDeveloperRegistrations(action,{requestId:selected.id,reviewNotes:notes.trim()||null,...payload})
      if(result?.emailSent){setActivationLink('');setNotice(result.resent?`Activation email resent automatically to ${result.email||selected.email}.`:`Invitation email sent automatically to ${result.email||selected.email}.`)}else if(result?.activationLink){setActivationLink(result.activationLink);setNotice('Manual activation link generated. Use it only if email delivery is unavailable.')}
      setNotes('');await load();return result
    }catch(e){setError(e.message||'Unable to update application.');return null}
    finally{setBusy('')}
  }

  async function copyActivationLink(){
    const result=await act('copy_activation_link')
    const link=result?.activationLink
    if(!link)return
    try{await navigator.clipboard.writeText(link);setNotice('Activation link copied to clipboard.')}catch{setNotice('Activation link generated. Copy it manually below.')}
  }

  async function saveSubscription(){
    const ultraLimit=Math.floor(Number(ultraStationLimit))
    if(subscriptionPlan==='ultra'&&(!Number.isInteger(ultraLimit)||ultraLimit<1||ultraLimit>10000)){setError('Ultra station limit must be between 1 and 10,000.');return}
    const result=await act('set_subscription',{subscriptionPlan,ultraStationLimit:subscriptionPlan==='ultra'?ultraLimit:undefined})
    if(result?.subscription)setNotice(`${packageDefinition(result.subscription.plan).label} package saved · ${result.subscription.max_stations} station limit.`)
  }

  function openConfirm(action){setConfirm(action);setConfirmReason('');setConfirmName('');setError('')}
  async function runConfirmed(){
    const spec=ACTION_COPY[confirm]
    if(!spec||busy)return
    if(!spec.reasonOptional&&!confirmReason.trim()){setError('Enter a reason before continuing.');return}
    if(spec.requireName&&confirmName.trim()!==selected?.business_name){setError('Type the exact business name to confirm permanent deletion.');return}
    const result=await act(confirm,{reviewNotes:confirmReason.trim()||null,confirmBusinessName:confirmName.trim()||undefined})
    if(result){setConfirm(null);setConfirmReason('');setConfirmName('')}
  }

  const orgStatus=selected?.organization_status
  const purgeReady=Boolean(selected?.purge_eligible_at&&Date.now()>=new Date(selected.purge_eligible_at).getTime())
  const content=<div className={standalone?'developer-console-page developer-console-standalone':'developer-console-page'}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="eyebrow">Platform access</p><h1 className="font-display text-xl font-semibold text-ink-900 sm:text-2xl">Developer approvals</h1><p className="mt-1 max-w-2xl text-xs leading-5 text-slate-soft">Approve owners, control billing lifecycle, and preserve local café operation even when Cloud access is suspended.</p></div>
      <div className="flex w-full gap-2 sm:w-auto"><Button className="flex-1 sm:flex-none" variant="ghost" size="sm" icon={RefreshCw} onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</Button>{standalone&&<Button className="flex-1 sm:flex-none" variant="ghost" size="sm" icon={LogOut} onClick={logout}>Sign out</Button>}</div>
    </div>
    {error&&<div className="rounded-xl border border-ember/25 bg-ember/10 px-3 py-2.5 text-xs text-ember-dim">{error}</div>}
    {notice&&<div className="rounded-xl border border-teal/20 bg-teal/5 px-3 py-2.5 text-xs text-teal-dim">{notice}</div>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {[['pending','Pending',Clock3],['reviewing','Reviewing',ShieldCheck],['invited','Invited',Mail],['activated','Active',UserRoundCheck]].map(([key,label,Icon])=><div key={key} className="rounded-2xl border border-surface-line bg-surface p-3 sm:p-4"><Icon size={17} className="text-gold-dim"/><p className="mt-2 text-xl font-semibold text-ink-900 sm:mt-3 sm:text-2xl">{counts[key]||0}</p><p className="text-[11px] text-slate-soft">{label}</p></div>)}
    </div>
    <div className="grid min-h-[520px] gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
      <section className="min-w-0 rounded-2xl border border-surface-line bg-surface p-3 sm:p-4">
        <div className="relative min-w-0 flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-soft"/><input value={query} onChange={e=>setQuery(e.target.value)} className="min-h-11 w-full rounded-xl border border-surface-line bg-soft-white pl-9 pr-3 text-xs text-ink-900" placeholder="Search business, owner, email…"/></div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{FILTERS.map(key=><button key={key} onClick={()=>setFilter(key)} className={`min-h-9 shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold ${filter===key?'bg-midnight text-soft-white':'bg-midnight/6 text-slate-soft'}`}>{labels[key]} {key!=='all'&&counts[key]?`· ${counts[key]}`:''}</button>)}</div>
        <div className="mt-3 space-y-2 overflow-y-auto lg:max-h-[510px]">{visible.length?visible.map(item=><button key={item.id} onClick={()=>{const suggested=packageForStations(item.expected_station_count||1);const next=String(item.subscription_plan||suggested.id).toLowerCase();setSelected(item);setSubscriptionPlan(next);setUltraStationLimit(String(next==='ultra'?(item.subscription_max_stations||Math.max(501,Number(item.expected_station_count)||501)):(item.subscription_max_stations||packageDefinition(next).maxStations||500)));setNotes(item.review_notes||'');setActivationLink('');setNotice('')}} className={`w-full rounded-xl border p-3 text-left transition-colors ${selected?.id===item.id?'border-gold/50 bg-gold/5':'border-surface-line bg-surface-raised/35 hover:bg-surface-raised'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{item.business_name}</p><p className="mt-0.5 truncate text-[11px] text-slate-soft">{item.owner_name} · {item.email}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${badge(item.status)}`}>{labels[item.status]||item.status}</span></div><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-soft"><span>Submitted {formatDate(item.created_at)}</span>{item.organization_status&&<span className={`rounded-full px-2 py-0.5 font-semibold ${businessBadge(item.organization_status)}`}>{businessLabels[item.organization_status]||item.organization_status}</span>}</div></button>):<div className="flex min-h-40 items-center justify-center text-xs text-slate-soft">No applications in this view.</div>}</div>
      </section>

      <section className="min-w-0 rounded-2xl border border-surface-line bg-surface p-3 sm:p-4">{selected?<>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="eyebrow">Application</p><h2 className="mt-1 break-words font-display text-xl font-semibold text-ink-900">{selected.business_name}</h2></div><div className="flex flex-wrap gap-1.5"><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${badge(selected.status)}`}>{labels[selected.status]||selected.status}</span>{orgStatus&&<span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${businessBadge(orgStatus)}`}>{businessLabels[orgStatus]||orgStatus}</span>}</div></div>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{[[Building2,'Owner',selected.owner_name],[Mail,'Email',selected.email],[MapPin,'Location',selected.location||'—'],[Monitor,'Expected PCs',selected.expected_station_count||1]].map(([Icon,label,value])=><div key={label} className="flex min-w-0 items-center gap-3 rounded-xl bg-surface-raised/45 p-3"><Icon size={15} className="shrink-0 text-gold-dim"/><div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-slate-soft">{label}</p><p className="mt-0.5 break-words font-medium text-ink-900">{value}</p></div></div>)}</div>
        {selected.phone&&<p className="mt-3 text-xs text-slate-soft">Phone: <span className="text-ink-900">{selected.phone}</span></p>}{selected.note&&<div className="mt-3 rounded-xl border border-surface-line bg-soft-white p-3 text-xs leading-5 text-slate-soft">{selected.note}</div>}
        <div className="mt-3 rounded-xl border border-surface-line bg-surface-raised/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-ink-900">Subscription package</p><p className="mt-1 text-[10px] leading-4 text-slate-soft">Station caps apply across every branch in this business.</p></div>{selected.subscription_status&&<span className="rounded-full bg-midnight/7 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-soft">{selected.subscription_status}</span>}</div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">{SUBSCRIPTION_PACKAGES.map(pkg=><button type="button" key={pkg.id} onClick={()=>{setSubscriptionPlan(pkg.id);if(pkg.id==='ultra'&&Number(ultraStationLimit)<1)setUltraStationLimit(String(Math.max(501,Number(selected.expected_station_count)||501)))}} className={`rounded-xl border p-2.5 text-left transition-colors ${subscriptionPlan===pkg.id?'border-gold/55 bg-gold/10':'border-surface-line bg-soft-white hover:bg-surface-raised/60'}`}><p className={`text-xs font-semibold ${subscriptionPlan===pkg.id?'text-gold-dim':'text-ink-900'}`}>{pkg.label}</p><p className="mt-1 text-[10px] text-slate-soft">{pkg.maxStations===null?'Custom station count':`Up to ${pkg.maxStations} stations`}</p></button>)}</div>
          {subscriptionPlan==='ultra'&&<label className="mt-3 block"><span className="eyebrow mb-1.5 block">Ultra station limit</span><input type="number" min="1" max="10000" value={ultraStationLimit} onChange={e=>setUltraStationLimit(e.target.value)} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/><span className="mt-1 block text-[10px] text-slate-soft">Developer-defined organization-wide station allowance.</span></label>}
          {selected.organization_id&&<div className="mt-3 flex items-center justify-between gap-3"><p className="text-[10px] text-slate-soft">Current limit: <strong className="text-ink-900">{selected.subscription_max_stations||'—'} stations</strong>{selected.grace_until?` · grace until ${formatDate(selected.grace_until)}`:''}</p><Button size="sm" variant="subtle" disabled={Boolean(busy)} onClick={saveSubscription}>{busy==='set_subscription'?'Saving…':'Save package'}</Button></div>}
        </div>
        {selected.organization_reason&&<div className="mt-3 rounded-xl border border-ember/15 bg-ember/5 p-3 text-xs leading-5 text-slate-soft"><span className="font-semibold text-ink-900">Lifecycle reason:</span> {selected.organization_reason}</div>}
        <label className="mt-4 block"><span className="eyebrow mb-2 block">Developer notes</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-surface-line bg-soft-white p-3 text-xs text-ink-900" placeholder="Internal review note / information requested"/></label>

        {!['invited','activated'].includes(selected.status)&&<div className="mt-4 grid gap-2 sm:grid-cols-2"><Button variant="ghost" size="sm" icon={ShieldCheck} disabled={Boolean(busy)} onClick={()=>act('reviewing')}>{busy==='reviewing'?'Saving…':'Mark reviewing'}</Button><Button variant="ghost" size="sm" icon={Mail} disabled={Boolean(busy)} onClick={()=>act('needs_info')}>{busy==='needs_info'?'Saving…':'Needs info'}</Button><Button variant="danger" size="sm" icon={X} disabled={Boolean(busy)} onClick={()=>act('reject')}>{busy==='reject'?'Rejecting…':'Reject'}</Button><Button variant="primary" size="sm" icon={Check} disabled={Boolean(busy)||selected.status==='rejected'} onClick={()=>act('approve',{subscriptionPlan,ultraStationLimit:subscriptionPlan==='ultra'?Math.floor(Number(ultraStationLimit)):undefined})}>{busy==='approve'?'Approving…':'Approve & send invite'}</Button></div>}

        {selected.status==='invited'&&<div className="mt-4 space-y-3 rounded-xl border border-gold/25 bg-gold/5 p-3 text-xs leading-5 text-slate-soft"><p>Aezakmi-branded invitation sent automatically to <strong className="text-ink-900">{selected.email}</strong> {formatDate(selected.invite_sent_at)}. The owner opens the secure email link and sets their own password.</p><div className="grid gap-2 sm:grid-cols-3"><Button variant="primary" size="sm" icon={Mail} disabled={Boolean(busy)} onClick={()=>act('resend_invite')}>{busy==='resend_invite'?'Sending…':'Resend invite email'}</Button><Button variant="ghost" size="sm" icon={Link2} disabled={Boolean(busy)} onClick={copyActivationLink}>{busy==='copy_activation_link'?'Generating…':'Copy activation link'}</Button><Button variant="danger" size="sm" icon={Ban} disabled={Boolean(busy)} onClick={()=>openConfirm('cancel_invite')}>Cancel invite</Button></div></div>}
        {activationLink&&<div className="mt-3 rounded-xl border border-teal/20 bg-teal/5 p-3"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-semibold uppercase tracking-wide text-teal-dim">Manual activation link</p><button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-teal-dim hover:bg-teal/10" onClick={async()=>{try{await navigator.clipboard.writeText(activationLink);setNotice('Activation link copied to clipboard.')}catch{}}}><Copy size={13}/> Copy</button></div><input readOnly value={activationLink} onFocus={e=>e.currentTarget.select()} className="mt-2 min-h-10 w-full rounded-lg border border-teal/20 bg-soft-white px-3 text-[10px] text-ink-900"/></div>}
        {selected.status==='invite_cancelled'&&<div className="mt-4 rounded-xl border border-ember/20 bg-ember/5 p-3 text-xs leading-5 text-slate-soft">Invitation cancelled {formatDate(selected.invite_cancelled_at)}. The provisional Auth account and Cloud tenant were removed. Mark the request reviewing to invite again later.</div>}

        {selected.status==='activated'&&<div className="mt-4 space-y-3"><div className="rounded-xl border border-teal/25 bg-teal/5 p-3 text-xs leading-5 text-teal-dim">Business owner activated the approved account {formatDate(selected.activated_at)}.</div>
          <div className="rounded-xl border border-surface-line bg-surface-raised/30 p-3"><div className="flex items-center gap-2"><CalendarClock size={15} className="text-gold-dim"/><p className="text-xs font-semibold text-ink-900">Business lifecycle</p></div><p className="mt-1 text-[11px] leading-5 text-slate-soft">Billing controls affect Cloud access only. Suspending a business does not shut down its local café sessions.</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {orgStatus==='active'&&<><Button variant="ghost" size="sm" icon={CalendarClock} disabled={Boolean(busy)} onClick={()=>openConfirm('grace_period')}>Grace period</Button><Button variant="danger" size="sm" icon={Ban} disabled={Boolean(busy)} onClick={()=>openConfirm('suspend')}>Suspend Cloud</Button></>}
              {orgStatus==='grace_period'&&<><Button variant="primary" size="sm" icon={RotateCcw} disabled={Boolean(busy)} onClick={()=>openConfirm('reactivate')}>Reactivate</Button><Button variant="danger" size="sm" icon={Ban} disabled={Boolean(busy)} onClick={()=>openConfirm('suspend')}>Suspend Cloud</Button></>}
              {orgStatus==='suspended'&&<><Button variant="primary" size="sm" icon={RotateCcw} disabled={Boolean(busy)} onClick={()=>openConfirm('reactivate')}>Reactivate</Button><Button variant="danger" size="sm" icon={TriangleAlert} disabled={Boolean(busy)} onClick={()=>openConfirm('terminate')}>Terminate</Button></>}
              {['active','grace_period'].includes(orgStatus)&&<Button className="sm:col-span-2" variant="danger" size="sm" icon={TriangleAlert} disabled={Boolean(busy)} onClick={()=>openConfirm('terminate')}>Terminate business</Button>}
            </div>
          </div>
          {orgStatus==='terminated'&&<div className="rounded-xl border border-ember/25 bg-ember/5 p-3"><div className="flex items-center gap-2"><TriangleAlert size={15} className="text-ember-dim"/><p className="text-xs font-semibold text-ink-900">Terminated business</p></div><p className="mt-1 text-[11px] leading-5 text-slate-soft">Cloud Edge credentials are revoked. Business data remains retained until permanent deletion becomes eligible.</p><div className="mt-3 grid gap-2 sm:grid-cols-2"><Button variant="danger" size="sm" icon={UserX} disabled={Boolean(busy)||Boolean(selected.owner_deleted_at)||!selected.auth_user_id} onClick={()=>openConfirm('delete_owner')}>{selected.owner_deleted_at?'Owner login deleted':'Delete owner login'}</Button><Button variant="danger" size="sm" icon={Trash2} disabled={Boolean(busy)||!purgeReady||Boolean(selected.purged_at)} onClick={()=>openConfirm('purge_business')}>{selected.purged_at?'Data deleted':'Permanently delete data'}</Button></div>{!purgeReady&&selected.purge_eligible_at&&<p className="mt-2 text-[10px] text-slate-soft">Permanent deletion available after {formatDate(selected.purge_eligible_at)}.</p>}</div>}
        </div>}
      </>:<div className="flex min-h-[360px] flex-col items-center justify-center text-center lg:min-h-[520px]"><ShieldCheck size={26} className="text-gold-dim"/><p className="mt-3 text-sm font-semibold text-ink-900">Select an application</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-soft">Review registration, invitation, and business lifecycle controls.</p></div>}</section>
    </div>

    {confirm&&selected&&<div className="fixed inset-0 z-[120] flex items-end justify-center bg-midnight/55 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true"><div className="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl border border-surface-line bg-surface p-4 shadow-card sm:max-w-lg sm:rounded-2xl sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Developer action</p><h3 className="mt-1 font-display text-lg font-semibold text-ink-900">{ACTION_COPY[confirm]?.title}</h3></div><button type="button" onClick={()=>setConfirm(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-soft hover:bg-surface-raised" aria-label="Close"><X size={17}/></button></div><p className="mt-3 text-xs leading-5 text-slate-soft">{ACTION_COPY[confirm]?.description}</p><label className="mt-4 block"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-soft">{ACTION_COPY[confirm]?.reasonOptional?'Reason / note (optional)':'Reason (required)'}</span><textarea autoFocus value={confirmReason} onChange={e=>setConfirmReason(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-surface-line bg-soft-white p-3 text-xs text-ink-900" placeholder="Why are you performing this action?"/></label>{ACTION_COPY[confirm]?.requireName&&<label className="mt-3 block"><span className="text-[10px] font-semibold uppercase tracking-wide text-ember-dim">Type {selected.business_name} to confirm</span><input value={confirmName} onChange={e=>setConfirmName(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-ember/25 bg-soft-white px-3 text-xs text-ink-900"/></label>}<div className="mt-5 grid gap-2 sm:grid-cols-2"><Button variant="ghost" onClick={()=>setConfirm(null)} disabled={Boolean(busy)}>Cancel</Button><Button variant={ACTION_COPY[confirm]?.variant||'danger'} onClick={runConfirmed} disabled={Boolean(busy)}>{busy===confirm?'Working…':ACTION_COPY[confirm]?.confirm}</Button></div></div></div>}
  </div>

  if(standalone)return <main className="admin-app-canvas min-h-screen">{content}</main>
  return content
}
