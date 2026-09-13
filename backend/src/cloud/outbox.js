import crypto from 'node:crypto'
import { db, nowIso } from '../db/connection.js'

export function enqueueCloudEvent(eventType,payload={},options={}){
  const id=options.id||crypto.randomUUID(),occurredAt=options.occurredAt||nowIso()
  db.prepare(`INSERT OR IGNORE INTO sync_outbox(id,event_type,entity_type,entity_id,payload_json,occurred_at,attempt_count,next_attempt_at,synced_at,last_error) VALUES(?,?,?,?,?,?,0,NULL,NULL,NULL)`)
    .run(id,String(eventType||'edge.event'),options.entityType||null,options.entityId||null,JSON.stringify(payload||{}),occurredAt)
  return id
}

export function pendingCloudEvents(limit=100){
  const lastSuccess=db.prepare("SELECT value FROM sync_state WHERE key='cloud_last_success_at'").get()?.value||null
  return db.prepare(`SELECT id,event_type,entity_type,entity_id,payload_json,occurred_at,attempt_count FROM sync_outbox WHERE synced_at IS NULL AND(next_attempt_at IS NULL OR next_attempt_at<=?) ORDER BY occurred_at LIMIT ?`)
    .all(nowIso(),Math.max(1,Math.min(200,Number(limit)||100)))
    .map(r=>{
      let p={};try{p=JSON.parse(r.payload_json||'{}')}catch{}
      const baseline=String(r.id||'').startsWith('baseline:')
      // Cloud snapshots are applied with cloud_apply_in_progress=1, therefore a
      // normal trigger-created outbox event is a genuine local Edge mutation.
      // Baselines are bootstrap-only and never overwrite an existing Cloud row.
      const authority=p?._authority||p?.authority||(baseline?'bootstrap':'edge')
      return{eventId:r.id,eventType:r.event_type,entityType:r.entity_type,entityId:r.entity_id,payload:{...p,_authority:authority,_cloudBaseSyncAt:p?._cloudBaseSyncAt||lastSuccess||null},occurredAt:r.occurred_at,attemptCount:Number(r.attempt_count||0)}
    })
}

export function markCloudEventsSynced(ids,at=nowIso()){if(!ids?.length)return;db.transaction(()=>{const s=db.prepare('UPDATE sync_outbox SET synced_at=?,last_error=NULL,next_attempt_at=NULL WHERE id=?');for(const id of ids)s.run(at,id)})()}
export function markCloudEventsFailed(ids,error){if(!ids?.length)return;const now=Date.now(),read=db.prepare('SELECT attempt_count FROM sync_outbox WHERE id=?'),s=db.prepare('UPDATE sync_outbox SET attempt_count=attempt_count+1,last_error=?,next_attempt_at=? WHERE id=? AND synced_at IS NULL');db.transaction(()=>{for(const id of ids){const n=Number(read.get(id)?.attempt_count||0)+1,delay=Math.min(15*60_000,5000*(2**Math.min(n-1,7)));s.run(String(error||'Cloud sync failed').slice(0,1000),new Date(now+delay).toISOString(),id)}})()}
const clean=(row,omit=[])=>Object.fromEntries(Object.entries(row||{}).filter(([k])=>!omit.includes(k)))
export function enqueueInitialCloudSnapshot(namespace=crypto.randomUUID()){const before=Number(db.prepare('SELECT COUNT(*) c FROM sync_outbox WHERE synced_at IS NULL').get()?.c||0);const sets=[
 ['members','member.upsert','member','id',['password_hash']],['pcs','station.upsert','station','id',['station_token_hash']],['rate_plans','rate_plan.upsert','rate_plan','id',[]],['computer_sessions','session.upsert','session','id',[]],['wallet_transactions','wallet_ledger.insert','wallet_transaction','id',[]],['session_time_transactions','session_time_ledger.insert','session_time_transaction','id',[]],['top_up_requests','top_up.upsert','top_up','id',[]],['session_extensions','session_extension.upsert','session_extension','id',[]],['revenue_events','revenue.insert','revenue_event','id',[]],['announcements','announcement.upsert','announcement','id',[]],['customer_feedback','feedback.upsert','feedback','id',[]]
];for(const [table,eventType,entityType,idKey,omit] of sets){let rows=[];try{rows=db.prepare(`SELECT * FROM ${table}`).all()}catch{continue}for(const row of rows)enqueueCloudEvent(eventType,{...clean(row,omit),_authority:'bootstrap'},{id:`baseline:${namespace}:${table}:${row[idKey]}`,entityType,entityId:String(row[idKey]),occurredAt:row.updated_at||row.created_at||row.requested_at||row.occurred_at||nowIso()})}const after=Number(db.prepare('SELECT COUNT(*) c FROM sync_outbox WHERE synced_at IS NULL').get()?.c||0);return{queued:Math.max(0,after-before)}}

export function pruneCloudOutbox(days=7){const cutoff=new Date(Date.now()-Math.max(1,Number(days)||7)*86400000).toISOString();return db.prepare('DELETE FROM sync_outbox WHERE synced_at IS NOT NULL AND synced_at<?').run(cutoff).changes}
