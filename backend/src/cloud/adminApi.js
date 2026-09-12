import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { db, nowIso } from '../db/connection.js'
import { env } from '../config/env.js'

const ALLOWED_ROOTS = new Set([
  'pcs','members','rate-plans','announcements','feedback','support','top-ups','sessions',
  'session-extensions','transfer-requests','promos','logs','analytics','billing-policy',
  'settings','wallet','expenses','tax-estimate','branding','remote-commands','dashboard',
  'earnings','guest','client',
])
const METHODS = new Set(['GET','POST','PATCH','PUT','DELETE'])

function safePath(value) {
  const path = String(value || '').trim()
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('..') || /^https?:/i.test(path)) {
    throw Object.assign(new Error('Invalid Admin API path.'), { code:'INVALID_PATH', status:400 })
  }
  const root = path.split('?')[0].split('/').filter(Boolean)[0] || ''
  if (!ALLOWED_ROOTS.has(root)) {
    throw Object.assign(new Error('Admin API path is not cloud-enabled.'), { code:'PATH_NOT_ALLOWED', status:403 })
  }
  return path
}

function adminToken() {
  const admin = db.prepare("SELECT id,must_change_credentials FROM users WHERE role='admin' AND is_active=1 ORDER BY created_at LIMIT 1").get()
  if (!admin) throw Object.assign(new Error('Local Admin account is unavailable.'), { code:'ADMIN_UNAVAILABLE', status:503 })
  if (admin.must_change_credentials) {
    throw Object.assign(new Error('Finish local Admin credential setup before using Cloud Admin.'), { code:'LOCAL_ADMIN_SETUP_REQUIRED', status:409 })
  }

  const sessionId = crypto.randomUUID()
  const jwtId = crypto.randomUUID()
  const now = nowIso()
  const expiresAt = new Date(Date.now() + 60_000).toISOString()
  db.prepare('INSERT INTO auth_sessions(id,user_id,jwt_id,pc_id,client_ip,created_at,last_seen_at,expires_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(sessionId, admin.id, jwtId, null, '127.0.0.1', now, now, expiresAt)
  const token = jwt.sign({ sub:admin.id, role:'admin', memberId:null, pcId:null, jti:jwtId }, env.jwtSecret, { expiresIn:'60s' })
  return { token, sessionId }
}

function cached(commandId) {
  const row = db.prepare('SELECT status,result FROM cloud_admin_actions WHERE cloud_command_id=?').get(commandId)
  if (!row) return null
  try { return { status:row.status, result:row.result ? JSON.parse(row.result) : {} } }
  catch { return { status:row.status, result:{} } }
}

function persist(commandId, action, status, result, { complete=false } = {}) {
  const now = nowIso()
  db.prepare(`
    INSERT INTO cloud_admin_actions(cloud_command_id,action,status,result,created_at,completed_at)
    VALUES(?,?,?,?,?,?)
    ON CONFLICT(cloud_command_id) DO UPDATE SET
      action=excluded.action,
      status=excluded.status,
      result=excluded.result,
      completed_at=excluded.completed_at
  `).run(commandId, action, status, JSON.stringify(result || {}), now, complete ? now : null)
}

export async function executeCloudAdminApi(command) {
  const commandId = String(command?.id || '')
  if (!commandId) return { ok:false, result:{ status:400, code:'INVALID_COMMAND', error:'Missing command id.' } }

  const previous = cached(commandId)
  if (previous?.status === 'completed') return { ok:true, result:previous.result }
  if (previous?.status === 'failed') return { ok:false, result:previous.result }

  const method = String(command?.payload?.method || 'GET').toUpperCase()
  if (!METHODS.has(method)) return { ok:false, result:{ status:405, code:'METHOD_NOT_ALLOWED', error:'Unsupported HTTP method.' } }

  let path
  try { path = safePath(command?.payload?.path) }
  catch (error) { return { ok:false, result:{ status:error.status || 400, code:error.code || 'INVALID_PATH', error:error.message } } }

  const body = command?.payload?.body && typeof command.payload.body === 'object' ? command.payload.body : {}
  const action = `api:${method}:${path}`
  persist(commandId, action, 'running', {})

  let sessionId = null
  try {
    const auth = adminToken()
    sessionId = auth.sessionId
    const headers = {
      Authorization:`Bearer ${auth.token}`,
      Accept:'application/json',
      'Idempotency-Key':commandId,
    }
    const init = { method, headers, signal:AbortSignal.timeout(15_000) }
    if (method !== 'GET' && method !== 'DELETE') {
      headers['Content-Type'] = 'application/json'
      init.body = JSON.stringify(body)
    }

    const response = await fetch(`http://127.0.0.1:${env.port}/api${path}`, init)
    let data = null
    try { data = await response.json() } catch { data = {} }
    const result = {
      status:response.status,
      data,
      ...(!response.ok ? {
        code:data?.code || 'LOCAL_API_ERROR',
        error:data?.error || `Local API request failed (${response.status}).`,
      } : {}),
    }
    persist(commandId, action, response.ok ? 'completed' : 'failed', result, { complete:true })
    return { ok:response.ok, result }
  } catch (error) {
    const result = {
      status:Number(error?.status || (error?.name === 'TimeoutError' ? 504 : 502)),
      code:error?.code || (error?.name === 'TimeoutError' ? 'EDGE_API_TIMEOUT' : 'EDGE_API_ERROR'),
      error:error?.message || 'Unable to reach local API.',
    }
    persist(commandId, action, 'failed', result, { complete:true })
    return { ok:false, result }
  } finally {
    if (sessionId) {
      db.prepare('UPDATE auth_sessions SET revoked_at=?,ended_at=?,end_reason=? WHERE id=? AND revoked_at IS NULL')
        .run(nowIso(), nowIso(), 'cloud_admin_api', sessionId)
    }
  }
}
