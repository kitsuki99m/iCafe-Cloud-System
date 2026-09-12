import { db } from '../db/connection.js'
import { env } from '../config/env.js'

function count(sql, ...params) {
  return Number(db.prepare(sql).get(...params)?.c || 0)
}

export function buildEdgeSnapshot() {
  const pcRows = db.prepare('SELECT status,COUNT(*) AS c FROM pcs GROUP BY status').all()
  const stations = { total:0, available:0, occupied:0, offline:0, maintenance:0, reserved:0 }
  for (const row of pcRows) {
    const n = Number(row.c || 0)
    stations.total += n
    stations[row.status] = n
  }

  const revenueCentavos = Number(db.prepare(`
    SELECT COALESCE(SUM(amount_centavos),0) AS amount
    FROM revenue_events
    WHERE date(occurred_at,'localtime')=date('now','localtime')
  `).get()?.amount || 0)

  return {
    serverName:env.serverName,
    softwareVersion:env.edgeVersion,
    generatedAt:new Date().toISOString(),
    stations,
    activeSessions:count("SELECT COUNT(*) AS c FROM computer_sessions WHERE status='active'"),
    activeMembers:count("SELECT COUNT(*) AS c FROM members WHERE status='active'"),
    pendingTopUps:count("SELECT COUNT(*) AS c FROM top_up_requests WHERE status='pending' AND archived_at IS NULL"),
    revenueTodayCentavos:revenueCentavos,
  }
}
