import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { db, nowIso } from '../db/connection.js'
import { env } from '../config/env.js'
import { stationCredentialMatches } from '../utils/stationAuth.js'


function cloudFallbackAuth(rawToken, req) {
  const tokenHash=crypto.createHash('sha256').update(String(rawToken||'')).digest('hex')
  const row=db.prepare(`
    SELECT c.*,m.user_id,u.is_active,COALESCE(cm.must_change_credentials,u.must_change_credentials,0) AS must_change_credentials
    FROM cloud_customer_auth_sessions c
    JOIN members m ON m.id=c.member_id
    LEFT JOIN users u ON u.id=m.user_id
    LEFT JOIN cloud_member_credentials cm ON cm.member_id=c.member_id
    WHERE c.token_hash=? AND c.revoked_at IS NULL AND c.expires_at>?
    LIMIT 1
  `).get(tokenHash,nowIso())
  if(!row || !row.is_active) return null
  const currentPcId=req.pc?.id??null
  if(!currentPcId || String(row.local_station_id)!==String(currentPcId)) return null
  const suppliedStationToken=String(req.get('x-aezakmi-station-token')||'')
  if(!env.allowUnregisteredDevStation && !stationCredentialMatches(req.pc,suppliedStationToken)) return null
  return {row,tokenHash,currentPcId}
}

function activeSession(row) {
  if (!row || row.revoked_at) return false
  return new Date(row.expires_at).getTime() > Date.now()
}

function credentialSetupRouteAllowed(req) {
  const route = `${req.baseUrl || ''}${req.path || ''}`
  return route === '/api/auth/setup-credentials' || route === '/api/auth/me'
}

export function authenticate(req, res, next) {
  const header = req.get('authorization') || ''
  if (!header.startsWith('Bearer ')) {
    return res.status(401).json({ success:false, code:'AUTH_REQUIRED', error:'Authentication required.' })
  }

  try {
    const token = header.slice(7).trim()
    const payload = jwt.verify(token, env.jwtSecret)
    const session = db.prepare(`
      SELECT a.*, u.role, u.is_active, u.member_id, u.must_change_credentials
      FROM auth_sessions a
      JOIN users u ON u.id=a.user_id
      WHERE a.jwt_id=?
    `).get(payload.jti)

    if (!activeSession(session) || !session.is_active) {
      return res.status(401).json({ success:false, code:'SESSION_INVALID', error:'Your login session is no longer active.' })
    }

    if (session.role === 'admin' && Boolean(session.must_change_credentials) && !credentialSetupRouteAllowed(req)) {
      return res.status(403).json({
        success:false,
        code:'CREDENTIAL_SETUP_REQUIRED',
        error:'Set up permanent admin credentials before using the admin console.',
      })
    }

    let sessionPcId = session.pc_id ?? null

    if (session.role === 'customer') {
      const currentPcId = req.pc?.id ?? null
      const suppliedStationToken = String(req.get('x-aezakmi-station-token') || '')
      const stationAuthenticated = stationCredentialMatches(req.pc, suppliedStationToken)

      // Every authenticated customer request remains station-bound. A valid
      // account token alone is never proof that this physical station is paired.
      if (!currentPcId && !env.allowUnregisteredDevStation) {
        return res.status(403).json({
          success:false,
          code:'PC_NOT_REGISTERED',
          error:'This PC is not registered with the cafe server yet.',
        })
      }
      if (!env.allowUnregisteredDevStation && !stationAuthenticated) {
        return res.status(403).json({
          success:false,
          code:'STATION_NOT_PAIRED',
          error:'This station must be paired with the cafe server before customer access is allowed.',
        })
      }
      if (sessionPcId && currentPcId && String(sessionPcId) !== String(currentPcId)) {
        return res.status(403).json({
          success:false,
          code:'SESSION_PC_MISMATCH',
          error:'This account is logged in on a different registered PC.',
        })
      }

      if (!sessionPcId && currentPcId) {
        db.prepare('UPDATE auth_sessions SET pc_id=?,client_ip=? WHERE id=? AND pc_id IS NULL')
          .run(currentPcId,req.clientIp ?? null,session.id)
        sessionPcId = currentPcId
      }
    }

    req.auth = {
      ...payload,
      sessionId:session.id,
      userId:session.user_id,
      role:session.role,
      memberId:session.member_id,
      mustChangeCredentials:Boolean(session.must_change_credentials),
      pcId:sessionPcId,
    }
    req.authSession = { ...session, pc_id:sessionPcId }
    next()
  } catch {
    const fallback=cloudFallbackAuth(header.slice(7).trim(),req)
    if(fallback){
      const {row,tokenHash,currentPcId}=fallback
      req.auth={sub:row.user_id,sessionId:`cloud:${tokenHash.slice(0,20)}`,userId:row.user_id,role:'customer',memberId:row.member_id,mustChangeCredentials:Boolean(row.must_change_credentials),pcId:currentPcId,cloudFallback:true}
      req.authSession={id:req.auth.sessionId,user_id:row.user_id,role:'customer',member_id:row.member_id,pc_id:currentPcId,expires_at:row.expires_at,cloudFallback:true}
      return next()
    }
    return res.status(401).json({ success:false, code:'TOKEN_INVALID', error:'Your login session is invalid or expired.' })
  }
}

export function requireRole(...roles) {
  return (req,res,next) => {
    if (!roles.includes(req.auth?.role)) {
      return res.status(403).json({success:false,code:'FORBIDDEN',error:'You do not have permission for this action.'})
    }
    next()
  }
}

export function touchAuthSession(req) {
  if (!req.auth?.sessionId || req.auth?.cloudFallback) return
  db.prepare('UPDATE auth_sessions SET last_seen_at=? WHERE id=? AND revoked_at IS NULL')
    .run(nowIso(),req.auth.sessionId)
}
