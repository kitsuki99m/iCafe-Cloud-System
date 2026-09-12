import {
  AlertTriangle,
  Clock3,
  LockKeyhole,
  PauseCircle,
  Pencil,
  Play,
  Power,
  RefreshCw,
  Settings2,
  UnlockKeyhole,
} from 'lucide-react'
import { getStationActionIds, getStationSessionActionMode } from '../../lib/stationActions.js'

const ACTION_META = {
  session: {
    icon:Play,
    group:'session',
    label:(pc)=>{
      const mode=getStationSessionActionMode(pc)
      return mode==='reservation' ? 'Reservation' : mode==='manage' ? 'Manage session' : 'Start session'
    },
    hint:(pc)=>{
      const mode=getStationSessionActionMode(pc)
      return mode==='reservation' ? 'Review reservation and check in' : mode==='manage' ? 'Billing, end session, refund, or status' : 'Choose customer and rate plan'
    },
  },
  'add-time': { icon:Clock3, group:'session', label:'Add time', hint:'Apply a tier-eligible rate plan' },
  'reduce-time': { icon:Clock3, group:'session', label:'Reduce time', hint:'Adjust the prepaid session safely' },
  'transfer-time': { icon:Clock3, group:'session', label:'Transfer time', hint:'Move prepaid time to another station' },
  'forfeit-time': { icon:AlertTriangle, group:'session', label:'Forfeit saved time', hint:'Permanently end the paused offline session', tone:'danger' },
  lock: { icon:LockKeyhole, group:'station', label:'Lock session', hint:'Pause access at this station' },
  unlock: { icon:UnlockKeyhole, group:'station', label:'Unlock session', hint:'Resume access at this station' },
  'pause-save': { icon:PauseCircle, group:'station', label:'Pause & save time', hint:'End now and save the remaining prepaid time' },
  restart: { icon:RefreshCw, group:'station', label:'Restart client', hint:'Send a restart command to this PC' },
  shutdown: { icon:Power, group:'station', label:'Shutdown client', hint:'Send a shutdown command to this PC', tone:'danger' },
  maintenance: { icon:Settings2, group:'station', label:'Maintenance', hint:'Mark this station temporarily unavailable' },
  'return-available': { icon:Settings2, group:'station', label:'Return available', hint:'Put this station back on the floor' },
  edit: { icon:Pencil, group:'station', label:'Edit PC', hint:'Update station name, IP, or hardware details' },
}

const text = (value, pc) => typeof value === 'function' ? value(pc) : value

export default function StationActions({
  pc,
  variant = 'drawer',
  commandBusy = false,
  pauseSaveBusy = false,
  onSession,
  onTimeAction,
  onForfeit,
  onCommand,
  onPauseSave,
  onMaintenance,
  onEdit,
}) {
  const ids = getStationActionIds(pc)
  const groups = {
    session: ids.filter((id) => ACTION_META[id]?.group === 'session'),
    station: ids.filter((id) => ACTION_META[id]?.group === 'station'),
  }

  function invoke(id) {
    if (id === 'session') return onSession?.(pc)
    if (id === 'add-time') return onTimeAction?.(pc, 'add')
    if (id === 'reduce-time') return onTimeAction?.(pc, 'reduce')
    if (id === 'transfer-time') return onTimeAction?.(pc, 'transfer')
    if (id === 'forfeit-time') return onForfeit?.(pc)
    if (id === 'lock' || id === 'unlock' || id === 'restart' || id === 'shutdown') return onCommand?.(pc, id)
    if (id === 'pause-save') return onPauseSave?.(pc)
    if (id === 'maintenance') return onMaintenance?.(pc, true)
    if (id === 'return-available') return onMaintenance?.(pc, false)
    if (id === 'edit') return onEdit?.(pc)
  }

  const isDisabled = (id) => {
    if (['lock','unlock','restart','shutdown'].includes(id)) return Boolean(commandBusy)
    if (id === 'pause-save') return Boolean(pauseSaveBusy)
    return false
  }

  if (variant === 'popover') {
    return <div className="w-[248px]">
      <div className="border-b border-surface-line px-2.5 py-2">
        <p className="text-xs font-semibold text-ink-900">{pc.label}</p>
        <p className="stat-figure mt-0.5 text-[10px] text-slate-soft">{pc.ipAddress} · {pc.session?.isLocked ? 'locked' : pc.status}</p>
      </div>
      {ids.map((id, index) => {
        const meta = ACTION_META[id]
        const Icon = meta.icon
        const startsStation = meta.group === 'station' && index > 0 && ACTION_META[ids[index - 1]]?.group !== 'station'
        return <div key={id}>
          {startsStation && <div className="my-1 border-t border-surface-line" />}
          <button
            type="button"
            role="menuitem"
            disabled={isDisabled(id)}
            className={`admin-station-menu-action ${meta.tone === 'danger' ? 'danger' : ''}`}
            onClick={() => invoke(id)}
          >
            <Icon size={14}/><span>{id === 'pause-save' && pauseSaveBusy ? 'Saving…' : text(meta.label, pc)}</span>
          </button>
        </div>
      })}
    </div>
  }

  const renderDrawerGroup = (label, actionIds) => actionIds.length ? <section>
    <p className="eyebrow mb-2">{label}</p>
    <div className={label === 'Station controls' ? 'grid grid-cols-2 gap-2' : 'grid gap-2'}>
      {actionIds.map((id) => {
        const meta = ACTION_META[id]
        const Icon = meta.icon
        if (label === 'Station controls') return <button
          type="button"
          key={id}
          disabled={isDisabled(id)}
          className={`admin-control-tile ${meta.tone === 'danger' ? 'danger' : ''}`}
          onClick={() => invoke(id)}
        >
          <Icon size={16}/><span>{id === 'pause-save' && pauseSaveBusy ? 'Saving…' : text(meta.label, pc)}</span>
        </button>
        return <button
          type="button"
          key={id}
          disabled={isDisabled(id)}
          className={`admin-drawer-action ${meta.tone === 'danger' ? 'danger' : ''}`}
          onClick={() => invoke(id)}
        >
          <Icon size={15}/><span><b>{text(meta.label, pc)}</b><small>{text(meta.hint, pc)}</small></span>
        </button>
      })}
    </div>
  </section> : null

  return <div className="space-y-5">
    {renderDrawerGroup('Station controls', groups.station)}
    {renderDrawerGroup('Session actions', groups.session)}
  </div>
}
