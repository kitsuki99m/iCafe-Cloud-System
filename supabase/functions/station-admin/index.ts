import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function fail(error:any,fallback='Request failed.'){
  const status=Number(error?.status||500)
  return json({success:false,code:error?.code||'SERVER_ERROR',error:status>=500&&!error?.exposeMessage?fallback:(error?.message||fallback)},status)
}
function isMissingAtomicCloseRpc(error:any){
  const code=String(error?.code||'').toUpperCase()
  const message=`${error?.message||''} ${error?.details||''} ${error?.hint||''}`.toLowerCase()
  return code==='PGRST202'||code==='42883'||(message.includes('aezakmi_admin_close_session')&&(message.includes('could not find')||message.includes('does not exist')||message.includes('schema cache')))
}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function token(bytes=24){const v=new Uint8Array(bytes);crypto.getRandomValues(v);return btoa(String.fromCharCode(...v)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function part(){const a=new Uint8Array(4);crypto.getRandomValues(a);let s='';for(const n of a)s+=chars[n%chars.length];return s}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const v=Deno.env.get('SUPABASE_URL')||'';if(!v)throw Object.assign(new Error('SUPABASE_URL unavailable.'),{status:500});return v.replace(/\/+$/,'')}
function publishableKey(){return Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||namedKey('SUPABASE_PUBLISHABLE_KEYS')||Deno.env.get('SUPABASE_ANON_KEY')||''}
function secretKey(){const v=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!v)throw Object.assign(new Error('Supabase privileged key is unavailable.'),{status:500});return v}
function adminClient(){return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}
async function authUser(req:Request){const authorization=req.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))throw Object.assign(new Error('Sign in first.'),{status:401,code:'AUTH_REQUIRED'});const key=publishableKey();if(!key)throw Object.assign(new Error('Supabase publishable key unavailable.'),{status:500});const client=createClient(projectUrl(),key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});const{data,error}=await client.auth.getUser();if(error||!data.user)throw Object.assign(new Error('Cloud session invalid.'),{status:401,code:'AUTH_INVALID'});return data.user}
async function requireBranch(admin:SupabaseClient,userId:string,branchId:string,roles=['owner','admin','manager']){const{data:branch,error}=await admin.from('branches').select('id,organization_id,name').eq('id',branchId).maybeSingle();if(error)throw error;if(!branch)throw Object.assign(new Error('Branch not found.'),{status:404,code:'BRANCH_NOT_FOUND'});const{data:member,error:memberError}=await admin.from('organization_members').select('role').eq('organization_id',branch.organization_id).eq('user_id',userId).maybeSingle();if(memberError)throw memberError;if(!member||!roles.includes(member.role))throw Object.assign(new Error('Forbidden.'),{status:403,code:'FORBIDDEN'});const{data:org,error:orgError}=await admin.from('organizations').select('name,lifecycle_status').eq('id',branch.organization_id).maybeSingle();if(orgError)throw orgError;if(!org||!['active','grace_period'].includes(String(org.lifecycle_status||'active')))throw Object.assign(new Error(org?.lifecycle_status==='terminated'?'This business has been terminated.':'Cloud access for this business is suspended.'),{status:403,code:org?.lifecycle_status==='terminated'?'BUSINESS_TERMINATED':'BUSINESS_SUSPENDED'});return{branch,org,member}}
async function requireStationCapacity(admin:SupabaseClient,organizationId:string){const[{data:sub,error:subError},{data:branches,error:branchError}]=await Promise.all([admin.from('subscriptions').select('plan,max_stations').eq('organization_id',organizationId).maybeSingle(),admin.from('branches').select('id').eq('organization_id',organizationId)]);if(subError)throw subError;if(branchError)throw branchError;const max=Number(sub?.max_stations||0),plan=String(sub?.plan||'bronze');if(max<1)throw Object.assign(new Error('This business has no active station allowance.'),{status:409,code:'STATION_SUBSCRIPTION_MISSING'});const ids=(branches||[]).map((x:any)=>x.id);let used=0;if(ids.length){const{count,error}=await admin.from('branch_stations').select('local_id',{count:'exact',head:true}).in('branch_id',ids);if(error)throw error;used=Number(count||0)}if(used>=max)throw Object.assign(new Error(`${plan.charAt(0).toUpperCase()+plan.slice(1)} supports up to ${max} stations. Upgrade the subscription package before adding another PC.`),{status:409,code:'STATION_LIMIT_REACHED',data:{plan,maxStations:max,stationCount:used}});return{plan,maxStations:max,stationCount:used}}
async function ownerEmail(admin:SupabaseClient,organizationId:string){const{data:owner,error}=await admin.from('organization_members').select('user_id').eq('organization_id',organizationId).eq('role','owner').order('created_at',{ascending:true}).limit(1).maybeSingle();if(error)throw error;if(!owner?.user_id)throw Object.assign(new Error('Business owner account is unavailable.'),{status:409,code:'OWNER_MISSING'});const{data,error:authError}=await admin.auth.admin.getUserById(owner.user_id);if(authError)throw authError;const email=String(data.user?.email||'').trim().toLowerCase();if(!email)throw Object.assign(new Error('Business owner email is unavailable.'),{status:409,code:'OWNER_EMAIL_MISSING'});return{userId:owner.user_id,email}}
async function broadcast(topicKey:string,payload:any){if(!topicKey)return;try{await fetch(`${projectUrl()}/realtime/v1/api/broadcast/${encodeURIComponent(`station-wakeup:${topicKey}`)}/events/sync`,{method:'POST',headers:{apikey:secretKey(),'Content-Type':'application/json'},body:JSON.stringify(payload||{})})}catch{}}
async function rollbackLockCheckpoint(admin:SupabaseClient,branchId:string,stationId:string,commandId:string){const{data,error}=await admin.rpc('aezakmi_rollback_station_lock',{p_branch_id:branchId,p_pc_id:stationId,p_command_id:commandId,p_resumed_at:new Date().toISOString()});if(error)throw error;return data}
async function restoreStationAvailable(admin:SupabaseClient,branchId:string,stationId:string){const{data:active,error:activeError}=await admin.from('branch_sessions').select('local_id').eq('branch_id',branchId).eq('pc_id',stationId).eq('status','active').limit(1).maybeSingle();if(activeError)throw activeError;if(active)return;const{data:station,error:stationError}=await admin.from('branch_stations').select('status').eq('branch_id',branchId).eq('local_id',stationId).maybeSingle();if(stationError)throw stationError;const current=String(station?.status||'').toLowerCase();if(!['maintenance','reserved'].includes(current)){const{error}=await admin.from('branch_stations').update({status:'available',updated_at:new Date().toISOString()}).eq('branch_id',branchId).eq('local_id',stationId);if(error)throw error}}
async function expireStationCommands(admin:SupabaseClient,branchId:string,stationId:string,deviceId:string){const now=new Date().toISOString();const{data,error}=await admin.from('station_commands').select('id,command,status').eq('station_device_id',deviceId).in('status',['queued','running']).lte('expires_at',now);if(error)throw error;for(const command of data||[]){if(command.command==='lock')await rollbackLockCheckpoint(admin,branchId,stationId,command.id);if(command.command==='reboot'||command.command==='shutdown')await restoreStationAvailable(admin,branchId,stationId);const{error:updateError}=await admin.from('station_commands').update({status:'expired',acknowledged_at:now,result:{error:'Station command expired before delivery.',code:'COMMAND_EXPIRED'}}).eq('id',command.id).eq('status',command.status);if(updateError)throw updateError}}
const STATION_OFFLINE_AFTER_MS=10_000
function stationRecentlyOnline(lastSeen:any){const ms=new Date(lastSeen||0).getTime();return Number.isFinite(ms)&&Date.now()-ms<STATION_OFFLINE_AFTER_MS}
async function checkpointAdminInterruption(admin:SupabaseClient,branchId:string,stationId:string,stationDeviceId:string,command:string,commandId:string,actorId:string){
  const now=new Date().toISOString()
  if(command==='lock'){
    const{data,error}=await admin.rpc('aezakmi_station_pause_session',{p_branch_id:branchId,p_pc_id:stationId,p_reason:'admin_lock',p_command_id:commandId,p_actor_id:actorId,p_paused_at:now})
    if(error)throw error
    return data&&typeof data==='object'?data:{success:true,paused:false}
  }
  if(command==='reboot'||command==='shutdown'){
    const{data,error}=await admin.rpc('aezakmi_station_release_session',{p_branch_id:branchId,p_pc_id:stationId,p_reason:command,p_interrupted_at:now,p_expected_member_id:null})
    if(error)throw error
    const out=data&&typeof data==='object'?data:{}
    if(out.success===false)throw Object.assign(new Error(out.error||'Unable to save the active station session.'),{status:Number(out.status||400),code:out.code||'STATION_INTERRUPTION_FAILED'})
    const revoked=await admin.from('branch_customer_auth_sessions').update({revoked_at:now}).eq('branch_id',branchId).eq('station_device_id',stationDeviceId).is('revoked_at',null)
    if(revoked.error)throw revoked.error
    return {...out,revokedAuth:true}
  }
  return {success:true,skipped:true}
}

Deno.serve(async req=>{const pre=preflight(req);if(pre)return pre;try{const user=await authUser(req),admin=adminClient(),body=await req.json().catch(()=>({})),action=String(body.action||'');
  if(action==='create'){
    const branchId=String(body.branchId||'');const{branch}=await requireBranch(admin,user.id,branchId);const operationKey=String(body.operationKey||'').trim()||null,actorKey=`admin:${user.id}`;
    if(operationKey){const{data:receipt,error:receiptError}=await admin.from('cloud_operation_receipts').select('response').eq('branch_id',branchId).eq('actor_key',actorKey).eq('operation_key',operationKey).maybeSingle();if(receiptError)throw receiptError;if(receipt?.response)return json(receipt.response,200)}
    await requireStationCapacity(admin,branch.organization_id);const input=body.station&&typeof body.station==='object'?body.station:{};const rawPcNumber=String(input.pcNumber??input.pc_number??'').trim(),parsedPcNumber=/^\d+$/.test(rawPcNumber)?Number(rawPcNumber):NaN,pcNumber=Number.isSafeInteger(parsedPcNumber)&&parsedPcNumber>0?String(parsedPcNumber):'',label=String(input.label||(pcNumber?`PC - ${pcNumber}`:'New PC')).trim().slice(0,120)||(pcNumber?`PC - ${pcNumber}`:'New PC'),localId=String(input.id||(pcNumber?`pc-${pcNumber}`:crypto.randomUUID()));const requestedStatus=String(input.status||'offline').toLowerCase();if(!['offline','maintenance','reserved'].includes(requestedStatus))throw Object.assign(new Error('New PCs start offline until the paired Customer Station connects.'),{status:400,code:'INVALID_PC_STATUS'});
    if(pcNumber){const{data:duplicateNumber,error:duplicateNumberError}=await admin.from('branch_stations').select('*').eq('branch_id',branchId).eq('pc_number',pcNumber).limit(1).maybeSingle();if(duplicateNumberError)throw duplicateNumberError;if(duplicateNumber){if(operationKey&&String(duplicateNumber.local_id)===localId){const replay={success:true,pc:duplicateNumber,duplicate:true};await admin.from('cloud_operation_receipts').upsert({branch_id:branchId,actor_key:actorKey,operation_key:operationKey,action:'station.create',response:replay},{onConflict:'branch_id,actor_key,operation_key'});return json(replay,200)}throw Object.assign(new Error(`PC - ${pcNumber} already exists.`),{status:409,code:'PC_NUMBER_EXISTS'})}}
    const row={branch_id:branch.id,edge_id:null,local_id:localId,pc_number:pcNumber||String(input.pcNumber||input.pc_number||label).slice(0,80),label,ip_address:String(input.ipAddress||input.ip_address||'').slice(0,80)||null,mac_address:String(input.macAddress||input.mac_address||'').slice(0,80)||null,spec:String(input.spec||'').slice(0,240)||null,status:requestedStatus,created_at:new Date().toISOString(),updated_at:new Date().toISOString(),cloud_connection_status:'unpaired'};
    const{data,error}=await admin.from('branch_stations').insert(row).select('*').single();if(error){if(String(error.message||'').includes('STATION_LIMIT_REACHED'))throw Object.assign(new Error('This subscription has reached its maximum station count. Upgrade the package before adding another PC.'),{status:409,code:'STATION_LIMIT_REACHED'});throw error}const response={success:true,pc:data};if(operationKey){const{error:receiptError}=await admin.from('cloud_operation_receipts').upsert({branch_id:branchId,actor_key:actorKey,operation_key:operationKey,action:'station.create',response},{onConflict:'branch_id,actor_key,operation_key'});if(receiptError)throw receiptError}return json(response,201)
  }
  if(action==='update'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||'');await requireBranch(admin,user.id,branchId);const patch=body.patch&&typeof body.patch==='object'?body.patch:{};const{data:existing,error:existingError}=await admin.from('branch_stations').select('local_id,status').eq('branch_id',branchId).eq('local_id',stationId).maybeSingle();if(existingError)throw existingError;if(!existing)throw Object.assign(new Error('Station not found.'),{status:404,code:'STATION_NOT_FOUND'});const{data:active,error:activeError}=await admin.from('branch_sessions').select('local_id').eq('branch_id',branchId).eq('pc_id',stationId).eq('status','active').limit(1).maybeSingle();if(activeError)throw activeError;const allowed:any={updated_at:new Date().toISOString()};if('label'in patch)allowed.label=String(patch.label||'').slice(0,120);if('pcNumber'in patch||'pc_number'in patch)allowed.pc_number=String(patch.pcNumber||patch.pc_number||'').slice(0,80);if('ipAddress'in patch||'ip_address'in patch)allowed.ip_address=String(patch.ipAddress||patch.ip_address||'').slice(0,80)||null;if('macAddress'in patch||'mac_address'in patch)allowed.mac_address=String(patch.macAddress||patch.mac_address||'').slice(0,80)||null;if('spec'in patch)allowed.spec=String(patch.spec||'').slice(0,240)||null;if('status'in patch){const nextStatus=String(patch.status||'offline').toLowerCase();if(!['offline','available','maintenance','reserved','occupied'].includes(nextStatus))throw Object.assign(new Error('Invalid PC status.'),{status:400,code:'INVALID_PC_STATUS'});if(!active&&nextStatus==='available')throw Object.assign(new Error('A PC becomes available automatically when its paired Customer Station connects.'),{status:409,code:'PC_PRESENCE_MANAGED'});if(active&&nextStatus!=='occupied')throw Object.assign(new Error('End the active session before changing this PC status.'),{status:409,code:'PC_HAS_ACTIVE_SESSION'});if(!active&&nextStatus==='occupied')throw Object.assign(new Error('A PC can only be marked occupied by an active session.'),{status:409,code:'PC_HAS_NO_SESSION'});allowed.status=nextStatus}const{data,error}=await admin.from('branch_stations').update(allowed).eq('branch_id',branchId).eq('local_id',stationId).select('*').maybeSingle();if(error)throw error;return json({success:true,pc:data})
  }
  if(action==='delete'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||'');await requireBranch(admin,user.id,branchId);const{data:stationRow,error:stationError}=await admin.from('branch_stations').select('local_id,status,station_device_id').eq('branch_id',branchId).eq('local_id',stationId).maybeSingle();if(stationError)throw stationError;if(!stationRow)throw Object.assign(new Error('Station not found.'),{status:404,code:'STATION_NOT_FOUND'});const{data:active,error:activeError}=await admin.from('branch_sessions').select('local_id').eq('branch_id',branchId).eq('pc_id',stationId).eq('status','active').limit(1).maybeSingle();if(activeError)throw activeError;if(active||['occupied','reserved'].includes(String(stationRow.status||'').toLowerCase()))throw Object.assign(new Error('Cannot remove an occupied, reserved, or actively used PC.'),{status:409,code:'PC_IN_USE'});const now=new Date().toISOString();if(stationRow.station_device_id)await admin.from('branch_customer_auth_sessions').update({revoked_at:now}).eq('branch_id',branchId).eq('station_device_id',stationRow.station_device_id).is('revoked_at',null);await admin.from('station_devices').update({status:'revoked',revoked_at:now,updated_at:now}).eq('branch_id',branchId).eq('local_station_id',stationId).is('revoked_at',null);const{error}=await admin.from('branch_stations').delete().eq('branch_id',branchId).eq('local_id',stationId);if(error)throw error;return json({success:true})
  }
  if(action==='pairing_code'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||'');const{branch}=await requireBranch(admin,user.id,branchId);const{data:station,error:stationError}=await admin.from('branch_stations').select('local_id,label,station_device_id').eq('branch_id',branchId).eq('local_id',stationId).maybeSingle();if(stationError)throw stationError;if(!station)throw Object.assign(new Error('Station not found.'),{status:404,code:'STATION_NOT_FOUND'});if(station.station_device_id)throw Object.assign(new Error('This PC is already paired. Reset or remove its current station pairing first.'),{status:409,code:'STATION_ALREADY_PAIRED'});const owner=await ownerEmail(admin,branch.organization_id),code=`${part()}-${part()}`,hash=await sha256(code),expiresAt=new Date(Date.now()+15*60_000).toISOString();await admin.from('station_pairing_codes').delete().eq('branch_id',branchId).eq('local_station_id',stationId).is('used_at',null);const{error}=await admin.from('station_pairing_codes').insert({organization_id:branch.organization_id,branch_id:branchId,local_station_id:stationId,owner_user_id:owner.userId,owner_email:owner.email,code_hash:hash,expires_at:expiresAt,created_by:user.id});if(error)throw error;return json({success:true,pairingCode:code,ownerEmail:owner.email,expiresAt,station:{id:station.local_id,label:station.label}},201)
  }
  if(action==='reset_pairing'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||'');await requireBranch(admin,user.id,branchId);const now=new Date().toISOString();const{data:device,error:deviceError}=await admin.from('station_devices').select('id').eq('branch_id',branchId).eq('local_station_id',stationId).is('revoked_at',null).maybeSingle();if(deviceError)throw deviceError;const{data:release,error:releaseError}=await admin.rpc('aezakmi_station_release_session',{p_branch_id:branchId,p_pc_id:stationId,p_reason:'pairing_reset',p_interrupted_at:now,p_expected_member_id:null});if(releaseError)throw releaseError;if(release&&typeof release==='object'&&release.success===false)throw Object.assign(new Error(release.error||'Unable to save the station session before resetting pairing.'),{status:Number(release.status||400),code:release.code||'STATION_INTERRUPTION_FAILED'});if(device?.id)await admin.from('branch_customer_auth_sessions').update({revoked_at:now}).eq('branch_id',branchId).eq('station_device_id',device.id).is('revoked_at',null);await admin.from('station_devices').update({status:'revoked',revoked_at:now,updated_at:now}).eq('branch_id',branchId).eq('local_station_id',stationId).is('revoked_at',null);const{data:stationState,error:stationStateError}=await admin.from('branch_stations').select('status').eq('branch_id',branchId).eq('local_id',stationId).maybeSingle();if(stationStateError)throw stationStateError;const persistedStatus=String(stationState?.status||'offline').toLowerCase();const resetStation=await admin.from('branch_stations').update({station_device_id:null,cloud_connection_status:'unpaired',cloud_last_seen_at:null,status:['maintenance','reserved'].includes(persistedStatus)?persistedStatus:'offline',updated_at:now}).eq('branch_id',branchId).eq('local_id',stationId);if(resetStation.error)throw resetStation.error;return json({success:true,interruption:release||null})
  }
  if(action==='session_preview'){
    const branchId=String(body.branchId||''),sessionId=String(body.sessionId||'');
    await requireBranch(admin,user.id,branchId);
    if(!sessionId)throw Object.assign(new Error('Session id is required.'),{status:400,code:'SESSION_REQUIRED'});
    const{data,error}=await admin.rpc('aezakmi_cloud_execute',{
      p_branch_id:branchId,p_action:'session.preview',p_payload:{sessionId},p_actor_kind:'admin',p_actor_id:user.id,p_operation_key:null
    });
    if(error)throw error;
    const out=data&&typeof data==='object'?data:{};
    if(out.success===false)throw Object.assign(new Error(out.error||'Unable to preview this session.'),{status:Number(out.status||400),code:out.code||'SESSION_PREVIEW_FAILED'});
    return json(out)
  }
  if(action==='session_close'){
    const branchId=String(body.branchId||''),sessionId=String(body.sessionId||''),disposition=String(body.disposition||'save').toLowerCase();
    const{branch}=await requireBranch(admin,user.id,branchId);
    if(!sessionId)throw Object.assign(new Error('Session id is required.'),{status:400,code:'SESSION_REQUIRED'});
    if(!['save','forfeit','refund'].includes(disposition))throw Object.assign(new Error('Choose Save, Forfeit, or Refund.'),{status:400,code:'INVALID_DISPOSITION'});
    const operationKey=String(body.operationKey||'').trim()||null;
    const{data:before,error:beforeError}=await admin.from('branch_sessions').select('local_id,pc_id,member_id,billing_type,data').eq('branch_id',branchId).eq('local_id',sessionId).eq('status','active').maybeSingle();
    if(beforeError)throw Object.assign(new Error('Cloud could not read the active session for this Admin action. Retry once; if it persists, redeploy station-admin and verify the database migrations.'),{status:503,code:'SESSION_CLOSE_READ_FAILED',exposeMessage:true,cause:beforeError});
    if(!before)throw Object.assign(new Error('Active session not found.'),{status:404,code:'NO_ACTIVE_SESSION'});
    if(String(before.billing_type||'')!=='prepaid')throw Object.assign(new Error('Postpaid sessions must be settled before they can end.'),{status:409,code:'SETTLEMENT_REQUIRED'});

    let data:any=null,error:any=null,compatibilityFallback:string|null=null;
    const atomic=await admin.rpc('aezakmi_admin_close_session',{
      p_branch_id:branchId,p_session_id:sessionId,p_disposition:disposition,p_actor_id:user.id,p_operation_key:operationKey
    });
    data=atomic.data;error=atomic.error;

    // Admin close must stay independent of the station command queue and of one
    // particular database RPC revision. If the newer atomic RPC is missing or
    // fails at runtime, use the older production paths that Customer logout has
    // already exercised for months. Save uses station-release because it
    // atomically persists Guest savedRemainingSeconds; Forfeit/Refund use the
    // established cloud transaction engine. A failed RPC transaction cannot
    // partially commit, so this compatibility retry is safe.
    if(error){
      console.warn('[station-admin] atomic session close failed; using compatibility path',{code:error?.code||null,message:error?.message||String(error),sessionId,disposition});
      if(disposition==='save'){
        const fallback=await admin.rpc('aezakmi_station_release_session',{
          p_branch_id:branchId,
          p_pc_id:String(before.pc_id||''),
          p_reason:'logout',
          p_interrupted_at:new Date().toISOString(),
          p_expected_member_id:before.member_id||null,
        });
        if(fallback.error){
          const message=isMissingAtomicCloseRpc(error)
            ? 'Cloud session-close schema is unavailable and the proven logout fallback also failed. Apply the latest migrations and redeploy station-admin.'
            : 'Cloud could not save and close the session. No Admin station command is required; retry the action.';
          throw Object.assign(new Error(message),{status:503,code:'SESSION_CLOSE_BACKEND_FAILED',exposeMessage:true,cause:fallback.error});
        }
        data=fallback.data;error=null;compatibilityFallback='station_release';
      }else{
        const fallbackAction=disposition==='refund'?'session.refund':'session.end';
        const fallbackPayload=disposition==='refund'?{sessionId}:{sessionId,disposition:'forfeit'};
        const fallback=await admin.rpc('aezakmi_cloud_execute',{
          p_branch_id:branchId,p_action:fallbackAction,p_payload:fallbackPayload,p_actor_kind:'admin',p_actor_id:user.id,p_operation_key:operationKey
        });
        if(fallback.error){
          const message=isMissingAtomicCloseRpc(error)
            ? 'Cloud session-close schema is unavailable and the compatibility close also failed. Apply the latest migrations and redeploy station-admin.'
            : 'Cloud could not close the session. No session time was changed; retry the Admin action.';
          throw Object.assign(new Error(message),{status:503,code:'SESSION_CLOSE_BACKEND_FAILED',exposeMessage:true,cause:fallback.error});
        }
        data=fallback.data;error=null;compatibilityFallback='cloud_execute';
      }
    }
    let out:any=data&&typeof data==='object'?data:{};
    if(out.success===false)throw Object.assign(new Error(out.error||'Unable to close this session.'),{status:Number(out.status||400),code:out.code||'SESSION_CLOSE_FAILED',exposeMessage:true});

    const now=new Date().toISOString();
    if(compatibilityFallback){
      const remaining=Math.max(0,Number(out.remainingSeconds||0)||0);
      const savedRemainingSeconds=disposition==='save'?remaining:0;
      // Compatibility paths already committed the authoritative accounting.
      // Enrich the ended row for Admin audit/recovery, but never convert a
      // successful close into a false UI failure because this metadata write
      // races replication/schema drift.
      const{data:ended,error:endedReadError}=await admin.from('branch_sessions').select('data').eq('branch_id',branchId).eq('local_id',sessionId).maybeSingle();
      if(endedReadError)console.warn('[station-admin] close metadata read warning',endedReadError);
      else{
        const existingData=ended?.data&&typeof ended.data==='object'?ended.data:{};
        const endedPatch=await admin.from('branch_sessions').update({
          data:{...existingData,lifecycle:disposition==='save'?'admin_saved':disposition==='forfeit'?'forfeited':'refunded',endReason:`admin_${disposition}`,closeDisposition:disposition,savedRemainingSeconds,closedAt:now},
          updated_at:now,
        }).eq('branch_id',branchId).eq('local_id',sessionId);
        if(endedPatch.error)console.warn('[station-admin] close metadata write warning',endedPatch.error);
      }
      out={...out,sessionId:out.sessionId||sessionId,savedRemainingSeconds,remainingSeconds:savedRemainingSeconds};
    }

    out={...out,pcId:out.pcId||before.pc_id||null,memberId:Object.prototype.hasOwnProperty.call(out,'memberId')?out.memberId:(before.member_id||null)};
    const stationId=String(out.pcId||'');
    let authRevokeWarning:string|null=null;
    if(stationId){
      const{data:device,error:deviceError}=await admin.from('station_devices').select('id,realtime_topic_key').eq('branch_id',branchId).eq('local_station_id',stationId).is('revoked_at',null).maybeSingle();
      if(deviceError)console.warn('[station-admin] station lookup after session close warning',deviceError);
      const reason=disposition==='forfeit'?'session_forfeited':disposition==='refund'?'session_refunded':'session_saved';
      // Every Admin close is a terminal use of this station. Revoke the Customer
      // auth session after accounting commits, then broadcast an immediate login
      // boundary. This mirrors normal Customer logout without re-checkpointing.
      if(device?.id){
        const{error:revokeError}=await admin.from('branch_customer_auth_sessions').update({revoked_at:now}).eq('branch_id',branchId).eq('station_device_id',device.id).is('revoked_at',null);
        if(revokeError)authRevokeWarning='CUSTOMER_AUTH_REVOKE_FAILED';
      }
      if(device?.realtime_topic_key)await broadcast(device.realtime_topic_key,{kind:'session_changed',reason,sessionId,pcId:stationId,memberId:out.memberId||null,disposition,forceLogout:true});
    }
    if(authRevokeWarning)out={...out,warnings:[...(Array.isArray(out.warnings)?out.warnings:[]),authRevokeWarning]};
    const audit=await admin.from('cloud_audit_logs').insert({organization_id:branch.organization_id,branch_id:branchId,actor_user_id:user.id,action:`session.${disposition}`,details:{sessionId,pcId:out.pcId||null,remainingSeconds:out.remainingSeconds||0,refundAmount:out.refundAmount||0,authRevokeWarning,compatibilityFallback}});
    if(audit.error)console.warn('[station-admin] session close audit warning',audit.error);
    return json(out)
  }
  if(action==='command_status'){
    const branchId=String(body.branchId||''),commandId=String(body.commandId||'');await requireBranch(admin,user.id,branchId);if(!commandId)throw Object.assign(new Error('Command id is required.'),{status:400,code:'COMMAND_ID_REQUIRED'});
    const{data:command,error}=await admin.from('station_commands').select('id,command,status,requested_at,expires_at,acknowledged_at,result,station_device_id').eq('branch_id',branchId).eq('id',commandId).maybeSingle();if(error)throw error;if(!command)throw Object.assign(new Error('Station command not found.'),{status:404,code:'COMMAND_NOT_FOUND'});
    return json({success:true,command:{id:command.id,command:command.command,status:command.status,requestedAt:command.requested_at,expiresAt:command.expires_at,executedAt:command.acknowledged_at,result:command.result||null}})
  }
  if(action==='command'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||''),command=String(body.command||'');
    const{branch}=await requireBranch(admin,user.id,branchId);
    if(!['lock','unlock','reboot','shutdown','game_update','refresh'].includes(command))throw Object.assign(new Error('Unsupported station command.'),{status:400,code:'INVALID_COMMAND'});
    const{data:device,error}=await admin.from('station_devices').select('id,realtime_topic_key,revoked_at,cloud_last_seen_at,status').eq('branch_id',branchId).eq('local_station_id',stationId).is('revoked_at',null).maybeSingle();
    if(error)throw error;if(!device)throw Object.assign(new Error('This PC is not paired to Aezakmi Cloud yet.'),{status:409,code:'STATION_NOT_PAIRED'});
    await expireStationCommands(admin,branchId,stationId,device.id);
    if(!stationRecentlyOnline(device.cloud_last_seen_at))throw Object.assign(new Error('The station is offline and cannot receive this command.'),{status:409,code:'PC_OFFLINE'});
    const idempotencyKey=String(body.idempotencyKey||'').trim()||null;
    if(idempotencyKey){const{data:existing,error:existingError}=await admin.from('station_commands').select('id,status,requested_at,expires_at').eq('station_device_id',device.id).eq('requested_by',user.id).eq('idempotency_key',idempotencyKey).maybeSingle();if(existingError)throw existingError;if(existing)return json({success:true,commandId:existing.id,status:existing.status,expiresAt:existing.expires_at,duplicate:true},200)}
    const{data:pending,error:pendingError}=await admin.from('station_commands').select('id,command').eq('station_device_id',device.id).in('status',['queued','running']).gt('expires_at',new Date().toISOString()).order('requested_at',{ascending:true}).limit(1).maybeSingle();if(pendingError)throw pendingError;if(pending)throw Object.assign(new Error('Wait for the current station command to finish.'),{status:409,code:'COMMAND_PENDING'});
    const{data:active,error:activeError}=await admin.from('branch_sessions').select('local_id').eq('branch_id',branchId).eq('pc_id',stationId).eq('status','active').order('started_at',{ascending:false}).limit(1).maybeSingle();if(activeError)throw activeError;let activePause:any=null;if(active?.local_id){const{data:pause,error:pauseError}=await admin.from('branch_session_pauses').select('local_id,command_id').eq('branch_id',branchId).eq('computer_session_id',active.local_id).is('resumed_at',null).limit(1).maybeSingle();if(pauseError)throw pauseError;activePause=pause}
    if(command==='lock'&&!active)throw Object.assign(new Error('Lock Session requires an active session.'),{status:409,code:'SESSION_REQUIRED'});
    if(command==='lock'&&activePause)throw Object.assign(new Error('This session is already locked.'),{status:409,code:'SESSION_ALREADY_LOCKED'});
    if(command==='unlock'&&!activePause)throw Object.assign(new Error('This session is not locked.'),{status:409,code:'SESSION_NOT_LOCKED'});
    const expiresAt=new Date(Date.now()+30_000).toISOString();
    const payload:any={organization_id:branch.organization_id,branch_id:branchId,station_device_id:device.id,local_station_id:stationId,command,payload:body.payload&&typeof body.payload==='object'?body.payload:{},requested_by:user.id,expires_at:expiresAt,idempotency_key:idempotencyKey};
    let commandRow:any=null,created=false;
    const inserted=await admin.from('station_commands').insert(payload).select('id,status,requested_at,expires_at').single();
    if(inserted.error){
      if(inserted.error.code==='23505'&&idempotencyKey){const{data:existing,error:existingError}=await admin.from('station_commands').select('id,status,requested_at,expires_at').eq('station_device_id',device.id).eq('requested_by',user.id).eq('idempotency_key',idempotencyKey).maybeSingle();if(existingError)throw existingError;commandRow=existing}
      else throw inserted.error
    }else{commandRow=inserted.data;created=true}
    if(!commandRow)throw Object.assign(new Error('Unable to create station command.'),{status:500,code:'COMMAND_CREATE_FAILED'});
    let interruption:any={success:true,skipped:true};
    if(created&&(command==='lock'||command==='reboot'||command==='shutdown')){
      try{interruption=await checkpointAdminInterruption(admin,branchId,stationId,device.id,command,commandRow.id,user.id)}
      catch(interruptError){await admin.from('station_commands').update({status:'failed',acknowledged_at:new Date().toISOString(),result:{error:'Unable to checkpoint active session before station control.',code:'SESSION_CHECKPOINT_FAILED'}}).eq('id',commandRow.id).eq('status','queued');throw interruptError}
    }
    await admin.from('cloud_audit_logs').insert({organization_id:branch.organization_id,branch_id:branchId,actor_user_id:user.id,action:`station.command.${command}`,details:{stationId,stationCommandId:commandRow.id,sessionInterruption:interruption}});
    await broadcast(device.realtime_topic_key,{stationCommandId:commandRow.id,kind:'station_command',sessionInterrupted:command==='lock'||command==='reboot'||command==='shutdown'});
    return json({success:true,commandId:commandRow.id,status:commandRow.status||'queued',expiresAt:commandRow.expires_at,interruption},201)
  }
  return json({success:false,code:'INVALID_ACTION',error:'Unsupported station admin action.'},400)
}catch(e){
  console.error('[station-admin]',{code:(e as any)?.code||null,status:(e as any)?.status||500,message:(e as any)?.message||String(e),details:(e as any)?.details||null,hint:(e as any)?.hint||null})
  return fail(e,'Unable to manage Customer Station.')
}})
