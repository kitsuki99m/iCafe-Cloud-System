import crypto from 'node:crypto'

export function stationCredentialMatches(pc, suppliedToken) {
  const storedHash = String(pc?.station_token_hash || '')
  const token = String(suppliedToken || '')
  if (!storedHash || !token) return false
  const expected = Buffer.from(storedHash)
  const actual = Buffer.from(crypto.createHash('sha256').update(token).digest('hex'))
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual)
}
