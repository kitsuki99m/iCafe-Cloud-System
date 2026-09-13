import { useEffect, useMemo, useState } from 'react'
import { Check, Clock3, RefreshCw, ShieldCheck, UserRoundCheck, X, Search, Mail, Building2, Monitor, MapPin, LogOut } from 'lucide-react'
import { cloudDeveloperRegistrations } from '../lib/cloudClient.js'
import { useAuth } from '../context/AuthContext.jsx'
import Button from '../components/common/Button.jsx'

const FILTERS=['all','pending','reviewing','needs_info','approved','invited','activated','rejected']
const labels={all:'All',pending:'Pending',reviewing:'Reviewing',needs_info:'Needs info',approved:'Approved',invited:'Invited',activated:'Active',rejected:'Rejected'}
function badge(status){return status==='activated'?'bg-teal/10 text-teal-dim':status==='rejected'?'bg-ember/10 text-ember-dim':status==='invited'?'bg-gold/12 text-gold-dim':'bg-midnight/7 text-slate-soft'}

export default function DeveloperConsolePage({standalone=false}){
  const{logout}=useAuth()
  const[items,setItems]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[filter,setFilter]=useState('pending'),[query,setQuery]=useState(''),[selected,setSelected]=useState(null),[notes,setNotes]=useState(''),[busy,setBusy]=useState('')
  async function load(){setLoading(true);setError('');try{const r=await cloudDeveloperRegistrations('list');setItems(r.requests||[]);if(selected){const next=(r.requests||[]).find(x=>x.id===selected.id);setSelected(next||null)}}catch(e){setError(e.message||'Unable to load registration requests.')}finally{setLoading(false)}}
  useEffect(()=>{load()},[])
  const counts=useMemo(()=>items.reduce((acc,item)=>({...acc,[item.status]:(acc[item.status]||0)+1}),{}),[items])
  const visible=useMemo(()=>items.filter(item=>(filter==='all'||item.status===filter)&&(!query.trim()||`${item.business_name} ${item.owner_name} ${item.email} ${item.location||''}`.toLowerCase().includes(query.trim().toLowerCase()))),[items,filter,query])
  async function act(action){if(!selected||busy)return;setBusy(action);setError('');try{await cloudDeveloperRegistrations(action,{requestId:selected.id,reviewNotes:notes.trim()||null});setNotes('');await load()}catch(e){setError(e.message||'Unable to update application.')}finally{setBusy('')}}
  const content=<div className={standalone?'mx-auto w-full max-w-[1440px] p-4 sm:p-6':'space-y-4'}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="eyebrow">Platform access</p><h1 className="font-display text-2xl font-semibold text-ink-900">Developer approvals</h1><p className="mt-1 text-xs leading-5 text-slate-soft">Review business applications before Supabase Auth invitations and tenant provisioning are created.</p></div>
      <div className="flex gap-2"><Button variant="secondary" size="sm" icon={RefreshCw} onClick={load} disabled={loading}>{loading?'Refreshing…':'Refresh'}</Button>{standalone&&<Button variant="secondary" size="sm" icon={LogOut} onClick={logout}>Sign out</Button>}</div>
    </div>
    {error&&<div className="rounded-xl border border-ember/25 bg-ember/10 px-3 py-2.5 text-xs text-ember-dim">{error}</div>}
    <div className="grid gap-3 sm:grid-cols-4">
      {[['pending','Pending',Clock3],['reviewing','Reviewing',ShieldCheck],['invited','Invited',Mail],['activated','Active',UserRoundCheck]].map(([key,label,Icon])=><div key={key} className="rounded-2xl border border-surface-line bg-surface p-4"><Icon size={17} className="text-gold-dim"/><p className="mt-3 text-2xl font-semibold text-ink-900">{counts[key]||0}</p><p className="text-[11px] text-slate-soft">{label}</p></div>)}
    </div>
    <div className="grid min-h-[520px] gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
      <section className="min-w-0 rounded-2xl border border-surface-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-2"><div className="relative min-w-[220px] flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-soft"/><input value={query} onChange={e=>setQuery(e.target.value)} className="min-h-10 w-full rounded-xl border border-surface-line bg-soft-white pl-9 pr-3 text-xs text-ink-900" placeholder="Search business, owner, email…"/></div></div>
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">{FILTERS.map(key=><button key={key} onClick={()=>setFilter(key)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-semibold ${filter===key?'bg-midnight text-soft-white':'bg-midnight/6 text-slate-soft'}`}>{labels[key]} {key!=='all'&&counts[key]?`· ${counts[key]}`:''}</button>)}</div>
        <div className="mt-3 space-y-2 overflow-y-auto lg:max-h-[430px]">{visible.length?visible.map(item=><button key={item.id} onClick={()=>{setSelected(item);setNotes(item.review_notes||'')}} className={`w-full rounded-xl border p-3 text-left transition-colors ${selected?.id===item.id?'border-gold/50 bg-gold/5':'border-surface-line bg-surface-raised/35 hover:bg-surface-raised'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink-900">{item.business_name}</p><p className="mt-0.5 truncate text-[11px] text-slate-soft">{item.owner_name} · {item.email}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-wide ${badge(item.status)}`}>{labels[item.status]||item.status}</span></div><p className="mt-2 text-[10px] text-slate-soft">Submitted {new Date(item.created_at).toLocaleString()}</p></button>):<div className="flex min-h-40 items-center justify-center text-xs text-slate-soft">No applications in this view.</div>}</div>
      </section>
      <section className="rounded-2xl border border-surface-line bg-surface p-4">{selected?<>
        <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Application</p><h2 className="mt-1 font-display text-xl font-semibold text-ink-900">{selected.business_name}</h2></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide ${badge(selected.status)}`}>{labels[selected.status]||selected.status}</span></div>
        <div className="mt-4 grid gap-2 text-xs">{[[Building2,'Owner',selected.owner_name],[Mail,'Email',selected.email],[MapPin,'Location',selected.location||'—'],[Monitor,'Expected PCs',selected.expected_station_count||1]].map(([Icon,label,value])=><div key={label} className="flex items-center gap-3 rounded-xl bg-surface-raised/45 p-3"><Icon size={15} className="text-gold-dim"/><div><p className="text-[9px] uppercase tracking-wide text-slate-soft">{label}</p><p className="mt-0.5 font-medium text-ink-900">{value}</p></div></div>)}</div>
        {selected.phone&&<p className="mt-3 text-xs text-slate-soft">Phone: <span className="text-ink-900">{selected.phone}</span></p>}{selected.note&&<div className="mt-3 rounded-xl border border-surface-line bg-soft-white p-3 text-xs leading-5 text-slate-soft">{selected.note}</div>}
        <label className="mt-4 block"><span className="eyebrow mb-2 block">Developer notes</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} className="w-full rounded-xl border border-surface-line bg-soft-white p-3 text-xs text-ink-900" placeholder="Internal review note / information requested"/></label>
        {!['invited','activated'].includes(selected.status)&&<div className="mt-4 grid gap-2 sm:grid-cols-2"><Button variant="secondary" size="sm" icon={ShieldCheck} disabled={Boolean(busy)} onClick={()=>act('reviewing')}>{busy==='reviewing'?'Saving…':'Mark reviewing'}</Button><Button variant="secondary" size="sm" icon={Mail} disabled={Boolean(busy)} onClick={()=>act('needs_info')}>{busy==='needs_info'?'Saving…':'Needs info'}</Button><Button variant="danger" size="sm" icon={X} disabled={Boolean(busy)} onClick={()=>act('reject')}>{busy==='reject'?'Rejecting…':'Reject'}</Button><Button variant="primary" size="sm" icon={Check} disabled={Boolean(busy)||selected.status==='rejected'} onClick={()=>act('approve')}>{busy==='approve'?'Approving…':'Approve & invite'}</Button></div>}
        {selected.status==='invited'&&<div className="mt-4 rounded-xl border border-gold/25 bg-gold/5 p-3 text-xs leading-5 text-slate-soft">Invitation sent {selected.invite_sent_at?new Date(selected.invite_sent_at).toLocaleString():'—'}. Tenant provisioning is complete; activation occurs when the owner accepts the invite and sets a password.</div>}
        {selected.status==='activated'&&<div className="mt-4 rounded-xl border border-teal/25 bg-teal/5 p-3 text-xs leading-5 text-teal-dim">Business owner activated the approved account {selected.activated_at?new Date(selected.activated_at).toLocaleString():''}.</div>}
      </>:<div className="flex min-h-[420px] flex-col items-center justify-center text-center"><ShieldCheck size={26} className="text-gold-dim"/><p className="mt-3 text-sm font-semibold text-ink-900">Select an application</p><p className="mt-1 max-w-xs text-xs leading-5 text-slate-soft">Review business details and approve only verified café owners.</p></div>}</section>
    </div>
  </div>
  if(standalone)return <main className="admin-app-canvas min-h-screen">{content}</main>
  return content
}
