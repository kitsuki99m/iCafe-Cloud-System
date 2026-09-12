const ENV_API_BASE = String(import.meta.env.VITE_API_BASE_URL || '').trim()
const DEFAULT_PORT = 3000
export const SERVER_TEST_TIMEOUT_MS = 4000

function absoluteEnvBase() {
  return /^https?:\/\//i.test(ENV_API_BASE) ? ENV_API_BASE.replace(/\/$/, '') : ''
}

function bridge() {
  return typeof window !== 'undefined' ? window.aezakmiAdmin : null
}

function parseApiBase(apiBase) {
  try {
    const url = new URL(apiBase)
    return {
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      apiBase: `${url.origin}/api`,
    }
  } catch {
    return null
  }
}

function makeProbeError(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

async function probeApiBase(apiBase, { signal, timeoutMs = SERVER_TEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController()
  let timedOut = false
  const onExternalAbort = () => controller.abort()

  if (signal?.aborted) controller.abort()
  else signal?.addEventListener?.('abort', onExternalAbort, { once: true })

  const timeout = window.setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  try {
    const response = await fetch(`${apiBase.replace(/\/$/, '')}/health`, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`Server responded with HTTP ${response.status}.`)
    const data = await response.json().catch(() => null)
    if (data?.success === false) throw new Error(data.error || 'Server health check failed.')
    return data
  } catch (error) {
    if (signal?.aborted && !timedOut) {
      throw makeProbeError('Connection test cancelled.', 'SERVER_CONNECTION_CANCELLED')
    }
    if (timedOut || error?.name === 'AbortError') {
      throw makeProbeError('Server did not respond within 4 seconds. Check the IP, port, and backend, then try again.', 'SERVER_CONNECTION_TIMEOUT')
    }
    throw makeProbeError(error?.message || 'Unable to reach the server.', 'SERVER_CONNECTION_FAILED')
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener?.('abort', onExternalAbort)
  }
}

export function getRuntimeServerConfig() {
  try {
    const value = bridge()?.getServerConfig?.()
    if (value?.configured !== false && value?.apiBase && /^https?:\/\//i.test(value.apiBase)) return value
  } catch {}
  return null
}

export function getApiBase() {
  const runtime = getRuntimeServerConfig()
  if (runtime?.apiBase) return runtime.apiBase.replace(/\/$/, '')

  const envBase = absoluteEnvBase()
  if (envBase) return envBase

  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3000/api'
  }
  return '/api'
}

export function getServerConnectionDefaults() {
  const runtime = getRuntimeServerConfig()
  if (runtime) return { host: runtime.host || '127.0.0.1', port: Number(runtime.port || DEFAULT_PORT), source: runtime.source || 'runtime' }

  const env = parseApiBase(absoluteEnvBase())
  if (env) return { host: env.host, port: env.port, source: 'build fallback' }

  return { host: '127.0.0.1', port: DEFAULT_PORT, source: 'local default' }
}

export function normalizeServerDraft(hostValue, portValue) {
  const host = String(hostValue || '').trim()
  const port = Number(portValue)
  if (!host) throw new Error('Enter the server IP address or hostname.')
  if (/^https?:\/\//i.test(host) || /[\\/\s]/.test(host)) {
    throw new Error('Enter only the server IP or hostname, without http:// or a path.')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Port must be a whole number from 1 to 65535.')
  }
  return { host, port, apiBase: `http://${host}:${port}/api` }
}

export async function testServerConfig(host, port, options = {}) {
  const candidate = normalizeServerDraft(host, port)
  await probeApiBase(candidate.apiBase, options)
  return { ok: true, ...candidate }
}

export async function testCurrentServerConfig(options = {}) {
  const apiBase = getApiBase()
  await probeApiBase(apiBase, options)
  return { ok: true, apiBase }
}

export async function saveRuntimeServerConfig(host, port) {
  const candidate = normalizeServerDraft(host, port)
  const setter = bridge()?.setServerConfig
  if (!setter) throw new Error('Runtime server settings are available in the Electron app.')
  return setter({ host: candidate.host, port: candidate.port })
}
