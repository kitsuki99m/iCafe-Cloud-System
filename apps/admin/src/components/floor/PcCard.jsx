import { CalendarClock, MonitorCheck, MonitorOff, MonitorPlay, Settings2, TriangleAlert, Wrench, Zap } from 'lucide-react'
import { elapsedSessionSeconds, remainingSessionSeconds } from '../../lib/sessionTime.js'
import { effectivePcStatus } from '../../lib/pcStatus.js'

const STATUS = {
  available:{ label:'Available', sublabel:'Ready · Idle', icon:MonitorCheck, color:'text-teal-dim', iconBg:'bg-teal/10', border:'hover:border-teal/50' },
  occupied:{ label:'In use', sublabel:'Active Session', icon:MonitorPlay, color:'text-orange-dim', iconBg:'bg-orange/15', border:'border-orange/40' },
  reserved:{ label:'Reserved', sublabel:'Reserved Seat', icon:CalendarClock, color:'text-grape', iconBg:'bg-trillium/25', border:'border-trillium/60' },
  maintenance:{ label:'Maintenance', sublabel:'Service Mode', icon:Wrench, color:'text-ember-dim', iconBg:'bg-ember/10', border:'border-ember/30' },
  offline:{ label:'Offline', sublabel:'Disconnected', icon:MonitorOff, color:'text-slate-soft', iconBg:'bg-surface-raised', border:'border-surface-line' },
}

function formatClock(total) { const seconds=Math.max(0,Math.floor(total)); const h=Math.floor(seconds/3600); const m=Math.floor(seconds%3600/60); const s=seconds%60; return `${h?`${String(h).padStart(2,'0')}:`:''}${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` }

export default function PcCard({ pc, now=Date.now(), lowTimeWarningMinutes=5, onSelect, onControls }) {
  const session=pc.session
  const rawStatus=String(pc.status||'').trim().toLowerCase().replaceAll('_','-')
  const statusKey=effectivePcStatus(pc)
  const state=STATUS[statusKey] || STATUS.offline
  const Icon=state.icon
  const elapsed=session ? elapsedSessionSeconds(session,now) : 0
  const remaining=session?.billing==='prepaid' ? remainingSessionSeconds(session,now) : null
  const lowTime=remaining != null && remaining>0 && remaining<=Number(lowTimeWarningMinutes||5)*60
  const explicitConnectionLost = pc.stationOnline === false || pc.isOnline === false || pc.cloudOnline === false || pc.cloudConnectionStatus === 'offline'
  const disconnected=Boolean(session) && (explicitConnectionLost || rawStatus === 'offline')
  const guestOfflinePause=disconnected && session?.pauseReason==='station_offline'
  const timer=session ? formatClock(session.billing==='prepaid'?remaining:elapsed) : null

  const isOccupied = statusKey === 'occupied'

  return (
    <article
      data-pc-id={pc.id}
      className={`group relative flex min-h-[160px] flex-col rounded-2xl border bg-surface p-3.5 shadow-card transition-all duration-150 hover:-translate-y-0.5 hover:shadow-md ${
        lowTime
          ? 'border-ember bg-ember/5 ring-1 ring-ember/30 animate-pulse'
          : isOccupied
            ? 'border-teal/50 bg-teal/[0.03] ring-1 ring-teal/20'
            : state.border
      }`}
    >
      <button
        type="button"
        onClick={(event) => onSelect?.(pc, event)}
        className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold z-0"
        aria-label={`Open actions for ${pc.label}`}
      />

      {/* Header: Station Name + Icon & Controls */}
      <div className="relative z-10 flex items-start justify-between gap-2 pointer-events-none">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full shrink-0 ${lowTime ? 'bg-ember animate-ping' : isOccupied ? 'bg-teal animate-pulse' : statusKey === 'available' ? 'bg-slate-soft/60' : 'bg-slate-soft'}`} />
            <p className="font-display text-base font-bold text-ink-900 tracking-tight truncate">
              {pc.pcNumber ? `PC ${pc.pcNumber}` : pc.label}
            </p>
          </div>
          {pc.pcNumber && pc.label && pc.label !== `PC ${pc.pcNumber}` && (
            <p className="mt-0.5 truncate text-[11px] text-slate-soft pl-3.5">{pc.label}</p>
          )}
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-1.5 pointer-events-auto">
          <span className={`flex h-8 w-8 items-center justify-center rounded-xl shrink-0 ${lowTime ? 'bg-ember/15 text-ember-dim' : state.iconBg} ${state.color}`}>
            <Icon size={16} />
          </span>
          {onControls && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onControls(pc, event)
              }}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-surface-line bg-surface-raised/80 px-2 text-[10px] font-bold text-slate-soft transition-colors hover:bg-surface-line hover:text-ink-900 shadow-xs"
              aria-label={`Open station controls for ${pc.label}`}
              title="Station Quick Controls"
            >
              <Settings2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Spec / Hardware */}
      <div className="relative z-10 mt-2 pointer-events-none min-w-0">
        <p className="truncate text-[10px] text-slate-soft font-medium">{pc.spec || 'Customer station'}</p>
        <div className="mt-0.5 flex min-w-0 items-center gap-2 text-[10px] text-slate-soft/75">
          <span className="stat-figure truncate">{pc.ipAddress}</span>
          {pc.customerVersion && (
            <span className="shrink-0 rounded-full bg-surface-raised px-1.5 py-0.5">v{pc.customerVersion}</span>
          )}
        </div>
      </div>

      {/* Footer: User & Timer */}
      <div className="relative z-10 mt-auto flex items-end justify-between gap-2 pt-2.5 border-t border-surface-line/50 pointer-events-none">
        <div className="min-w-0">
          <p className={`flex items-center gap-1 text-[11px] font-bold ${lowTime ? 'text-ember-dim' : session?.isLocked ? 'text-grape' : isOccupied ? 'text-teal-dim' : 'text-slate-soft'}`}>
            {session?.billing === 'prepaid' && <Zap size={11} className="shrink-0" />}
            <span className="truncate">
              {guestOfflinePause ? 'Time paused' : session?.isLocked ? 'Session locked' : session ? (session.username || session.customerName || 'Guest') : state.sublabel}
            </span>
          </p>
        </div>

        {timer && (
          <div className="text-right shrink-0">
            <span className={`font-mono stat-figure text-xs sm:text-[13px] font-bold tracking-tight px-1.5 py-0.5 rounded-md ${
              lowTime
                ? 'bg-ember/15 text-ember-dim font-black'
                : isOccupied
                  ? 'bg-teal/10 text-teal-dim'
                  : 'bg-surface-raised text-ink-900'
            }`}>
              {timer}
            </span>
          </div>
        )}
      </div>

      {/* Low Time Alert Pill */}
      {lowTime && (
        <span className="pointer-events-none absolute right-2.5 top-11 flex items-center gap-1 rounded-full bg-ember/20 border border-ember/30 px-2 py-0.5 text-[9px] font-black text-ember-dim shadow-xs">
          <TriangleAlert size={10} /> &lt;5m Left
        </span>
      )}

      {/* Disconnection Warning */}
      {disconnected && (
        <div className={`pointer-events-none relative mt-1.5 flex items-center gap-1 rounded-lg px-2 py-1 text-[9px] font-semibold ${guestOfflinePause ? 'bg-trillium/25 text-grape' : 'bg-ember/10 text-ember-dim'}`}>
          <TriangleAlert size={10} className="shrink-0" />
          <span className="truncate">{guestOfflinePause ? 'Time saved until this station reconnects or staff forfeits it' : 'Station connection lost · session still active'}</span>
        </div>
      )}
    </article>
  )
}
