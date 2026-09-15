import crypto from'node:crypto'
import{env}from'../config/env.js'
import{db,nowIso}from'../db/connection.js'
import{pairEdge,syncEdge,unpairEdge,startCloudWakeup,stopCloudWakeup}from'./client.js'
import{enqueueCloudEvent,enqueueInitialCloudSnapshot,markCloudEventsFailed,markCloudEventsSynced,pendingCloudEvents,pruneCloudOutbox}from'./outbox.js'
import{buildEdgeSnapshot}from'./snapshot.js'
import{clearCloudIdentity,getCloudBranchConfig,getCloudIdentity,getCloudLicense,getSyncState,getSyncSummary,saveCloudBranchConfig,saveCloudIdentity,setCloudLicense,setSyncState,touchCloudSeen}from'./store.js'
import{applyCloudConfig,applyCloudRuntime}from'./configApply.js'
import{queueCloudCommand}from'./commands.js'

let timer=null,running=null
function installationId(){let r=db.prepare("SELECT value FROM sync_state WHERE key='installation_id'").get();if(r?.value)return r.value;const v=crypto.randomUUID();db.prepare("INSERT OR REPLACE INTO sync_state(key,value,updated_at) VALUES('installation_id',?,?)").run(v,nowIso());return v}
const recent=(at,ms=150000)=>!!at&&Date.now()-new Date(at).getTime()<ms
export function cloudStatus(){const i=getCloudIdentity();return{enabled:env.cloudEnabled,provider:'supabase',supabaseUrl:i?.cloud_url||env.supabaseUrl||null,paired:Boolean(i?.edge_id&&i?.edge_token),online:Boolean(i&&recent(i.last_seen_at)),organizationId:i?.organization_id||null,branchId:i?.branch_id||null,edgeId:i?.edge_id||null,pairedAt:i?.paired_at||null,lastSeenAt:i?.last_seen_at||null,configVersion:Number(i?.config_version||0),installationId:installationId(),license:getCloudLicense(),sync:getSyncSummary()}}
function wake(){stopCloudWakeup();if(env.cloudEnabled&&getCloudIdentity()?.edge_id)startCloudWakeup(()=>syncCloudNow({reason:'realtime'}).catch(()=>{}))}
export async function pairCloudEdge(pairingCode){if(!env.cloudEnabled)throw Object.assign(new Error('Cloud integration is disabled.'),{status:409,code:'CLOUD_DISABLED'});if(!env.supabaseUrl||!env.supabasePublishableKey)throw Object.assign(new Error('Supabase URL/publishable key are not configured.'),{status:503,code:'CLOUD_CONFIG_MISSING'});const code=String(pairingCode||'').trim().toUpperCase();if(!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code))throw Object.assign(new Error('Pairing code must use XXXX-XXXX.'),{status:400,code:'PAIRING_CODE_INVALID'});const r=await pairEdge({pairingCode:code,installationId:installationId(),edgeName:env.serverName,softwareVersion:env.edgeVersion});saveCloudIdentity({organizationId:r.organizationId,branchId:r.branchId,edgeId:r.edgeId,edgeToken:r.edgeToken,supabaseUrl:env.supabaseUrl,realtimeTopicKey:r.realtimeTopicKey,pairedAt:r.pairedAt,configVersion:Number(r.configVersion||0),metadata:{branchName:r.branchName||null,organizationName:r.organizationName||null}});setSyncState('cloud_runtime_cursor','');enqueueCloudEvent('edge.paired',{installationId:installationId(),serverName:env.serverName,softwareVersion:env.edgeVersion},{entityType:'edge',entityId:r.edgeId});enqueueInitialCloudSnapshot(r.pairedAt||crypto.randomUUID());wake();await syncCloudNow({reason:'pair'}).catch(()=>null);return cloudStatus()}
export async function unpairCloudEdge({remote=true}={}){if(getCloudIdentity()&&remote){try{await unpairEdge()}catch{}}stopCloudWakeup();clearCloudIdentity();return cloudStatus()}
function commandAck(e){let result=e.payload?.result;if(typeof result==='string'){try{result=JSON.parse(result)}catch{result={message:result}}}return{id:e.payload?.id||e.entityId,status:e.payload?.status,result:result&&typeof result==='object'?result:{}}}

export async function syncCloudNow({reason='manual'}={}){
  if(!env.cloudEnabled)return{skipped:true,reason:'disabled',status:cloudStatus()}
  if(!getCloudIdentity()?.edge_id)return{skipped:true,reason:'not_paired',status:cloudStatus()}
  if(running)return running
  running=(async()=>{
    const pending=pendingCloudEvents(env.cloudSyncBatchSize),acks=pending.filter(e=>e.eventType==='cloud_command.ack'),events=pending.filter(e=>e.eventType!=='cloud_command.ack'),cfg=getCloudBranchConfig(),runtimeCursor=getSyncState('cloud_runtime_cursor')?.value||null
    const lastFullRaw=getSyncState('cloud_last_full_sync_at')?.value||''
    const lastFullMs=Date.parse(lastFullRaw)
    const fullSyncDue=!Number.isFinite(lastFullMs)||Date.now()-lastFullMs>=5*60_000
    // Idle interval/ACK cycles only need presence + command/config checks. Full
    // runtime mirrors still happen immediately for local data events, Realtime
    // wakeups, manual syncs, pairing, and at least every five minutes.
    const lightweight=(reason==='interval'||reason==='command-ack')&&events.length===0&&!fullSyncDue
    try{
      const snapshot=lightweight
        ? {syncReason:reason,outboxPending:pending.length,lightweight:true}
        : {...buildEdgeSnapshot(),syncReason:reason,outboxPending:pending.length,lightweight:false}
      const r=await syncEdge({softwareVersion:env.edgeVersion,snapshot,configVersion:cfg.version,runtimeCursor:runtimeCursor||null,events,commandAcks:acks.map(commandAck),lightweight}),at=r.receivedAt||nowIso()
      // The server records every event exactly once. Conflicted Edge events are
      // intentionally considered processed: Cloud wins, and the runtime mirror
      // below repairs local SQLite to the Cloud-authoritative state.
      const processedIds=Array.isArray(r.processedEventIds)&&r.processedEventIds.length?r.processedEventIds:events.map(e=>e.eventId)
      const ackIds=acks.map(e=>e.eventId)
      markCloudEventsSynced([...new Set([...processedIds,...ackIds])],at)
      pruneCloudOutbox();touchCloudSeen(at);setSyncState('cloud_last_success_at',at);setSyncState('cloud_last_error','')
      if(Array.isArray(r.conflicts)&&r.conflicts.length)setSyncState('cloud_last_conflicts',JSON.stringify(r.conflicts.slice(0,50)));else setSyncState('cloud_last_conflicts','[]')
      if(r.license)setCloudLicense(r.license)
      if(r.config?.changed&&Number(r.config.version)>Number(cfg.version)){saveCloudBranchConfig(r.config.version,r.config.config||{});await applyCloudConfig(r.config.config||{})}
      if(r.runtime&&typeof r.runtime==='object'){await applyCloudRuntime(r.runtime);if(r.runtime.cursor)setSyncState('cloud_runtime_cursor',r.runtime.cursor)}
      if(!lightweight)setSyncState('cloud_last_full_sync_at',at)
      for(const c of r.commands||[])queueCloudCommand(c)
      if((r.commands||[]).length)setTimeout(()=>syncCloudNow({reason:'command-ack'}).catch(()=>{}),100).unref?.()
      return{events:{sent:events.length,accepted:Number(r.accepted||0),conflicts:Array.isArray(r.conflicts)?r.conflicts.length:0,acks:acks.length},runtime:{cursor:r.runtime?.cursor||runtimeCursor},commands:{received:(r.commands||[]).length},status:cloudStatus()}
    }catch(e){markCloudEventsFailed(pending.map(x=>x.eventId),e.message||e);setSyncState('cloud_last_error',e.message||String(e));throw e}
  })()
  try{return await running}finally{running=null}
}
export function startCloudSyncWorker(){if(!env.cloudEnabled||timer)return;wake();const run=()=>syncCloudNow({reason:'interval'}).catch(e=>{if(env.nodeEnv==='development')console.warn(`[cloud] sync failed: ${e.message||e}`)});setTimeout(run,800).unref?.();timer=setInterval(run,env.cloudSyncIntervalSeconds*1000);timer.unref?.()}
export function stopCloudSyncWorker(){if(timer)clearInterval(timer);timer=null;stopCloudWakeup()}
