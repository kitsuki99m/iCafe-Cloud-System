import { CalendarClock, MonitorCheck, MonitorOff, MonitorPlay, Settings2, TriangleAlert, Wrench, Zap, User, Gamepad2, ShieldAlert } from 'lucide-react'
import { elapsedSessionSeconds, remainingSessionSeconds } from '../../lib/sessionTime.js'
import { effectivePcStatus } from '../../lib/pcStatus.js'

const STATUS = {
  available:{ label:'READY', sublabel:'Station Ready', icon:MonitorCheck, color:'text-teal-dim', iconBg:'bg-teal/10', dotColor:'bg-teal/70', badgeClass:'border-teal/30 bg-teal/10 text-teal-dim', cardClass:'border-surface-line bg-surface hover:border-teal/40 hover:bg-teal/[0.015] hover:shadow-md' },
  occupied:{ label:'IN USE', sublabel:'Active Match', icon:MonitorPlay, color:'text-orange-dim', iconBg:'bg-orange/15', dotColor:'bg-teal animate-pulse', badgeClass:'border-teal/40 bg-teal/15 text-teal-dim', cardClass:'border-teal/40 bg-gradient-to-b from-teal/[0.05] to-surface shadow-[0_0_16px_rgba(20,184,166,0.08)] ring-1 ring-teal/25 hover:border-teal/70 hover:shadow-[0_0_22px_rgba(20,184,166,0.16)]' },
  reserved:{ label:'RESERVED', sublabel:'Reserved Seat', icon:CalendarClock, color:'text-grape', iconBg:'bg-trillium/25', dotColor:'bg-grape', badgeClass:'border-grape/30 bg-grape/10 text-grape', cardClass:'border-grape/35 bg-gradient-to-b from-grape/[0.04] to-surface shadow-[0_0_14px_rgba(168,85,247,0.06)] ring-1 ring-grape/20 hover:border-grape/60' },
  maintenance:{ label:'SERVICE', sublabel:'Maintenance', icon:Wrench, color:'text-ember-dim', iconBg:'bg-ember/10', dotColor:'bg-amber-500', badgeClass:'border-amber-500/30 bg-amber-500/10 text-amber-500', cardClass:'border-amber-500/30 bg-gradient-to-b from-amber-500/[0.03] to-surface shadow-xs hover:border-amber-500/60' },
  offline:{ label:'OFFLINE', sublabel:'Disconnected', icon:MonitorOff, color:'text-slate-soft', iconBg:'bg-surface-raised', dotColor:'bg-slate-soft/50', badgeClass:'border-surface-line bg-surface-raised text-slate-soft', cardClass:'border-surface-line bg-surface/70 opacity-80 hover:opacity-100 hover:border-surface-line' },
}

function formatClock(total) {
  const seconds = Math.max(0, Math.floor(total))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return `${h ? `${String(h).padStart(2, '0')}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export default function PcCard({ pc, now = Date.now(), lowTimeWarningMinutes = 5, onSelect, onControls }) {
  const session = pc.session
  const rawStatus = String(pc.status || '').trim().toLowerCase().replaceAll('_', '-')
  const statusKey=effectivePcStatus(pc)
  const config = STATUS[statusKey] || STATUS.offline
  const Icon = config.icon
  const elapsed = session ? elapsedSessionSeconds(session, now) : 0
  const remaining = session?.billing === 'prepaid' ? remainingSessionSeconds(session, now) : null
  const lowTime = remaining != null && remaining > 0 && remaining <= Number(lowTimeWarningMinutes || 5) * 60
  const explicitConnectionLost = pc.stationOnline === false || pc.isOnline === false || pc.cloudOnline === false || pc.cloudConnectionStatus === 'offline'
  const disconnected = Boolean(session) && (explicitConnectionLost || rawStatus === 'offline')
  const guestOfflinePause = disconnected && session?.pauseReason === 'station_offline'
  const timer = session ? formatClock(session.billing === 'prepaid' ? remaining : elapsed) : null
  const isOccupied = statusKey === 'occupied'

  // Format station display name
  const stationNumber = pc.pcNumber != null && String(pc.pcNumber).trim() !== '' ? String(pc.pcNumber).padStart(2, '0') : null
  const stationTitle = stationNumber ? `PC-${stationNumber}` : (pc.label || 'PC')

  return (
    <article
      data-pc-id={pc.id}
      className={`group relative flex min-h-[178px] flex-col rounded-2xl border p-3.5 shadow-card transition-all duration-200 hover:-translate-y-1 ${
        lowTime
          ? 'border-ember bg-gradient-to-b from-ember/10 to-surface shadow-[0_0_20px_rgba(239,68,68,0.18)] ring-1 ring-ember/40 animate-pulse hover:border-ember'
          : config.cardClass
      }`}
    >
      {/* Click target for full card selection */}
      <button
        type="button"
        onClick={(event) => onSelect?.(pc, event)}
        className="absolute inset-0 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold z-0 cursor-pointer"
        aria-label={`Open actions for ${pc.label || stationTitle}`}
      />

      {/* TOP HEADER: Esports Station Badge + Status Pill + Controls */}
      <div className="relative z-10 flex items-start justify-between gap-2 pointer-events-none">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-soft/80">STATION</span>
          </div>
          <div className="flex items-baseline gap-1.5 min-w-0 flex-nowrap overflow-hidden">
            <h3 className="font-display text-base sm:text-lg font-black tracking-tight text-ink-900 whitespace-nowrap shrink-0">
              {stationTitle}
            </h3>
            {pc.label && pc.label !== stationTitle && pc.label !== `PC ${pc.pcNumber}` && (
              <span className="truncate text-[10px] font-medium text-slate-soft shrink min-w-0" title={pc.label}>
                ({pc.label})
              </span>
            )}
          </div>
        </div>

        <div className="relative z-10 flex shrink-0 items-center gap-1.5 pointer-events-auto">
          {/* Status Badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black tracking-wider uppercase ${
              lowTime
                ? 'border-ember/40 bg-ember/15 text-ember-dim animate-pulse'
                : config.badgeClass
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${lowTime ? 'bg-ember animate-ping' : config.dotColor}`} />
            {lowTime ? '<5M LEFT' : config.label}
          </span>

          {/* Quick Settings Action */}
          {onControls && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onControls(pc, event)
              }}
              className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-surface-line bg-surface-raised/90 text-slate-soft transition hover:bg-surface-line hover:text-ink-900 shadow-xs"
              aria-label={`Open station controls for ${stationTitle}`}
              title="Station Quick Controls"
            >
              <Settings2 size={13} />
            </button>
          )}
        </div>
      </div>

      {/* MIDDLE ZONE: Session Gamer Display or Ready Status */}
      <div className="relative z-10 my-auto py-2 pointer-events-none">
        {session ? (
          <div className="rounded-xl border border-surface-line/70 bg-surface-raised/50 p-2.5 space-y-1.5">
            {/* Player Info Row */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-midnight/8 text-ink-900">
                  <User size={11} />
                </span>
                <span className="truncate text-xs font-bold text-ink-900">
                  {guestOfflinePause
                    ? 'Time Paused'
                    : session.isLocked
                    ? 'Session Locked'
                    : session.username || session.customerName || 'Guest Player'}
                </span>
              </div>

              {/* Billing Mode Badge */}
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded px-1.5 py-0.2 text-[9px] font-black uppercase tracking-wider text-slate-soft bg-surface-raised border border-surface-line/50">
                {session.billing === 'prepaid' ? (
                  <>
                    <Zap size={9} className="text-gold-dim" /> Prepaid
                  </>
                ) : (
                  'Postpaid'
                )}
              </span>
            </div>

            {/* Esports Digital Match Timer */}
            {timer && (
              <div className="flex items-center justify-between rounded-lg bg-surface/80 border border-surface-line/40 px-2 py-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-soft">
                  {session.billing === 'prepaid' ? 'Remaining' : 'Elapsed'}
                </span>
                <span
                  className={`font-mono stat-figure text-sm sm:text-[15px] font-black tracking-tight ${
                    lowTime
                      ? 'text-ember-dim animate-pulse'
                      : isOccupied
                      ? 'text-teal-dim'
                      : 'text-ink-900'
                  }`}
                >
                  {timer}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-surface-line/80 bg-surface-raised/20 p-2 text-slate-soft">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.badgeClass}`}>
              <Icon size={14} />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-ink-900 truncate">
                {statusKey === 'available' ? 'Available to Play' : config.sublabel}
              </p>
              <p className="text-[9px] text-slate-soft truncate">
                {statusKey === 'available' ? 'Click to assign or start session' : 'System idle'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Disconnection or Locked Alert */}
      {disconnected && (
        <div className={`pointer-events-none relative mb-2 flex items-center gap-1.5 rounded-lg px-2 py-1 text-[9px] font-semibold ${
          guestOfflinePause ? 'bg-grape/15 text-grape border border-grape/30' : 'bg-ember/10 text-ember-dim border border-ember/20'
        }`}>
          <ShieldAlert size={11} className="shrink-0" />
          <span className="truncate">
            {guestOfflinePause ? 'Station offline · Time saved' : 'Station connection lost · session still active'}
          </span>
        </div>
      )}

      {/* FOOTER: Hardware Specs & Network Telemetry */}
      <div className="relative z-10 mt-auto flex items-center justify-between gap-2 pt-2 border-t border-surface-line/50 pointer-events-none text-[10px] text-slate-soft">
        <span className="truncate font-medium" title={pc.spec || 'Esports Rig'}>
          {pc.spec || 'Standard Rig'}
        </span>
        <div className="flex shrink-0 items-center gap-1.5 font-mono">
          <span className="stat-figure">{pc.ipAddress || 'No IP'}</span>
          {pc.customerVersion && (
            <span className="rounded bg-surface-raised px-1 py-0.2 text-[8px] font-sans font-bold">
              v{pc.customerVersion}
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
