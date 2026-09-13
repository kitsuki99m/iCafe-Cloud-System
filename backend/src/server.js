import { createApp } from './app.js'
import { env } from './config/env.js'
import { migrate } from './db/schema.js'
import { db, transaction } from './db/connection.js'
import { ensureMemberProfileColumns } from './db/memberProfileMigration.js'
import { ensureBootstrapAdmin } from './db/bootstrapAdmin.js'
import { Server as SocketIOServer } from 'socket.io'
import { setRealtime, emitSessionUpdated, emitDataChanged, emitPcPresence } from './realtime.js'
import jwt from 'jsonwebtoken'
import { activeSessionPause, closeSessionAndSaveRemaining, isSessionHeartbeatStale, remainingSecondsForSession, releaseStationSession, resumeActiveSession } from './utils/sessionTime.js'
import { normalizeIp, isValidIpv4 } from './middleware/clientIdentity.js'
import { stationCredentialMatches } from './utils/stationAuth.js'
import { startCloudSyncWorker, stopCloudSyncWorker } from './cloud/syncWorker.js'

migrate()
ensureMemberProfileColumns()
await ensureBootstrapAdmin()

// A queued/running command belongs to the backend process that delivered it.
// Process-local acknowledgement timers disappear on restart, so never replay a
// command inherited from a previous process — especially shutdown/reboot.
const remoteCommandCleanupAt = new Date().toISOString()
const inheritedLockCommands=db.prepare("SELECT id,pc_id FROM remote_commands WHERE status IN ('queued','running') AND command='lock'").all()
for (const command of inheritedLockCommands) {
  const active=db.prepare("SELECT id FROM computer_sessions WHERE pc_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(command.pc_id)
  const pause=active ? activeSessionPause(active.id) : null
  if (pause && String(pause.command_id || '') === String(command.id)) {
    resumeActiveSession(command.pc_id,{commandId:command.id,at:remoteCommandCleanupAt})
  }
}
db.prepare("UPDATE remote_commands SET status='failed',executed_at=?,result=? WHERE status IN ('queued','running')")
  .run(remoteCommandCleanupAt,JSON.stringify({error:'Remote command cancelled because the backend restarted.',code:'REMOTE_COMMAND_SERVER_RESTARTED'}))

// Presence belongs to this backend process, not to the last value stored in
// SQLite. After a restart no Customer Station sockets exist yet, so every
// normal station must be treated as offline until it proves itself by making a
// valid paired socket connection. Keep intentional maintenance/reservation
// states untouched and keep active sessions intact for recovery/management.
const presenceResetAt = new Date().toISOString()
db.prepare("UPDATE pcs SET status='offline', updated_at=? WHERE status IN ('available','occupied')").run(presenceResetAt)
const app = createApp()

function cleanupExpiredComputerSessions() {
  const scanAt = new Date().toISOString()
  const candidateIds = db.prepare(`SELECT id FROM computer_sessions WHERE status='active' AND expires_at IS NOT NULL AND expires_at<=?`).all(scanAt).map(row=>row.id)
  if (!candidateIds.length) return
  const closed = transaction(() => {
    // Revalidate after obtaining the IMMEDIATE write lock. An extension may
    // have renewed the session after the read-only candidate scan.
    const results=[]
    for (const sessionId of candidateIds) {
      const nowMs=Date.now(); const now=new Date(nowMs).toISOString()
      const s=db.prepare(`SELECT * FROM computer_sessions
        WHERE id=? AND status='active' AND expires_at IS NOT NULL AND expires_at<=?
          AND NOT EXISTS (SELECT 1 FROM session_pauses sp WHERE sp.computer_session_id=computer_sessions.id AND sp.resumed_at IS NULL)`)
        .get(sessionId,now)
      if(!s) continue
      const changed=db.prepare("UPDATE computer_sessions SET status='ended',ended_at=? WHERE id=? AND status='active' AND expires_at IS NOT NULL AND expires_at<=?").run(now,s.id,now)
      if(changed.changes!==1) continue
      if(s.member_id) {
        db.prepare('UPDATE members SET session_seconds_remaining=0,updated_at=? WHERE id=?').run(now,s.member_id)
        db.prepare(`UPDATE auth_sessions SET revoked_at=? WHERE revoked_at IS NULL AND user_id=(SELECT user_id FROM members WHERE id=?)`).run(now,s.member_id)
      }
      db.prepare("UPDATE pcs SET status='available',updated_at=? WHERE id=? AND status='occupied'").run(now,s.pc_id)
      results.push({...s,remainingSeconds:0})
    }
    return results
  })
  for(const s of closed) emitSessionUpdated(s.id,{pcId:s.pc_id,memberId:s.member_id,reason:'session_expired',remainingSeconds:0})
  if(closed.length) emitDataChanged({method:'SYSTEM',path:'/sessions/expire'})
}
cleanupExpiredComputerSessions()
const cleanupTimer=setInterval(cleanupExpiredComputerSessions,5000)
const server=app.listen(env.port,env.host,()=>{
  console.log(`Aezakmi Cafe backend listening on http://${env.host}:${env.port}`)
  console.log(`iCafe8 diskless provider: ${env.disklessProvider}`)
})
startCloudSyncWorker()
if (env.cloudEnabled) console.log(`Aezakmi Cloud sync enabled: ${env.supabaseUrl}`)
const io=new SocketIOServer(server,{cors:{origin:env.corsOrigin==='*'?true:env.corsOrigin.split(',').map(x=>x.trim()).filter(Boolean)}})
setRealtime(io)
const stationDisconnectTimers = new Map()
const STATION_DISCONNECT_GRACE_MS = 3000

// Presence is independent from a session's billing state.  A station that
// reconnects while its guest session is active must immediately become busy
// again instead of remaining visually offline until another mutation occurs.
function restorePcPresence(pcId) {
  const now = new Date().toISOString()
  const powerPending = db.prepare(`SELECT id FROM remote_commands
    WHERE pc_id=? AND command IN ('shutdown','reboot') AND status IN ('queued','running')
      AND (expires_at IS NULL OR expires_at>?) LIMIT 1`).get(pcId, now)
  // A shutdown/reboot command checkpoints and releases the paid session before
  // Windows executes it. The station can reconnect its socket during the
  // warning, but that must never make the seat Available again while power-off
  // is still pending.
  if (powerPending) {
    db.prepare("UPDATE pcs SET status='offline',updated_at=? WHERE id=? AND status<>'maintenance'").run(now, pcId)
    return
  }
  db.prepare("UPDATE pcs SET status=CASE WHEN EXISTS (SELECT 1 FROM computer_sessions WHERE pc_id=pcs.id AND status='active') THEN 'occupied' ELSE 'available' END,updated_at=? WHERE id=? AND status='offline'")
    .run(now, pcId)
}

io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token
  const advertisedIp = normalizeIp(socket.handshake.auth?.clientIp)
  const peerIp = normalizeIp(socket.handshake.address)
  const trustedAdvertisedIp = advertisedIp && isValidIpv4(advertisedIp) && ((peerIp === '127.0.0.1' && (env.nodeEnv !== 'production' || env.embeddedCustomerServer)) || advertisedIp === peerIp) ? advertisedIp : ''
  const stationIp = trustedAdvertisedIp || (isValidIpv4(peerIp) ? peerIp : '')
  const suppliedStationToken=String(socket.handshake.auth?.stationToken||'')
  let auth = null
  let presencePcId = null

  if (token) {
    try {
      const payload = jwt.verify(String(token), env.jwtSecret)
      const session = db.prepare(`
        SELECT a.*, u.role, u.is_active, u.member_id, u.must_change_credentials
        FROM auth_sessions a
        JOIN users u ON u.id = a.user_id
        WHERE a.jwt_id = ?
      `).get(payload.jti)

      const active = session && !session.revoked_at && session.is_active && new Date(session.expires_at).getTime() > Date.now()
      if (active) {
        if (session.role === 'admin' && Boolean(session.must_change_credentials)) {
          socket.emit('auth:setup-required', { reason:'credential_setup_required' })
          socket.disconnect(true)
          return
        }
        const claimedPc = stationIp ? db.prepare('SELECT id,ip_address,status,station_token_hash FROM pcs WHERE ip_address=?').get(stationIp) : null
        if (session.role === 'customer' && session.pc_id && (!claimedPc || String(session.pc_id) !== String(claimedPc.id) || !stationCredentialMatches(claimedPc, suppliedStationToken))) {
          socket.disconnect(true)
          return
        }
        auth = { role:session.role, memberId:session.member_id, pcId:session.pc_id, userId:session.user_id, sessionId:session.id, jwtId:session.jwt_id }
        socket.data.auth = auth
        if (session.role === 'admin') socket.join('admin')
        if (session.member_id) socket.join(`customer:${session.member_id}`)
        if (session.role === 'customer' && session.pc_id) socket.join('customer-stations')
        if (session.pc_id) {
          presencePcId = session.pc_id
          socket.join(`pc:${session.pc_id}`)
          restorePcPresence(session.pc_id)
          emitPcPresence(session.pc_id, true, { role:session.role })
          emitDataChanged({ method:'SOCKET', path:'/pcs/presence', pcId:session.pc_id, online:true })
        }
      }
    } catch {
      // Anonymous realtime connections are allowed for login/guest screens,
      // but they are never placed in private rooms.
    }
  }

  // Guest stations have no JWT, but still identify themselves through the
  // trusted Electron-provided station IP so Admin can track their presence.
  if (!presencePcId && !auth && stationIp) {
    const guestPc = db.prepare('SELECT id,status,station_token_hash FROM pcs WHERE ip_address=?').get(stationIp)
    // A browser development station may lose its local enrollment token when
    // storage is cleared. Limit this recovery path to a local peer with an
    // already-active guest session; production stations always need pairing.
    const activeGuestSession=guestPc && db.prepare("SELECT id FROM computer_sessions WHERE pc_id=? AND member_id IS NULL AND status='active' LIMIT 1").get(guestPc.id)
    const localGuestDevelopmentRecovery=env.nodeEnv !== 'production' && peerIp === '127.0.0.1' && Boolean(activeGuestSession)
    if (guestPc && (stationCredentialMatches(guestPc, suppliedStationToken) || localGuestDevelopmentRecovery)) {
      presencePcId = guestPc.id
      socket.data.guestPcId = guestPc.id
      socket.join(`pc:${guestPc.id}`)
      socket.join('customer-stations')
      restorePcPresence(guestPc.id)
      emitPcPresence(guestPc.id, true, { role:'guest' })
      emitDataChanged({ method:'SOCKET', path:'/pcs/presence', pcId:guestPc.id, online:true })
    }
  }

  if (presencePcId) {
    const pendingDisconnect = stationDisconnectTimers.get(presencePcId)
    if (pendingDisconnect) {
      clearTimeout(pendingDisconnect)
      stationDisconnectTimers.delete(presencePcId)
    }
    const activeSession=db.prepare("SELECT id,member_id,billing_type FROM computer_sessions WHERE pc_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(presencePcId)
    const pause=activeSession ? activeSessionPause(activeSession.id) : null
    // Legacy builds paused sessions on reboot/offline and silently resumed them
    // when the station came back. The Customer lifecycle now treats a real PC
    // exit as logout: save prepaid time (or freeze postpaid debt), release the
    // seat, and require a fresh member/guest session after restart.
    if (activeSession && (pause?.reason === 'reboot' || pause?.reason === 'station_offline')) {
      const released = releaseStationSession(presencePcId,{ reason:`legacy_${pause.reason}_recovery`, at:pause.paused_at })
      const revokedAt = new Date().toISOString()
      db.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?),ended_at=COALESCE(ended_at,?),end_reason=COALESCE(end_reason,'station_restart') WHERE pc_id=? AND revoked_at IS NULL")
        .run(revokedAt,revokedAt,presencePcId)
      if (released?.released) emitSessionUpdated(activeSession.id,{pcId:presencePcId,memberId:activeSession.member_id,reason:'station_session_released',endReason:pause.reason,remainingSeconds:released.remainingSeconds,amountDue:released.amountDue,settlementPending:released.settlementPending,locked:true})
    }
    const replayNow=new Date().toISOString()
    const expiredReplayLocks=db.prepare("SELECT id FROM remote_commands WHERE pc_id=? AND command='lock' AND status IN ('queued','running') AND ((expires_at IS NOT NULL AND expires_at<=?) OR (expires_at IS NULL AND julianday(requested_at)<=julianday('now','-30 seconds')))").all(presencePcId,replayNow)
    for (const command of expiredReplayLocks) {
      const expiredCommandPcId=presencePcId
      const currentSession=db.prepare("SELECT id FROM computer_sessions WHERE pc_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(expiredCommandPcId)
      const currentPause=currentSession ? activeSessionPause(currentSession.id) : null
      if (currentPause && String(currentPause.command_id || '') === String(command.id)) resumeActiveSession(expiredCommandPcId,{commandId:command.id,at:replayNow})
    }
    const expiredReplay=db.prepare("UPDATE remote_commands SET status='failed',executed_at=?,result=? WHERE pc_id=? AND status IN ('queued','running') AND ((expires_at IS NOT NULL AND expires_at<=?) OR (expires_at IS NULL AND julianday(requested_at)<=julianday('now','-30 seconds')) OR (status='queued' AND command IN ('shutdown','reboot') AND warning_expires_at IS NOT NULL AND warning_expires_at<=?))")
      .run(replayNow,JSON.stringify({error:'Remote command expired before reconnect replay.',code:'REMOTE_COMMAND_EXPIRED'}),presencePcId,replayNow,replayNow)
    if(expiredReplay.changes) emitDataChanged({method:'EXPIRE',path:'/remote-commands',pcId:presencePcId})
    const queued=db.prepare("SELECT id,command,payload,warning_started_at,warning_expires_at,expires_at FROM remote_commands WHERE pc_id=? AND status='queued' AND (expires_at IS NULL OR expires_at>?) ORDER BY requested_at").all(presencePcId,replayNow)
    for(const command of queued) {
      const warningExpiresAt=command.warning_expires_at || null
      const warningSeconds=warningExpiresAt ? Math.max(0,Math.ceil((new Date(warningExpiresAt).getTime()-Date.now())/1000)) : 0
      socket.emit('remote:command',{id:command.id,command:command.command,payload:command.payload?JSON.parse(command.payload):null,warningSeconds,warningExpiresAt,expiresAt:command.expires_at || null,replayed:true})
    }
  }

  const sessionCheck = auth ? setInterval(() => {
    const current = db.prepare('SELECT revoked_at,expires_at FROM auth_sessions WHERE id=?').get(auth.sessionId)
    const sessionInvalid = !current || current.revoked_at || new Date(current.expires_at).getTime() <= Date.now()
    if (sessionInvalid) {
      socket.emit('auth:revoked', { sessionId:auth.sessionId, reason:current?.revoked_at ? 'revoked' : 'expired' })
      socket.disconnect(true)
      return
    }
    if (auth.role === 'customer' && !env.allowUnregisteredDevStation) {
      const pairedPc = auth.pcId ? db.prepare('SELECT id,ip_address,station_token_hash FROM pcs WHERE id=?').get(auth.pcId) : null
      const pairingValid = pairedPc && String(pairedPc.ip_address) === String(stationIp) && stationCredentialMatches(pairedPc, suppliedStationToken)
      if (!pairingValid) {
        socket.emit('auth:revoked', { sessionId:auth.sessionId, reason:'station_pairing_invalid' })
        socket.disconnect(true)
      }
    }
  }, 15000) : null

  socket.emit('realtime:ready', { serverTime:Date.now(), authenticated:Boolean(auth) })
  socket.on('disconnect', (reason) => {
    if (sessionCheck) clearInterval(sessionCheck)
    const pcId = presencePcId || socket.data.auth?.pcId || socket.data.guestPcId
    if (!pcId || (socket.data.auth?.role && socket.data.auth.role !== 'customer')) return
    const disconnectedAt = new Date().toISOString()
    const previous = stationDisconnectTimers.get(pcId)
    if (previous) clearTimeout(previous)
    const timer = setTimeout(async () => {
      stationDisconnectTimers.delete(pcId)
      try {
        const peers = await io.in(`pc:${pcId}`).fetchSockets()
        if (peers.length > 0) return
        const activeSession=db.prepare("SELECT id,member_id,billing_type FROM computer_sessions WHERE pc_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(pcId)
        const released = activeSession ? releaseStationSession(pcId,{reason:'station_disconnect',at:disconnectedAt,markAvailable:false}) : null
        db.prepare("UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,?),ended_at=COALESCE(ended_at,?),end_reason=COALESCE(end_reason,'station_disconnect') WHERE pc_id=? AND revoked_at IS NULL")
          .run(disconnectedAt,disconnectedAt,pcId)
        db.prepare("UPDATE pcs SET status='offline',updated_at=? WHERE id=? AND status<>'maintenance'").run(new Date().toISOString(), pcId)
        if (released?.released) emitSessionUpdated(activeSession.id,{pcId,memberId:activeSession.member_id,reason:'station_session_released',endReason:'station_disconnect',remainingSeconds:released.remainingSeconds,amountDue:released.amountDue,settlementPending:released.settlementPending,locked:true})
        emitPcPresence(pcId, false, { reason })
        emitDataChanged({ method:'SOCKET', path:'/pcs/presence', pcId, online:false })
      } catch (error) {
        console.warn('Unable to update PC presence:', error?.message || error)
      }
    }, STATION_DISCONNECT_GRACE_MS)
    stationDisconnectTimers.set(pcId,timer)
  })
})
const cleanup=()=>{try{clearInterval(cleanupTimer);for(const timer of stationDisconnectTimers.values())clearTimeout(timer);stationDisconnectTimers.clear()
  stopCloudSyncWorker();io.close();server.close(()=>{db.close();process.exit(0)})}catch{process.exit(0)}}
process.on('SIGINT',cleanup);process.on('SIGTERM',cleanup)
