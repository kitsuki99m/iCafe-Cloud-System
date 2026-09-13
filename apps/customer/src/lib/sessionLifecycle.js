import { apiPost } from './api.js'

export function stationLifecycleMarker() {
  try { return window.aezakmiClient?.getSessionLifecycleMarker?.() || null } catch { return null }
}

export function hasPendingStationLifecycle() {
  return Boolean(stationLifecycleMarker()?.active)
}

async function markExit(reason, interruptedAt, preserveExisting = false) {
  const current = stationLifecycleMarker()
  if (preserveExisting && current?.exitRequestedAt) return current
  const bridge = window.aezakmiClient?.markSessionExit
  if (!bridge) return { ...(current || {}), active:true, exitReason:reason, exitRequestedAt:interruptedAt }
  return await bridge({ reason, interruptedAt })
}

export async function clearStationLifecycleMarker() {
  try { await window.aezakmiClient?.clearSessionLifecycleMarker?.() } catch {}
}

export async function releaseStationLifecycle(reason='station_exit', options={}) {
  const requestedAt = options.interruptedAt || new Date().toISOString()
  const marker = await markExit(reason, requestedAt, Boolean(options.preserveExistingExit))
  const interruptedAt = marker?.exitRequestedAt || requestedAt
  try {
    const result = await apiPost('/public/station/lifecycle', {
      event:reason,
      interruptedAt,
      sessionId:marker?.sessionId || null,
    })
    await clearStationLifecycleMarker()
    return { ok:true, ...result }
  } catch (error) {
    if (options.allowDeferred) return { ok:false, deferred:true, error }
    throw error
  }
}

export async function recoverPendingStationLifecycle() {
  const marker = stationLifecycleMarker()
  if (!marker?.active) return { ok:true, skipped:true }
  return releaseStationLifecycle(marker.exitReason || 'startup_recovery', {
    interruptedAt:marker.exitRequestedAt || marker.lastSeenAt || marker.markedAt || new Date().toISOString(),
    preserveExistingExit:true,
    allowDeferred:true,
  })
}
