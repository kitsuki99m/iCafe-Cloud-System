import { useCallback, useEffect, useRef, useState } from 'react'
import { Archive, CheckCircle2, Eye, RotateCcw } from 'lucide-react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import { apiGet, apiPatch, apiPost } from '../../lib/api.js'

export default function FeedbackInboxModal({open,onClose,onChanged}){
  const [items,setItems]=useState([]),[selected,setSelected]=useState([]),[busy,setBusy]=useState(false),[tab,setTab]=useState('unresolved'),[viewing,setViewing]=useState(null),[page,setPage]=useState(1),[pages,setPages]=useState(1),[error,setError]=useState('')
  const archived=tab==='archived'

  const requestSequenceRef=useRef(0)
  const load=useCallback(async()=>{
    const requestId=++requestSequenceRef.current
    setError('')
    try{
      const data=await apiGet(`/feedback?archived=${archived?1:0}${archived?'':`&status=${tab}`}&page=${page}&limit=30`)
      if(requestId !== requestSequenceRef.current)return
      setItems(data.feedback||[])
      setPages(data.pagination?.pages||1)
    }catch(error){
      if(requestId !== requestSequenceRef.current)return
      setError(error?.message||'Unable to load feedback.')
    }
  },[archived,tab,page])

  useEffect(()=>{
    if(open) void load()
    else requestSequenceRef.current += 1
    return()=>{requestSequenceRef.current += 1}
  },[open,load])

  async function update(item,status){
    setBusy(true);setError('')
    try{await apiPatch(`/feedback/${item.id}/status`,{status});await load();onChanged?.()}
    catch(error){setError(error?.message||'Unable to update feedback.')}
    finally{setBusy(false)}
  }

  async function archive(){
    if(!selected.length)return
    setBusy(true);setError('')
    try{await apiPost('/feedback/archive',{ids:selected});setSelected([]);await load();onChanged?.()}
    catch(error){setError(error?.message||'Unable to archive feedback.')}
    finally{setBusy(false)}
  }

  async function restore(item){
    setBusy(true);setError('')
    try{await apiPost(`/feedback/${item.id}/restore`,{});await load();onChanged?.()}
    catch(error){setError(error?.message||'Unable to restore feedback.')}
    finally{setBusy(false)}
  }

  return <Modal open={open} busy={busy} onClose={()=>!busy&&onClose()} eyebrow="CUSTOMER VOICE" title="Feedback inbox" maxWidth="max-w-2xl" footer={<><span className="mr-auto text-[10px] text-slate-soft">Page {page} of {pages}</span><Button variant="ghost" disabled={busy||page<=1} onClick={()=>setPage(v=>v-1)}>Previous</Button><Button variant="ghost" disabled={busy||page>=pages} onClick={()=>setPage(v=>v+1)}>Next</Button>{tab==='resolved'&&<Button variant="danger" icon={Archive} onClick={archive} disabled={busy||!selected.length}>Archive selected</Button>}</>}>
    {error&&<p className="mb-3 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{error}</p>}
    <div className="mb-3 grid grid-cols-3 gap-1 rounded-lg bg-surface-raised p-1">{['unresolved','resolved','archived'].map(value=><button key={value} disabled={busy} onClick={()=>{setTab(value);setSelected([]);setPage(1)}} className={`rounded-md px-3 py-2 text-xs font-semibold capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${tab===value?'bg-midnight text-soft-white':'text-slate-soft'}`}>{value}</button>)}</div>
    <div className="max-h-[52vh] space-y-2 overflow-y-auto">{items.length?items.map(item=><article key={item.id} className="rounded-lg border border-surface-line p-3"><div className="flex items-center gap-3">{tab==='resolved'&&<input type="checkbox" disabled={busy} checked={selected.includes(item.id)} onChange={event=>setSelected(current=>event.target.checked?[...current,item.id]:current.filter(id=>id!==item.id))}/>}<div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-ink-900">{item.username||item.customer_name}</p><p className="mt-1 text-[10px] text-slate-soft">{item.pc_label||'No station'} · {new Date(item.created_at).toLocaleString()} · {item.account_count} total sent</p></div><button disabled={busy} onClick={()=>setViewing(item)} className="flex h-8 items-center gap-1 rounded-md px-2 text-[10px] font-semibold text-gold-dim disabled:opacity-50"><Eye size={11}/> View</button>{archived?<button disabled={busy} onClick={()=>restore(item)} className="flex h-8 items-center gap-1 rounded-md bg-gold/10 px-2 text-[10px] font-semibold text-gold-dim"><RotateCcw size={11}/> Restore</button>:<button disabled={busy} onClick={()=>update(item,tab==='resolved'?'unresolved':'resolved')} className="flex h-8 items-center gap-1 rounded-md bg-teal/10 px-2 text-[10px] font-semibold text-teal-dim">{tab==='resolved'?<RotateCcw size={11}/>:<CheckCircle2 size={11}/>} {tab==='resolved'?'Unresolve':'Resolve'}</button>}</div></article>):<p className="rounded-lg border border-dashed border-surface-line py-10 text-center text-xs text-slate-soft">No {tab} feedback.</p>}</div>
    {viewing&&<div className="mt-3 rounded-lg border border-gold/20 bg-gold/5 p-3"><div className="mb-2 flex justify-between"><p className="text-xs font-semibold text-ink-900">Message from {viewing.username||viewing.customer_name}</p><button disabled={busy} onClick={()=>setViewing(null)} className="text-[10px] text-slate-soft disabled:opacity-50">Close</button></div><p className="whitespace-pre-wrap text-xs leading-5 text-ink-900">{viewing.message}</p></div>}
  </Modal>
}
