import { db, nowIso } from '../db/connection.js'
import { id } from './helpers.js'
import { env } from '../config/env.js'

export function sessionHeartbeatStaleMs() {
  return Math.max(25000, Number(env.heartbeatSeconds || 10) * 2500)
}

export function isSessionHeartbeatStale(session, nowMs = Date.now()) {
  if (!session?.last_heartbeat_at) return false
  return nowMs - new Date(session.last_heartbeat_at).getTime() > sessionHeartbeatStaleMs()
}

export function remainingSecondsForSession(session, nowMs = Date.now()) {
  if (!session || session.billing_type !== 'prepaid' || !session.expires_at) return 0
  const activePause = db.prepare('SELECT paused_at FROM session_pauses WHERE computer_session_id=? AND resumed_at IS NULL LIMIT 1').get(session.id)
  const effectiveNow = activePause ? Math.min(nowMs, new Date(activePause.paused_at).getTime()) : nowMs
  return Math.max(0, Math.floor((new Date(session.expires_at).getTime() - effectiveNow) / 1000))
}

export function activeSessionPause(sessionId) {
  if (!sessionId) return null
  return db.prepare('SELECT * FROM session_pauses WHERE computer_session_id=? AND resumed_at IS NULL LIMIT 1').get(sessionId) || null
}

export function pausedSecondsForSession(sessionId, nowMs = Date.now()) {
  if (!sessionId) return 0
  const rows = db.prepare('SELECT paused_at,resumed_at FROM session_pauses WHERE computer_session_id=?').all(sessionId)
  return rows.reduce((total, row) => {
    const start = new Date(row.paused_at).getTime()
    const end = row.resumed_at ? new Date(row.resumed_at).getTime() : nowMs
    return total + Math.max(0, Math.floor((end - start) / 1000))
  }, 0)
}

export function elapsedBillableSeconds(session, nowMs = Date.now()) {
  if (!session?.started_at) return 0
  const elapsed = Math.max(0, Math.floor((nowMs - new Date(session.started_at).getTime()) / 1000))
  return Math.max(0, elapsed - pausedSecondsForSession(session.id, nowMs))
}

export function pauseActiveSession(pcId, { reason='admin_lock', commandId=null, userId=null, at=nowIso() } = {}) {
  const session = db.prepare("SELECT * FROM computer_sessions WHERE pc_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(pcId)
  if (!session) return null
  const atMsRaw = new Date(at).getTime()
  const atMs = Number.isFinite(atMsRaw) ? Math.min(Date.now(), Math.max(new Date(session.started_at || at).getTime(), atMsRaw)) : Date.now()
  const checkpointAt = new Date(atMs).toISOString()
  let pause = activeSessionPause(session.id)
  let created = false
  if (!pause) {
    pause = { id:id(), computer_session_id:session.id, reason, paused_at:checkpointAt, resumed_at:null, command_id:commandId, created_by:userId }
    db.prepare('INSERT INTO session_pauses(id,computer_session_id,reason,paused_at,resumed_at,command_id,created_by) VALUES(?,?,?,?,?,?,?)')
      .run(pause.id,pause.computer_session_id,pause.reason,pause.paused_at,null,pause.command_id,pause.created_by)
    created = true
  }

  // A pause is also a durable billing checkpoint. This is intentionally done
  // when the blocking action is requested, not when the station later ACKs it,
  // so no paid time can leak while a lock/power command is already hindering use.
  const remainingSeconds = session.billing_type === 'prepaid' ? remainingSecondsForSession(session, atMs) : 0
  const elapsedBillable = session.billing_type === 'postpaid' ? elapsedBillableSeconds(session, atMs) : 0
  const amountDue = session.billing_type === 'postpaid'
    ? Math.max(0, Math.round((elapsedBillable / 60) * Number(session.postpaid_rate_per_minute || 0) * 100) / 100)
    : 0
  db.prepare(`UPDATE computer_sessions
    SET last_heartbeat_at=?,saved_remaining_seconds=?,unsettled_amount_due=?
    WHERE id=? AND status='active'`)
    .run(checkpointAt,remainingSeconds,amountDue,session.id)
  if (session.member_id && session.billing_type === 'prepaid') {
    db.prepare('UPDATE members SET session_seconds_remaining=?,updated_at=? WHERE id=?')
      .run(remainingSeconds,checkpointAt,session.member_id)
  }
  return { session, pause, created, remainingSeconds, elapsedBillableSeconds:elapsedBillable, amountDue, checkpointAt }
}

export function resumeActiveSession(pcId, { commandId=null, at=nowIso() } = {}) {
  const session = db.prepare("SELECT * FROM computer_sessions WHERE pc_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(pcId)
  if (!session) return null
  const pause = activeSessionPause(session.id)
  if (!pause) return { session, pause:null, resumed:false, pausedSeconds:0 }
  const pausedSeconds = Math.max(0, Math.floor((new Date(at).getTime() - new Date(pause.paused_at).getTime()) / 1000))
  if (session.billing_type === 'prepaid' && session.expires_at && pausedSeconds > 0) {
    db.prepare('UPDATE computer_sessions SET expires_at=? WHERE id=?').run(new Date(new Date(session.expires_at).getTime() + pausedSeconds * 1000).toISOString(),session.id)
  }
  db.prepare('UPDATE session_pauses SET resumed_at=?,command_id=COALESCE(command_id,?) WHERE id=? AND resumed_at IS NULL').run(at,commandId,pause.id)
  db.prepare("UPDATE computer_sessions SET saved_remaining_seconds=NULL,unsettled_amount_due=NULL WHERE id=? AND status='active'").run(session.id)
  return { session, pause, resumed:true, pausedSeconds }
}

export function extendPrepaidSession(sessionOrId, addedSeconds, nowMs = Date.now()) {
  const session = typeof sessionOrId === 'string'
    ? db.prepare("SELECT * FROM computer_sessions WHERE id=? AND status='active'").get(sessionOrId)
    : sessionOrId
  if (!session || session.status !== 'active' || session.billing_type !== 'prepaid') {
    throw Object.assign(new Error('Only an active prepaid session can be extended.'), { status:409, code:'PREPAID_SESSION_REQUIRED', expose:true })
  }
  const seconds = Math.max(0, Math.floor(Number(addedSeconds || 0)))
  if (!(seconds > 0)) throw Object.assign(new Error('Extension time must be greater than zero.'), { status:400, code:'INVALID_EXTENSION_TIME', expose:true })
  const pause = activeSessionPause(session.id)
  const remaining = remainingSecondsForSession(session, nowMs)
  const anchorMs = pause?.paused_at ? new Date(pause.paused_at).getTime() : nowMs
  const newRemaining = remaining + seconds
  const expiresAt = new Date(anchorMs + newRemaining * 1000).toISOString()
  db.prepare("UPDATE computer_sessions SET prepaid_seconds=COALESCE(prepaid_seconds,0)+?,expires_at=? WHERE id=? AND status='active'")
    .run(seconds, expiresAt, session.id)
  if (session.member_id) {
    db.prepare('UPDATE members SET session_seconds_remaining=?,updated_at=? WHERE id=?')
      .run(newRemaining, new Date(nowMs).toISOString(), session.member_id)
  }
  return { ...session, prepaid_seconds:Number(session.prepaid_seconds || 0)+seconds, expires_at:expiresAt, remainingSeconds:newRemaining }
}

export function checkpointMemberSession(memberId, sessionId = null, nowMs = Date.now()) {
  if (!memberId) return 0
  const session = sessionId
    ? db.prepare("SELECT * FROM computer_sessions WHERE id=? AND member_id=? AND status='active'").get(sessionId, memberId)
    : db.prepare("SELECT * FROM computer_sessions WHERE member_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(memberId)
  if (!session) return Number(db.prepare('SELECT session_seconds_remaining FROM members WHERE id=?').get(memberId)?.session_seconds_remaining ?? 0)
  const heartbeatStale = isSessionHeartbeatStale(session, nowMs)
  const stored = Number(db.prepare('SELECT session_seconds_remaining FROM members WHERE id=?').get(memberId)?.session_seconds_remaining ?? 0)
  const remaining = heartbeatStale ? Math.max(0, stored) : remainingSecondsForSession(session, nowMs)
  db.prepare('UPDATE members SET session_seconds_remaining=?, updated_at=? WHERE id=?').run(remaining, new Date(nowMs).toISOString(), memberId)
  if (heartbeatStale && remaining > 0) {
    db.prepare("UPDATE computer_sessions SET expires_at=?, last_heartbeat_at=? WHERE id=? AND status='active'").run(new Date(nowMs + remaining * 1000).toISOString(), new Date(nowMs).toISOString(), session.id)
  }
  return remaining
}

export function releaseStationSession(pcId, { reason='station_exit', at=nowIso(), expectedMemberId=undefined, markAvailable=true } = {}) {
  if (!pcId) return null
  const session = db.prepare("SELECT * FROM computer_sessions WHERE pc_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(pcId)
  const releasedAtMs = Math.min(Date.now(), Math.max(
    session?.started_at ? new Date(session.started_at).getTime() : 0,
    session?.last_heartbeat_at ? new Date(session.last_heartbeat_at).getTime() : 0,
    Number.isFinite(new Date(at).getTime()) ? new Date(at).getTime() : Date.now(),
  ))
  const releasedAt = new Date(releasedAtMs).toISOString()

  if (!session) {
    if (markAvailable) db.prepare("UPDATE pcs SET status='available',updated_at=? WHERE id=? AND status NOT IN ('maintenance','reserved')").run(releasedAt, pcId)
    return { released:false, pcId, releasedAt, reason, markAvailable }
  }
  if (expectedMemberId !== undefined && String(session.member_id || '') !== String(expectedMemberId || '')) return null

  const remaining = session.billing_type === 'prepaid' ? remainingSecondsForSession(session, releasedAtMs) : 0
  const elapsed = session.billing_type === 'postpaid' ? elapsedBillableSeconds(session, releasedAtMs) : 0
  const amountDue = session.billing_type === 'postpaid'
    ? Math.max(0, Math.round((elapsed / 60) * Number(session.postpaid_rate_per_minute || 0) * 100) / 100)
    : 0

  const activePause = activeSessionPause(session.id)
  if (activePause) {
    const resumedAt = new Date(Math.max(new Date(activePause.paused_at).getTime(), releasedAtMs)).toISOString()
    db.prepare('UPDATE session_pauses SET resumed_at=? WHERE id=? AND resumed_at IS NULL').run(resumedAt, activePause.id)
  }

  if (session.member_id && session.billing_type === 'prepaid') {
    db.prepare('UPDATE members SET session_seconds_remaining=?,updated_at=? WHERE id=?').run(remaining, releasedAt, session.member_id)
  }

  db.prepare(`UPDATE computer_sessions
    SET status='ended',ended_at=?,last_heartbeat_at=?,end_reason=?,saved_remaining_seconds=?,
        unsettled_amount_due=?,settlement_pending=?,settlement_method=CASE WHEN ?=1 THEN 'pending' ELSE settlement_method END
    WHERE id=? AND status='active'`)
    .run(releasedAt,releasedAt,String(reason||'station_exit'),remaining,amountDue,session.billing_type==='postpaid'?1:0,session.billing_type==='postpaid'?1:0,session.id)
  if (markAvailable) db.prepare("UPDATE pcs SET status='available',updated_at=? WHERE id=? AND status NOT IN ('maintenance','reserved')").run(releasedAt, pcId)

  return {
    ...session,
    released:true,
    releasedAt,
    reason,
    remainingSeconds:remaining,
    elapsedBillableSeconds:elapsed,
    amountDue,
    settlementPending:session.billing_type === 'postpaid',
    markAvailable,
  }
}

export function closeSessionAndSaveRemaining(sessionId, nowMs = Date.now()) {
  const session = db.prepare("SELECT * FROM computer_sessions WHERE id=? AND status='active'").get(sessionId)
  if (!session) return null
  return releaseStationSession(session.pc_id, { reason:'session_end_save', at:new Date(nowMs).toISOString(), expectedMemberId:session.member_id ?? undefined })
}

export function clearExpiredMemberSession(memberId, nowMs = Date.now()) {
  const session = db.prepare("SELECT * FROM computer_sessions WHERE member_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(memberId)
  if (!session) return 0
  const remaining = remainingSecondsForSession(session, nowMs)
  if (remaining > 0) return remaining
  closeSessionAndSaveRemaining(session.id, nowMs)
  return 0
}
