// Tracks the last-applied `seq` per logical room ('admin', `pc:{id}`,
// `customer:{id}`, 'customer-stations') and rejects anything at or behind
// it. This guards against two real scenarios with Socket.io:
//  1. A reconnect replaying/racing with a fresh emit can deliver events out
//     of the order the server sent them.
//  2. Two socket transports can briefly overlap during failover (this app
//     falls back to a secondary cloud socket in some configs).
// `seq` is a per-room monotonic counter assigned server-side in
// backend/src/realtime.js — NOT the wall-clock `at` field, since admin/kiosk
// hardware clocks are not assumed to be in sync.
export function createSeqGuard() {
  const lastSeqByRoom = new Map()

  // room: the room the event's `seq` was scoped to server-side. For events
  // that always land in the admin's own 'admin' room this is optional.
  return function accept(payload, room = 'admin') {
    const seq = payload?.seq
    if (typeof seq !== 'number' || !Number.isFinite(seq)) return true // no seq (legacy/test event) — don't block it
    const last = lastSeqByRoom.get(room) || 0
    if (seq <= last) return false
    lastSeqByRoom.set(room, seq)
    return true
  }
}
