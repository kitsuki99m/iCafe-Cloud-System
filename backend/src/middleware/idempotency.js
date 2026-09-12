import crypto from 'node:crypto'
import { db, nowIso } from '../db/connection.js'

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000
export const IDEMPOTENCY_IN_PROGRESS_TTL_MS = 2 * 60 * 1000

function cutoffIso(ageMs) {
  return new Date(Date.now() - ageMs).toISOString()
}

export function idempotency(req,res,next) {
  if (!['POST','PATCH','PUT','DELETE'].includes(req.method)) return next()
  const key=String(req.get('Idempotency-Key')||'').trim()
  if(!key) return next()
  if(key.length>128) return res.status(400).json({success:false,code:'INVALID_IDEMPOTENCY_KEY',error:'Idempotency key is too long.'})

  // Completed results are useful only for a bounded retry window. Removing
  // stale records also prevents this table from growing forever.
  db.prepare('DELETE FROM idempotency_records WHERE created_at <= ? AND status_code <> 0').run(cutoffIso(IDEMPOTENCY_TTL_MS))

  const actor=crypto.createHash('sha256').update(String(req.get('Authorization')||req.get('X-Aezakmi-Station-Token')||req.clientIp||'anonymous')).digest('hex').slice(0,20)
  const scope=`${actor}:${req.method}:${req.path}`
  const requestHash=crypto.createHash('sha256').update(JSON.stringify(req.body??null)).digest('hex')
  let existing=db.prepare('SELECT * FROM idempotency_records WHERE scope=? AND request_key=?').get(scope,key)

  const staleInProgress = existing?.status_code===0 && new Date(existing.created_at).getTime() <= Date.now()-IDEMPOTENCY_IN_PROGRESS_TTL_MS
  if(staleInProgress){
    db.prepare('DELETE FROM idempotency_records WHERE scope=? AND request_key=? AND status_code=0').run(scope,key)
    existing=null
  }

  if(existing){
    if(existing.request_hash!==requestHash)return res.status(409).json({success:false,code:'IDEMPOTENCY_CONFLICT',error:'This operation key was already used with different input.'})
    if(existing.status_code===0)return res.status(409).json({success:false,code:'OPERATION_IN_PROGRESS',error:'This operation is already being processed.'})
    return res.status(existing.status_code).json(JSON.parse(existing.response_json))
  }

  db.prepare('INSERT INTO idempotency_records(scope,request_key,request_hash,status_code,response_json,created_at) VALUES(?,?,?,?,?,?)').run(scope,key,requestHash,0,'null',nowIso())
  const originalJson=res.json.bind(res)
  res.json=(body)=>{
    if(res.statusCode>=200&&res.statusCode<400)db.prepare('UPDATE idempotency_records SET status_code=?,response_json=? WHERE scope=? AND request_key=?').run(res.statusCode,JSON.stringify(body??null),scope,key)
    else db.prepare('DELETE FROM idempotency_records WHERE scope=? AND request_key=? AND status_code=0').run(scope,key)
    return originalJson(body)
  }
  next()
}
