import { recordLocalError } from '../utils/observability.js'

export function notFound(req, res) {
  res.status(404).json({ success: false, code: 'NOT_FOUND', error: 'Route not found.' })
}

export function errorHandler(err, req, res, next) {
  console.error(err)
  recordLocalError('http', err, { method:req?.method, path:req?.originalUrl || req?.url })
  if (res.headersSent) return next(err)

  const sqliteConstraint = String(err?.code || '').startsWith('SQLITE_CONSTRAINT')
  const status = sqliteConstraint ? 409 : (Number(err?.status) || 500)
  const expose = sqliteConstraint || Boolean(err?.expose) || status < 500
  const code = sqliteConstraint
    ? 'DATA_CONFLICT'
    : err?.code && typeof err.code === 'string' && !err.code.startsWith('SQLITE_')
      ? err.code
      : status >= 500 ? 'INTERNAL_ERROR' : 'REQUEST_FAILED'
  const message = sqliteConstraint
    ? 'The requested change conflicts with current data. Refresh and retry.'
    : expose ? String(err.message || 'Request failed.') : 'Internal server error.'

  res.status(status).json({
    success: false,
    code,
    error: message,
  })
}
