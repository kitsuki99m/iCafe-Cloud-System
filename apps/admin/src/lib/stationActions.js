import { effectivePcStatus, isPcStationOnline } from './pcStatus.js'

export function isStationReachable(pc) {
  return isPcStationOnline(pc)
}

export function getStationSessionActionMode(pc) {
  if (!pc) return null
  const rawStatus = String(pc.status || '').toLowerCase()
  if (rawStatus === 'reserved' && pc.session) return 'reservation'
  const status = effectivePcStatus(pc)
  if (pc.session) return 'manage'
  if (status === 'available') return 'start'
  return null
}

export function getStationActionIds(pc) {
  if (!pc) return []
  const actions = []
  const hasSession = Boolean(pc.session)
  const prepaid = pc.session?.billing === 'prepaid'
  const reachable = isStationReachable(pc)

  if (getStationSessionActionMode(pc)) actions.push('session')
  if (prepaid) actions.push('add-time', 'reduce-time', 'transfer-time')
  if (!reachable && prepaid) actions.push('forfeit-time')
  if (hasSession && reachable) actions.push(pc.session?.isLocked ? 'unlock' : 'lock')
  if (pc.session?.isLocked && prepaid) actions.push('pause-save')
  if (reachable) actions.push('restart', 'shutdown')
  if (!hasSession && reachable) actions.push(effectivePcStatus(pc) === 'maintenance' ? 'return-available' : 'maintenance')
  actions.push('edit')

  return actions
}
