import { getApiBase } from './serverConfig.js'
import {
  cloudStationApiFetch,
  cloudStationFeatureEnabled,
  cloudStationPaired,
  setFallbackTransportActive,
  cloudStationTransport,
  getCloudStationCredential,
} from './cloudStation.js'

export function createOperationKey() { return crypto.randomUUID() }

export function getToken() {
  // This token is the local Café Edge member/guest auth token. Cloud device
  // identity is stored separately in Electron safeStorage.
  localStorage.removeItem('aezakmi.auth.token')
  return sessionStorage.getItem('aezakmi.auth.token')
}
export function setToken(token) {
  localStorage.removeItem('aezakmi.auth.token')
  if (token) sessionStorage.setItem('aezakmi.auth.token', token)
  else sessionStorage.removeItem('aezakmi.auth.token')
}


function isLocalOnlyStationPath(path) {
  const base=String(path||'').split('?')[0]
  return base === '/public/station/enroll' || /^\/public\/station-control(?:\/[^/]+\/ack)?$/.test(base)
}

function shouldFallback(error) {
  if (!error) return true
  if (error instanceof TypeError) return true
  const status=Number(error.status||0)
  return [502,503,504].includes(status) || ['EDGE_UNAVAILABLE','EDGE_TIMEOUT','BUSINESS_SUSPENDED','BUSINESS_TERMINATED'].includes(String(error.code||''))
}

async function localApiFetch(path, options = {}) {
  const { operationKey, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers || {})
  if (fetchOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (fetchOptions.method && fetchOptions.method !== 'GET' && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', operationKey || createOperationKey())
  try {
    const stationIp = window.aezakmiClient?.getLocalIPv4?.() || import.meta.env.VITE_CLIENT_IP || ''
    if (stationIp) headers.set('X-Aezakmi-Client-IP', stationIp)
    // Café Edge and Aezakmi Cloud use different station credentials. Local
    // requests must prefer the Edge enrollment token; a Cloud device token is
    // only a last-resort compatibility fallback and normally belongs only on
    // Supabase Function requests.
    const edgeToken = window.aezakmiClient?.getStationCredential?.() || localStorage.getItem('aezakmi.dev.station-token') || ''
    const cloudToken = getCloudStationCredential()?.stationToken || ''
    const stationToken = edgeToken || cloudToken
    if (stationToken) headers.set('X-Aezakmi-Station-Token', stationToken)
    const installationId = window.aezakmiClient?.getInstallationId?.() || ''
    if (installationId) headers.set('X-Aezakmi-Installation-Id', installationId)
    if (cloudStationTransport() === 'fallback') headers.set('X-Aezakmi-Cloud-Fallback', '1')
  } catch {}

  const response = await fetch(`${getApiBase()}${path}`, { ...fetchOptions, headers })
  let data = null
  try { data = await response.json() } catch {}
  // A 401 can mean either member-auth expiry or station-device auth failure.
  // Guests intentionally have no member auth token, so a station credential
  // problem on /guest/session must never kick an active walk-in session back
  // to Member Login. Only invalidate customer auth when a customer token was
  // actually presented.
  if (response.status === 401 && getToken()) window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid', { detail: data }))
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`)
    error.status = response.status; error.code = data?.code; error.data = data
    throw error
  }
  return data
}

export async function apiFetch(path, options = {}) {
  const { operationKey, ...fetchOptions } = options
  const method=String(fetchOptions.method||'GET').toUpperCase()
  let body={}
  if(fetchOptions.body!=null){try{body=typeof fetchOptions.body==='string'?JSON.parse(fetchOptions.body):fetchOptions.body}catch{body={}}}

  // Emergency hidden-shortcut authorization deliberately remains local: the Admin
  // management PIN is never uploaded to Supabase. Everything else uses Cloud first.
  if (cloudStationFeatureEnabled() && cloudStationPaired() && !isLocalOnlyStationPath(path)) {
    try {
      const data=await cloudStationApiFetch(path,{method,body,operationKey:operationKey || (method!=='GET'?createOperationKey():null),localAuthToken:getToken()||''})
      setFallbackTransportActive(false)

      // Guest sessions are started by Admin and may exist on the LAN Edge a
      // moment before Cloud sync reflects them. A Cloud `session:null` is not
      // authoritative proof that this physical PC has no guest session. Probe
      // the paired Café Edge immediately and prefer its active guest session.
      // This makes prepaid/postpaid walk-ins leave the member-login kiosk as
      // soon as staff starts the session, while Cloud remains primary whenever
      // it already has the active session or Edge is unavailable.
      const basePath=String(path||'').split('?')[0]
      if (method==='GET' && basePath==='/guest/session' && !data?.session) {
        try {
          const localGuest=await localApiFetch(path, options)
          if (localGuest?.session) return { ...localGuest, guestSessionAuthority:'edge', guestSessionAbsentConfirmed:false }
          // Both Cloud and the paired LAN Edge agree that no guest session is
          // active. Consumers may use this as a confirmed absence rather than
          // treating a single Cloud-sync miss as a logout boundary.
          return { ...data, guestSessionAuthority:'cloud+edge', guestSessionAbsentConfirmed:true }
        } catch {
          // Cloud currently has no guest row but Edge could not be consulted.
          // Preserve an already-rendered guest until transport reconciliation
          // succeeds; otherwise a brief Edge credential/network problem causes
          // Guest UI -> Member Login flapping.
          return { ...data, guestSessionAuthority:'cloud', guestSessionAbsentConfirmed:false, guestSessionReconcilePending:true }
        }
      }
      if (method==='GET' && basePath==='/guest/session' && data?.session) return { ...data, guestSessionAuthority:'cloud', guestSessionAbsentConfirmed:false }
      return data
    } catch (error) {
      if (!shouldFallback(error)) {
        if (error?.status === 401 && getToken()) window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid',{detail:error.data}))
        throw error
      }
      // Cloud transport is unavailable (or intentionally suspended). The station
      // now talks straight to Café Edge over LAN until Cloud recovers.
      setFallbackTransportActive(true,error?.message||'Cloud unavailable')
    }
  }

  const localData=await localApiFetch(path, options)
  const localBase=String(path||'').split('?')[0]
  if (method==='GET' && localBase==='/guest/session') return { ...localData, guestSessionAuthority:'edge', guestSessionAbsentConfirmed:!localData?.session }
  return localData
}

export function apiGet(path) { return apiFetch(path, { cache:'no-store' }) }
export function apiPost(path, body, options = {}) { return apiFetch(path, { ...options, method:'POST', body: JSON.stringify(body ?? {}) }) }
export function apiPatch(path, body, options = {}) { return apiFetch(path, { ...options, method:'PATCH', body: JSON.stringify(body ?? {}) }) }
export function apiDelete(path, options = {}) { return apiFetch(path, { ...options, method:'DELETE' }) }
export function apiUrl(path = '') { return `${getApiBase()}${path}` }
