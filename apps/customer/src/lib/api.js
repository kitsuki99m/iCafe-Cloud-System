import { getApiBase } from './serverConfig.js'

export function createOperationKey() {
  return crypto.randomUUID()
}

export function getToken() {
  // Auth belongs to the current Electron/window session. Remove the legacy
  // persistent copy so upgrading does not keep a bearer token on disk.
  localStorage.removeItem('aezakmi.auth.token')
  return sessionStorage.getItem('aezakmi.auth.token')
}

export function setToken(token) {
  localStorage.removeItem('aezakmi.auth.token')
  if (token) sessionStorage.setItem('aezakmi.auth.token', token)
  else sessionStorage.removeItem('aezakmi.auth.token')
}

export async function apiFetch(path, options = {}) {
  const { operationKey, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers || {})
  if (fetchOptions.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (fetchOptions.method && fetchOptions.method !== 'GET' && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', operationKey || createOperationKey())
  }

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
    error.status = response.status
    error.code = data?.code
    error.data = data
    throw error
  }
  return data
}

export function apiGet(path) { return apiFetch(path, { cache:'no-store' }) }
export function apiPost(path, body, options = {}) { return apiFetch(path, { ...options, method:'POST', body: JSON.stringify(body ?? {}) }) }
export function apiPatch(path, body, options = {}) { return apiFetch(path, { ...options, method:'PATCH', body: JSON.stringify(body ?? {}) }) }
export function apiDelete(path, options = {}) { return apiFetch(path, { ...options, method:'DELETE' }) }

export function apiUrl(path = '') {
  return `${getApiBase()}${path}`
}
