function toTimestamp(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function snapshotAgeSeconds(session, now) {
  const observedAt = toTimestamp(session?.observedAt)
  return observedAt == null ? 0 : Math.max(0, Math.floor((now - observedAt) / 1000))
}

function frozen(session) {
  return Boolean(session?.isPaused || session?.isLocked)
}

export function remainingSessionSeconds(session, now = Date.now()) {
  if (!session || session.billing !== 'prepaid') return 0
  if (Number.isFinite(Number(session.remainingSeconds))) {
    const base = Math.max(0, Math.floor(Number(session.remainingSeconds)))
    return frozen(session) ? base : Math.max(0, base - snapshotAgeSeconds(session, now))
  }
  const expiresAt = toTimestamp(session.expiresAt)
  if (expiresAt == null) return Math.max(0, Math.floor(Number(session.prepaidSeconds || 0)))
  const pausedAt = toTimestamp(session.pausedAt)
  const effectiveNow = frozen(session) && pausedAt != null ? pausedAt : now
  return Math.max(0, Math.floor((expiresAt - effectiveNow) / 1000))
}

export function sessionWarningMinute(remainingSeconds) {
  const seconds = Number(remainingSeconds)
  if (!Number.isFinite(seconds) || seconds <= 5 || seconds > 300) return null
  return seconds > 60 ? 5 : 1
}

export function elapsedSessionSeconds(session, now = Date.now()) {
  if (!session) return 0
  if (Number.isFinite(Number(session.billableSeconds))) {
    const base = Math.max(0, Math.floor(Number(session.billableSeconds)))
    return frozen(session) ? base : base + snapshotAgeSeconds(session, now)
  }
  const startedAt = toTimestamp(session.startedAt)
  if (startedAt == null) return 0
  const pausedAt = toTimestamp(session.pausedAt)
  const effectiveNow = frozen(session) && pausedAt != null ? pausedAt : now
  return Math.max(0, Math.floor((effectiveNow - startedAt) / 1000))
}

export function formatRemainingSession(session, now = Date.now()) {
  const seconds = remainingSessionSeconds(session, now)
  if (seconds <= 0) return 'Expired'
  const mins = Math.ceil(seconds / 60)
  const hours = Math.floor(mins / 60)
  const minutes = mins % 60
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`
}
