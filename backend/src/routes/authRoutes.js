import { Router } from 'express'
import argon2 from 'argon2'
import jwt from 'jsonwebtoken'
import crypto from 'node:crypto'
import { db, nowIso, transaction } from '../db/connection.js'
import { env } from '../config/env.js'
import { checkpointMemberSession, releaseStationSession, remainingSecondsForSession } from '../utils/sessionTime.js'
import { id, clientIp } from '../utils/helpers.js'
import { authenticate, touchAuthSession } from '../middleware/auth.js'
import { loginLimiter, adminCredentialLimiter } from '../middleware/rateLimiter.js'
import { stationCredentialMatches } from '../utils/stationAuth.js'
import { enqueueCloudEvent } from '../cloud/outbox.js'

const router = Router()

// Verifies an existing authenticated staff member without issuing, replacing,
// or extending an auth session. The Admin UI uses this solely to unlock its
// local privacy overlay after Alt+Shift+U.
router.post('/verify-admin-credentials', authenticate, adminCredentialLimiter, async (req,res,next) => {
  try {
    if (req.auth.role !== 'admin') return res.status(403).json({success:false,code:'ADMIN_REQUIRED',error:'An Admin session is required.'})
    const pin=String(req.body?.pin||'').trim()
    const password=String(req.body?.password||'')
    const current=db.prepare("SELECT pin_hash,password_hash,auth_method FROM users WHERE id=? AND role='admin' AND is_active=1").get(req.auth.userId)
    if(!current) return res.status(401).json({success:false,code:'INVALID_CREDENTIALS',error:'Admin credentials are unavailable.'})
    const method=current.auth_method || 'pin'
    let verified=false
    if(method === 'pin') {
      if(!pin) return res.status(400).json({success:false,code:'PIN_REQUIRED',error:'Enter the configured Admin PIN.'})
      verified=Boolean(current.pin_hash && await argon2.verify(current.pin_hash,pin))
    } else if(method === 'password') {
      if(!password) return res.status(400).json({success:false,code:'PASSWORD_REQUIRED',error:'Enter the current Admin password.'})
      verified=Boolean(current.password_hash && await argon2.verify(current.password_hash,password))
    } else if(method === 'pin_password') {
      if(!pin || !password) return res.status(400).json({success:false,code:'PIN_PASSWORD_REQUIRED',error:'Enter both the Admin PIN and password.'})
      const pinOk=Boolean(current.pin_hash && await argon2.verify(current.pin_hash,pin))
      const passwordOk=Boolean(current.password_hash && await argon2.verify(current.password_hash,password))
      verified=pinOk && passwordOk
    }
    if(!verified) return res.status(401).json({success:false,code:'INVALID_CREDENTIALS',error:'Incorrect Admin credentials.'})
    res.json({success:true,verifiedAt:nowIso()})
  } catch(error) { next(error) }
})

function userView(user, member = null, pc = null) {
  const wallet = member ? Number(member.wallet_balance ?? 0) : null
  return {
    id: user.id,
    role: user.role,
    name: member?.name ?? (user.username === 'admin' ? 'Front Desk Admin' : user.username),
    username: user.username,
    tier: member?.tier,
    wallet,
    walletBalance: wallet,
    sessionSecondsRemaining: Number(member?.session_seconds_remaining ?? 0),
    memberId: member?.id ?? null,
    pcId: pc?.id ?? null,
    pcIp: pc?.ip_address ?? null,
    mustChangeCredentials: Boolean(user.must_change_credentials),
    authMethod: user.auth_method ?? 'pin',
  }
}




function makeCloudMemberCredential(memberId,username,password,mustChange=false){
  const salt=crypto.randomBytes(16),iterations=210000
  const hash=crypto.pbkdf2Sync(String(password),salt,iterations,32,'sha256').toString('base64')
  return{member_id:memberId,username_ci:String(username||'').trim().toLowerCase(),password_salt:salt.toString('base64'),password_hash:hash,password_iterations:iterations,must_change_credentials:mustChange?1:0,updated_at:nowIso()}
}

function verifyCloudMemberPassword(memberId,password){
  const cred=db.prepare('SELECT * FROM cloud_member_credentials WHERE member_id=?').get(memberId)
  if(!cred)return null
  try{
    const derived=crypto.pbkdf2Sync(String(password),Buffer.from(String(cred.password_salt||''),'base64'),Number(cred.password_iterations||210000),32,'sha256').toString('base64')
    const a=Buffer.from(derived),b=Buffer.from(String(cred.password_hash||''))
    return a.length===b.length&&crypto.timingSafeEqual(a,b)?cred:false
  }catch{return false}
}

function passwordError(password) {
  if (typeof password !== 'string' || password.length === 0) {
    return 'Password is required.'
  }
  return null
}

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { role = 'customer', username, password, pin } = req.body ?? {}
    let user = null

    if (role === 'admin') {
      const adminUsername=String(username || '').trim()
      // PIN-only login intentionally excludes combined-factor accounts: a
      // configured PIN + Password account must prove both values together.
      if (pin && !adminUsername && !password) {
        const admins = db.prepare("SELECT * FROM users WHERE role='admin' AND is_active=1 AND auth_method = 'pin'").all()
        for (const candidate of admins) {
          if (candidate.pin_hash && await argon2.verify(candidate.pin_hash, String(pin))) {
            user = candidate
            break
          }
        }
        if (!user) return res.status(401).json({ success:false, code:'INVALID_CREDENTIALS', error:'Incorrect PIN or the account requires another sign-in method.' })
      } else {
        if (!adminUsername || !password) return res.status(400).json({ success:false, code:'AUTH_FIELDS_REQUIRED', error:'Username and password are required.' })
        user = db.prepare(`
          SELECT * FROM users
          WHERE role='admin' AND username = ? AND is_active = 1
        `).get(adminUsername)
        if (!user) return res.status(401).json({ success:false, code:'INVALID_CREDENTIALS', error:'Incorrect Admin credentials.' })
        const method=user.auth_method || 'pin'
        if(method === 'pin') return res.status(401).json({ success:false, code:'AUTH_METHOD_PIN_REQUIRED', error:'This account requires PIN login.' })
        if(method === 'pin_password' && !pin) return res.status(400).json({ success:false, code:'AUTH_METHOD_PIN_PASSWORD_REQUIRED', error:'This account requires both PIN and password.' })
        const passwordOk=Boolean(user.password_hash && await argon2.verify(user.password_hash,String(password)))
        const pinOk=method !== 'pin_password' || Boolean(user.pin_hash && await argon2.verify(user.pin_hash,String(pin)))
        if(!passwordOk || !pinOk) return res.status(401).json({ success:false, code:'INVALID_CREDENTIALS', error:'Incorrect Admin credentials.' })
      }
    } else {
      if (!username || !password) return res.status(400).json({ success:false, code:'AUTH_FIELDS_REQUIRED', error:'Username and password are required.' })

      const candidate = db.prepare(`
        SELECT u.*, m.name AS member_name
        FROM users u
        JOIN members m ON m.user_id = u.id
        WHERE u.role='customer' AND u.is_active=1 AND lower(u.username)=lower(?)
        LIMIT 1
      `).get(String(username).trim())

      let cloudCredential=null
      let passwordValid=false
      if(candidate){
        cloudCredential=verifyCloudMemberPassword(candidate.member_id,String(password))
        passwordValid=cloudCredential===null ? await argon2.verify(candidate.password_hash,String(password)) : Boolean(cloudCredential)
      }
      if (!candidate || !passwordValid) {
        return res.status(401).json({ success:false, code:'INVALID_CREDENTIALS', error:'We couldn’t find a member with those details.' })
      }
      if(cloudCredential&&cloudCredential!==true) candidate.must_change_credentials=Number(cloudCredential.must_change_credentials||0)

      const member = db.prepare('SELECT wallet_balance,status FROM members WHERE id=?').get(candidate.member_id)
      if (!member || member.status !== 'active') {
        return res.status(403).json({ success:false, code:'ACCOUNT_INACTIVE', error:'This member account is inactive.' })
      }

      // Customer authentication is station-bound. Do not unlock a station
      // until the backend has resolved the request to a registered PC.
      if (!req.pc && !env.allowUnregisteredDevStation) {
        return res.status(403).json({
          success:false,
          code:'PC_NOT_REGISTERED',
          error:'This PC is not registered with the cafe server yet.',
        })
      }

      if (!env.allowUnregisteredDevStation && !req.stationAuthenticated) {
        return res.status(403).json({
          success:false,
          code:'STATION_NOT_PAIRED',
          error:'This station must be paired with the cafe server before member login.',
        })
      }

      const savedSeconds = Number(member.session_seconds_remaining ?? 0)
      if (db.prepare("SELECT id FROM computer_sessions WHERE member_id=? AND status='active' LIMIT 1").get(candidate.member_id)) {
        checkpointMemberSession(candidate.member_id)
      }
      const activeComputerSession = db.prepare("SELECT * FROM computer_sessions WHERE member_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(candidate.member_id)
      if (activeComputerSession) {
        const remaining = remainingSecondsForSession(activeComputerSession)
        if (remaining <= 0) {
          closeSessionAndSaveRemaining(activeComputerSession.id)
        } else if (String(activeComputerSession.pc_id) !== String(req.pc.id)) {
          return res.status(409).json({
            success:false,
            code:'ACCOUNT_ALREADY_ACTIVE',
            error:'This member already has an active session on another PC. Log out there before signing in here.',
            activePcId:activeComputerSession.pc_id,
          })
        }
      }

      const refreshedMember = db.prepare('SELECT wallet_balance,status,session_seconds_remaining FROM members WHERE id=?').get(candidate.member_id)
      const availableWallet = Number(refreshedMember?.wallet_balance ?? 0)
      const availableSavedSeconds = Number(refreshedMember?.session_seconds_remaining ?? savedSeconds ?? 0)
      if (!(availableWallet > 0) && !(availableSavedSeconds > 0)) {
        return res.status(402).json({
          success:false,
          code:'INSUFFICIENT_BALANCE',
          error:'Insufficient balance. Top up your account before logging in.',
        })
      }
      user = candidate
    }

    if (!user) {
      return res.status(401).json({
        success:false,
        code:'INVALID_CREDENTIALS',
        error:'Invalid credentials.',
      })
    }

    const ip = req.clientIp || clientIp(req)
    const now = new Date()
    const nowString = now.toISOString()
    const expires = new Date(now.getTime() + env.sessionIdleMinutes * 60 * 1000)
    const jwtId = id()
    const sessionId = id()

    const result = transaction(() => {
      // Expired auth sessions are harmless stale records and can be cleaned.
      db.prepare(`
        UPDATE auth_sessions
        SET revoked_at = ?, ended_at = ?, end_reason = 'expired'
        WHERE user_id = ? AND revoked_at IS NULL AND expires_at <= ?
      `).run(nowString, nowString, user.id, nowString)

      // Login is single-session per account. A new login always takes over
      // from the previous token, whether it came from another admin terminal
      // or another customer station.
      db.prepare(`
        UPDATE auth_sessions
        SET revoked_at=?, ended_at=?, end_reason='replaced'
        WHERE user_id=? AND revoked_at IS NULL AND expires_at>?
      `).run(nowString, nowString, user.id, nowString)

      const pc = req.pc ?? (ip ? db.prepare('SELECT * FROM pcs WHERE ip_address=?').get(ip) : null)
      if (role === 'customer' && !pc && !env.allowUnregisteredDevStation) {
        throw Object.assign(new Error('This PC is not registered with the cafe server yet.'), {
          status:403,
          code:'PC_NOT_REGISTERED',
          expose:true,
        })
      }

      db.prepare(`
        INSERT INTO auth_sessions
        (id,user_id,jwt_id,pc_id,client_ip,created_at,last_seen_at,expires_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(
        sessionId,
        user.id,
        jwtId,
        pc?.id ?? null,
        ip,
        nowString,
        nowString,
        expires.toISOString(),
      )

      db.prepare(`
        INSERT INTO logs (id,user_id,action,entity_type,entity_id,pc_id,details,created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(id(),user.id,'login','auth_session',sessionId,pc?.id ?? null,JSON.stringify({ip}),nowString)

      return pc
    })

    const token = jwt.sign(
      { sub:user.id, role:user.role, memberId:user.member_id, pcId:result?.id ?? null, jti:jwtId },
      env.jwtSecret,
      { expiresIn:env.jwtExpiresIn },
    )

    const member = user.member_id ? db.prepare('SELECT * FROM members WHERE id=?').get(user.member_id) : null
    res.json({
      success:true,
      token,
      user:userView(user,member,result),
      expiresAt:expires.toISOString(),
    })
  } catch (err) {
    if (err.code === 'ACCOUNT_ALREADY_ACTIVE') {
      return res.status(409).json({ success:false, code:err.code, error:err.message })
    }
    next(err)
  }
})

router.post('/complete-customer-password-setup', authenticate, async (req,res,next) => {
  try {
    if (req.auth.role !== 'customer') {
      return res.status(403).json({ success:false, code:'CUSTOMER_REQUIRED', error:'Customer access required.' })
    }
    if (!req.auth.mustChangeCredentials) {
      return res.status(409).json({ success:false, code:'PASSWORD_SETUP_COMPLETE', error:'Your temporary password has already been replaced.' })
    }

    const { newPassword = '' } = req.body ?? {}
    const error = passwordError(String(newPassword))
    if (error) return res.status(400).json({ success:false, code:'PASSWORD_REQUIRED', error })

    const current = db.prepare("SELECT * FROM users WHERE id=? AND role='customer' AND is_active=1").get(req.auth.userId)
    if (!current || !current.member_id) {
      return res.status(404).json({ success:false, code:'CUSTOMER_NOT_FOUND', error:'Customer account not found.' })
    }

    const hash = await argon2.hash(String(newPassword))
    const changedAt = nowIso()
    let cloudCredential=null
    transaction(() => {
      db.prepare("UPDATE users SET password_hash=?,must_change_credentials=0,updated_at=? WHERE id=? AND role='customer'")
        .run(hash,changedAt,current.id)
      db.prepare('UPDATE members SET password_hash=?,updated_at=? WHERE id=?')
        .run(hash,changedAt,current.member_id)
      if(db.prepare('SELECT 1 FROM cloud_member_credentials WHERE member_id=?').get(current.member_id)){
        cloudCredential=makeCloudMemberCredential(current.member_id,current.username,String(newPassword),false)
        db.prepare(`INSERT INTO cloud_member_credentials(member_id,username_ci,password_salt,password_hash,password_iterations,must_change_credentials,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET username_ci=excluded.username_ci,password_salt=excluded.password_salt,password_hash=excluded.password_hash,password_iterations=excluded.password_iterations,must_change_credentials=excluded.must_change_credentials,updated_at=excluded.updated_at`)
          .run(cloudCredential.member_id,cloudCredential.username_ci,cloudCredential.password_salt,cloudCredential.password_hash,cloudCredential.password_iterations,cloudCredential.must_change_credentials,cloudCredential.updated_at)
      }
      db.prepare("UPDATE auth_sessions SET revoked_at=?,ended_at=?,end_reason='password_changed' WHERE user_id=? AND id<>? AND revoked_at IS NULL")
        .run(changedAt,changedAt,current.id,req.auth.sessionId)
      db.prepare(`
        INSERT INTO logs (id,user_id,action,entity_type,entity_id,pc_id,details,created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(id(),current.id,'customer.password_setup','user',current.id,req.auth.pcId ?? null,JSON.stringify({temporaryPasswordReplaced:true}),changedAt)
    })
    if(cloudCredential)enqueueCloudEvent('member_credential.upsert',{...cloudCredential,_authority:'edge'},{entityType:'member_credential',entityId:current.member_id,occurredAt:changedAt})

    const fresh = db.prepare('SELECT * FROM users WHERE id=?').get(current.id)
    const member = db.prepare('SELECT * FROM members WHERE id=?').get(current.member_id)
    const pc = req.auth.pcId ? db.prepare('SELECT * FROM pcs WHERE id=?').get(req.auth.pcId) : null
    res.json({ success:true, user:userView(fresh,member,pc) })
  } catch(err) { next(err) }
})

router.post('/setup-credentials', authenticate, async (req,res,next) => {
  try {
    if (req.auth.role !== 'admin') return res.status(403).json({success:false,code:'FORBIDDEN',error:'Admin access required.'})
    if (!req.auth.mustChangeCredentials) return res.status(409).json({success:false,code:'CREDENTIAL_SETUP_COMPLETE',error:'Initial admin credential setup has already been completed.'})
    const {method='pin',username='admin',password='',pin=''}=req.body??{}
    if(!['pin','password','pin_password'].includes(method)) return res.status(400).json({success:false,code:'INVALID_AUTH_METHOD',error:'Invalid authentication method.'})
    if((method==='password'||method==='pin_password')) {
      const error=passwordError(String(password))
      if(error)return res.status(400).json({success:false,code:'PASSWORD_REQUIRED',error})
    }
    if((method==='pin'||method==='pin_password')&&!/^\d{4,8}$/.test(String(pin)))return res.status(400).json({success:false,code:'INVALID_PIN',error:'PIN must contain 4 to 8 digits.'})
    const user=db.prepare("SELECT * FROM users WHERE id=? AND role='admin'").get(req.auth.userId)
    if(!user)return res.status(404).json({success:false,code:'USER_NOT_FOUND',error:'Admin account not found.'})
    const passwordHash=method==='pin'?await argon2.hash(id()):await argon2.hash(String(password))
    const pinHash=method==='password'?user.pin_hash:await argon2.hash(String(pin))
    const nextUsername=String(username).trim()
    if(!nextUsername)return res.status(400).json({success:false,code:'USERNAME_REQUIRED',error:'Username is required.'})
    const duplicate=db.prepare('SELECT id FROM users WHERE lower(username)=lower(?) AND id<>?').get(nextUsername,user.id)
    if(duplicate)return res.status(409).json({success:false,code:'USERNAME_EXISTS',error:'That username is already in use.'})
    db.prepare('UPDATE users SET username=?,password_hash=?,pin_hash=?,must_change_credentials=0,auth_method=?,updated_at=? WHERE id=?').run(nextUsername,passwordHash,pinHash,method,nowIso(),user.id)
    // Credential rotation invalidates every other token while preserving the
    // authenticated setup request so the operator is not unexpectedly logged out.
    db.prepare('UPDATE auth_sessions SET revoked_at=? WHERE user_id=? AND id<>? AND revoked_at IS NULL').run(nowIso(), user.id, req.auth.sessionId)
    const fresh=db.prepare('SELECT * FROM users WHERE id=?').get(user.id)
    res.json({success:true,user:userView(fresh,null,null)})
  }catch(err){next(err)}
})

router.post('/update-credentials', authenticate, adminCredentialLimiter, async (req,res,next) => {
  try {
    if (req.auth.role !== 'admin') return res.status(403).json({success:false,code:'FORBIDDEN',error:'Admin access required.'})
    const current = db.prepare("SELECT * FROM users WHERE id=? AND role='admin' AND is_active=1").get(req.auth.userId)
    if (!current) return res.status(404).json({success:false,code:'USER_NOT_FOUND',error:'Admin account not found.'})

    const currentPin = String(req.body?.currentPin || '').trim()
    const currentPassword = String(req.body?.currentPassword || '')
    const currentMethod = current.auth_method || 'pin'
    let verified = false
    if (currentMethod === 'pin') {
      if (!currentPin) return res.status(400).json({success:false,code:'PIN_REQUIRED',error:'Enter the current Admin PIN.'})
      verified = Boolean(current.pin_hash && await argon2.verify(current.pin_hash,currentPin))
    } else if (currentMethod === 'password') {
      if (!currentPassword) return res.status(400).json({success:false,code:'PASSWORD_REQUIRED',error:'Enter the current Admin password.'})
      verified = Boolean(current.password_hash && await argon2.verify(current.password_hash,currentPassword))
    } else if (currentMethod === 'pin_password') {
      if (!currentPin || !currentPassword) return res.status(400).json({success:false,code:'PIN_PASSWORD_REQUIRED',error:'Enter both the current Admin PIN and password.'})
      const pinOk = Boolean(current.pin_hash && await argon2.verify(current.pin_hash,currentPin))
      const passwordOk = Boolean(current.password_hash && await argon2.verify(current.password_hash,currentPassword))
      verified = pinOk && passwordOk
    }
    if (!verified) return res.status(401).json({success:false,code:'INVALID_CREDENTIALS',error:'Incorrect current Admin credentials.'})

    const authMethod = String(req.body?.authMethod || currentMethod)
    if (!['pin','password','pin_password'].includes(authMethod)) return res.status(400).json({success:false,code:'INVALID_AUTH_METHOD',error:'Invalid authentication method.'})

    const newPin = String(req.body?.newPin || '').trim()
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : ''
    if (newPin && !/^\d{4,8}$/.test(newPin)) return res.status(400).json({success:false,code:'INVALID_PIN',error:'Management PIN must contain 4 to 8 digits.'})
    if ((authMethod === 'password' || authMethod === 'pin_password') && currentMethod === 'pin' && !newPassword) {
      return res.status(400).json({success:false,code:'NEW_PASSWORD_REQUIRED',error:'Set a new password before enabling password login.'})
    }

    let nextPinHash = current.pin_hash
    if (newPin) nextPinHash = await argon2.hash(newPin)
    if (!nextPinHash) return res.status(400).json({success:false,code:'MANAGEMENT_PIN_REQUIRED',error:'Set a 4 to 8 digit Management PIN before saving Admin credentials.'})

    let nextPasswordHash = current.password_hash
    if (newPassword) nextPasswordHash = await argon2.hash(newPassword)

    const changedAt = nowIso()
    transaction(() => {
      db.prepare('UPDATE users SET password_hash=?,pin_hash=?,auth_method=?,updated_at=? WHERE id=? AND role=\'admin\'')
        .run(nextPasswordHash,nextPinHash,authMethod,changedAt,current.id)
      db.prepare("UPDATE auth_sessions SET revoked_at=?,ended_at=?,end_reason='credentials_changed' WHERE user_id=? AND id<>? AND revoked_at IS NULL")
        .run(changedAt,changedAt,current.id,req.auth.sessionId)
      db.prepare(`
        INSERT INTO logs (id,user_id,action,entity_type,entity_id,pc_id,details,created_at)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(
        id(),
        current.id,
        'admin.credentials.updated',
        'user',
        current.id,
        req.auth.pcId ?? null,
        JSON.stringify({ authMethod, pinChanged:Boolean(newPin), passwordChanged:Boolean(newPassword) }),
        changedAt,
      )
    })

    const fresh = db.prepare('SELECT * FROM users WHERE id=?').get(current.id)
    res.json({success:true,user:userView(fresh,null,null),adminPinReady:Boolean(fresh.pin_hash)})
  } catch(err) { next(err) }
})

router.post('/logout', (req,res,next) => {
  try {
    const token = String(req.headers.authorization || '').startsWith('Bearer ')
      ? String(req.headers.authorization).slice(7).trim()
      : null
    if (!token) return res.json({success:true,revoked:false})

    // A signed but stale token is not authority to mutate a newer customer
    // session. We decode expired tokens only so their exact auth-session row
    // can be revoked; customer computer-session side effects require the
    // matching, currently-active DB auth session and paired physical station.
    let payload
    try {
      payload = jwt.verify(token, env.jwtSecret, { ignoreExpiration:true })
    } catch {
      return res.json({success:true,revoked:false})
    }
    const jwtId = payload?.jti ?? null
    const userId = payload?.sub ?? null
    if (!jwtId || !userId) return res.json({success:true,revoked:false})

    const now = nowIso()
    const logoutSession = db.prepare(`
      SELECT a.*,u.role,u.member_id,u.is_active
      FROM auth_sessions a
      JOIN users u ON u.id=a.user_id
      WHERE a.jwt_id=? AND a.user_id=? AND a.revoked_at IS NULL AND a.expires_at>?
      LIMIT 1
    `).get(jwtId,userId,now)

    // Revoke only the exact token presented. Never fall back to revoking every
    // session for payload.sub: an old token must not affect a replacement login.
    const changes = db.prepare(`
      UPDATE auth_sessions
      SET revoked_at=?,ended_at=?,end_reason='logout'
      WHERE jwt_id=? AND user_id=? AND revoked_at IS NULL
    `).run(now,now,jwtId,userId).changes

    if (changes === 1 && logoutSession?.role === 'customer' && logoutSession.member_id) {
      const currentPcId = req.pc?.id ?? null
      const suppliedStationToken = String(req.get('x-aezakmi-station-token') || '')
      const paired = env.allowUnregisteredDevStation || (
        currentPcId &&
        stationCredentialMatches(req.pc, suppliedStationToken) &&
        (!logoutSession.pc_id || String(logoutSession.pc_id) === String(currentPcId))
      )
      if (paired) {
        const active = db.prepare("SELECT id,pc_id FROM computer_sessions WHERE member_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(logoutSession.member_id)
        if (active && (!logoutSession.pc_id || String(active.pc_id) === String(logoutSession.pc_id))) {
          releaseStationSession(active.pc_id, { reason:'logout', at:now, expectedMemberId:logoutSession.member_id })
        } else {
          checkpointMemberSession(logoutSession.member_id)
        }
      }
    }

    res.json({success:true,revoked:changes>0})
  } catch(err) {
    next(err)
  }
})

router.get('/me', authenticate, (req,res,next) => {
  try {
    touchAuthSession(req)
    const user = db.prepare('SELECT * FROM users WHERE id=?').get(req.auth.userId)
    const member = user?.member_id ? db.prepare('SELECT * FROM members WHERE id=?').get(user.member_id) : null
    const pc = req.auth.pcId ? db.prepare('SELECT * FROM pcs WHERE id=?').get(req.auth.pcId) : null
    res.json({success:true,user:userView(user,member,pc)})
  } catch(err) { next(err) }
})

router.post('/heartbeat', authenticate, (req,res,next) => {
  try {
    const now = new Date()
    const expires = new Date(now.getTime() + env.sessionIdleMinutes * 60 * 1000)
    db.prepare('UPDATE auth_sessions SET last_seen_at=?,expires_at=? WHERE id=? AND revoked_at IS NULL')
      .run(nowIso(),expires.toISOString(),req.auth.sessionId)
    let remainingSeconds = null
    if (req.auth.role === 'customer' && req.auth.memberId) {
      const activeSession = db.prepare("SELECT id FROM computer_sessions WHERE member_id=? AND status='active' ORDER BY started_at DESC LIMIT 1").get(req.auth.memberId)
      if (activeSession) {
        db.prepare("UPDATE computer_sessions SET last_heartbeat_at=? WHERE id=? AND status='active'").run(nowIso(), activeSession.id)
      }
      remainingSeconds = checkpointMemberSession(req.auth.memberId)
      if (remainingSeconds <= 0) {
        const active = db.prepare("SELECT id FROM computer_sessions WHERE member_id=? AND status='active' LIMIT 1").get(req.auth.memberId)
        if (active) closeSessionAndSaveRemaining(active.id)
      }
    }
    res.json({success:true,expiresAt:expires.toISOString(),remainingSeconds})
  } catch(err) { next(err) }
})

export default router
