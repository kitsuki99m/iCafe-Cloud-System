// Tracks the last-applied `seq` per logical room and rejects anything at or
// behind it — see backend/src/realtime.js for how `seq` is assigned
// server-side. Kiosk hardware clocks are not assumed to be in sync, so
// ordering is keyed off this monotonic counter, never the wall-clock `at`
// field.
export function createSeqGuard() {
  const lastSeqByRoom = new Map()

  return function accept(payload, room = 'session') {
    const seq = payload?.seq
    if (typeof seq !== 'number' || !Number.isFinite(seq)) return true // no seq (legacy/test event) — don't block it
    const last = lastSeqByRoom.get(room) || 0
    if (seq <= last) return false
    lastSeqByRoom.set(room, seq)
    return true
  }
}
