import rateLimit from 'express-rate-limit'
import jwt from 'jsonwebtoken'
import { db } from '../db/connection.js'
import { env } from '../config/env.js'

function isActiveStaffRequest(req) {
  const header = req.get?.('authorization') || ''
  if (!header.startsWith('Bearer ')) return false
  try {
    const payload = jwt.verify(header.slice(7).trim(), env.jwtSecret)
    const session = db.prepare(`SELECT a.revoked_at,a.expires_at,u.role,u.is_active FROM auth_sessions a JOIN users u ON u.id=a.user_id WHERE a.jwt_id=?`).get(payload.jti)
    return Boolean(session && !session.revoked_at && session.is_active && new Date(session.expires_at).getTime() > Date.now() && ['admin'].includes(session.role))
  } catch { return false }
}

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'LOGIN_RATE_LIMITED', error: 'Too many login attempts. Please wait and try again later.' },
})

export const stationControlLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success:false, code:'STATION_CONTROL_RATE_LIMITED', error:'Too many emergency PIN attempts. Wait before trying again.' },
})

export const adminCredentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success:false, code:'ADMIN_CREDENTIAL_RATE_LIMITED', error:'Too many unlock attempts. Please wait before trying again.' },
})

export const topUpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'TOPUP_RATE_LIMITED', error: 'Too many top-up requests. Please wait before trying again.' },
  skip: isActiveStaffRequest,
})

export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: isActiveStaffRequest,
})

export const supportLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { success: false, code: 'SUPPORT_RATE_LIMITED', error: 'Too many help requests. Please wait a moment before trying again.' },
  skip: isActiveStaffRequest,
})
