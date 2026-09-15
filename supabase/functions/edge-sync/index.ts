import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-aezakmi-edge-id, x-aezakmi-edge-token','Access-Control-Allow-Methods':'POST,OPTIONS'}
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function fail(error:any,fallback='Request failed.'){const status=Number(error?.status||500);return json({success:false,code:error?.code||'SERVER_ERROR',error:status>=500?fallback:(error?.message||fallback)},status)}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const value=Deno.env.get('SUPABASE_URL')||'';if(!value)throw Object.assign(new Error('SUPABASE_URL unavailable.'),{status:500});return value.replace(/\/+$/,'')}
function secretKey(){const value=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!value)throw Object.assign(new Error('Supabase privileged key is unavailable in this Edge Function.'),{status:500});return value}
function adminClient():SupabaseClient{return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}
async function requireEdge(req:Request,admin:SupabaseClient){const id=(req.headers.get('x-aezakmi-edge-id')||'').trim(),edgeToken=req.headers.get('x-aezakmi-edge-token')||'';if(!id||!edgeToken)throw Object.assign(new Error('Edge credentials required.'),{status:401,code:'EDGE_AUTH_REQUIRED'});const hash=await sha256(edgeToken);const{data,error}=await admin.rpc('aezakmi_verify_edge',{p_edge_id:id,p_token_hash:hash});if(error)throw error;const edge=Array.isArray(data)?data[0]:null;if(!edge)throw Object.assign(new Error('Edge credential invalid or revoked.'),{status:401,code:'EDGE_AUTH_INVALID'});return edge}
async function list(query:any){const{data,error}=await query;if(error)throw error;return data||[]}
function validCursor(value:any){const raw=String(value||'').trim();if(!raw)return null;const ms=Date.parse(raw);return Number.isFinite(ms)?new Date(ms).toISOString():null}
function uniqueBy(rows:any[],key:string){const map=new Map<string,any>();for(const row of rows||[])map.set(String(row?.[key]||''),row);return [...map.values()].filter(row=>String(row?.[key]||''))}

async function runtimeSnapshot(admin:SupabaseClient,branchId:string,cursorRaw:any,snapshotAt:string){
  const cursor=validCursor(cursorRaw),floor=cursor||new Date(Date.now()-30*86400_000).toISOString()
  const [members,credentials,stations,stationDevices,authSessions,activeSessions,changedSessions,walletLedger,sessionTimeLedger,topUps,extensions,revenueEvents,activePauses,recentPauses]=await Promise.all([
    list(admin.from('branch_members').select('local_id,member_code,name,username,birthdate,phone,email,tier,wallet_balance,session_seconds_remaining,status,pc_id,pc_ip,created_at,updated_at').eq('branch_id',branchId).order('local_id').limit(5000)),
    list(admin.from('branch_member_credentials').select('member_id,username_ci,password_salt,password_hash,password_iterations,must_change_credentials,updated_at').eq('branch_id',branchId).order('member_id').limit(5000)),
    list(admin.from('branch_stations').select('*').eq('branch_id',branchId).order('local_id').limit(2000)),
    list(admin.from('station_devices').select('id,local_station_id,device_token_hash,status,created_at,updated_at,revoked_at').eq('branch_id',branchId).is('revoked_at',null).limit(2000)),
    list(admin.from('branch_customer_auth_sessions').select('token_hash,station_device_id,member_id,created_at,last_seen_at,expires_at,revoked_at').eq('branch_id',branchId).is('revoked_at',null).gt('expires_at',snapshotAt).limit(5000)),
    list(admin.from('branch_sessions').select('*').eq('branch_id',branchId).eq('status','active').order('updated_at',{ascending:true}).limit(2000)),
    list(admin.from('branch_sessions').select('*').eq('branch_id',branchId).gt('updated_at',floor).lte('updated_at',snapshotAt).order('updated_at',{ascending:true}).limit(3000)),
    list(admin.from('branch_wallet_ledger').select('*').eq('branch_id',branchId).gt('created_at',floor).lte('created_at',snapshotAt).order('created_at',{ascending:true}).limit(3000)),
    list(admin.from('branch_session_time_ledger').select('*').eq('branch_id',branchId).gt('created_at',floor).lte('created_at',snapshotAt).order('created_at',{ascending:true}).limit(3000)),
    list(admin.from('branch_top_ups').select('*').eq('branch_id',branchId).order('requested_at',{ascending:false}).limit(500)),
    list(admin.from('branch_session_extensions').select('*').eq('branch_id',branchId).order('requested_at',{ascending:false}).limit(500)),
    list(admin.from('branch_revenue_events').select('*').eq('branch_id',branchId).gt('occurred_at',floor).lte('occurred_at',snapshotAt).order('occurred_at',{ascending:true}).limit(3000)),
    list(admin.from('branch_session_pauses').select('*').eq('branch_id',branchId).is('resumed_at',null).order('paused_at',{ascending:true}).limit(1000)),
    list(admin.from('branch_session_pauses').select('*').eq('branch_id',branchId).gt('paused_at',floor).order('paused_at',{ascending:true}).limit(1000)),
  ])
  return{cursor:snapshotAt,baseCursor:cursor,fullMembers:true,fullCredentials:true,fullStations:true,fullAuthSessions:true,members,credentials,stations,stationDevices,authSessions,sessions:uniqueBy([...activeSessions,...changedSessions],'local_id'),walletLedger,sessionTimeLedger,topUps,extensions,revenueEvents,pauses:uniqueBy([...activePauses,...recentPauses],'local_id')}
}

Deno.serve(async req=>{const o=preflight(req);if(o)return o;try{
  const admin=adminClient(),edge=await requireEdge(req,admin),b=await req.json().catch(()=>({})),now=new Date().toISOString(),events=Array.isArray(b.events)?b.events.slice(0,200):[],acks=Array.isArray(b.commandAcks)?b.commandAcks.slice(0,100):[],lightweight=b.lightweight===true&&events.length===0
  let ingest:any={accepted:0,processedEventIds:[],conflicts:[]}
  if(events.length){const{data,error}=await admin.rpc('aezakmi_ingest_edge_events',{p_edge_id:edge.id,p_events:events});if(error)throw error;if(data&&typeof data==='object')ingest=data;else ingest={accepted:Number(data||0),processedEventIds:events.map((e:any)=>e.eventId).filter(Boolean),conflicts:[]}}
  for(const ack of acks){const status=['running','completed','failed'].includes(String(ack?.status))?String(ack.status):null;if(!ack?.id||!status)continue;const patch:any={status,result:ack.result&&typeof ack.result==='object'?ack.result:{}};if(status==='completed'||status==='failed')patch.completed_at=now;await admin.from('cloud_commands').update(patch).eq('id',String(ack.id)).eq('edge_id',edge.id)}
  await admin.from('edge_servers').update({last_seen_at:now,last_sync_at:now,software_version:String(b.softwareVersion||'').slice(0,60)||null,status_snapshot:b.snapshot&&typeof b.snapshot==='object'?b.snapshot:{},updated_at:now}).eq('id',edge.id)
  if(!lightweight)await admin.from('cloud_commands').update({status:'expired',completed_at:now,result:{error:'Command expired before the Edge could execute it.',code:'COMMAND_EXPIRED'}}).eq('edge_id',edge.id).eq('status','queued').lte('expires_at',now)
  const baseReads=[
    admin.from('branch_configs').select('version,config,updated_at').eq('branch_id',edge.branch_id).maybeSingle(),
    admin.from('cloud_commands').select('id,station_id,command,payload,requested_at,expires_at').eq('edge_id',edge.id).eq('status','queued').gt('expires_at',now).order('requested_at').limit(50),
  ] as const
  const[{data:cfg},{data:commands,error:cmdError}]=await Promise.all(baseReads)
  if(cmdError)throw cmdError
  let sub:any=null,runtime:any=null
  if(!lightweight){
    const[{data:subscription},runtimeData]=await Promise.all([
      admin.from('subscriptions').select('plan,status,max_branches,max_stations,trial_ends_at,grace_until,current_period_end').eq('organization_id',edge.organization_id).maybeSingle(),
      runtimeSnapshot(admin,edge.branch_id,b.runtimeCursor,now),
    ])
    sub=subscription;runtime=runtimeData
  }
  const since=Number(b.configVersion||0),version=Number(cfg?.version||0)
  return json({success:true,accepted:Number(ingest?.accepted||0),processedEventIds:Array.isArray(ingest?.processedEventIds)?ingest.processedEventIds:[],conflicts:Array.isArray(ingest?.conflicts)?ingest.conflicts:[],receivedAt:now,...(!lightweight?{license:sub?{plan:sub.plan,status:sub.status,maxBranches:Number(sub.max_branches||0),maxStations:Number(sub.max_stations||0),trialEndsAt:sub.trial_ends_at||null,graceUntil:sub.grace_until||null,currentPeriodEnd:sub.current_period_end||null,advisoryOnly:true}:{status:'unknown',advisoryOnly:true}}:{}),config:{changed:version>since,version,config:version>since?(cfg?.config||{}):undefined,updatedAt:cfg?.updated_at||null},runtime,commands:commands||[],lightweight})
}catch(e){return fail(e,'Cloud synchronization failed.')}})
