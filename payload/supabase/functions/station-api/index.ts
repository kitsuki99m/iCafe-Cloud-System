import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-aezakmi-station-id, x-aezakmi-station-token','Access-Control-Allow-Methods':'POST,OPTIONS'}
const METHODS=new Set(['GET','POST','PATCH','DELETE'])
const allowed=[
  /^\/auth\/(login|heartbeat|logout|me|complete-customer-password-setup)$/,
  /^\/guest\/session$/,
  /^\/members\/me$/,
  /^\/pcs\/current$/,
  /^\/rate-plans$/,
  /^\/public\/rate-plans$/,
  /^\/announcements$/,
  /^\/public\/announcements$/,
  /^\/settings$/,
  /^\/public\/settings$/,
  /^\/client\/context$/,
  /^\/wallet$/,
  /^\/sessions\/start$/,
  /^\/public\/station-control$/,
  /^\/top-ups(?:\/[^/]+)?$/,
  /^\/public\/top-ups$/,
  /^\/support(?:\/[^/]+)?$/,
  /^\/public\/support$/,
  /^\/feedback(?:\/[^/]+)?$/,
  /^\/public\/feedback$/,
  /^\/session-extensions(?:\/[^/]+(?:\/(?:confirm|reject))?)?$/,
  /^\/sessions\/[^/]+\/(?:end|time-adjustments)$/,
  /^\/public\/sessions\/[^/]+\/end$/,
  /^\/public\/remote-commands\/[^/]+$/,
]
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function fail(error:any,fallback='Request failed.'){const status=Number(error?.status||500);return json({success:false,code:error?.code||'SERVER_ERROR',error:status>=500?fallback:(error?.message||fallback)},status)}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const v=Deno.env.get('SUPABASE_URL')||'';if(!v)throw Object.assign(new Error('SUPABASE_URL unavailable.'),{status:500});return v.replace(/\/+$/,'')}
function secretKey(){const v=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!v)throw Object.assign(new Error('Supabase privileged key is unavailable.'),{status:500});return v}
function adminClient(){return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}
async function stationAuth(req:Request,admin:SupabaseClient){const id=String(req.headers.get('x-aezakmi-station-id')||'').trim(),token=String(req.headers.get('x-aezakmi-station-token')||'');if(!id||!token)throw Object.assign(new Error('Customer Station credentials are required.'),{status:401,code:'STATION_AUTH_REQUIRED'});const hash=await sha256(token);const{data,error}=await admin.from('station_devices').select('id,organization_id,branch_id,local_station_id,station_name,status,revoked_at').eq('id',id).eq('device_token_hash',hash).maybeSingle();if(error)throw error;if(!data||data.revoked_at)throw Object.assign(new Error('Customer Station credential is invalid or revoked.'),{status:401,code:'STATION_AUTH_INVALID'});const{data:org,error:orgError}=await admin.from('organizations').select('lifecycle_status').eq('id',data.organization_id).maybeSingle();if(orgError)throw orgError;if(!org||!['active','grace_period'].includes(String(org.lifecycle_status||'active')))throw Object.assign(new Error('Cloud access for this business is suspended. Café Edge fallback remains available.'),{status:403,code:org?.lifecycle_status==='terminated'?'BUSINESS_TERMINATED':'BUSINESS_SUSPENDED'});return data}
function cleanPath(raw:string){const p=String(raw||'').trim();if(!p.startsWith('/')||p.startsWith('//')||p.includes('..')||/^https?:/i.test(p))throw Object.assign(new Error('Invalid station API path.'),{status:400,code:'INVALID_PATH'});const base=p.split('?')[0];if(!allowed.some(re=>re.test(base)))throw Object.assign(new Error('This Customer Station action is not cloud-enabled.'),{status:403,code:'PATH_NOT_ALLOWED'});return p}
function mapStation(row:any,device:any,session:any){if(!row)return null;const data=session?.data&&typeof session.data==='object'?session.data:{};return{id:String(row.local_id),label:row.label||row.pc_number||device.station_name,ipAddress:row.ip_address||'',spec:row.spec||'',status:session?'occupied':(row.status||'available'),cloudOnline:true,stationDeviceId:device.id,session:session?{...data,id:String(session.local_id),pcId:String(session.pc_id||row.local_id),customerId:session.member_id||null,ratePlanId:session.rate_plan_id||null,customerName:session.customer_name||data.customerName||'Customer',billing:session.billing_type||data.billing||'prepaid',startedAt:session.started_at,expiresAt:session.expires_at,status:session.status||'active'}:null}}
async function directRead(admin:SupabaseClient,station:any,path:string){const base=path.split('?')[0];
  if(base==='/client/context')return{success:true,cloud:true,stationId:station.id,pcId:station.local_station_id,branchId:station.branch_id,organizationId:station.organization_id,transport:'cloud'};
  if(base==='/pcs'||base==='/pcs/current'||base==='/guest/session'){
    const[{data:pc,error:pcError},{data:session,error:sessionError}]=await Promise.all([admin.from('branch_stations').select('*').eq('branch_id',station.branch_id).eq('local_id',station.local_station_id).maybeSingle(),admin.from('branch_sessions').select('*').eq('branch_id',station.branch_id).eq('pc_id',station.local_station_id).eq('status','active').order('started_at',{ascending:false}).limit(1).maybeSingle()]);if(pcError)throw pcError;if(sessionError)throw sessionError;const view=mapStation(pc,station,session);if(base==='/pcs')return{success:true,pcs:view?[view]:[]};if(base==='/pcs/current')return{success:true,pc:view};if(!session||session.member_id)return{success:true,pc:view,session:null};return{success:true,pc:view,session:view?.session||null}
  }
  if(base==='/rate-plans'||base==='/public/rate-plans'){const{data,error}=await admin.from('branch_rate_plans').select('local_id,data').eq('branch_id',station.branch_id);if(error)throw error;return{success:true,ratePlans:(data||[]).map((r:any)=>({...(r.data||{}),id:String(r.local_id)}))}}
  if(base==='/announcements'||base==='/public/announcements'){const{data,error}=await admin.from('branch_announcements').select('local_id,data').eq('branch_id',station.branch_id).order('updated_at',{ascending:false});if(error)throw error;return{success:true,announcements:(data||[]).map((r:any)=>({...(r.data||{}),id:String(r.local_id)}))}}
  if(base==='/settings'||base==='/public/settings'){const{data,error}=await admin.from('branch_configs').select('config').eq('branch_id',station.branch_id).maybeSingle();if(error)throw error;const config=data?.config&&typeof data.config==='object'?data.config:{};return{success:true,settings:(config as any).settings||config||{}}}
  return null
}
async function waitFor(admin:SupabaseClient,id:string){const deadline=Date.now()+18_000;while(Date.now()<deadline){const{data,error}=await admin.from('cloud_commands').select('status,result').eq('id',id).single();if(error)throw error;if(data.status==='completed'){const r=data.result||{};return json(r.data??r,Number(r.status||200))}if(data.status==='failed'||data.status==='expired'){const r=data.result||{};return json({success:false,code:r.code||'EDGE_ACTION_FAILED',error:r.error||'Café Edge rejected the station request.',...(r.data&&typeof r.data==='object'?{data:r.data}:{})},Number(r.status||502))}await new Promise(r=>setTimeout(r,180))}return json({success:false,code:'EDGE_TIMEOUT',error:'Café Edge did not respond in time. Customer Station can retry using LAN fallback.'},504)}

Deno.serve(async req=>{const pre=preflight(req);if(pre)return pre;try{const admin=adminClient(),station=await stationAuth(req,admin),body=await req.json().catch(()=>({})),method=String(body.method||'GET').toUpperCase(),path=cleanPath(body.path),requestBody=body.body&&typeof body.body==='object'?body.body:{},operationKey=String(body.operationKey||'').trim()||null;if(!METHODS.has(method))return json({success:false,code:'METHOD_NOT_ALLOWED',error:'Unsupported method.'},400);if(method==='GET'){const direct=await directRead(admin,station,path);if(direct)return json(direct)}const{data:edge,error:edgeError}=await admin.from('edge_servers').select('id,last_seen_at').eq('branch_id',station.branch_id).is('revoked_at',null).order('last_seen_at',{ascending:false}).limit(1).maybeSingle();if(edgeError)throw edgeError;const edgeFresh=edge?.last_seen_at&&Date.now()-new Date(edge.last_seen_at).getTime()<45_000;if(!edge||!edgeFresh)return json({success:false,code:'EDGE_UNAVAILABLE',error:'Cloud is online, but Café Edge is not reachable. Configure the cashier/admin PC or use direct LAN fallback if available.'},503);if(method!=='GET'&&operationKey){const{data:existing,error}=await admin.from('cloud_commands').select('id').eq('branch_id',station.branch_id).eq('idempotency_key',operationKey).eq('command','station_api').maybeSingle();if(error)throw error;if(existing?.id)return await waitFor(admin,existing.id)}const expiresAt=new Date(Date.now()+30_000).toISOString();const inserted=await admin.from('cloud_commands').insert({organization_id:station.organization_id,branch_id:station.branch_id,edge_id:edge.id,station_id:station.local_station_id,command:'station_api',payload:{method,path,body:requestBody,localAuthToken:String(body.localAuthToken||''),stationDeviceId:station.id},idempotency_key:method==='GET'?null:operationKey,expires_at:expiresAt}).select('id').single();if(inserted.error)throw inserted.error;return await waitFor(admin,inserted.data.id)}catch(e){return fail(e,'Unable to execute Customer Station cloud request.')}})
