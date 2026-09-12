import { useEffect, useMemo, useState } from 'react'
import { Clock3, RefreshCw, ScrollText, Search, SlidersHorizontal } from 'lucide-react'
import { apiGet } from '../lib/api.js'
import SidePanel from '../components/common/SidePanel.jsx'
import { AdminMetricCard, AdminPageWorkspace, AdminRailCard } from '../components/layout/AdminPageWorkspace.jsx'

const BADGE = {
  'session.start': 'text-teal-dim bg-teal/10',
  'session.end': 'text-gold-dim bg-gold/10',
  'session.extend.confirm': 'text-teal-dim bg-teal/10',
}

function labelForAction(action = '') {
  if (action === 'session.start') return 'Session Start'
  if (action === 'session.end') return 'Session End'
  if (action === 'session.extend.confirm') return 'Extension'
  return action.replaceAll('.', ' ')
}

function formatTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString([], { dateStyle:'medium', timeStyle:'short' })
}

function durationFromDetails(details) {
  const seconds = Number(details?.durationSeconds ?? details?.elapsedSeconds ?? details?.duration ?? 0)
  if (!Number.isFinite(seconds) || seconds <= 0) return '—'
  const mins = Math.floor(seconds / 60)
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`
}

export default function LogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [actionFilter, setActionFilter] = useState('all')
  const [selectedLog, setSelectedLog] = useState(null)
  const [page,setPage]=useState(1)
  const pageSize=50

  const actionOptions=useMemo(()=>['all',...new Set(logs.map((log)=>log.action).filter(Boolean))],[logs])
  const filteredLogs=useMemo(()=>{
    const term=query.trim().toLowerCase()
    return logs.filter((log)=>{
      if(actionFilter!=='all'&&log.action!==actionFilter)return false
      if(!term)return true
      const details=log.details||{}
      return [log.action,labelForAction(log.action),log.entityType,log.entity_type,log.pcId,log.entityId,details.customerName,details.username,details.memberName,details.ratePlanName].some((value)=>String(value||'').toLowerCase().includes(term))
    })
  },[actionFilter,logs,query])
  const pages=Math.max(1,Math.ceil(filteredLogs.length/pageSize))
  const visibleLogs=filteredLogs.slice((page-1)*pageSize,page*pageSize)
  const actionCounts=useMemo(()=>logs.reduce((acc,log)=>{const key=log.action||'other';acc[key]=(acc[key]||0)+1;return acc},{}),[logs])
  const sessionStarts=Number(actionCounts['session.start']||0)
  const sessionEnds=Number(actionCounts['session.end']||0)
  const latestLog=logs[0]||null

  async function loadLogs() {
    setLoading(true)
    setError('')
    try {
      const data = await apiGet('/logs')
      const nextLogs = Array.isArray(data?.logs) ? data.logs : []
      setLogs(nextLogs)
      setPage(current => Math.min(current, Math.max(1, Math.ceil(nextLogs.length/pageSize))))
    } catch (err) {
      setLogs([])
      setPage(1)
      setError(err?.message || 'Unable to load session logs.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLogs() }, [])
  useEffect(()=>{setPage(1)},[query,actionFilter])

  const logRail = <>
    <AdminRailCard title="Audit snapshot" subtitle="Operational activity currently loaded.">
      <div className="space-y-2">
        <div className="admin-rail-stat"><span className="text-slate-soft">All records</span><b className="stat-figure text-ink-900">{logs.length}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Session starts</span><b className="stat-figure text-teal-dim">{sessionStarts}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Session ends</span><b className="stat-figure text-ink-900">{sessionEnds}</b></div>
      </div>
    </AdminRailCard>
    <AdminRailCard title="Quick filters" subtitle="Jump to common audit categories.">
      <div className="space-y-2">
        {['all','session.start','session.end','session.extend.confirm'].map(action=><button type="button" key={action} className="admin-rail-action" onClick={()=>setActionFilter(action)}><span>{action==='all'?'All activity':labelForAction(action)}<small>{action==='all'?`${logs.length} records`:`${actionCounts[action]||0} records`}</small></span><SlidersHorizontal size={14}/></button>)}
      </div>
    </AdminRailCard>
    <AdminRailCard title="Latest event" subtitle="Most recent audit entry in the loaded log.">
      {latestLog?<button type="button" className="admin-rail-action" onClick={()=>setSelectedLog(latestLog)}><span>{labelForAction(latestLog.action)}<small>{formatTime(latestLog.createdAt)} · {latestLog.pcId||'No PC'}</small></span><Clock3 size={14}/></button>:<p className="text-xs text-slate-soft">No audit activity yet.</p>}
    </AdminRailCard>
  </>

  return <AdminPageWorkspace aside={logRail}>
    <div className="admin-metric-grid mb-5">
      <AdminMetricCard label="Audit records" value={logs.length} hint="Records currently loaded" icon={ScrollText}/>
      <AdminMetricCard label="Session starts" value={sessionStarts} hint="Session start events" icon={Clock3} tone="success"/>
      <AdminMetricCard label="Session ends" value={sessionEnds} hint="Completed session events" icon={Clock3} tone="warning"/>
      <AdminMetricCard label="Filtered view" value={filteredLogs.length} hint="Records matching current filters" icon={SlidersHorizontal}/>
    </div>
    <div className="admin-page-toolbar mb-5 flex flex-wrap items-center gap-3">
      <div className="admin-search-field min-w-[240px] flex-1 sm:max-w-md"><Search size={15} className="text-slate-soft"/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search logs" className="w-full bg-transparent text-xs text-ink-900 outline-none placeholder:text-slate-soft"/></div>
      <label className="admin-search-field text-xs"><SlidersHorizontal size={14}/><select value={actionFilter} onChange={(event)=>setActionFilter(event.target.value)} className="bg-transparent text-xs font-medium text-ink-900 outline-none"><option value="all">All actions</option>{actionOptions.filter((item)=>item!=='all').map((action)=><option key={action} value={action}>{labelForAction(action)}</option>)}</select></label>
      <button type="button" onClick={loadLogs} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-surface-line bg-surface px-3 text-xs font-semibold text-ink-900 hover:bg-surface-raised disabled:opacity-50"><RefreshCw size={14} className={loading?'animate-spin':''}/>Refresh</button>
    </div>

    {error && <div className="mb-4 rounded-xl border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-dim">{error}</div>}

    {!loading && !error && filteredLogs.length === 0 ? <div className="overview-card flex flex-col items-center gap-2 py-16 text-center"><ScrollText size={22} className="text-slate-soft"/><p className="text-sm font-medium text-ink-900">No logs match this view.</p><p className="text-xs text-slate-soft">Try a different search or action filter.</p></div> : <div className="admin-table-shell overflow-hidden"><div className="max-h-[calc(100vh-300px)] overflow-auto"><table className="w-full min-w-[780px] text-[11px]"><thead className="sticky top-0 z-10 bg-surface"><tr className="text-left text-[10px] uppercase tracking-[0.12em] text-slate-soft"><th className="px-4 py-3 font-medium">Action</th><th className="px-4 py-3 font-medium">Entity</th><th className="px-4 py-3 font-medium">PC</th><th className="px-4 py-3 font-medium">Duration</th><th className="px-4 py-3 font-medium">Amount</th><th className="px-4 py-3 font-medium">Time</th></tr></thead><tbody>{loading?<tr><td colSpan="6" className="px-4 py-12 text-center text-sm text-slate-soft">Loading logs…</td></tr>:visibleLogs.map((log)=>{const details=log.details||{};const amount=Number(details.amount??details.amountPaid??0);const badge=BADGE[log.action]||'text-slate-soft bg-surface-raised';return <tr key={log.id} onClick={()=>setSelectedLog(log)} className="cursor-pointer border-b border-surface-line/50 last:border-0 hover:bg-surface-raised/45"><td className="px-4 py-2.5"><span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${badge}`}>{labelForAction(log.action)}</span></td><td className="px-4 py-2.5 text-slate-soft">{log.entityType||log.entity_type||'—'}</td><td className="px-4 py-2.5 font-medium text-ink-900">{log.pcId||'—'}</td><td className="stat-figure px-4 py-2.5 text-slate-soft">{durationFromDetails(details)}</td><td className="stat-figure px-4 py-2.5 text-ink-900">{amount>0?`₱${amount.toFixed(2)}`:'—'}</td><td className="px-4 py-2.5 text-slate-soft">{formatTime(log.createdAt)}</td></tr>})}</tbody></table></div><div className="flex items-center justify-between gap-2 border-t border-surface-line bg-surface px-4 py-2.5 text-[10px] text-slate-soft"><span>{filteredLogs.length} record{filteredLogs.length===1?'':'s'} · Page {page} of {pages}</span><div className="flex gap-2"><button disabled={page<=1} onClick={()=>setPage(v=>v-1)} className="rounded-lg border border-surface-line px-2.5 py-1.5 disabled:opacity-40">Previous</button><button disabled={page>=pages} onClick={()=>setPage(v=>v+1)} className="rounded-lg border border-surface-line px-2.5 py-1.5 disabled:opacity-40">Next</button></div></div></div>}

    <SidePanel open={!!selectedLog} onClose={()=>setSelectedLog(null)} eyebrow="Log details" title={selectedLog?labelForAction(selectedLog.action):'Log'}>
      {selectedLog&&<div className="space-y-4"><section className="overview-soft-card p-4"><div className="grid grid-cols-2 gap-3 text-xs"><div><p className="text-[10px] text-slate-soft">Recorded</p><p className="mt-1 font-medium text-ink-900">{formatTime(selectedLog.createdAt)}</p></div><div><p className="text-[10px] text-slate-soft">PC</p><p className="mt-1 font-medium text-ink-900">{selectedLog.pcId||'—'}</p></div><div><p className="text-[10px] text-slate-soft">Entity</p><p className="mt-1 font-medium text-ink-900">{selectedLog.entityType||selectedLog.entity_type||'—'}</p></div><div><p className="text-[10px] text-slate-soft">Entity ID</p><p className="stat-figure mt-1 break-all font-medium text-ink-900">{selectedLog.entityId||selectedLog.entity_id||'—'}</p></div></div></section><section className="overview-card p-4"><p className="eyebrow mb-3">Recorded details</p>{Object.keys(selectedLog.details||{}).length?<dl className="space-y-2">{Object.entries(selectedLog.details||{}).map(([key,value])=><div key={key} className="grid grid-cols-[130px_1fr] gap-3 border-b border-surface-line/50 pb-2 text-xs last:border-0"><dt className="text-slate-soft">{key.replaceAll(/([A-Z])/g,' $1')}</dt><dd className="break-words text-right font-medium text-ink-900">{typeof value==='object'?JSON.stringify(value):String(value??'—')}</dd></div>)}</dl>:<p className="text-xs text-slate-soft">No additional details were recorded.</p>}</section></div>}
    </SidePanel>
  </AdminPageWorkspace>
}
