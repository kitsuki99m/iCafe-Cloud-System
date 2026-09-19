import { memo } from 'react'
import { CalendarClock, Crown, MonitorCheck, MonitorOff, MonitorPlay, Settings2, TriangleAlert, Wrench, Zap, User, Gamepad2, ShieldAlert } from 'lucide-react'
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

function PcCard({ pc, now = Date.now(), lowTimeWarningMinutes = 5, onSelect, onControls }) {

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
  const isHold = statusKey === 'reserved'

  // Format station display name
  const stationNumber = pc.pcNumber != null && String(pc.pcNumber).trim() !== '' ? String(pc.pcNumber).padStart(2, '0') : null
  const stationTitle = stationNumber ? `PC-${stationNumber}` : (pc.label || 'PC')

  const isVipStation = Boolean(
    pc.isVip ||
    pc.vip ||
    pc.tier === 'VIP' ||
    pc.tier === 'vip' ||
    String(pc.spec || '').toLowerCase().includes('vip') ||
    String(pc.label || '').toLowerCase().includes('vip') ||
    String(pc.zone || '').toLowerCase().includes('vip') ||
    String(pc.category || '').toLowerCase().includes('vip')
  )

  const normalizedLabel = String(pc.label || '').replace(/[\s-_]+/g, '').toLowerCase()
  const normalizedTitle = String(stationTitle || '').replace(/[\s-_]+/g, '').toLowerCase()
  const isDefaultNumberLabel = /^pc0*\d+$/i.test(normalizedLabel) || normalizedLabel === normalizedTitle
  const customNickname = !isDefaultNumberLabel && pc.label && pc.label !== stationTitle ? pc.label : null

  const pillStyles = {
    available: 'text-[var(--free,#2ED3A0)] bg-[color-mix(in_srgb,var(--free,#2ED3A0)_15%,transparent)] border-[color-mix(in_srgb,var(--free,#2ED3A0)_30%,transparent)]',
    occupied: 'text-[var(--live,#FFB020)] bg-[color-mix(in_srgb,var(--live,#FFB020)_15%,transparent)] border-[color-mix(in_srgb,var(--live,#FFB020)_35%,transparent)]',
    reserved: 'text-[var(--hold,#4CC2FF)] bg-[color-mix(in_srgb,var(--hold,#4CC2FF)_15%,transparent)] border-[color-mix(in_srgb,var(--hold,#4CC2FF)_30%,transparent)]',
    maintenance: 'text-[var(--down,#6B7688)] bg-[color-mix(in_srgb,var(--down,#6B7688)_15%,transparent)] border-[color-mix(in_srgb,var(--down,#6B7688)_30%,transparent)]',
    offline: 'text-[var(--muted,#8D9AB5)] bg-[color-mix(in_srgb,var(--muted,#8D9AB5)_12%,transparent)] border-[var(--line,#26314A)]',
  }

  const pillText = {
    available: 'Open',
    occupied: 'In use',
    reserved: 'Reserved',
    maintenance: 'Repair',
    offline: 'Offline',
  }

  const ratePerHour = pc.rate || pc.hourlyRate || (isVipStation ? 60 : 35)
  const dueEstimate = session
    ? (session.billing === 'prepaid'
        ? Number(session.totalAmount || session.paidAmount || 0)
        : Math.round(((elapsed || 0) / 3600) * ratePerHour))
    : 0

  return (
    <article
      data-pc-id={pc.id}
      style={{
        clipPath: 'var(--tile-clip, none)',
        borderRadius: 'var(--tile-r, 12px)',
      }}
      className={`nexus-tile tile group relative flex min-h-[160px] flex-col justify-between border p-3.5 transition-all duration-200 hover:-translate-y-0.5 ${
        isOccupied
          ? 'live border-[color-mix(in_srgb,var(--live,#FFB020)_45%,var(--line,#26314A))] shadow-[0_10px_26px_-14px_var(--glow,rgba(255,176,32,0.3))] ring-1 ring-[color-mix(in_srgb,var(--live,#FFB020)_30%,transparent)]'
          : lowTime
          ? 'border-ember bg-ember/10 shadow-[0_0_20px_rgba(239,68,68,0.25)] ring-1 ring-ember animate-pulse'
          : 'border-[var(--line,#26314A)] bg-[var(--surface,#131A28)]/90 hover:border-[var(--brand,#7B61FF)]'
      }`}
    >
      {/* Click target for full card selection */}
      <button
        type="button"
        onClick={(event) => onSelect?.(pc, event)}
        className="absolute inset-0 z-0 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand,#7B61FF)]"
        aria-label={`Open station ${stationTitle}`}
      />

      {/* TOP ROW: Station Title + Status Pill + Settings */}
      <div className="relative z-10 flex items-center justify-between gap-2 pointer-events-none">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-display font-bold text-sm sm:text-base tracking-tight text-[var(--text,#E6EAF2)]">
            {stationTitle}
          </span>
          {isVipStation && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/20 px-1.5 py-0.2 text-[9px] font-black text-amber-400 border border-amber-500/40">
              <Crown size={9} /> VIP
            </span>
          )}
          {customNickname && (
            <span className="truncate text-[10px] text-[var(--muted,#8D9AB5)]" title={customNickname}>
              ({customNickname})
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 pointer-events-auto">
          {/* Status Pill matching Claude artifact */}
          <span
            className={`pill inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
              pillStyles[statusKey] || pillStyles.offline
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                isOccupied ? 'bg-[var(--live,#FFB020)] animate-pulse' : 'bg-current'
              }`}
            />
            {lowTime ? '<5m left' : pillText[statusKey] || 'Offline'}
          </span>

          {onControls && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation()
                onControls(pc, event)
              }}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--line,#26314A)] text-[var(--muted,#8D9AB5)] transition hover:bg-[var(--surface-2,#1A2233)] hover:text-[var(--text,#E6EAF2)]"
              title="Station Quick Controls"
            >
              <Settings2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* MIDDLE ROW: Big Monospace Timer Readout */}
      <div className="relative z-10 my-1 pointer-events-none">
        <div
          className={`font-mono text-xl sm:text-2xl font-bold tracking-tight ${
            isOccupied
              ? 'text-[var(--text,#E6EAF2)]'
              : statusKey === 'available'
              ? 'text-[var(--faint,#6B7891)]'
              : 'text-[var(--muted,#8D9AB5)]'
          }`}
        >
          {isOccupied && timer ? timer : statusKey === 'available' ? '00:00:00' : '—'}
        </div>
      </div>

      {/* FOOTER ROW: Who & Cost/Rate */}
      <div className="relative z-10 flex flex-col gap-0.5 pointer-events-none text-xs">
        <div className="truncate font-medium text-[var(--muted,#8D9AB5)]">
          {isOccupied
            ? `${session?.customerName || session?.username || 'Guest'} · ${pc.game || session?.game || 'Match'}`
            : isHold
            ? `Held for ${pc.reservedFor || 'a player'}`
            : statusKey === 'maintenance'
            ? 'In maintenance'
            : 'Ready for player'}
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono text-[var(--faint,#6B7891)]">
          <span>
            {isOccupied
              ? `₱${dueEstimate.toLocaleString('en-PH')} · ${session?.billing === 'prepaid' ? 'Prepaid' : 'Standard'}`
              : statusKey === 'available'
              ? `₱${ratePerHour}/hr`
              : pc.spec || 'Gaming Station'}
          </span>
          {pc.ipAddress && <span className="text-[10px] opacity-75">{pc.ipAddress}</span>}
        </div>
      </div>
    </article>
  )
}

export default memo(PcCard)

