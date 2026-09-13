import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-aezakmi-edge-id, x-aezakmi-edge-token','Access-Control-Allow-Methods':'POST,OPTIONS'}
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function fail(error:any,fallback='Request failed.'){const status=Number(error?.status||500);return json({success:false,code:error?.code||'SERVER_ERROR',error:status>=500?fallback:(error?.message||fallback)},status)}
async function sha256(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function token(bytes=32){const v=new Uint8Array(bytes);crypto.getRandomValues(v);return btoa(String.fromCharCode(...v)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const value=Deno.env.get('SUPABASE_URL')||'';if(!value)throw Object.assign(new Error('SUPABASE_URL unavailable.'),{status:500});return value.replace(/\/+$/,'')}
function publishableKey(){return Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||namedKey('SUPABASE_PUBLISHABLE_KEYS')||Deno.env.get('SUPABASE_ANON_KEY')||''}
function secretKey(){const value=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!value)throw Object.assign(new Error('Supabase privileged key is unavailable in this Edge Function.'),{status:500});return value}
function adminClient():SupabaseClient{return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}
async function userClient(req:Request){const authorization=req.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))throw Object.assign(new Error('Sign in first.'),{status:401,code:'AUTH_REQUIRED'});const key=publishableKey();if(!key)throw Object.assign(new Error('Supabase publishable key is unavailable in this Edge Function.'),{status:500});const client=createClient(projectUrl(),key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await client.auth.getUser();if(error||!data.user)throw Object.assign(new Error('Cloud session invalid.'),{status:401,code:'AUTH_INVALID'});return{client,user:data.user}}
async function requireMembership(admin:SupabaseClient,userId:string,organizationId:string,roles:string[]=[]){const{data,error}=await admin.from('organization_members').select('role').eq('organization_id',organizationId).eq('user_id',userId).maybeSingle();if(error)throw error;if(!data||(roles.length&&!roles.includes(data.role)))throw Object.assign(new Error('Forbidden.'),{status:403,code:'FORBIDDEN'});const{data:org,error:orgError}=await admin.from('organizations').select('lifecycle_status').eq('id',organizationId).maybeSingle();if(orgError)throw orgError;if(!org||!['active','grace_period'].includes(String(org.lifecycle_status||'active')))throw Object.assign(new Error(org?.lifecycle_status==='terminated'?'This business has been terminated.':'Cloud access for this business is suspended.'),{status:403,code:org?.lifecycle_status==='terminated'?'BUSINESS_TERMINATED':'BUSINESS_SUSPENDED'});return data}
async function requireEdge(req:Request,admin:SupabaseClient){const id=(req.headers.get('x-aezakmi-edge-id')||'').trim(),edgeToken=req.headers.get('x-aezakmi-edge-token')||'';if(!id||!edgeToken)throw Object.assign(new Error('Edge credentials required.'),{status:401,code:'EDGE_AUTH_REQUIRED'});const hash=await sha256(edgeToken);const{data,error}=await admin.rpc('aezakmi_verify_edge',{p_edge_id:id,p_token_hash:hash});if(error)throw error;const edge=Array.isArray(data)?data[0]:null;if(!edge)throw Object.assign(new Error('Edge credential invalid or revoked.'),{status:401,code:'EDGE_AUTH_INVALID'});return edge}
async function broadcastWakeup(url:string,secret:string,topicKey:string,payload:Record<string,unknown>={}){if(!topicKey)return;try{await fetch(`${url}/realtime/v1/api/broadcast/${encodeURIComponent(`edge-wakeup:${topicKey}`)}/events/sync`,{method:'POST',headers:{apikey:secret,'Content-Type':'application/json'},body:JSON.stringify(payload)})}catch{}}

const METHODS=new Set(['GET','POST','PATCH','PUT','DELETE']);
const ALLOWED_ROOTS=new Set(['pcs','members','rate-plans','announcements','feedback','support','top-ups','sessions','session-extensions','transfer-requests','promos','logs','analytics','billing-policy','settings','wallet','expenses','tax-estimate','branding','remote-commands','dashboard','earnings','guest','client']);
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

function normalizePath(input:unknown){
  const path=String(input||'').trim();
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('..')||/^https?:/i.test(path))throw Object.assign(new Error('Invalid Admin API path.'),{status:400,code:'INVALID_PATH'});
  const root=path.split('?')[0].split('/').filter(Boolean)[0]||'';
  if(!ALLOWED_ROOTS.has(root))throw Object.assign(new Error('This Admin API path is not cloud-enabled.'),{status:403,code:'PATH_NOT_ALLOWED'});
  return path;
}

async function waitForCommand(admin:any,id:string){
  const deadline=Date.now()+18_000;
  while(Date.now()<deadline){
    const{data:current,error}=await admin.from('cloud_commands').select('status,result').eq('id',id).single();if(error)throw error;
    if(current.status==='completed')return json({success:true,commandId:id,status:Number(current.result?.status||200),data:current.result?.data??current.result??{}},200);
    if(current.status==='failed'||current.status==='expired')return json({success:false,commandId:id,status:Number(current.result?.status||502),code:current.result?.code||'EDGE_ACTION_FAILED',error:current.result?.error||'The Edge rejected the request.',data:current.result?.data??null},200);
    await sleep(180);
  }
  return json({success:false,commandId:id,status:504,code:'EDGE_TIMEOUT',error:'The branch Edge did not respond in time. The command remains auditable and may still complete.'},200);
}

Deno.serve(async req=>{
  const o=preflight(req);if(o)return o;
  try{
    const{user}=await userClient(req),admin=adminClient(),b=await req.json(),branchId=String(b.branchId||''),method=String(b.method||'GET').toUpperCase(),path=normalizePath(b.path),body=b.body&&typeof b.body==='object'?b.body:{},operationKey=String(b.operationKey||'').trim()||null;
    if(!branchId)return json({success:false,code:'BRANCH_REQUIRED',error:'Select a branch first.'},400);
    if(!METHODS.has(method))return json({success:false,code:'METHOD_NOT_ALLOWED',error:'Unsupported HTTP method.'},400);
    const{data:branch,error:branchError}=await admin.from('branches').select('id,organization_id').eq('id',branchId).single();if(branchError)throw branchError;
    await requireMembership(admin,user.id,branch.organization_id,method==='GET'?['owner','admin','manager','viewer']:['owner','admin','manager']);
    const{data:edge,error:edgeError}=await admin.from('edge_servers').select('id,realtime_topic_key,revoked_at,last_seen_at').eq('branch_id',branchId).is('revoked_at',null).order('last_seen_at',{ascending:false}).limit(1).maybeSingle();if(edgeError)throw edgeError;
    if(!edge)return json({success:false,code:'EDGE_UNAVAILABLE',error:'No active Edge server is paired to this branch.'},503);

    if(method!=='GET'&&operationKey){
      const{data:existing,error:existingError}=await admin.from('cloud_commands').select('id').eq('branch_id',branchId).eq('requested_by',user.id).eq('idempotency_key',operationKey).maybeSingle();if(existingError)throw existingError;
      if(existing?.id)return await waitForCommand(admin,existing.id);
    }

    const expiresAt=new Date(Date.now()+30_000).toISOString();
    const payload={organization_id:branch.organization_id,branch_id:branchId,edge_id:edge.id,command:'admin_api',payload:{method,path,body},requested_by:user.id,expires_at:expiresAt,...(method!=='GET'&&operationKey?{idempotency_key:operationKey}:{})};
    let command:any=null;
    const inserted=await admin.from('cloud_commands').insert(payload).select('id,status,requested_at,expires_at').single();
    if(inserted.error){
      if(inserted.error.code==='23505'&&operationKey){
        const{data:existing,error}=await admin.from('cloud_commands').select('id').eq('branch_id',branchId).eq('requested_by',user.id).eq('idempotency_key',operationKey).single();if(error)throw error;command=existing;
      }else throw inserted.error;
    }else command=inserted.data;
    if(method!=='GET')await admin.from('cloud_audit_logs').insert({organization_id:branch.organization_id,branch_id:branchId,actor_user_id:user.id,action:`admin.api.${method.toLowerCase()}`,entity_type:'cloud_command',entity_id:command.id,details:{path,idempotencyKey:operationKey}});
    await broadcastWakeup(projectUrl(),secretKey(),edge.realtime_topic_key,{commandId:command.id,kind:'admin_api'});
    return await waitForCommand(admin,command.id);
  }catch(e){return fail(e,'Unable to execute Admin request.');}
});
