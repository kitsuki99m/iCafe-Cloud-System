import { env } from '../config/env.js'
import { internalCloudProxySecret } from './internalProxy.js'

const METHODS = new Set(['GET','POST','PATCH','DELETE'])
const ALLOWED_PATHS = [
  /^\/auth\/(login|heartbeat|logout|me|complete-customer-password-setup)$/,
  /^\/guest\/session$/,
  /^\/members\/me$/,
  /^\/pcs\/current$/,
  /^\/rate-plans$/,
  /^\/public\/rate-plans$/,
  /^\/announcements$/,
  /^\/public\/announcements$/,
  /^\/settings$/,
  /^\/public\/settings$/,
  /^\/client\/context$/,
  /^\/wallet$/,
  /^\/sessions\/start$/,
  /^\/public\/station-control$/,
  /^\/top-ups(?:\/[^/]+)?$/,
  /^\/public\/top-ups$/,
  /^\/support(?:\/[^/]+)?$/,
  /^\/public\/support$/,
  /^\/feedback(?:\/[^/]+)?$/,
  /^\/public\/feedback$/,
  /^\/session-extensions(?:\/[^/]+(?:\/(?:confirm|reject))?)?$/,
  /^\/sessions\/[^/]+\/(?:end|time-adjustments)$/,
  /^\/public\/sessions\/[^/]+\/end$/,
  /^\/public\/remote-commands\/[^/]+$/,
  /^\/launcher\/(categories|apps)$/,
  /^\/menu-items$/,
  /^\/menu-orders(?:\/[^/]+(?:\/cancel)?)?$/,
  /^\/vouchers\/redeem$/,
]

function safePath(value) {
  const path = String(value || '').trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || /^https?:/i.test(path)) {
    throw Object.assign(new Error('Invalid station API path.'), { code:'INVALID_PATH', status:400 })
  }
  const base = path.split('?')[0]
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(base))) {
    throw Object.assign(new Error('Customer Station API path is not cloud-enabled.'), { code:'PATH_NOT_ALLOWED', status:403 })
  }
  return path
}

export async function executeCloudStationApi(command) {
  const commandId = String(command?.id || '')
  const stationId = command?.station_id == null ? '' : String(command.station_id)
  if (!commandId || !stationId) return { ok:false, result:{ status:400, code:'INVALID_COMMAND', error:'Missing station cloud command identity.' } }

  const method = String(command?.payload?.method || 'GET').toUpperCase()
  if (!METHODS.has(method)) return { ok:false, result:{ status:405, code:'METHOD_NOT_ALLOWED', error:'Unsupported HTTP method.' } }

  let path
  try { path = safePath(command?.payload?.path) }
  catch (error) { return { ok:false, result:{ status:error.status || 400, code:error.code || 'INVALID_PATH', error:error.message } } }

  const body = command?.payload?.body && typeof command.payload.body === 'object' ? command.payload.body : {}
  const localAuthToken = String(command?.payload?.localAuthToken || '').trim()
  try {
    const headers = {
      Accept:'application/json',
      'Idempotency-Key':commandId,
      'X-Aezakmi-Cloud-Station-Id':stationId,
      'X-Aezakmi-Internal-Proxy':internalCloudProxySecret,
    }
    if (localAuthToken) headers.Authorization = `Bearer ${localAuthToken}`
    const init = { method, headers, signal:AbortSignal.timeout(15_000) }
    if (method !== 'GET' && method !== 'DELETE') {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const response = await fetch(`http://127.0.0.1:${env.port}/api${path}`, init)
    let data = null
    try { data = await response.json() } catch { data = {} }
    return {
      ok:response.ok,
      result:{
        status:response.status,
        data,
        ...(!response.ok ? { code:data?.code || 'LOCAL_API_ERROR', error:data?.error || `Local API request failed (${response.status}).` } : {}),
      },
    }
  } catch (error) {
    return {
      ok:false,
      result:{
        status:Number(error?.status || (error?.name === 'TimeoutError' ? 504 : 502)),
        code:error?.code || (error?.name === 'TimeoutError' ? 'EDGE_API_TIMEOUT' : 'EDGE_API_ERROR'),
        error:error?.message || 'Unable to reach local Customer Station API.',
      },
    }
  }
}
