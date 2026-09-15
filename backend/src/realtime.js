let io = null
let pendingDataChange = null
let dataChangeQueued = false

// Per-session monotonic sequence counter.  Clients compare the `seq` field on
// incoming `session:updated` events to detect and discard stale out-of-order
// deliveries without waiting for a full data reconciliation refresh.
// The map is process-scoped and reset on restart, which is safe: the first
// event after a restart carries seq=1, and clients treat any seq >= their
// last-seen value as authoritative.  Map entries are pruned when a terminal
// session reason is broadcast so the map does not grow without bound across
// long-running deployments with many session turnovers.
const sessionSeqMap = new Map()

function nextSessionSeq(sessionId) {
  const next = (sessionSeqMap.get(sessionId) ?? 0) + 1
  sessionSeqMap.set(sessionId, next)
  return next
}

const TERMINAL_SESSION_REASONS = new Set([
  'session_ended', 'session_expired', 'session_forfeited',
  'session_refunded', 'session_saved', 'session_settled',
  'station_session_released',
])

export function setRealtime(serverIo) {
  io = serverIo
}

export function emitDataChanged(payload = {}) {
  // Generic invalidation is deliberately coalesced within one event-loop turn.
  // A route may emit a domain event and the global HTTP mutation middleware may
  // also invalidate the same data; clients only need one authoritative refresh.
  if (!pendingDataChange) pendingDataChange = payload
  if (dataChangeQueued) return
  dataChangeQueued = true
  queueMicrotask(() => {
    const event = pendingDataChange || {}
    pendingDataChange = null
    dataChangeQueued = false
    io?.emit('data:changed', { ...event, at: Date.now() })
  })
}

// Rate plans are shared configuration: a change made in the admin console
// must be visible to every customer station without a page reload.
export function emitRatePlansUpdated(payload = {}) {
  io?.to('customer-stations').emit('rate-plans:updated', { ...payload, at: Date.now() })
  emitToStaff('rate-plans:updated', payload)
}

export function emitAnnouncementsUpdated(payload = {}) {
  io?.to('customer-stations').emit('announcements:updated', { ...payload, at: Date.now() })
  emitToStaff('announcements:updated', payload)
}

export function emitPcPresence(pcId, online, payload = {}) {
  if (!io || !pcId) return
  const event = { pcId, online:Boolean(online), ...payload, at:Date.now() }
  io.to('admin').emit('pc:presence', event)
  }

export function emitToRoom(room, event, payload = {}) {
  io?.to(room).emit(event, { ...payload, at: Date.now() })
}

export function emitToStaff(event, payload = {}) {
  if (!io) return
  io.to('admin').emit(event, { ...payload, at: Date.now() })
  }

export function emitToCustomer(memberId, event, payload = {}) {
  if (!memberId) return
  io?.to(`customer:${memberId}`).emit(event, { memberId, ...payload, at: Date.now() })
}

export function emitToPc(pcId, event, payload = {}) {
  if (!pcId) return
  io?.to(`pc:${pcId}`).emit(event, { pcId, ...payload, at: Date.now() })
}

export function getIO() {
  return io
}

export function emitTopUpRequest(payload = {}) {
  emitToStaff('topup:new_request', payload)
}

export function emitSupportRequest(payload = {}) {
  emitToStaff('support:new_request', payload)
}

export function emitWalletUpdated(memberId, payload = {}) {
  emitToCustomer(memberId, 'wallet:updated', payload)
  emitToStaff('wallet:updated', { memberId, ...payload })
  emitDataChanged({ method:'SOCKET', path:'/wallet', memberId })
}

export function emitSessionUpdated(sessionId, payload = {}) {
  const memberId = payload.memberId ?? null
  const pcId = payload.pcId ?? null
  // Stamp a monotonic sequence number so clients can detect and discard stale
  // out-of-order events without waiting for a full data reconciliation.
  const seq = nextSessionSeq(sessionId)
  const event = { sessionId, ...payload, seq, at: Date.now() }
  if (memberId) io?.to(`customer:${memberId}`).emit('session:updated', event)
  if (pcId) io?.to(`pc:${pcId}`).emit('session:updated', event)
  if (io) {
    io.to('admin').emit('session:updated', event)
  }
  // Prune map entries for fully-closed sessions so the map does not grow
  // without bound across many session turnovers in long-running deployments.
  if (TERMINAL_SESSION_REASONS.has(String(payload.reason || ''))) {
    sessionSeqMap.delete(sessionId)
  }
}

export function emitTopUpUpdated(payload = {}) {
  if (payload.memberId) emitToCustomer(payload.memberId, 'topup:updated', payload)
  emitToStaff('topup:updated', payload)
}

export function emitSessionExtensionRequest(payload = {}) {
  emitToStaff('extension:new_request', payload)
}

export function emitSessionExtensionUpdated(payload = {}) {
  if (payload.memberId) emitToCustomer(payload.memberId, 'extension:updated', payload)
  if (payload.pcId) emitToPc(payload.pcId, 'extension:updated', payload)
  emitToStaff('extension:updated', payload)
}
