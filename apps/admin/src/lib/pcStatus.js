export function effectivePcStatus(pc) {
  if (!pc) return 'offline'
  const raw = String(pc.status || '').trim().toLowerCase().replaceAll('_', '-')
  // A live session is authoritative for business state. Connectivity is
  // deliberately represented by stationOnline/cloudOnline instead of changing
  // an occupied desk to Offline when a renderer is minimized or reconnecting.
  if (raw === 'maintenance') return 'maintenance'
  // Reservations also carry lightweight customer metadata in `session`; they
  // are not billable active sessions until a billing mode exists.
  if (raw === 'reserved' && !pc.session?.billing) return 'reserved'
  if (pc.session || ['occupied', 'in-use', 'busy'].includes(raw)) return 'occupied'
  if (raw === 'reserved') return 'reserved'
  if (raw === 'available') return 'available'
  return 'offline'
}

export function isPcStationOnline(pc) {
  if (!pc) return false
  // Explicit transport presence wins over the business/session status. An
  // occupied desk can be temporarily disconnected without ceasing to be in use.
  if (pc.stationOnline === false || pc.isOnline === false || pc.cloudOnline === false || pc.cloudConnectionStatus === 'offline') return false
  if (pc.stationOnline === true || pc.isOnline === true || pc.cloudOnline === true || pc.cloudConnectionStatus === 'online') return true
  if (pc.stationLastSeenAt || pc.cloudLastSeenAt) {
    const seen = new Date(pc.stationLastSeenAt || pc.cloudLastSeenAt).getTime()
    if (Number.isFinite(seen)) return Date.now() - seen <= 180000
  }
  if (pc.status === 'offline' || pc.status === 'inactive') return false
  return pc.status === 'available' || pc.status === 'occupied' || pc.status === 'reserved' || pc.status === 'maintenance'
}
