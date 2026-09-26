import { getApiBase } from './serverConfig.js'
import { isCloudAdmin, cloudAdminRequest, cloudBranchId, cloudInvalidateReadCache } from './cloudClient.js'

const readCache = new Map()
const readInFlight = new Map()
let readCacheEpoch = 0

export function createOperationKey() { return crypto.randomUUID() }

function readScope() {
  if (isCloudAdmin()) return `cloud:${cloudBranchId() || 'unselected'}`
  return `local:${getApiBase()}:${sessionStorage.getItem('aezakmi.auth.token') || 'anonymous'}`
}

function readTtl(path) {
  const base=String(path||'').split('?')[0]
  if (base==='/auth/me' || /^\/remote-commands\//.test(base) || /\/settlement-preview$/.test(base)) return 0
  if (base==='/client/context') return 5 * 60_000
  if (base==='/settings' || base==='/public/settings' || base==='/rate-plans' || base==='/announcements') return 5 * 60_000
  if (base==='/launcher/categories' || base==='/launcher/apps') return 5 * 60_000
  if (base==='/app-data') return 20_000
  if (base==='/pcs' || base==='/members' || base==='/top-ups' || base==='/support' || base==='/session-extensions') return 20_000
  if (base==='/menu-items' || base==='/vouchers') return 60_000
  if (base==='/menu-orders' || base==='/shifts/current') return 20_000
  if (base==='/shifts/history') return 60_000
  if (base==='/dashboard/overview') return 45_000
  if (base==='/logs' || base==='/sessions/interrupted') return 60_000
  if (base==='/cloud/status') return 30_000
  if (base==='/feedback') return 20_000
  if (base==='/analytics') return 4 * 60_000
  if (base==='/earnings' || base==='/tax-estimate') return 60_000
  if (/^\/earnings\/reports\//.test(base)) return 60_000
  return 15_000
}

export function invalidateApiCache(predicate = null) {
  readCacheEpoch += 1
  if (!predicate) {
    readCache.clear()
    readInFlight.clear()
  } else {
    const match = typeof predicate === 'function'
      ? predicate
      : (key) => String(key).includes(String(predicate))
    for (const key of readCache.keys()) if (match(key)) readCache.delete(key)
    for (const key of readInFlight.keys()) if (match(key)) readInFlight.delete(key)
  }
  cloudInvalidateReadCache()
}

export function getToken() {
  localStorage.removeItem('aezakmi.auth.token')
  return sessionStorage.getItem('aezakmi.auth.token')
}
export function setToken(token) {
  localStorage.removeItem('aezakmi.auth.token')
  const previous=sessionStorage.getItem('aezakmi.auth.token')
  if (token) sessionStorage.setItem('aezakmi.auth.token', token)
  else sessionStorage.removeItem('aezakmi.auth.token')
  if (String(previous||'') !== String(token||'')) invalidateApiCache()
}

export async function apiFetch(path, options = {}) {
  const { operationKey, ...fetchOptions } = options
  const method=String(fetchOptions.method||'GET').toUpperCase()
  if (isCloudAdmin()) {
    let body
    if(fetchOptions.body!=null){try{body=typeof fetchOptions.body==='string'?JSON.parse(fetchOptions.body):fetchOptions.body}catch{body={}}}
    try{
      const result=await cloudAdminRequest(path,{method,body,operationKey:operationKey || (method!=='GET' ? createOperationKey() : null)})
      if(method!=='GET') invalidateApiCache()
      return result
    }
    catch(error){if(error?.status===401)window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid',{detail:error.data}));throw error}
  }
  const headers = new Headers(fetchOptions.headers || {})
  if (fetchOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (fetchOptions.method && fetchOptions.method !== 'GET' && !headers.has('Idempotency-Key')) headers.set('Idempotency-Key', operationKey || createOperationKey())
  const response = await fetch(`${getApiBase()}${path}`, { ...fetchOptions, headers })
  let data = null
  try { data = await response.json() } catch {}
  if (response.status === 401) window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid', { detail: data }))
  if (!response.ok) { const error = new Error(data?.error || `Request failed (${response.status})`); error.status = response.status; error.code = data?.code; error.data = data; throw error }
  if(method!=='GET') invalidateApiCache()
  return data
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
export function apiPut(path, body, options = {}) { return apiFetch(path, { ...options, method:'PUT', body: JSON.stringify(body ?? {}) }) }
export function apiDelete(path, options = {}) { return apiFetch(path, { ...options, method:'DELETE' }) }
export function apiUrl(path = '') { return isCloudAdmin() ? path : `${getApiBase()}${path}` }
