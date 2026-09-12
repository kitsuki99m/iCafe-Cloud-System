export const VALID_MEMBER_TIERS = Object.freeze(['Regular', 'Gold', 'VIP'])

export function isValidMemberTier(value) {
  return VALID_MEMBER_TIERS.includes(String(value || '').trim())
}

export function isValidIsoDate(value) {
  const text = String(value || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const [year, month, day] = text.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

export function isValidIpv4(value) {
  const text = String(value || '').trim()
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(text)) return false
  return text.split('.').every((part) => {
    if (part.length > 1 && part.startsWith('0')) return false
    const number = Number(part)
    return Number.isInteger(number) && number >= 0 && number <= 255
  })
}

export function validateStationIp(value) {
  const ip = String(value || '').trim()
  if (!isValidIpv4(ip)) {
    return { ok:false, code:'INVALID_IP', error:'Enter a valid IPv4 address, e.g. 192.168.100.35.' }
  }
  return { ok:true, ip }
}
