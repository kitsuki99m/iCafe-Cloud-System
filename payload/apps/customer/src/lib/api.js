import { getApiBase } from './serverConfig.js'
import {
  cloudStationApiFetch,
  cloudStationFeatureEnabled,
  cloudStationPaired,
  setFallbackTransportActive,
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
    const stationToken = window.aezakmiClient?.getStationCredential?.() || localStorage.getItem('aezakmi.dev.station-token') || ''
    if (stationToken) headers.set('X-Aezakmi-Station-Token', stationToken)
  } catch {}

  const response = await fetch(`${getApiBase()}${path}`, { ...fetchOptions, headers })
  let data = null
  try { data = await response.json() } catch {}
  if (response.status === 401) window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid', { detail: data }))
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

  if (cloudStationFeatureEnabled() && cloudStationPaired() && path !== '/public/station/enroll') {
    try {
      const data=await cloudStationApiFetch(path,{method,body,operationKey:operationKey || (method!=='GET'?createOperationKey():null),localAuthToken:getToken()||''})
      setFallbackTransportActive(false)
      return data
    } catch (error) {
      if (!shouldFallback(error)) {
        if (error?.status === 401) window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid',{detail:error.data}))
        throw error
      }
      // Cloud transport is unavailable (or intentionally suspended). The station
      // now talks straight to Café Edge over LAN until Cloud recovers.
      setFallbackTransportActive(true,error?.message||'Cloud unavailable')
    }
  }

  return localApiFetch(path, options)
}

export function apiGet(path) { return apiFetch(path, { cache:'no-store' }) }
export function apiPost(path, body, options = {}) { return apiFetch(path, { ...options, method:'POST', body: JSON.stringify(body ?? {}) }) }
export function apiPatch(path, body, options = {}) { return apiFetch(path, { ...options, method:'PATCH', body: JSON.stringify(body ?? {}) }) }
export function apiDelete(path, options = {}) { return apiFetch(path, { ...options, method:'DELETE' }) }
export function apiUrl(path = '') { return `${getApiBase()}${path}` }
