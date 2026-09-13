import { db } from '../db/connection.js'
import { clientIp } from '../utils/helpers.js'
import { env } from '../config/env.js'
import { stationCredentialMatches } from '../utils/stationAuth.js'
import { internalCloudProxySecret } from '../cloud/internalProxy.js'

export function normalizeIp(value) {
  let ip = String(value || '').trim()
  if (ip.startsWith('::ffff:')) ip = ip.slice(7)
  if (ip === '::1') ip = '127.0.0.1'
  return ip
}

export function isValidIpv4(value) {
  const ip = normalizeIp(value)
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return false
  return ip.split('.').every((part) => Number(part) >= 0 && Number(part) <= 255)
}

export function attachClientIdentity(req, res, next) {
  const socketIp = normalizeIp(clientIp(req))
  const advertisedIp = normalizeIp(req.get('x-aezakmi-client-ip'))
  const socketPc = isValidIpv4(socketIp)
    ? db.prepare('SELECT * FROM pcs WHERE ip_address = ?').get(socketIp)
    : null
  const localDevelopmentPeer = socketIp === '127.0.0.1' && env.nodeEnv !== 'production'
  const advertisedMatchesPeer = advertisedIp && advertisedIp === socketIp
  const canTrustAdvertisedIp = localDevelopmentPeer || advertisedMatchesPeer
  const advertisedPc = canTrustAdvertisedIp && isValidIpv4(advertisedIp)
    ? db.prepare('SELECT * FROM pcs WHERE ip_address = ?').get(advertisedIp)
    : null

  // In Vite/Electron development the backend sees localhost, so the
  // Electron preload may advertise the station LAN IP. In production, the
  // advertised IP must match the actual TCP peer; clients cannot claim a
  // different registered PC by changing a header.
  const internalStationId = String(req.get('x-aezakmi-cloud-station-id') || '').trim()
  const internalSecret = String(req.get('x-aezakmi-internal-proxy') || '')
  const trustedCloudProxy = socketIp === '127.0.0.1' && internalStationId && internalSecret === internalCloudProxySecret
  const internalPc = trustedCloudProxy
    ? db.prepare('SELECT * FROM pcs WHERE id=?').get(internalStationId)
    : null

  let pc = internalPc ?? advertisedPc ?? socketPc ?? null
  // Development's open-station switch must provide a real station identity,
  // not merely skip authentication checks.  A stable local row lets the same
  // session, promo, top-up, and presence flows run in Vite/Electron without
  // adding a LAN IP manually.  This branch is impossible in production.
  if (!pc && env.allowUnregisteredDevStation && localDevelopmentPeer) {
    const devIp = advertisedIp && isValidIpv4(advertisedIp) ? advertisedIp : '127.0.0.1'
    const devId = `dev-station-${devIp.replace(/[^0-9]/g, '-')}`
    const timestamp = new Date().toISOString()
    db.prepare(`INSERT OR IGNORE INTO pcs (id,pc_number,label,ip_address,spec,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`)
      .run(devId, 'DEV-LOCAL', 'Development Station', devIp, 'Local development station', 'available', timestamp, timestamp)
    pc = db.prepare('SELECT * FROM pcs WHERE id=?').get(devId)
  }
  req.clientIp = pc?.ip_address ?? socketIp
  req.pc = pc
  const supplied=String(req.get('x-aezakmi-station-token')||'')
  req.stationAuthenticated=Boolean(trustedCloudProxy && internalPc) || stationCredentialMatches(pc, supplied)
  next()
}


export function requirePairedStation(req, res, next) {
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
      error:'This station must be paired with the cafe server before customer actions are allowed.',
    })
  }
  next()
}
