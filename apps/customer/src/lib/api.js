import { getApiBase } from './serverConfig.js'
import {
  cloudStationApiFetch,
  cloudStationFeatureEnabled,
  cloudStationPaired,
  setFallbackTransportActive,
  cloudStationTransport,
  getCloudStationCredential,
} from './cloudStation.js'

const readCache = new Map()
const readInFlight = new Map()
let readCacheEpoch = 0

export function createOperationKey() { return crypto.randomUUID() }

function readScope() {
  const station=getCloudStationCredential()
  return `${station?.stationId || 'local'}:${getToken() || 'anonymous'}:${cloudStationTransport()}`
}

function readTtl(path) {
  const base=String(path||'').split('?')[0]
  if (base==='/auth/me' || base==='/guest/session') return 0
  if (base==='/app-data' || base==='/client/context' || base==='/pcs/current' || base==='/members/me' || base==='/wallet') return 1_500
  if (base==='/settings' || base==='/public/settings' || base==='/rate-plans' || base==='/public/rate-plans' || base==='/announcements' || base==='/public/announcements') return 5 * 60_000
  if (base==='/feedback/me' || base==='/public/feedback/me') return 30_000
  return 2_000
}

function mutationInvalidatesReads(path, method) {
  if (String(method||'GET').toUpperCase()==='GET') return false
  const base=String(path||'').split('?')[0]
  // Heartbeats only renew presence/auth TTL; they do not change view data.
  if (base==='/auth/heartbeat' || /^\/public\/remote-commands\//.test(base)) return false
  return true
}

export function invalidateApiCache(predicate = null) {
  readCacheEpoch += 1
  if (!predicate) {
    readCache.clear()
    readInFlight.clear()
    return
  }
  const match=typeof predicate==='function' ? predicate : (key)=>String(key).includes(String(predicate))
  for(const key of readCache.keys()) if(match(key)) readCache.delete(key)
  for(const key of readInFlight.keys()) if(match(key)) readInFlight.delete(key)
}

export function getToken() {
  // This token is the local Café Edge member/guest auth token. Cloud device
  // identity is stored separately in Electron safeStorage.
  localStorage.removeItem('aezakmi.auth.token')
  return sessionStorage.getItem('aezakmi.auth.token')
}
export function setToken(token) {
  localStorage.removeItem('aezakmi.auth.token')
  const previous=sessionStorage.getItem('aezakmi.auth.token')
  if (token) sessionStorage.setItem('aezakmi.auth.token', token)
  else sessionStorage.removeItem('aezakmi.auth.token')
  if(String(previous||'')!==String(token||'')) invalidateApiCache()
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
    const edgeToken = window.aezakmiClient?.getStationCredential?.() || localStorage.getItem('aezakmi.dev.station-token') || ''
    const cloudToken = getCloudStationCredential()?.stationToken || ''
    const stationToken = edgeToken || cloudToken
    if (stationToken) headers.set('X-Aezakmi-Station-Token', stationToken)
    const installationId = window.aezakmiClient?.getInstallationId?.() || ''
    if (installationId) headers.set('X-Aezakmi-Installation-Id', installationId)
    if (cloudStationTransport() === 'fallback') headers.set('X-Aezakmi-Cloud-Fallback', '1')
  } catch {}

  let response
  try {
    const apiBase=getApiBase()
    response = await fetch(`${apiBase}${path}`, { ...fetchOptions, headers })
  } catch (error) {
    if (error?.code === 'CAFE_EDGE_NOT_CONFIGURED') throw error
    const unavailable = new Error('Café Edge is unavailable on the LAN. Connect this PC to the café network or restore the Cloud connection, then try again.')
    unavailable.status = 503
    unavailable.code = 'CAFE_EDGE_UNAVAILABLE'
    unavailable.cause = error
    throw unavailable
  }
  let data = null
  try { data = await response.json() } catch {}
  if (response.status === 401 && getToken()) window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid', { detail: data }))
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`)
    error.status = response.status; error.code = data?.code; error.data = data
    throw error
  }
  return data
}


// Fast LAN-only probe used while the Customer login kiosk is waiting for an
// Admin-started walk-in session. This deliberately avoids a Cloud request on
// every one-second probe; Realtime remains the immediate Cloud wake-up path.
export async function apiGetGuestSessionLocal() {
  const data = await localApiFetch('/guest/session', { cache:'no-store' })
  return { ...data, guestSessionAuthority:'edge', guestSessionAbsentConfirmed:!data?.session }
}

// Cloud-primary reads fall back to Café Edge over LAN until Cloud recovers.
async function localAppDataBundle() {
  // `/app-data` is a Cloud bundling route. When Cloud is unavailable, build the
  // same shape from Café Edge over LAN so callers do not need six separate
  // fallback code paths or a nonexistent local `/app-data` route.
  if (getToken()) {
    const [pcData, plansData, clientContext, memberData, settingsData, announcementData] = await Promise.all([
      localApiFetch('/pcs/current', { cache:'no-store' }),
      localApiFetch('/rate-plans', { cache:'no-store' }),
      localApiFetch('/client/context', { cache:'no-store' }),
      localApiFetch('/members/me', { cache:'no-store' }),
      localApiFetch('/settings', { cache:'no-store' }),
      localApiFetch('/announcements', { cache:'no-store' }),
    ])
    return {
      pc:pcData?.pc ?? clientContext?.pc ?? null,
      member:memberData?.member ?? null,
      ratePlans:plansData?.ratePlans ?? [],
      settings:settingsData?.settings ?? {},
      announcements:announcementData?.announcements ?? [],
      clientContext:clientContext ?? null,
      transport:'edge',
    }
  }
  const [guestData, settingsData, clientContext, announcementData, plansData] = await Promise.all([
    localApiFetch('/guest/session', { cache:'no-store' }),
    localApiFetch('/public/settings', { cache:'no-store' }),
    localApiFetch('/client/context', { cache:'no-store' }),
    localApiFetch('/public/announcements', { cache:'no-store' }),
    localApiFetch('/public/rate-plans', { cache:'no-store' }),
  ])
  const pc=guestData?.pc ?? clientContext?.pc ?? null
  return {
    pc:pc ? { ...pc, ...(guestData?.session ? { session:guestData.session, status:'occupied' } : {}) } : null,
    member:null,
    ratePlans:plansData?.ratePlans ?? [],
    settings:settingsData?.settings ?? {},
    announcements:announcementData?.announcements ?? [],
    clientContext:clientContext ?? null,
    guestSessionAuthority:'edge',
    guestSessionAbsentConfirmed:!guestData?.session,
    transport:'edge',
  }
}

export async function apiFetch(path, options = {}) {
  const { operationKey, ...fetchOptions } = options
  const method=String(fetchOptions.method||'GET').toUpperCase()
  let body={}
  if(fetchOptions.body!=null){try{body=typeof fetchOptions.body==='string'?JSON.parse(fetchOptions.body):fetchOptions.body}catch{body={}}}

  if (cloudStationFeatureEnabled() && cloudStationPaired() && !isLocalOnlyStationPath(path)) {
    try {
      const data=await cloudStationApiFetch(path,{method,body,operationKey:operationKey || (method!=='GET'?createOperationKey():null),localAuthToken:getToken()||''})
      setFallbackTransportActive(false)
      const basePath=String(path||'').split('?')[0]
      if (method==='GET' && basePath==='/guest/session' && !data?.session) {
        try {
          const localGuest=await localApiFetch(path, options)
          if (localGuest?.session) return { ...localGuest, guestSessionAuthority:'edge', guestSessionAbsentConfirmed:false }
          return { ...data, guestSessionAuthority:'cloud+edge', guestSessionAbsentConfirmed:true }
        } catch {
          return { ...data, guestSessionAuthority:'cloud', guestSessionAbsentConfirmed:false, guestSessionReconcilePending:true }
        }
      }
      if (method==='GET' && basePath==='/guest/session' && data?.session) return { ...data, guestSessionAuthority:'cloud', guestSessionAbsentConfirmed:false }
      if (method==='GET' && basePath==='/app-data' && !getToken() && !data?.pc?.session) {
        try {
          const edgeBundle=await localAppDataBundle()
          if (edgeBundle?.pc?.session) return edgeBundle
          return { ...data, guestSessionAuthority:'cloud+edge', guestSessionAbsentConfirmed:true }
        } catch {
          return { ...data, guestSessionAuthority:'cloud', guestSessionAbsentConfirmed:false, guestSessionReconcilePending:true }
        }
      }
      if(mutationInvalidatesReads(path,method)) invalidateApiCache()
      return data
    } catch (error) {
      if (!shouldFallback(error)) {
        if (error?.status === 401 && getToken()) window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid',{detail:error.data}))
        throw error
      }
      setFallbackTransportActive(true,error?.message||'Cloud unavailable')
      invalidateApiCache()
    }
  }

  const localBase=String(path||'').split('?')[0]
  const localData=method==='GET' && localBase==='/app-data'
    ? await localAppDataBundle()
    : await localApiFetch(path, options)
  if(mutationInvalidatesReads(path,method)) invalidateApiCache()
  if (method==='GET' && localBase==='/guest/session') return { ...localData, guestSessionAuthority:'edge', guestSessionAbsentConfirmed:!localData?.session }
  return localData
}

export async function apiGet(path, options = {}) {
  const force=Boolean(options?.force)
  const ttlMs=Number.isFinite(Number(options?.ttlMs)) ? Math.max(0,Number(options.ttlMs)) : readTtl(path)
  if(force || ttlMs<=0) return apiFetch(path, { cache:'no-store' })
  const key=`${readScope()}:GET:${path}`
  const cached=readCache.get(key)
  if(cached && cached.expiresAt>Date.now()) return cached.value
  if(readInFlight.has(key)) return readInFlight.get(key)
  const epoch=readCacheEpoch
  const request=apiFetch(path, { cache:'no-store' })
    .then((value)=>{if(epoch===readCacheEpoch)readCache.set(key,{value,expiresAt:Date.now()+ttlMs});return value})
    .finally(()=>readInFlight.delete(key))
  readInFlight.set(key,request)
  return request
}
export function apiPost(path, body, options = {}) { return apiFetch(path, { ...options, method:'POST', body: JSON.stringify(body ?? {}) }) }
export function apiPatch(path, body, options = {}) { return apiFetch(path, { ...options, method:'PATCH', body: JSON.stringify(body ?? {}) }) }
export function apiDelete(path, options = {}) { return apiFetch(path, { ...options, method:'DELETE' }) }
export function apiUrl(path = '') { return `${getApiBase()}${path}` }
