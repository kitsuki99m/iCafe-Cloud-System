import { getApiBase } from './serverConfig.js'
import { isCloudAdmin, cloudAdminRequest } from './cloudClient.js'

export function createOperationKey() { return crypto.randomUUID() }
export function getToken() {
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
  if (isCloudAdmin()) {
    const method=String(fetchOptions.method||'GET').toUpperCase()
    let body
    if(fetchOptions.body!=null){try{body=typeof fetchOptions.body==='string'?JSON.parse(fetchOptions.body):fetchOptions.body}catch{body={}}}
    try{return await cloudAdminRequest(path,{method,body,operationKey:operationKey || (method!=='GET' ? createOperationKey() : null)})}
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
  return data
}
export function apiGet(path) { return apiFetch(path, { cache:'no-store' }) }
export function apiPost(path, body, options = {}) { return apiFetch(path, { ...options, method:'POST', body: JSON.stringify(body ?? {}) }) }
export function apiPatch(path, body, options = {}) { return apiFetch(path, { ...options, method:'PATCH', body: JSON.stringify(body ?? {}) }) }
export function apiPut(path, body, options = {}) { return apiFetch(path, { ...options, method:'PUT', body: JSON.stringify(body ?? {}) }) }
export function apiDelete(path, options = {}) { return apiFetch(path, { ...options, method:'DELETE' }) }
export function apiUrl(path = '') { return isCloudAdmin() ? path : `${getApiBase()}${path}` }
