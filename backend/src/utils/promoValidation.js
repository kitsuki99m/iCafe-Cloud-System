import { db, nowIso } from '../db/connection.js'
import { promoScheduleStatus, promoWindowBounds } from './rateEligibility.js'

export function effectivePromoStatus(plan, at = new Date()) {
  if (!plan) return 'expired'
  return promoScheduleStatus(plan, at)
}

function promoError(code, message, status = 409) {
  return Object.assign(new Error(message), { status, code, expose:true })
}

export function validatePromoRedemption({ plan, memberId, pcId, customerName, amount, anchorAt = new Date(), now = new Date() }) {
  const isPromo = String(plan?.promo_kind || 'none') !== 'none'
  if (!isPromo) return { isPromo:false, minutes:0, nameFlag:false }
  const status = effectivePromoStatus(plan, now)
  if (status !== 'active') {
    if (status === 'scheduled') throw promoError('PROMO_DATE_EXPIRED', 'This promo has not started yet.')
    throw promoError('PROMO_DATE_EXPIRED', 'This promo has ended.')
  }
  const bounds = promoWindowBounds(plan, now)
  if (!bounds || now >= bounds.end) throw promoError('PROMO_DATE_EXPIRED', 'This promo has ended.')

  if (memberId) {
    const used = db.prepare('SELECT 1 FROM promo_redemptions WHERE promo_id=? AND user_id=? LIMIT 1').get(plan.id, memberId)
    if (used) throw promoError('PROMO_ALREADY_REDEEMED', 'This promo can only be used once.')
  } else if (pcId) {
    const seat = db.prepare(`SELECT 1 FROM promo_seat_redemptions WHERE promo_id=? AND pc_id=? AND cooldown_cleared_at IS NULL AND redeemed_at>=? AND redeemed_at<? LIMIT 1`).get(plan.id, pcId, bounds.start.toISOString(), bounds.end.toISOString())
    if (seat) throw promoError('PROMO_ALREADY_REDEEMED', 'This promo has already been used on this PC during its active window.')
  }

  const normalizedName = String(customerName || '').trim().replace(/\s+/g,' ').toLowerCase()
  const nameFlag = !memberId && normalizedName
    ? Boolean(db.prepare('SELECT 1 FROM promo_name_ledger WHERE promo_id=? AND name_normalized=? AND redeemed_at>=? AND redeemed_at<? LIMIT 1').get(plan.id, normalizedName, bounds.start.toISOString(), bounds.end.toISOString()))
    : false

  const anchor = new Date(anchorAt)
  const anchorMs = Math.max(anchor.getTime(), now.getTime())
  const totalWindowMinutes = Math.max(0, Math.round((bounds.end.getTime() - bounds.start.getTime()) / 60000))
  const sinceOpen = Math.max(0, Math.round((now.getTime() - bounds.start.getTime()) / 60000))
  const grace = Math.max(0, Number(plan.grace_minutes || 0))
  const graceActive = grace > 0 && sinceOpen <= grace
  const remaining = Math.max(0, Math.floor((bounds.end.getTime() - anchorMs) / 60000))
  const requestedMinutes = plan.mode === 'package' ? Number(plan.minutes || 0) : 0
  const maxMinutes = graceActive ? totalWindowMinutes : Math.min(remaining, totalWindowMinutes)
  if (plan.mode === 'package' && requestedMinutes > maxMinutes) {
    throw promoError('PROMO_WINDOW_EXCEEDED', "This would extend past the promo's cutoff. Reduce the amount or pick another rate.")
  }
  if (plan.mode === 'linear') {
    const unitMinutes = Number(plan.minutes_per_unit || 0)
    const pesoUnit = Number(plan.peso_unit || 0)
    const requestedAmount = Number(amount || 0)
    const requested = unitMinutes > 0 && pesoUnit > 0 ? Math.floor(requestedAmount * (unitMinutes / pesoUnit)) : 0
    if (requested > maxMinutes) throw promoError('PROMO_WINDOW_EXCEEDED', "This would extend past the promo's cutoff. Reduce the amount or pick another rate.")
  }
  return { isPromo:true, bounds, maxMinutes, graceActive, nameFlag, normalizedName }
}

export function recordPromoRedemption({ plan, memberId, pcId, sessionId, customerName, redeemedAt = nowIso() }) {
  if (!plan || String(plan.promo_kind || 'none') === 'none') return
  const normalizedName = String(customerName || '').trim().replace(/\s+/g,' ').toLowerCase()
  if (memberId) {
    db.prepare('INSERT INTO promo_redemptions(id,promo_id,user_id,session_id,redeemed_at) VALUES(?,?,?,?,?)').run(cryptoRandomId(), plan.id, memberId, sessionId, redeemedAt)
  } else {
    db.prepare('INSERT INTO promo_seat_redemptions(id,pc_id,promo_id,redeemed_name,session_id,redeemed_at) VALUES(?,?,?,?,?,?)').run(cryptoRandomId(), pcId, plan.id, customerName || 'Guest', sessionId, redeemedAt)
    if (normalizedName) db.prepare('INSERT INTO promo_name_ledger(id,promo_id,name_normalized,redeemed_at) VALUES(?,?,?,?)').run(cryptoRandomId(), plan.id, normalizedName, redeemedAt)
  }
}

export function clearSeatCooldown({ pcId, userId, at = nowIso() }) {
  if (!pcId) return 0
  const result = db.prepare(`UPDATE promo_seat_redemptions SET cooldown_cleared_by=?, cooldown_cleared_at=? WHERE pc_id=? AND cooldown_cleared_at IS NULL`).run(userId, at, pcId)
  return result.changes
}

export function recentPromoRedeemers(promoId, limit = 10) {
  const n = Math.max(1, Math.min(50, Number(limit) || 10))
  return db.prepare(`
    SELECT promo_id, pc_id, redeemed_name, redeemed_at, pc_label FROM (
      SELECT pr.promo_id, cs.pc_id, m.name AS redeemed_name, pr.redeemed_at, p.label AS pc_label
      FROM promo_redemptions pr
      LEFT JOIN computer_sessions cs ON cs.id=pr.session_id
      LEFT JOIN members m ON m.id=pr.user_id
      LEFT JOIN pcs p ON p.id=cs.pc_id
      WHERE pr.promo_id=?
      UNION ALL
      SELECT psr.promo_id, psr.pc_id, psr.redeemed_name, psr.redeemed_at, p.label AS pc_label
      FROM promo_seat_redemptions psr
      LEFT JOIN pcs p ON p.id=psr.pc_id
      WHERE psr.promo_id=?
    ) ORDER BY redeemed_at DESC LIMIT ?
  `).all(promoId, promoId, n)
}

function cryptoRandomId() {
  return `promo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,12)}`
}
