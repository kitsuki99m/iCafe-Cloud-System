import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function fail(error:any,fallback='Request failed.'){const status=Number(error?.status||500);return json({success:false,code:error?.code||'SERVER_ERROR',error:status>=500?fallback:(error?.message||fallback)},status)}
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
async function ownerEmail(admin:SupabaseClient,organizationId:string){const{data:owner,error}=await admin.from('organization_members').select('user_id').eq('organization_id',organizationId).eq('role','owner').order('created_at',{ascending:true}).limit(1).maybeSingle();if(error)throw error;if(!owner?.user_id)throw Object.assign(new Error('Business owner account is unavailable.'),{status:409,code:'OWNER_MISSING'});const{data,error:authError}=await admin.auth.admin.getUserById(owner.user_id);if(authError)throw authError;const email=String(data.user?.email||'').trim().toLowerCase();if(!email)throw Object.assign(new Error('Business owner email is unavailable.'),{status:409,code:'OWNER_EMAIL_MISSING'});return{userId:owner.user_id,email}}
async function broadcast(topicKey:string,payload:any){if(!topicKey)return;try{await fetch(`${projectUrl()}/realtime/v1/api/broadcast/${encodeURIComponent(`station-wakeup:${topicKey}`)}/events/sync`,{method:'POST',headers:{apikey:secretKey(),'Content-Type':'application/json'},body:JSON.stringify(payload||{})})}catch{}}
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
    const branchId=String(body.branchId||'');const{branch}=await requireBranch(admin,user.id,branchId);const input=body.station&&typeof body.station==='object'?body.station:{};const localId=String(input.id||crypto.randomUUID()),label=String(input.label||input.pcNumber||'New PC').trim().slice(0,120)||'New PC';
    const row={branch_id:branch.id,edge_id:null,local_id:localId,pc_number:String(input.pcNumber||input.pc_number||label).slice(0,80),label,ip_address:String(input.ipAddress||input.ip_address||'').slice(0,80)||null,mac_address:String(input.macAddress||input.mac_address||'').slice(0,80)||null,spec:String(input.spec||'').slice(0,240)||null,status:String(input.status||'offline'),created_at:new Date().toISOString(),updated_at:new Date().toISOString(),cloud_connection_status:'unpaired'};
    const{data,error}=await admin.from('branch_stations').insert(row).select('*').single();if(error)throw error;return json({success:true,pc:data},201)
  }
  if(action==='update'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||'');await requireBranch(admin,user.id,branchId);const patch=body.patch&&typeof body.patch==='object'?body.patch:{};const allowed:any={updated_at:new Date().toISOString()};if('label'in patch)allowed.label=String(patch.label||'').slice(0,120);if('pcNumber'in patch||'pc_number'in patch)allowed.pc_number=String(patch.pcNumber||patch.pc_number||'').slice(0,80);if('ipAddress'in patch||'ip_address'in patch)allowed.ip_address=String(patch.ipAddress||patch.ip_address||'').slice(0,80)||null;if('macAddress'in patch||'mac_address'in patch)allowed.mac_address=String(patch.macAddress||patch.mac_address||'').slice(0,80)||null;if('spec'in patch)allowed.spec=String(patch.spec||'').slice(0,240)||null;if('status'in patch)allowed.status=String(patch.status||'offline');const{data,error}=await admin.from('branch_stations').update(allowed).eq('branch_id',branchId).eq('local_id',stationId).select('*').maybeSingle();if(error)throw error;if(!data)throw Object.assign(new Error('Station not found.'),{status:404,code:'STATION_NOT_FOUND'});return json({success:true,pc:data})
  }
  if(action==='delete'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||'');await requireBranch(admin,user.id,branchId);const now=new Date().toISOString();await admin.from('station_devices').update({status:'revoked',revoked_at:now,updated_at:now}).eq('branch_id',branchId).eq('local_station_id',stationId).is('revoked_at',null);const{error}=await admin.from('branch_stations').delete().eq('branch_id',branchId).eq('local_id',stationId);if(error)throw error;return json({success:true})
  }
  if(action==='pairing_code'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||'');const{branch}=await requireBranch(admin,user.id,branchId);const{data:station,error:stationError}=await admin.from('branch_stations').select('local_id,label,station_device_id').eq('branch_id',branchId).eq('local_id',stationId).maybeSingle();if(stationError)throw stationError;if(!station)throw Object.assign(new Error('Station not found.'),{status:404,code:'STATION_NOT_FOUND'});if(station.station_device_id)throw Object.assign(new Error('This PC is already paired. Reset or remove its current station pairing first.'),{status:409,code:'STATION_ALREADY_PAIRED'});const owner=await ownerEmail(admin,branch.organization_id),code=`${part()}-${part()}`,hash=await sha256(code),expiresAt=new Date(Date.now()+15*60_000).toISOString();await admin.from('station_pairing_codes').delete().eq('branch_id',branchId).eq('local_station_id',stationId).is('used_at',null);const{error}=await admin.from('station_pairing_codes').insert({organization_id:branch.organization_id,branch_id:branchId,local_station_id:stationId,owner_user_id:owner.userId,owner_email:owner.email,code_hash:hash,expires_at:expiresAt,created_by:user.id});if(error)throw error;return json({success:true,pairingCode:code,ownerEmail:owner.email,expiresAt,station:{id:station.local_id,label:station.label}},201)
  }
  if(action==='reset_pairing'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||'');await requireBranch(admin,user.id,branchId);const now=new Date().toISOString();await admin.from('station_devices').update({status:'revoked',revoked_at:now,updated_at:now}).eq('branch_id',branchId).eq('local_station_id',stationId).is('revoked_at',null);await admin.from('branch_stations').update({station_device_id:null,cloud_connection_status:'unpaired',cloud_last_seen_at:null}).eq('branch_id',branchId).eq('local_id',stationId);return json({success:true})
  }
  if(action==='command'){
    const branchId=String(body.branchId||''),stationId=String(body.stationId||''),command=String(body.command||'');
    const{branch}=await requireBranch(admin,user.id,branchId);
    if(!['lock','unlock','reboot','shutdown','game_update','refresh'].includes(command))throw Object.assign(new Error('Unsupported station command.'),{status:400,code:'INVALID_COMMAND'});
    const{data:device,error}=await admin.from('station_devices').select('id,realtime_topic_key,revoked_at').eq('branch_id',branchId).eq('local_station_id',stationId).is('revoked_at',null).maybeSingle();
    if(error)throw error;if(!device)throw Object.assign(new Error('This PC is not paired to Aezakmi Cloud yet.'),{status:409,code:'STATION_NOT_PAIRED'});
    const expiresAt=new Date(Date.now()+30_000).toISOString(),idempotencyKey=String(body.idempotencyKey||'').trim()||null;
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
}catch(e){return fail(e,'Unable to manage Customer Station.')}})
