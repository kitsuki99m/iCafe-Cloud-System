export function isPcStationOnline(pc) {
  if (!pc) return false
  if (pc.status === 'offline' || pc.status === 'inactive') return false
  if (pc.stationOnline === false || pc.isOnline === false) return false
  if (pc.stationLastSeenAt) return Date.now() - new Date(pc.stationLastSeenAt).getTime() <= 60000
  return pc.status === 'available' || pc.status === 'occupied' || pc.status === 'reserved'
}
