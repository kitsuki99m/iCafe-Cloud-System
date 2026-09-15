let io = null
let pendingDataChange = null
let dataChangeQueued = false

// Per-room monotonic sequence counter. Socket.io does not guarantee delivery
// order across a reconnect (buffered/replayed emits can interleave with
// fresh ones), and kiosk hardware often has no reliable clock sync, so wall
// clock `at` is not safe for ordering. `seq` is: clients drop any event
// whose seq is <= the last seq they've applied for that room. See
// bindSessionSocket()/seqGuard on the client side.
const roomSeq = new Map()
function nextSeq(room) {
  const n = (roomSeq.get(room) || 0) + 1
  roomSeq.set(room, n)
  return n
}

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
  io?.to('customer-stations').emit('rate-plans:updated', { ...payload, at: Date.now(), seq: nextSeq('customer-stations') })
  emitToStaff('rate-plans:updated', payload)
}

export function emitAnnouncementsUpdated(payload = {}) {
  io?.to('customer-stations').emit('announcements:updated', { ...payload, at: Date.now(), seq: nextSeq('customer-stations') })
  emitToStaff('announcements:updated', payload)
}

export function emitPcPresence(pcId, online, payload = {}) {
  if (!io || !pcId) return
  const event = { pcId, online:Boolean(online), ...payload, at:Date.now(), seq: nextSeq('admin') }
  io.to('admin').emit('pc:presence', event)
  }

export function emitToRoom(room, event, payload = {}) {
  io?.to(room).emit(event, { ...payload, at: Date.now(), seq: nextSeq(room) })
}

export function emitToStaff(event, payload = {}) {
  if (!io) return
  io.to('admin').emit(event, { ...payload, at: Date.now(), seq: nextSeq('admin') })
  }

export function emitToCustomer(memberId, event, payload = {}) {
  if (!memberId) return
  const room = `customer:${memberId}`
  io?.to(room).emit(event, { memberId, ...payload, at: Date.now(), seq: nextSeq(room) })
}

export function emitToPc(pcId, event, payload = {}) {
  if (!pcId) return
  const room = `pc:${pcId}`
  io?.to(room).emit(event, { pcId, ...payload, at: Date.now(), seq: nextSeq(room) })
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
  const at = Date.now()
  // Each room gets its own seq (rooms can fall behind independently — an
  // admin dashboard receives far more events than a single kiosk), but the
  // shared fields must be identical so every audience converges on the same
  // absolute values regardless of arrival order.
  if (memberId) io?.to(`customer:${memberId}`).emit('session:updated', { sessionId, ...payload, at, seq: nextSeq(`customer:${memberId}`) })
  if (pcId) io?.to(`pc:${pcId}`).emit('session:updated', { sessionId, ...payload, at, seq: nextSeq(`pc:${pcId}`) })
  if (io) {
    io.to('admin').emit('session:updated', { sessionId, ...payload, at, seq: nextSeq('admin') })
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
