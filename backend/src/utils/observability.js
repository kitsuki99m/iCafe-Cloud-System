import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { env } from '../config/env.js'
import { db, nowIso } from '../db/connection.js'

const MAX_CONTEXT_LENGTH = 4000
let lastPruneAt = 0
function logDir(){return path.resolve(process.env.AEZAKMI_OBSERVABILITY_DIR || './data/logs')}
function safe(value) { try { const text=JSON.stringify(value ?? {}); return JSON.parse(text.length>MAX_CONTEXT_LENGTH?text.slice(0,MAX_CONTEXT_LENGTH):text) } catch { return {} } }
function redact(value) { if (!value || typeof value !== 'object') return value; const out=Array.isArray(value)?[]:{}; for(const[key,item]of Object.entries(value)){if(/password|secret|token|authorization|cookie|pin/i.test(key))out[key]='[REDACTED]';else if(item&&typeof item==='object')out[key]=redact(item);else out[key]=item} return out }
function fingerprint(source,code,message){return crypto.createHash('sha256').update(`${source}|${code}|${message}`).digest('hex')}
function pruneLocalTelemetry(){
  const now=Date.now();if(now-lastPruneAt<60*60*1000)return;lastPruneAt=now
  const days=Math.max(7,Math.min(365,Number(env.observabilityRetentionDays||30))),cutoff=new Date(now-days*86400000).toISOString()
  try{db.prepare('DELETE FROM observability_events WHERE synced_at IS NOT NULL AND created_at < ?').run(cutoff)}catch{}
  try{const dir=logDir();if(!fs.existsSync(dir))return;for(const name of fs.readdirSync(dir)){if(!/^errors-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name))continue;const file=path.join(dir,name);if(fs.statSync(file).mtimeMs<now-days*86400000)fs.unlinkSync(file)}}catch{}
}

export function recordLocalError(source,error,context={}) {
  pruneLocalTelemetry()
  const now=new Date(),code=String(error?.code||'UNHANDLED_ERROR').slice(0,120),message=String(error?.message||error||'Unknown error').slice(0,1000),normalizedSource=String(source||'unknown').slice(0,120),cleanContext=redact(safe(context)),fp=fingerprint(normalizedSource,code,message)
  const entry={at:now.toISOString(),source:normalizedSource,code,status:Number(error?.status||500),message,context:cleanContext,environment:env.nodeEnv,fingerprint:fp}
  try { fs.mkdirSync(logDir(),{recursive:true});fs.appendFileSync(path.join(logDir(),`errors-${now.toISOString().slice(0,10)}.jsonl`),`${JSON.stringify(entry)}\n`,{encoding:'utf8',mode:0o600}) } catch {}
  try { db.prepare(`INSERT INTO observability_events(id,source,severity,code,message,fingerprint,context_json,created_at,synced_at) VALUES(?,?,?,?,?,?,?,?,NULL)`).run(crypto.randomUUID(),normalizedSource,Number(error?.status||500)>=500?'error':'warning',code,message,fp,JSON.stringify(cleanContext),nowIso()) } catch {}
  if(env.observabilityWebhookUrl){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);timer.unref?.();void fetch(env.observabilityWebhookUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...entry,server:env.serverName}),signal:controller.signal}).catch(()=>{}).finally(()=>clearTimeout(timer))}
  return fp
}

export const reportError=recordLocalError
export function pendingObservability(limit=50){return db.prepare(`SELECT id,source,severity,code,message,fingerprint,context_json,created_at FROM observability_events WHERE synced_at IS NULL ORDER BY created_at LIMIT ?`).all(Math.max(1,Math.min(100,Number(limit)||50))).map(row=>({...row,context:row.context_json?JSON.parse(row.context_json):{}}))}
export function markObservabilitySynced(ids=[],at=nowIso()){pruneLocalTelemetry();const unique=[...new Set((ids||[]).filter(Boolean))];if(!unique.length)return;const stmt=db.prepare('UPDATE observability_events SET synced_at=? WHERE id=?');db.transaction(()=>{for(const id of unique)stmt.run(at,id)})()}
