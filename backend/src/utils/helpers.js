import { randomUUID } from 'node:crypto'

export const id = () => randomUUID()

export function json(value) {
  return JSON.stringify(value ?? null)
}

export function parseJson(value, fallback = null) {
  try { return JSON.parse(value) } catch { return fallback }
}

export function minutesForAmount(plan, amount) {
  if (!plan) return 0
  if (plan.mode === 'package') return Number(plan.minutes ?? 0)
  return Math.max(0, Math.floor(Number(amount || 0) * (Number(plan.minutes_per_unit) / Number(plan.peso_unit))))
}

export function amountForMinutes(plan, minutes) {
  if (!plan) return 0
  if (plan.mode === 'package') return Number(plan.amount ?? 0)
  return Math.max(0, Number(minutes || 0) * (Number(plan.peso_unit) / Number(plan.minutes_per_unit)))
}

export function clientIp(req) {
  let ip = req.socket.remoteAddress || ''
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  if (ip === '::1') ip = '127.0.0.1'
  return ip
}

export function boolInt(v) {
  return v ? 1 : 0
}
