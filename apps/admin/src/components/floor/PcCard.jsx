import { CalendarClock, MonitorCheck, MonitorOff, MonitorPlay, Settings2, TriangleAlert, Wrench, Zap } from 'lucide-react'
import { elapsedSessionSeconds, remainingSessionSeconds } from '../../lib/sessionTime.js'

const STATUS = {
  available:{ label:'Available', icon:MonitorCheck, color:'text-teal-dim', iconBg:'bg-teal/10', border:'hover:border-teal/50' },
  occupied:{ label:'In use', icon:MonitorPlay, color:'text-gold-dim', iconBg:'bg-gold/15', border:'border-gold/35' },
  reserved:{ label:'Reserved', icon:CalendarClock, color:'text-grape', iconBg:'bg-trillium/25', border:'border-trillium/60' },
  maintenance:{ label:'Maintenance', icon:Wrench, color:'text-ember-dim', iconBg:'bg-ember/10', border:'border-ember/30' },
  offline:{ label:'Offline', icon:MonitorOff, color:'text-slate-soft', iconBg:'bg-surface-raised', border:'border-surface-line' },
}

function formatClock(total) { const seconds=Math.max(0,Math.floor(total)); const h=Math.floor(seconds/3600); const m=Math.floor(seconds%3600/60); const s=seconds%60; return `${h?`${String(h).padStart(2,'0')}:`:''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` }

export default function PcCard({ pc, now=Date.now(), lowTimeWarningMinutes=5, onSelect, onControls }) {
  const state=STATUS[pc.status] ?? STATUS.offline
  const Icon=state.icon
  const session=pc.session
  const elapsed=session ? elapsedSessionSeconds(session,now) : 0
  const remaining=session?.billing==='prepaid' ? remainingSessionSeconds(session,now) : null
  const lowTime=remaining != null && remaining>0 && remaining<=Number(lowTimeWarningMinutes||5)*60
  const disconnected=pc.status==='offline' && Boolean(session)
  const guestOfflinePause=disconnected && session?.pauseReason==='station_offline'
  const timer=session ? formatClock(session.billing==='prepaid'?remaining:elapsed) : null

  return <article data-pc-id={pc.id} className={`group relative flex min-h-[174px] flex-col rounded-xl border bg-surface p-4 shadow-card transition-colors duration-150 ${state.border}`}>
    <button type="button" onClick={event=>onSelect?.(pc,event)} className="absolute inset-0 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold" aria-label={`Open actions for ${pc.label}`}/>
    <div className="pointer-events-none relative flex items-start justify-between gap-3">
      <div className="min-w-0"><p className="font-display text-base font-semibold text-ink-900">{pc.pcNumber ? `PC ${pc.pcNumber}` : pc.label}</p>{pc.pcNumber && pc.label && <p className="mt-0.5 truncate text-xs text-slate-soft">{pc.label}</p>}</div>
      <div className="relative z-10 flex shrink-0 flex-col items-end gap-1.5">
        <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${state.iconBg} ${state.color}`}><Icon size={19}/></span>
        {onControls && <button type="button" onClick={event=>{event.stopPropagation();onControls(pc,event)}} className="pointer-events-auto inline-flex items-center gap-1 rounded-md border border-surface-line bg-surface px-2 py-1 text-[10px] font-semibold text-slate-soft transition-colors hover:bg-surface-raised hover:text-ink-900" aria-label={`Open station controls for ${pc.label}`}><Settings2 size={11}/> Controls</button>}
      </div>
    </div>
    <div className="pointer-events-none relative mt-3 min-w-0"><p className="truncate text-[11px] text-slate-soft">{pc.spec || 'Customer station'}</p><div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-slate-soft/75"><span className="stat-figure truncate">{pc.ipAddress}</span>{pc.customerVersion&&<span className="shrink-0 rounded-full bg-surface-raised px-1.5 py-0.5">v{pc.customerVersion}</span>}{pc.customerUpdateState&&['available','downloading','ready','installing','error'].includes(pc.customerUpdateState)&&<span className={`shrink-0 rounded-full px-1.5 py-0.5 font-semibold ${pc.customerUpdateState==='error'?'bg-ember/10 text-ember-dim':'bg-gold/10 text-gold-dim'}`}>{pc.customerUpdateState==='downloading'?'Updating…':pc.customerUpdateState==='ready'?'Update ready':pc.customerUpdateState==='installing'?'Installing…':pc.customerUpdateState==='error'?'Update error':`Update ${pc.customerUpdateVersion||''}`}</span>}</div></div>
    <div className="pointer-events-none relative mt-auto flex items-end justify-between gap-3 pt-3">
      <div className="min-w-0"><p className={`flex items-center gap-1 text-xs font-semibold ${session?.isLocked?'text-grape':state.color}`}>{session?.billing==='prepaid' && <Zap size={11}/>} {guestOfflinePause?'Guest time paused':session?.isLocked?'Session locked':state.label}</p>{session && <><p className="mt-1 truncate text-xs font-medium text-ink-900">{session.username || session.customerName}</p>{session.memberName && session.memberName!==session.username && <p className="truncate text-[11px] text-slate-soft">{session.memberName}</p>}</>}</div>
      {timer && <span className={`stat-figure shrink-0 text-sm font-semibold ${lowTime?'text-ember-dim':'text-ink-900'}`}>{timer}</span>}
    </div>
    {lowTime && <span className="pointer-events-none absolute right-3 top-14 flex items-center gap-1 rounded-full bg-ember/10 px-2 py-1 text-[10px] font-semibold text-ember-dim"><TriangleAlert size={11}/> Low time</span>}
    {disconnected && <div className={`pointer-events-none relative mt-2 flex items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-semibold ${guestOfflinePause?'bg-trillium/25 text-grape':'bg-ember/10 text-ember-dim'}`}><TriangleAlert size={11}/><span className="truncate">{guestOfflinePause?'Time saved until this station reconnects or staff forfeits it':'Session still active'}</span></div>}
  </article>
}
