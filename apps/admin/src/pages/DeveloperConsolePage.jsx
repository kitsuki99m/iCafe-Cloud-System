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
  Send,
  Settings2,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  UserRoundCheck,
  UserX,
  X,
} from 'lucide-react'
import { cloudDeveloperRegistrations } from '../lib/cloudClient.js'
import { readSnapshot, writeSnapshot } from '../lib/localCache.js'
import { userCacheKey } from '../lib/pageCache.js'
import { useAuth } from '../context/AuthContext.jsx'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import { SUBSCRIPTION_PACKAGES, formatPackagePrice, normalizeSubscriptionPackages, packageDefinition, packageForStations } from '../lib/subscriptionPackages.js'

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
  const{logout,user}=useAuth()
  const[items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState(''),[filter,setFilter]=useState('pending'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[notes,setNotes]=useState(''),[busy,setBusy]=useState(''),[activationLink,setActivationLink]=useState(''),[confirm,setConfirm]=useState(null),[confirmReason,setConfirmReason]=useState(''),[confirmName,setConfirmName]=useState(''),[subscriptionPlan,setSubscriptionPlan]=useState('bronze'),[ultraStationLimit,setUltraStationLimit]=useState('51')
  const[packageCatalog,setPackageCatalog]=useState(SUBSCRIPTION_PACKAGES),[pricingSettings,setPricingSettings]=useState({deployment_fee_min:2500,deployment_fee_max:5000,quote_valid_days:14}),[emailDelivery,setEmailDelivery]=useState(null),[pricingOpen,setPricingOpen]=useState(false),[pricingDraft,setPricingDraft]=useState([]),[pricingSettingsDraft,setPricingSettingsDraft]=useState({deploymentFeeMin:'2500',deploymentFeeMax:'5000',quoteValidDays:'14'})
  const[quoteOpen,setQuoteOpen]=useState(false),[quoteDraft,setQuoteDraft]=useState({packageId:'bronze',stationCount:'1',branchCount:'1',monthlyPrice:'499',deploymentFeePerBranch:'2500',validDays:'14',message:''})
  const ultraFloor=Math.max(1,Number(packageDefinition('gold',packageCatalog).maxStations||50)+1)
  const developerCacheKey=useMemo(()=>userCacheKey('developer-console',user),[user])

  function applyDeveloperSnapshot(snapshot){if(!snapshot)return;setItems(snapshot.requests||[]);if(snapshot.packageCatalog)setPackageCatalog(normalizeSubscriptionPackages(snapshot.packageCatalog));if(snapshot.pricingSettings)setPricingSettings(snapshot.pricingSettings);if(snapshot.emailDelivery)setEmailDelivery(snapshot.emailDelivery)}
  async function load(){setLoading(true);setError('');try{const r=await cloudDeveloperRegistrations('list');const requests=r.requests||[];const snapshot={requests,packageCatalog:r.packageCatalog||SUBSCRIPTION_PACKAGES,pricingSettings:r.pricingSettings||{deployment_fee_min:2500,deployment_fee_max:5000,quote_valid_days:14},emailDelivery:r.emailDelivery||null};applyDeveloperSnapshot(snapshot);if(developerCacheKey)void writeSnapshot(developerCacheKey,snapshot);setSelected(current=>current?(requests.find(x=>x.id===current.id)||null):current)}catch(e){setError(e.message||'Unable to load registration requests. Showing cached data when available.')}finally{setLoading(false)}}
  useEffect(()=>{let active=true;if(developerCacheKey)void readSnapshot(developerCacheKey).then(snapshot=>{if(active&&snapshot){applyDeveloperSnapshot(snapshot);setLoading(false)}}).finally(()=>{if(active)void load()});else void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},300000);const onOnline=()=>void load();const onVisible=()=>{if(document.visibilityState==='visible')void load()};window.addEventListener('online',onOnline);document.addEventListener('visibilitychange',onVisible);return()=>{active=false;clearInterval(timer);window.removeEventListener('online',onOnline);document.removeEventListener('visibilitychange',onVisible)}},[developerCacheKey])
  useEffect(()=>{
    if(!selected)return
    const suggested=packageForStations(selected.expected_station_count||1,packageCatalog)
    const next=String(selected.subscription_plan||suggested.id).toLowerCase()
    setSubscriptionPlan(next)
    setUltraStationLimit(String(next==='ultra'?Math.max(ultraFloor,Number(selected.subscription_max_stations)||0,Number(selected.expected_station_count)||0):(selected.subscription_max_stations||packageDefinition(next,packageCatalog).maxStations||50)))
  },[selected?.id,selected?.subscription_plan,selected?.subscription_max_stations,selected?.expected_station_count,packageCatalog])
  const counts=useMemo(()=>items.reduce((acc,item)=>({...acc,[item.status]:(acc[item.status]||0)+1}),{}),[items])
  const visible=useMemo(()=>items.filter(item=>(filter==='all'||item.status===filter)&&(!query.trim()||`${item.business_name} ${item.owner_name} ${item.email} ${item.location||''} ${item.organization_status||''}`.toLowerCase().includes(query.trim().toLowerCase()))),[items,filter,query])

  async function act(action,payload={}){
    if(!selected||busy)return null
    setBusy(action);setError('');setNotice('')
    try{
      const result=await cloudDeveloperRegistrations(action,{requestId:selected.id,reviewNotes:notes.trim()||null,...payload})
      if(action==='send_quote'&&result?.emailSent){setActivationLink('');setNotice(`Quotation ${result.quotation?.quote_number||''} sent to ${result.email||selected.email}.`)}else if(result?.emailSent){setActivationLink('');setNotice(result.resent?`Activation email resent to ${result.email||selected.email}.`:`Invitation email sent automatically to ${result.email||selected.email}.`)}else if(result?.activationLink){setActivationLink(result.activationLink);setNotice('Manual activation link generated. Use it only if email delivery is unavailable.')}
      setNotes('');await load();return result
    }catch(e){setError(e.message||'Unable to update application.');return null}
    finally{setBusy('')}
  }

  async function testEmail(){
    if(busy)return
    setBusy('test_email');setError('');setNotice('')
    try{const result=await cloudDeveloperRegistrations('test_email');setNotice(`Email check sent to ${result.email}.`);await load()}catch(e){setError(e.message||'Unable to send test email.')}finally{setBusy('')}
  }

  async function copyActivationLink(){
    const result=await act('copy_activation_link')
    const link=result?.activationLink
    if(!link)return
    try{await navigator.clipboard.writeText(link);setNotice('Activation link copied to clipboard.')}catch{setNotice('Activation link generated. Copy it manually below.')}
  }

  function validatedUltraLimit(){
    const ultraLimit=Math.floor(Number(ultraStationLimit))
    if(subscriptionPlan==='ultra'&&(!Number.isInteger(ultraLimit)||ultraLimit<ultraFloor||ultraLimit>10000)){setError(`Ultra station limit must be between ${ultraFloor} and 10,000.`);return null}
    return ultraLimit
  }
  async function saveSubscription(){
    const ultraLimit=validatedUltraLimit()
    if(subscriptionPlan==='ultra'&&ultraLimit==null)return
    const result=await act('set_subscription',{subscriptionPlan,ultraStationLimit:subscriptionPlan==='ultra'?ultraLimit:undefined})
    if(result?.subscription)setNotice(`${packageDefinition(result.subscription.plan,packageCatalog).label} package saved · ${result.subscription.max_stations} station limit.`)
  }
  async function approveSelected(){
    const ultraLimit=validatedUltraLimit()
    if(subscriptionPlan==='ultra'&&ultraLimit==null)return
    await act('approve',{subscriptionPlan,ultraStationLimit:subscriptionPlan==='ultra'?ultraLimit:undefined})
  }


  function openPricingEditor(){
    setPricingDraft(packageCatalog.map(pkg=>({...pkg,maxStations:pkg.maxStations==null?'':String(pkg.maxStations),monthlyPrice:String(pkg.monthlyPrice??0),description:pkg.description||''})))
    setPricingSettingsDraft({deploymentFeeMin:String(pricingSettings.deployment_fee_min??2500),deploymentFeeMax:String(pricingSettings.deployment_fee_max??5000),quoteValidDays:String(pricingSettings.quote_valid_days??14)})
    setPricingOpen(true);setError('')
  }
  async function savePricingEditor(){
    if(busy)return
    setBusy('save_pricing');setError('');setNotice('')
    try{
      const fixedCaps=Object.fromEntries(pricingDraft.filter(pkg=>pkg.id!=='ultra').map(pkg=>[pkg.id,Math.floor(Number(pkg.maxStations))]))
      if(!(fixedCaps.bronze>=1&&fixedCaps.bronze<fixedCaps.silver&&fixedCaps.silver<fixedCaps.gold))throw new Error('PC limits must increase from Bronze to Silver to Gold.')
      const deploymentMin=Number(pricingSettingsDraft.deploymentFeeMin),deploymentMax=Number(pricingSettingsDraft.deploymentFeeMax),quoteDays=Math.floor(Number(pricingSettingsDraft.quoteValidDays))
      if(!Number.isFinite(deploymentMin)||deploymentMin<0||!Number.isFinite(deploymentMax)||deploymentMax<deploymentMin)throw new Error('Deployment fee range is invalid.')
      if(!Number.isInteger(quoteDays)||quoteDays<1||quoteDays>90)throw new Error('Quote validity must be between 1 and 90 days.')
      const packages=pricingDraft.map(pkg=>{
        const maxStations=pkg.id==='ultra'?null:Math.floor(Number(pkg.maxStations))
        if(pkg.id!=='ultra'&&(!Number.isInteger(maxStations)||maxStations<1||maxStations>10000))throw new Error(`${pkg.label} PC limit must be between 1 and 10,000.`)
        const monthlyPrice=Number(pkg.monthlyPrice)
        if(!Number.isFinite(monthlyPrice)||monthlyPrice<0||monthlyPrice>1000000)throw new Error(`${pkg.label} monthly price is invalid.`)
        return {id:pkg.id,maxStations,monthlyPrice,description:pkg.description||null}
      })
      const result=await cloudDeveloperRegistrations('update_pricing_catalog',{packages,deploymentFeeMin:deploymentMin,deploymentFeeMax:deploymentMax,quoteValidDays:quoteDays})
      if(result?.packageCatalog)setPackageCatalog(normalizeSubscriptionPackages(result.packageCatalog))
      if(result?.pricingSettings)setPricingSettings(result.pricingSettings)
      await load();setPricingOpen(false);setNotice('Pricing catalog updated.')
    }catch(e){setError(e.message||'Unable to save pricing.')}finally{setBusy('')}
  }
  function openQuote(){
    if(!selected)return
    const suggested=packageForStations(selected.expected_station_count||1,packageCatalog)
    const pkg=packageDefinition(selected.subscription_plan||suggested.id,packageCatalog)
    const stationCount=pkg.id==='ultra'?Math.max(ultraFloor,Number(selected.expected_station_count)||ultraFloor):Math.max(1,Number(selected.expected_station_count)||1)
    setQuoteDraft({packageId:pkg.id,stationCount:String(stationCount),branchCount:'1',monthlyPrice:String(pkg.monthlyPrice??0),deploymentFeePerBranch:String(pricingSettings.deployment_fee_min??2500),validDays:String(pricingSettings.quote_valid_days??14),message:''})
    setQuoteOpen(true);setError('')
  }
  function setQuotePackage(packageId){
    const pkg=packageDefinition(packageId,packageCatalog)
    setQuoteDraft(current=>({...current,packageId:pkg.id,monthlyPrice:String(pkg.monthlyPrice??0),stationCount:pkg.id==='ultra'?String(Math.max(ultraFloor,Number(current.stationCount)||ultraFloor)):current.stationCount}))
  }
  async function sendQuote(){
    const stationCount=Math.floor(Number(quoteDraft.stationCount)),branchCount=Math.floor(Number(quoteDraft.branchCount)),monthlyPrice=Number(quoteDraft.monthlyPrice),deploymentFeePerBranch=Number(quoteDraft.deploymentFeePerBranch),validDays=Math.floor(Number(quoteDraft.validDays))
    if(!Number.isInteger(stationCount)||stationCount<1||stationCount>10000){setError('Quotation PC count must be between 1 and 10,000.');return}
    if(quoteDraft.packageId==='ultra'&&stationCount<ultraFloor){setError(`Ultra quotations require at least ${ultraFloor} PCs.`);return}
    if(!Number.isInteger(branchCount)||branchCount<1||branchCount>1000){setError('Quotation branch count must be between 1 and 1,000.');return}
    if(!Number.isInteger(validDays)||validDays<1||validDays>90){setError('Quotation validity must be between 1 and 90 days.');return}
    if(!Number.isFinite(monthlyPrice)||monthlyPrice<0||!Number.isFinite(deploymentFeePerBranch)||deploymentFeePerBranch<0){setError('Quotation pricing is invalid.');return}
    const result=await act('send_quote',{subscriptionPlan:quoteDraft.packageId,ultraStationLimit:quoteDraft.packageId==='ultra'?stationCount:undefined,stationCount,branchCount,monthlyPrice,deploymentFeePerBranch,validDays,message:quoteDraft.message})
    if(result){setQuoteOpen(false)}
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
      <div><p className="eyebrow">Platform access</p><h1 className="font-display text-xl font-semibold text-ink-900 sm:text-2xl">Developer approvals</h1></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button className="flex-1 sm:flex-none" variant="ghost" size="sm" icon={Settings2} onClick={openPricingEditor}>Pricing</Button><Button className="flex-1 sm:flex-none" variant="ghost" size="sm" icon={Mail} onClick={testEmail} disabled={Boolean(busy)}>{busy==='test_email'?'Sending…':'Email check'}</Button><Button className="flex-1 sm:flex-none" variant="ghost" size="sm" icon={RefreshCw} onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</Button>{standalone&&<Button className="flex-1 sm:flex-none" variant="ghost" size="sm" icon={LogOut} onClick={logout}>Sign out</Button>}</div>
    </div>
    {error&&<div className="rounded-xl border border-ember/25 bg-ember/10 px-3 py-2.5 text-xs text-ember-dim">{error}</div>}
    {notice&&<div className="rounded-xl border border-teal/20 bg-teal/5 px-3 py-2.5 text-xs text-teal-dim">{notice}</div>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
      {[['pending','Pending',Clock3],['reviewing','Reviewing',ShieldCheck],['invited','Invited',Mail],['activated','Active',UserRoundCheck]].map(([key,label,Icon])=><div key={key} className="rounded-2xl border border-surface-line bg-surface p-3 sm:p-4"><Icon size={17} className="text-gold-dim"/><p className="mt-2 text-xl font-semibold text-ink-900 sm:mt-3 sm:text-2xl">{counts[key]||0}</p><p className="text-[11px] text-slate-soft">{label}</p></div>)}
    </div>
    <div className="grid min-h-[520px] items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
      <section className="min-w-0 rounded-2xl border border-surface-line bg-surface p-3 sm:p-4 lg:sticky lg:top-4 lg:self-start lg:flex lg:max-h-[calc(100dvh-120px)] lg:flex-col lg:overflow-hidden">
        <div className="relative min-w-0 flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-soft"/><input value={query} onChange={e=>setQuery(e.target.value)} className="min-h-11 w-full rounded-xl border border-surface-line bg-soft-white pl-9 pr-3 text-xs text-ink-900" placeholder="Search business, owner, email…"/></div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{FILTERS.map(key=><button key={key} onClick={()=>setFilter(key)} className={`min-h-9 shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold ${filter===key?'bg-midnight text-soft-white':'bg-midnight/6 text-slate-soft'}`}>{labels[key]} {key!=='all'&&counts[key]?`· ${counts[key]}`:''}</button>)}</div>
        <div className="mt-3 space-y-2 overflow-y-auto lg:min-h-0 lg:flex-1 lg:max-h-none">{visible.length?visible.map(item=><button key={item.id} onClick={()=>{const suggested=packageForStations(item.expected_station_count||1,packageCatalog);const next=String(item.subscription_plan||suggested.id).toLowerCase();setSelected(item);setSubscriptionPlan(next);setUltraStationLimit(String(next==='ultra'?Math.max(ultraFloor,Number(item.subscription_max_stations)||0,Number(item.expected_station_count)||0):(item.subscription_max_stations||packageDefinition(next,packageCatalog).maxStations||50)));setNotes(item.review_notes||'');setActivationLink('');setNotice('')}} className={`w-full rounded-xl border p-3 text-left transition-colors ${selected?.id===item.id?'border-gold/50 bg-gold/5':'border-surface-line bg-surface-raised/35 hover:bg-surface-raised'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{item.business_name}</p><p className="mt-0.5 truncate text-[11px] text-slate-soft">{item.owner_name} · {item.email}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${badge(item.status)}`}>{labels[item.status]||item.status}</span></div><div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-soft"><span>Submitted {formatDate(item.created_at)}</span>{item.organization_status&&<span className={`rounded-full px-2 py-0.5 font-semibold ${businessBadge(item.organization_status)}`}>{businessLabels[item.organization_status]||item.organization_status}</span>}</div></button>):<div className="flex min-h-40 items-center justify-center text-xs text-slate-soft">No applications in this view.</div>}</div>
      </section>

      <section className="min-w-0 rounded-2xl border border-surface-line bg-surface p-3 sm:p-4">{selected?<>
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="eyebrow">Application</p><h2 className="mt-1 break-words font-display text-xl font-semibold text-ink-900">{selected.business_name}</h2></div><div className="flex flex-wrap gap-1.5"><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${badge(selected.status)}`}>{labels[selected.status]||selected.status}</span>{orgStatus&&<span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${businessBadge(orgStatus)}`}>{businessLabels[orgStatus]||orgStatus}</span>}</div></div>
        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{[[Building2,'Owner',selected.owner_name],[Mail,'Email',selected.email],[MapPin,'Location',selected.location||'—'],[Monitor,'Expected PCs',selected.expected_station_count||1]].map(([Icon,label,value])=><div key={label} className="flex min-w-0 items-center gap-3 rounded-xl bg-surface-raised/45 p-3"><Icon size={15} className="shrink-0 text-gold-dim"/><div className="min-w-0"><p className="text-[9px] uppercase tracking-wide text-slate-soft">{label}</p><p className="mt-0.5 break-words font-medium text-ink-900">{value}</p></div></div>)}</div>
        {selected.phone&&<p className="mt-3 text-xs text-slate-soft">Phone: <span className="text-ink-900">{selected.phone}</span></p>}{selected.note&&<div className="mt-3 rounded-xl border border-surface-line bg-soft-white p-3 text-xs leading-5 text-slate-soft">{selected.note}</div>}
        <div className="mt-3 rounded-xl border border-surface-line bg-surface-raised/40 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-ink-900">Subscription package</p></div>{selected.subscription_status&&<span className="rounded-full bg-midnight/7 px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-slate-soft">{selected.subscription_status}</span>}</div>
          <div className="mt-3 grid grid-cols-2 gap-2">{packageCatalog.map(pkg=><button type="button" key={pkg.id} onClick={()=>{setSubscriptionPlan(pkg.id);if(pkg.id==='ultra'&&Number(ultraStationLimit)<ultraFloor)setUltraStationLimit(String(Math.max(ultraFloor,Number(selected.expected_station_count)||ultraFloor)))}} className={`rounded-xl border p-2.5 text-left transition-colors ${subscriptionPlan===pkg.id?'border-gold/55 bg-gold/10':'border-surface-line bg-soft-white hover:bg-surface-raised/60'}`}><p className={`text-xs font-semibold ${subscriptionPlan===pkg.id?'text-gold-dim':'text-ink-900'}`}>{pkg.label}</p><p className="mt-1 text-[10px] text-slate-soft">{pkg.maxStations===null?`${ultraFloor}+ PCs · custom cap`:`Up to ${pkg.maxStations} PCs`} · {formatPackagePrice(pkg)}</p></button>)}</div>
          {subscriptionPlan==='ultra'&&<label className="mt-3 block"><span className="eyebrow mb-1.5 block">Ultra station limit</span><input type="number" min={ultraFloor} max="10000" value={ultraStationLimit} onChange={e=>setUltraStationLimit(e.target.value)} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/><span className="mt-1 block text-[10px] text-slate-soft">Developer-defined organization-wide station allowance.</span></label>}
          {selected.organization_id&&<div className="mt-3 flex items-center justify-between gap-3"><p className="text-[10px] text-slate-soft">Current limit: <strong className="text-ink-900">{selected.subscription_max_stations||'—'} stations</strong>{selected.grace_until?` · grace until ${formatDate(selected.grace_until)}`:''}</p><Button size="sm" variant="subtle" disabled={Boolean(busy)} onClick={saveSubscription}>{busy==='set_subscription'?'Saving…':'Save package'}</Button></div>}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/20 bg-gold/5 p-3"><div><p className="text-xs font-semibold text-ink-900">Customer quotation</p></div><Button variant="subtle" size="sm" icon={Send} disabled={Boolean(busy)} onClick={openQuote}>Send quotation</Button></div>
        {selected.organization_reason&&<div className="mt-3 rounded-xl border border-ember/15 bg-ember/5 p-3 text-xs leading-5 text-slate-soft"><span className="font-semibold text-ink-900">Lifecycle reason:</span> {selected.organization_reason}</div>}
        <label className="mt-4 block"><span className="eyebrow mb-2 block">Developer notes</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-surface-line bg-soft-white p-3 text-xs text-ink-900" placeholder="Internal review note / information requested"/></label>

        {!['invited','activated'].includes(selected.status)&&<div className="mt-4 grid gap-2 sm:grid-cols-2"><Button variant="ghost" size="sm" icon={ShieldCheck} disabled={Boolean(busy)} onClick={()=>act('reviewing')}>{busy==='reviewing'?'Saving…':'Mark reviewing'}</Button><Button variant="ghost" size="sm" icon={Mail} disabled={Boolean(busy)} onClick={()=>act('needs_info')}>{busy==='needs_info'?'Saving…':'Needs info'}</Button><Button variant="danger" size="sm" icon={X} disabled={Boolean(busy)} onClick={()=>act('reject')}>{busy==='reject'?'Rejecting…':'Reject'}</Button><Button variant="primary" size="sm" icon={Check} disabled={Boolean(busy)||selected.status==='rejected'} onClick={approveSelected}>{busy==='approve'?'Approving…':'Approve & send invite'}</Button></div>}

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
      </>:<div className="flex min-h-[360px] flex-col items-center justify-center text-center lg:min-h-[520px]"><ShieldCheck size={26} className="text-gold-dim"/><p className="mt-3 text-sm font-semibold text-ink-900">Select an application</p></div>}</section>
    </div>

    <Modal open={pricingOpen} onClose={()=>!busy&&setPricingOpen(false)} busy={busy==='save_pricing'} maxWidth="max-w-3xl" eyebrow="Platform pricing" title="Aezakmi packages & deployment pricing" footer={<><Button variant="ghost" disabled={Boolean(busy)} onClick={()=>setPricingOpen(false)}>Cancel</Button><Button variant="primary" disabled={Boolean(busy)} onClick={savePricingEditor}>{busy==='save_pricing'?'Saving…':'Save pricing'}</Button></>}>
      <div className="space-y-4"><p className="text-xs leading-5 text-slate-soft">Defaults for new quotations only.</p><div className="grid gap-3 sm:grid-cols-2">{pricingDraft.map((pkg,index)=><div key={pkg.id} className="rounded-xl border border-surface-line bg-surface-raised/35 p-3"><div className="flex items-center justify-between gap-2"><p className="text-sm font-semibold text-ink-900">{pkg.label}</p><span className="rounded-full bg-gold/10 px-2 py-1 text-[9px] font-semibold uppercase text-gold-dim">{pkg.id}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2"><label><span className="eyebrow mb-1 block">Monthly ₱</span><input type="number" min="0" max="1000000" value={pkg.monthlyPrice} onChange={e=>setPricingDraft(rows=>rows.map((row,i)=>i===index?{...row,monthlyPrice:e.target.value}:row))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/></label><label><span className="eyebrow mb-1 block">PC limit</span>{pkg.id==='ultra'?<div className="flex min-h-10 items-center rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-slate-soft">{ultraFloor}+ · custom per business</div>:<input type="number" min="1" max="10000" value={pkg.maxStations} onChange={e=>setPricingDraft(rows=>rows.map((row,i)=>i===index?{...row,maxStations:e.target.value}:row))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/>}</label></div><label className="mt-2 block"><span className="eyebrow mb-1 block">Description</span><input value={pkg.description||''} onChange={e=>setPricingDraft(rows=>rows.map((row,i)=>i===index?{...row,description:e.target.value}:row))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/></label></div>)}</div><div className="rounded-xl border border-surface-line bg-surface-raised/35 p-3"><p className="text-xs font-semibold text-ink-900">Initial deployment & quotation defaults</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><label><span className="eyebrow mb-1 block">Minimum / branch ₱</span><input type="number" min="0" max="1000000" value={pricingSettingsDraft.deploymentFeeMin} onChange={e=>setPricingSettingsDraft(v=>({...v,deploymentFeeMin:e.target.value}))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/></label><label><span className="eyebrow mb-1 block">Maximum / branch ₱</span><input type="number" min="0" max="1000000" value={pricingSettingsDraft.deploymentFeeMax} onChange={e=>setPricingSettingsDraft(v=>({...v,deploymentFeeMax:e.target.value}))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/></label><label><span className="eyebrow mb-1 block">Quote valid days</span><input type="number" min="1" max="90" value={pricingSettingsDraft.quoteValidDays} onChange={e=>setPricingSettingsDraft(v=>({...v,quoteValidDays:e.target.value}))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/></label></div></div></div>
    </Modal>

    <Modal open={quoteOpen&&Boolean(selected)} onClose={()=>!busy&&setQuoteOpen(false)} busy={busy==='send_quote'} maxWidth="max-w-2xl" eyebrow="Aezakmi quotation" title={`Send quote to ${selected?.business_name||'customer'}`} footer={<><Button variant="ghost" disabled={Boolean(busy)} onClick={()=>setQuoteOpen(false)}>Cancel</Button><Button variant="primary" icon={Send} disabled={Boolean(busy)} onClick={sendQuote}>{busy==='send_quote'?'Sending…':'Send branded quotation'}</Button></>}>
      {selected&&<div className="space-y-4"><div className="rounded-xl border border-gold/20 bg-gold/5 p-3 text-xs leading-5 text-slate-soft">The quotation will be sent to <strong className="text-ink-900">{selected.email}</strong> using the Aezakmi email template. You can override the suggested figures before sending.</div><div className="grid gap-3 sm:grid-cols-2"><label><span className="eyebrow mb-1.5 block">Package</span><select value={quoteDraft.packageId} onChange={e=>setQuotePackage(e.target.value)} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900">{packageCatalog.map(pkg=><option key={pkg.id} value={pkg.id}>{pkg.label} · {formatPackagePrice(pkg)}</option>)}</select></label><label><span className="eyebrow mb-1.5 block">PC count</span><input type="number" min="1" max="10000" value={quoteDraft.stationCount} onChange={e=>setQuoteDraft(v=>({...v,stationCount:e.target.value}))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/></label><label><span className="eyebrow mb-1.5 block">Branches</span><input type="number" min="1" max="1000" value={quoteDraft.branchCount} onChange={e=>setQuoteDraft(v=>({...v,branchCount:e.target.value}))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/></label><label><span className="eyebrow mb-1.5 block">Monthly price ₱</span><input type="number" min="0" max="1000000" value={quoteDraft.monthlyPrice} onChange={e=>setQuoteDraft(v=>({...v,monthlyPrice:e.target.value}))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/></label><label><span className="eyebrow mb-1.5 block">Deployment / branch ₱</span><input type="number" min="0" max="1000000" value={quoteDraft.deploymentFeePerBranch} onChange={e=>setQuoteDraft(v=>({...v,deploymentFeePerBranch:e.target.value}))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/><span className="mt-1 block text-[10px] text-slate-soft">Current recommended range: ₱{Number(pricingSettings.deployment_fee_min||0).toLocaleString()}–₱{Number(pricingSettings.deployment_fee_max||0).toLocaleString()} / branch</span></label><label><span className="eyebrow mb-1.5 block">Valid for days</span><input type="number" min="1" max="90" value={quoteDraft.validDays} onChange={e=>setQuoteDraft(v=>({...v,validDays:e.target.value}))} className="min-h-10 w-full rounded-lg border border-surface-line bg-soft-white px-3 text-xs text-ink-900"/></label></div><label className="block"><span className="eyebrow mb-1.5 block">Optional message</span><textarea rows={3} value={quoteDraft.message} onChange={e=>setQuoteDraft(v=>({...v,message:e.target.value}))} placeholder="Example: Includes initial onsite setup for the main branch." className="w-full rounded-xl border border-surface-line bg-soft-white p-3 text-xs text-ink-900"/></label><div className="rounded-xl border border-surface-line bg-surface-raised/35 p-3 text-xs text-slate-soft"><div className="flex justify-between gap-3"><span>Monthly</span><strong className="text-ink-900">₱{Number(quoteDraft.monthlyPrice||0).toLocaleString()}</strong></div><div className="mt-1 flex justify-between gap-3"><span>Initial deployment total</span><strong className="text-gold-dim">₱{(Number(quoteDraft.deploymentFeePerBranch||0)*Math.max(1,Number(quoteDraft.branchCount)||1)).toLocaleString()}</strong></div></div></div>}
    </Modal>

    {confirm&&selected&&<div className="fixed inset-0 z-[120] flex items-end justify-center bg-midnight/55 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true"><div className="max-h-[100dvh] w-full overflow-y-auto rounded-t-2xl border border-surface-line bg-surface p-4 shadow-card sm:max-w-lg sm:rounded-2xl sm:p-5"><div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Developer action</p><h3 className="mt-1 font-display text-lg font-semibold text-ink-900">{ACTION_COPY[confirm]?.title}</h3></div><button type="button" onClick={()=>setConfirm(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-soft hover:bg-surface-raised" aria-label="Close"><X size={17}/></button></div><p className="mt-3 text-xs leading-5 text-slate-soft">{ACTION_COPY[confirm]?.description}</p><label className="mt-4 block"><span className="text-[10px] font-semibold uppercase tracking-wide text-slate-soft">{ACTION_COPY[confirm]?.reasonOptional?'Reason / note (optional)':'Reason (required)'}</span><textarea autoFocus value={confirmReason} onChange={e=>setConfirmReason(e.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-surface-line bg-soft-white p-3 text-xs text-ink-900" placeholder="Why are you performing this action?"/></label>{ACTION_COPY[confirm]?.requireName&&<label className="mt-3 block"><span className="text-[10px] font-semibold uppercase tracking-wide text-ember-dim">Type {selected.business_name} to confirm</span><input value={confirmName} onChange={e=>setConfirmName(e.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-ember/25 bg-soft-white px-3 text-xs text-ink-900"/></label>}<div className="mt-5 grid gap-2 sm:grid-cols-2"><Button variant="ghost" onClick={()=>setConfirm(null)} disabled={Boolean(busy)}>Cancel</Button><Button variant={ACTION_COPY[confirm]?.variant||'danger'} onClick={runConfirmed} disabled={Boolean(busy)}>{busy===confirm?'Working…':ACTION_COPY[confirm]?.confirm}</Button></div></div></div>}
  </div>

  if(standalone)return <main className="admin-app-canvas min-h-screen">{content}</main>
  return content
}
