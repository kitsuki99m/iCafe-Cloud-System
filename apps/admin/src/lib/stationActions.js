export function isStationReachable(pc) {
  return String(pc?.status || '').toLowerCase() !== 'offline'
}

export function getStationSessionActionMode(pc) {
  if (!pc) return null
  const status = String(pc.status || '').toLowerCase()
  if (status === 'reserved' && pc.session) return 'reservation'
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
  if (pc.status === 'offline' && prepaid) actions.push('forfeit-time')
  if (hasSession && reachable) actions.push(pc.session?.isLocked ? 'unlock' : 'lock')
  if (pc.session?.isLocked && prepaid) actions.push('pause-save')
  if (reachable) actions.push('restart', 'shutdown')
  if (!hasSession && reachable) actions.push(pc.status === 'maintenance' ? 'return-available' : 'maintenance')
  actions.push('edit')

  return actions
}
