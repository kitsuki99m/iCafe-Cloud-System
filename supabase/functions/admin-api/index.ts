import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-aezakmi-edge-id, x-aezakmi-edge-token','Access-Control-Allow-Methods':'POST,OPTIONS'}
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function fail(error:any,fallback='Request failed.'){const status=Number(error?.status||500);return json({success:false,code:error?.code||'SERVER_ERROR',error:status>=500?fallback:(error?.message||fallback)},status)}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const value=Deno.env.get('SUPABASE_URL')||'';if(!value)throw Object.assign(new Error('SUPABASE_URL unavailable.'),{status:500});return value.replace(/\/+$/,'')}
function publishableKey(){return Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||namedKey('SUPABASE_PUBLISHABLE_KEYS')||Deno.env.get('SUPABASE_ANON_KEY')||''}
function secretKey(){const value=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!value)throw Object.assign(new Error('Supabase privileged key is unavailable in this Edge Function.'),{status:500});return value}
function adminClient():SupabaseClient{return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}
async function userClient(req:Request){const authorization=req.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))throw Object.assign(new Error('Sign in first.'),{status:401,code:'AUTH_REQUIRED'});const key=publishableKey();if(!key)throw Object.assign(new Error('Supabase publishable key is unavailable in this Edge Function.'),{status:500});const client=createClient(projectUrl(),key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});const {data,error}=await client.auth.getUser();if(error||!data.user)throw Object.assign(new Error('Cloud session invalid.'),{status:401,code:'AUTH_INVALID'});return{user:data.user}}
async function requireMembership(admin:SupabaseClient,userId:string,organizationId:string,roles:string[]=[]){const{data,error}=await admin.from('organization_members').select('role').eq('organization_id',organizationId).eq('user_id',userId).maybeSingle();if(error)throw error;if(!data||(roles.length&&!roles.includes(data.role)))throw Object.assign(new Error('Forbidden.'),{status:403,code:'FORBIDDEN'});const{data:org,error:orgError}=await admin.from('organizations').select('lifecycle_status').eq('id',organizationId).maybeSingle();if(orgError)throw orgError;if(!org||!['active','grace_period'].includes(String(org.lifecycle_status||'active')))throw Object.assign(new Error(org?.lifecycle_status==='terminated'?'This business has been terminated.':'Cloud access for this business is suspended.'),{status:403,code:org?.lifecycle_status==='terminated'?'BUSINESS_TERMINATED':'BUSINESS_SUSPENDED'});return data}
async function broadcastWakeup(topicKey:string,payload:Record<string,unknown>={}){if(!topicKey)return;try{await fetch(`${projectUrl()}/realtime/v1/api/broadcast/${encodeURIComponent(`edge-wakeup:${topicKey}`)}/events/sync`,{method:'POST',headers:{apikey:secretKey(),'Content-Type':'application/json'},body:JSON.stringify(payload)})}catch{}}
async function wakeBranchEdge(admin:SupabaseClient,branchId:string,payload:Record<string,unknown>={}){try{const{data:edge}=await admin.from('edge_servers').select('realtime_topic_key').eq('branch_id',branchId).is('revoked_at',null).order('last_seen_at',{ascending:false}).limit(1).maybeSingle();if(edge?.realtime_topic_key)await broadcastWakeup(edge.realtime_topic_key,payload)}catch{}}
async function broadcastStationWakeup(admin:SupabaseClient,branchId:string,stationId:string,payload:Record<string,unknown>={}){if(!stationId)return;try{const{data:station}=await admin.from('branch_stations').select('station_device_id').eq('branch_id',branchId).eq('local_id',stationId).maybeSingle();if(!station?.station_device_id)return;const{data:device}=await admin.from('station_devices').select('realtime_topic_key').eq('id',station.station_device_id).maybeSingle();const topicKey=String(device?.realtime_topic_key||'');if(!topicKey)return;await fetch(`${projectUrl()}/realtime/v1/api/broadcast/${encodeURIComponent(`station-wakeup:${topicKey}`)}/events/sync`,{method:'POST',headers:{apikey:secretKey(),'Content-Type':'application/json'},body:JSON.stringify(payload)})}catch{}}
const METHODS=new Set(['GET','POST','PATCH','PUT','DELETE'])
const ALLOWED_ROOTS=new Set(['pcs','members','rate-plans','announcements','feedback','support','top-ups','sessions','session-extensions','transfer-requests','promos','logs','analytics','billing-policy','settings','wallet','expenses','tax-estimate','branding','remote-commands','dashboard','earnings','guest','client','launcher','menu-items','menu-orders','shifts','vouchers','reports','health','tax-policy','public'])
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))
function normalizePath(input:unknown){const path=String(input||'').trim();if(!path.startsWith('/')||path.startsWith('//')||path.includes('..')||/^https?:/i.test(path))throw Object.assign(new Error('Invalid Admin API path.'),{status:400,code:'INVALID_PATH'});const root=path.split('?')[0].split('/').filter(Boolean)[0]||'';if(!ALLOWED_ROOTS.has(root))throw Object.assign(new Error('This Admin API path is not cloud-enabled.'),{status:403,code:'PATH_NOT_ALLOWED'});return path}
function asUrl(path:string){return new URL(path,'https://aezakmi.local')}
function id(){return crypto.randomUUID()}
function now(){return new Date().toISOString()}
function n(value:any,fallback=0){const v=Number(value);return Number.isFinite(v)?v:fallback}
function b64(bytes:Uint8Array){let raw='';for(const b of bytes)raw+=String.fromCharCode(b);return btoa(raw)}
async function derivePassword(password:string,saltText?:string,iterations=210000){const salt=saltText?Uint8Array.from(atob(saltText),c=>c.charCodeAt(0)):crypto.getRandomValues(new Uint8Array(16));const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256);return{salt:b64(salt),hash:b64(new Uint8Array(bits)),iterations}}
async function setMemberCredential(admin:SupabaseClient,branchId:string,memberId:string,username:string,password:string,mustChange:boolean){const derived=await derivePassword(password);const{error}=await admin.from('branch_member_credentials').upsert({branch_id:branchId,member_id:memberId,username_ci:String(username||'').trim().toLowerCase(),password_salt:derived.salt,password_hash:derived.hash,password_iterations:derived.iterations,must_change_credentials:mustChange,updated_at:now()},{onConflict:'branch_id,member_id'});if(error)throw error}
async function cloudExecute(admin:SupabaseClient,branchId:string,action:string,payload:any,userId:string,operationKey:string|null){const{data,error}=await admin.rpc('aezakmi_cloud_execute',{p_branch_id:branchId,p_action:action,p_payload:payload||{},p_actor_kind:'admin',p_actor_id:userId,p_operation_key:operationKey||null});if(error)throw error;const out=data&&typeof data==='object'?data:{};const status=Number(out.status|| (out.success===false?400:200));if(out.success===false)return json({success:false,status,code:out.code||'CLOUD_TRANSACTION_FAILED',error:out.error||'Cloud transaction failed.',data:out},200);const clean={...out};delete clean.success;delete clean.status;return result(clean,status)}
async function requireAvailableStation(admin:SupabaseClient,branchId:string,stationId:string,intendedMemberId:string|null=null){const{data,error}=await admin.from('branch_stations').select('local_id,status,station_device_id,cloud_last_seen_at').eq('branch_id',branchId).eq('local_id',stationId).maybeSingle();if(error)throw error;if(!data)throw Object.assign(new Error('PC not found.'),{status:404,code:'PC_NOT_FOUND'});const status=String(data.status||'offline').toLowerCase();if(status==='maintenance')throw Object.assign(new Error('Take the station out of Maintenance first.'),{status:409,code:'PC_MAINTENANCE'});if(!data.station_device_id)throw Object.assign(new Error('This PC is not paired to a Customer Station.'),{status:409,code:'STATION_NOT_PAIRED'});const seen=new Date(data.cloud_last_seen_at||0).getTime();if(!Number.isFinite(seen)||Date.now()-seen>=180_000)throw Object.assign(new Error('The station is offline. Wait for Customer Station to reconnect before starting or restoring paid time.'),{status:409,code:'PC_OFFLINE'});const{data:signedIn,error:signedInError}=await admin.from('branch_customer_auth_sessions').select('member_id').eq('branch_id',branchId).eq('station_device_id',data.station_device_id).is('revoked_at',null).gt('expires_at',new Date().toISOString()).order('created_at',{ascending:false}).limit(1).maybeSingle();if(signedInError)throw signedInError;if(signedIn?.member_id&&String(signedIn.member_id)!==String(intendedMemberId||''))throw Object.assign(new Error('A member is already signed in on this PC.'),{status:409,code:'PC_MEMBER_SIGNED_IN'});if(status!=='available')throw Object.assign(new Error('This PC is not Available.'),{status:409,code:'PC_NOT_AVAILABLE'});return data}
function dayKey(value:any){try{return new Date(value).toISOString().slice(0,10)}catch{return''}}
function result(data:any,status=200){return json({success:true,status,data},200)}
async function audit(admin:SupabaseClient,branch:any,userId:string,action:string,entityType:string,entityId:string|null,details:any={}){await admin.from('cloud_audit_logs').insert({organization_id:branch.organization_id,branch_id:branch.id,actor_user_id:userId,action,entity_type:entityType,entity_id:entityId,details})}
async function readConfig(admin:SupabaseClient,branchId:string){const{data,error}=await admin.from('branch_configs').select('version,config').eq('branch_id',branchId).maybeSingle();if(error)throw error;return{version:Number(data?.version||0),config:data?.config&&typeof data.config==='object'?data.config:{}}}
async function writeConfig(admin:SupabaseClient,branchId:string,config:any,userId:string){const current=await readConfig(admin,branchId),nextVersion=current.version+1,{data,error}=await admin.from('branch_configs').upsert({branch_id:branchId,version:nextVersion,config,updated_by:userId,updated_at:now()},{onConflict:'branch_id'}).select('version,config,updated_at').single();if(error)throw error;return data}
async function refreshManagedConfig(admin:SupabaseClient,branchId:string,userId:string){const current=await readConfig(admin,branchId),[{data:ratePlans,error:rateError},{data:announcements,error:annError},{data:members,error:memberError},{data:feedback,error:feedbackError}]=await Promise.all([admin.from('branch_rate_plans').select('local_id,data,updated_at').eq('branch_id',branchId),admin.from('branch_announcements').select('local_id,data,updated_at').eq('branch_id',branchId),admin.from('branch_members').select('local_id,member_code,name,username,birthdate,phone,email,tier,wallet_balance,session_seconds_remaining,status,pc_id,pc_ip,created_at,updated_at').eq('branch_id',branchId),admin.from('branch_feedback').select('local_id,data,created_at').eq('branch_id',branchId)]);if(rateError)throw rateError;if(annError)throw annError;if(memberError)throw memberError;if(feedbackError)throw feedbackError;const cloudManaged={ratePlans:(ratePlans||[]).map((r:any)=>({...r.data,id:r.local_id,updatedAt:r.updated_at||r.data?.updatedAt||null})),announcements:(announcements||[]).map((r:any)=>({...r.data,id:r.local_id,updatedAt:r.updated_at||r.data?.updatedAt||null})),members:(members||[]).map((r:any)=>({id:r.local_id,memberCode:r.member_code,name:r.name,username:r.username,birthdate:r.birthdate,phone:r.phone,email:r.email,tier:r.tier,walletBalance:n(r.wallet_balance),sessionSecondsRemaining:n(r.session_seconds_remaining),status:r.status,pcId:r.pc_id,pcIp:r.pc_ip,createdAt:r.created_at,updatedAt:r.updated_at})),feedback:(feedback||[]).map((r:any)=>({...r.data,id:r.local_id,createdAt:r.created_at||r.data?.createdAt||null}))};return writeConfig(admin,branchId,{...current.config,cloudManaged},userId)}
function rateData(input:any,current:any={}){const t=now();return{...current,...input,id:String(current?.id||input?.id||id()),isActive:input?.isActive??current?.isActive??true,customerSelfService:input?.customerSelfService??current?.customerSelfService??false,createdAt:current?.createdAt||input?.createdAt||t,updatedAt:t}}
function memberShape(row:any){return{id:String(row.local_id),memberCode:row.member_code||null,name:row.name||'',username:row.username||'',birthdate:row.birthdate||null,phone:row.phone||null,email:row.email||null,tier:row.tier||'Regular',wallet:n(row.wallet_balance),walletBalance:n(row.wallet_balance),sessionSecondsRemaining:n(row.session_seconds_remaining),status:row.status||'active',pcId:row.pc_id||null,pcIp:row.pc_ip||null,createdAt:row.created_at||null,updatedAt:row.updated_at||null}}
function rangeBounds(range:string){const end=new Date(),start=new Date(end);if(range==='today')start.setHours(0,0,0,0);else if(range==='7d')start.setDate(start.getDate()-6);else if(range==='30d')start.setDate(start.getDate()-29);else if(range==='year')start.setMonth(0,1),start.setHours(0,0,0,0);else start.setFullYear(2000,0,1);return{start:start.toISOString(),end:end.toISOString()}}
function manilaDateParts(value=new Date()){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(value);const out:any={};for(const part of parts)if(part.type!=='literal')out[part.type]=Number(part.value);return{year:Number(out.year),month:Number(out.month),day:Number(out.day)}}
function manilaStartIso(year:number,month:number,day:number){return new Date(Date.UTC(year,month-1,day,-8,0,0,0)).toISOString()}
function earningsBounds(period:string,dateText:string){let year:number,month:number,day:number;if(/^\d{4}-\d{2}-\d{2}$/.test(dateText)){[year,month,day]=dateText.split('-').map(Number)}else({year,month,day}=manilaDateParts());let start:string,end:string,label='';if(period==='daily'){start=manilaStartIso(year,month,day);end=manilaStartIso(year,month,day+1);label=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}else if(period==='yearly'){start=manilaStartIso(year,1,1);end=manilaStartIso(year+1,1,1);label=String(year)}else if(period==='ytd'){start=manilaStartIso(year,1,1);end=manilaStartIso(year,month,day+1);label=`${year} YTD`}else{start=manilaStartIso(year,month,1);end=manilaStartIso(year,month+1,1);label=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'long',year:'numeric'}).format(new Date(`${year}-${String(month).padStart(2,'0')}-15T12:00:00+08:00`))}return{start,end,label,period,year}}
async function revenueRows(admin:SupabaseClient,branchId:string,start:string,end:string){const{data,error}=await admin.from('branch_revenue_events').select('*').eq('branch_id',branchId).gte('occurred_at',start).lt('occurred_at',end).order('occurred_at',{ascending:true});if(error)throw error;return data||[]}
async function walletLedgerRows(admin:SupabaseClient,branchId:string,start:string,end:string){const{data,error}=await admin.from('branch_wallet_ledger').select('*').eq('branch_id',branchId).gte('created_at',start).lt('created_at',end).order('created_at',{ascending:true});if(error)throw error;return data||[]}
function expenseFromRevenue(row:any){const meta=row.metadata&&typeof row.metadata==='object'?row.metadata:{};return{id:String(row.local_id),kind:meta.kind||'custom',category:row.category||meta.category||'Expense',description:meta.description||'',amount:Math.abs(n(row.amount_centavos)/100),recorded_at:row.occurred_at,recordedAt:row.occurred_at,sourceKey:meta.sourceKey||null,periodKey:meta.periodKey||null,taxRatePercent:meta.taxRatePercent??null,taxableBase:meta.taxableBase??null,formulaSnapshot:meta.formulaSnapshot??null}}
function isPaidWalletReceipt(row:any){const amount=n(row?.amount);if(amount<=0)return false;const type=String(row?.type||'').toLowerCase();return type==='admin_top_up'||type==='paid_deposit'||type==='top_up'}
function receiptCategoryForWalletRow(row:any){return String(row?.reference_type||'')==='member_create'?'initial_wallet':'wallet_top_up'}
function earningsFromRows(rows:any[],walletRows:any[],bounds:any){
  const revenue=rows.filter(r=>n(r.amount_centavos)>0&&r.event_type!=='session_refund')
  const expenseRows=rows.filter(r=>r.event_type==='expense'&&n(r.amount_centavos)<0)
  const categories:Record<string,number>={}
  const receiptSignature=(eventType:string,memberId:any,cents:any,occurredAt:any)=>`${eventType}|${String(memberId||'')}|${Math.round(n(cents))}|${String(occurredAt||'')}`
  const receiptLedgers=walletRows.filter(isPaidWalletReceipt)
  const ledgerById=new Map<string,any>()
  const ledgersByReference=new Map<string,string[]>()
  const ledgersBySignature=new Map<string,string[]>()
  for(const row of receiptLedgers){
    const ledgerId=String(row.local_id||'')
    if(!ledgerId)continue
    ledgerById.set(ledgerId,row)
    const referenceId=String(row.reference_id||'')
    if(referenceId)ledgersByReference.set(referenceId,[...(ledgersByReference.get(referenceId)||[]),ledgerId])
    const eventType=String(row.reference_type||'')==='member_create'?'member_initial_wallet':'wallet_top_up'
    const signature=receiptSignature(eventType,row.member_id,n(row.amount)*100,row.created_at)
    ledgersBySignature.set(signature,[...(ledgersBySignature.get(signature)||[]),ledgerId])
  }
  const countedWalletReceiptLedgers=new Set<string>()
  const receiptLedgerForRevenue=(row:any)=>{
    const meta=row.metadata&&typeof row.metadata==='object'?row.metadata:{}
    for(const raw of [meta.walletLedgerId,row.source_id]){
      const key=String(raw||'')
      if(key&&ledgerById.has(key))return key
    }
    const chooseLedger=(ids:string[])=>ids.find(ledgerId=>!countedWalletReceiptLedgers.has(ledgerId))||ids[0]||null
    const sourceId=String(row.source_id||'')
    const referenceLedger=chooseLedger(ledgersByReference.get(sourceId)||[])
    if(referenceLedger)return referenceLedger
    const memberId=row.member_id||(row.event_type==='member_initial_wallet'||row.source_type==='wallet_adjustment'?row.source_id:null)
    const signature=receiptSignature(row.event_type,memberId,row.amount_centavos,row.occurred_at)
    return chooseLedger(ledgersBySignature.get(signature)||[])
  }
  for(const row of revenue){
    if(row.event_type==='wallet_top_up'||row.event_type==='member_initial_wallet'){
      const ledgerId=receiptLedgerForRevenue(row)
      // Edge wallet inserts used to fire the Cloud receipt trigger and then sync
      // their own receipt event. Both describe one payment, so count the ledger
      // receipt only once even if historical data still contains both rows.
      if(ledgerId&&countedWalletReceiptLedgers.has(ledgerId))continue
      if(ledgerId)countedWalletReceiptLedgers.add(ledgerId)
    }
    const key=String(row.category||row.source_type||row.event_type||'other')
    categories[key]=(categories[key]||0)+n(row.amount_centavos)/100
  }
  // Read-time guard for deployments where the receipt trigger/backfill has not
  // reached a paid wallet ledger row yet. The ledger is immutable, so synthesize
  // only a receipt that was not already represented by a revenue event above.
  for(const row of receiptLedgers){
    const ledgerId=String(row.local_id||'')
    if(ledgerId&&countedWalletReceiptLedgers.has(ledgerId))continue
    const category=receiptCategoryForWalletRow(row)
    categories[category]=(categories[category]||0)+n(row.amount)
    if(ledgerId)countedWalletReceiptLedgers.add(ledgerId)
  }
  const walletFunding=n(categories.wallet_top_up)+n(categories.initial_wallet)
  const gross=Object.values(categories).reduce((a,b)=>a+b,0)
  const expenses=expenseRows.reduce((sum,row)=>sum+Math.abs(n(row.amount_centavos))/100,0)
  const taxProvision=expenseRows.filter(row=>String(row.category||'').toLowerCase().includes('tax')).reduce((sum,row)=>sum+Math.abs(n(row.amount_centavos))/100,0)
  const net=gross-expenses
  const walletUsage={prepaid:0,postpaid:0}
  for(const row of walletRows){
    if(n(row.amount)>=0)continue
    const type=String(row.type||'')
    if(type==='session_start'||type==='session_extension')walletUsage.prepaid+=Math.abs(n(row.amount))
    else if(type==='postpaid_settlement')walletUsage.postpaid+=Math.abs(n(row.amount))
  }
  return{bounds,summary:{gross,expenses,net,taxProvision,walletFunding,walletRevenue:walletUsage.prepaid+walletUsage.postpaid},categories,expenses:expenseRows.map(expenseFromRevenue),walletActivity:walletRows.map(row=>({id:String(row.local_id),type:String(row.type),amount:n(row.amount),recorded_at:row.created_at})),walletUsage}
}

async function taxEstimate(admin:SupabaseClient,branchId:string,dateText:string,rateInput:any){const bounds=earningsBounds('ytd',dateText),year=Number(bounds.year),[rows,walletRows]=await Promise.all([revenueRows(admin,branchId,bounds.start,bounds.end),walletLedgerRows(admin,branchId,bounds.start,bounds.end)]),grossYtd=earningsFromRows(rows,walletRows,bounds).summary.gross,rate=Math.min(100,Math.max(0,n(rateInput,8))),annualReduction=250000,taxableGross=Math.max(0,grossYtd-annualReduction),estimatedLiability=taxableGross*(rate/100),priorProvision=rows.filter(r=>r.event_type==='expense'&&n(r.amount_centavos)<0&&String(r.category||'').toLowerCase().includes('tax')).reduce((sum,row)=>sum+Math.abs(n(row.amount_centavos))/100,0),proposedProvision=Math.max(0,estimatedLiability-priorProvision),exceedsThreshold=grossYtd>3000000;return{grossYtd,annualReduction,taxableGross,ratePercent:rate,estimatedLiability,priorProvision,proposedProvision,exceedsThreshold,regimeState:exceedsThreshold?'manual_required':'eligible',taxYear:year}}

async function cloudNative(admin:SupabaseClient,user:any,branch:any,method:string,path:string,body:any,operationKey:string|null){
  const url=asUrl(path),route=url.pathname,branchId=branch.id,encoded=branchId;

  if(method==='PATCH'&&route==='/settings'){
    if(body?.defaultBilling!=null&&String(body.defaultBilling).toLowerCase()!=='prepaid')return json({success:false,status:410,code:'POSTPAID_DISABLED',error:'Postpaid billing is disabled in this build. Use prepaid sessions.'},200);
    if(body?.postpaidMinutesPerPeso!=null||body?.postpaidPesoPerMinute!=null)return json({success:false,status:410,code:'POSTPAID_DISABLED',error:'Postpaid billing is disabled in this build.'},200);
    const patch={...(body||{})};if(patch.defaultBilling!=null)patch.defaultBilling='prepaid';if(patch.displayName!=null){patch.displayName=String(patch.displayName).trim();if(patch.displayName.length>40)return json({success:false,status:400,code:'INVALID_DISPLAY_NAME',error:'Display name must be 40 characters or fewer.'},200)}
    const current=await readConfig(admin,branchId),settings={...(current.config.settings||{}),...patch},config={...current.config,settings};await writeConfig(admin,branchId,config,user.id);await audit(admin,branch,user.id,'cloud.settings.update','settings',null,{keys:Object.keys(patch)});return result({success:true,settings});
  }
  if(method==='POST'&&route==='/branding/logo'){
    const dataUrl=String(body?.dataUrl||'');if(!/^data:image\/(png|jpeg|jpg|webp|svg\+xml);/i.test(dataUrl))return json({success:false,status:400,code:'INVALID_LOGO',error:'Upload a PNG, JPEG, WebP, or SVG image.'},200);if(dataUrl.length>2_500_000)return json({success:false,status:413,code:'LOGO_TOO_LARGE',error:'Logo must be smaller than about 2 MB.'},200);const current=await readConfig(admin,branchId),logoVersion=Date.now(),settings={...(current.config.settings||{}),logoUrl:dataUrl,logoVersion},config={...current.config,settings};await writeConfig(admin,branchId,config,user.id);await audit(admin,branch,user.id,'cloud.branding.logo','settings',null,{logoVersion});return result({success:true,logoUrl:dataUrl,logoVersion});
  }
  if(method==='PATCH'&&route==='/billing-policy/session'){
    if(body?.defaultBilling!=null&&String(body.defaultBilling).toLowerCase()!=='prepaid')return json({success:false,status:410,code:'POSTPAID_DISABLED',error:'Postpaid billing is disabled in this build. Use prepaid sessions.'},200);
    const patch={...(body||{}),defaultBilling:'prepaid'};const current=await readConfig(admin,branchId),settings={...(current.config.settings||{}),...patch},config={...current.config,settings};await writeConfig(admin,branchId,config,user.id);return result({success:true,settings});
  }
  if(method==='PATCH'&&route==='/billing-policy/postpaid-rate')return json({success:false,status:410,code:'POSTPAID_DISABLED',error:'Postpaid billing is disabled in this build. Use prepaid sessions.'},200);

  if(method==='POST'&&route==='/rate-plans'){
    const data=rateData(body||{}),localId=String(data.id);const{error}=await admin.from('branch_rate_plans').insert({branch_id:branchId,edge_id:null,local_id:localId,data,updated_at:data.updatedAt});if(error)throw error;await audit(admin,branch,user.id,'cloud.rate_plan.create','rate_plan',localId,{name:data.name});await refreshManagedConfig(admin,branchId,user.id);return result({success:true,ratePlan:data},201);
  }
  const rateMatch=route.match(/^\/rate-plans\/([^/]+)$/);
  if(rateMatch&&method==='PATCH'){
    const localId=decodeURIComponent(rateMatch[1]),{data:row,error:readError}=await admin.from('branch_rate_plans').select('data').eq('branch_id',branchId).eq('local_id',localId).maybeSingle();if(readError)throw readError;if(!row)return json({success:false,status:404,code:'RATE_PLAN_NOT_FOUND',error:'Rate plan not found.'},200);const data=rateData({...body,id:localId},row.data||{}),{error}=await admin.from('branch_rate_plans').update({data,updated_at:data.updatedAt,edge_id:null}).eq('branch_id',branchId).eq('local_id',localId);if(error)throw error;await audit(admin,branch,user.id,'cloud.rate_plan.update','rate_plan',localId,{name:data.name});await refreshManagedConfig(admin,branchId,user.id);return result({success:true,ratePlan:data});
  }
  if(rateMatch&&method==='DELETE'){
    const localId=decodeURIComponent(rateMatch[1]),{data:row,error:readError}=await admin.from('branch_rate_plans').select('data').eq('branch_id',branchId).eq('local_id',localId).maybeSingle();if(readError)throw readError;if(!row)return result({success:true});const data=rateData({id:localId,isActive:false,customerSelfService:false},row.data||{}),{error}=await admin.from('branch_rate_plans').update({data,updated_at:data.updatedAt,edge_id:null}).eq('branch_id',branchId).eq('local_id',localId);if(error)throw error;await audit(admin,branch,user.id,'cloud.rate_plan.deactivate','rate_plan',localId,{});await refreshManagedConfig(admin,branchId,user.id);return result({success:true,ratePlan:data});
  }

  if(method==='POST'&&route==='/announcements'){
    const localId=String(body?.id||id()),data={...(body||{}),id:localId,updatedAt:now(),createdAt:body?.createdAt||now()};const{error}=await admin.from('branch_announcements').insert({branch_id:branchId,edge_id:null,local_id:localId,data,updated_at:data.updatedAt});if(error)throw error;await audit(admin,branch,user.id,'cloud.announcement.create','announcement',localId,{});await refreshManagedConfig(admin,branchId,user.id);return result({success:true,announcement:data},201);
  }
  const annMatch=route.match(/^\/announcements\/([^/]+)$/);
  if(annMatch&&method==='PATCH'){
    const localId=decodeURIComponent(annMatch[1]),{data:row,error:readError}=await admin.from('branch_announcements').select('data').eq('branch_id',branchId).eq('local_id',localId).maybeSingle();if(readError)throw readError;if(!row)return json({success:false,status:404,error:'Announcement not found.'},200);const data={...(row.data||{}),...(body||{}),id:localId,updatedAt:now()},{error}=await admin.from('branch_announcements').update({data,updated_at:data.updatedAt,edge_id:null}).eq('branch_id',branchId).eq('local_id',localId);if(error)throw error;await refreshManagedConfig(admin,branchId,user.id);return result({success:true,announcement:data});
  }
  if(annMatch&&method==='DELETE'){
    const localId=decodeURIComponent(annMatch[1]),{error}=await admin.from('branch_announcements').delete().eq('branch_id',branchId).eq('local_id',localId);if(error)throw error;await audit(admin,branch,user.id,'cloud.announcement.delete','announcement',localId,{});await refreshManagedConfig(admin,branchId,user.id);return result({success:true});
  }

  const supportResolve=route.match(/^\/support\/([^/]+)\/resolve$/);
  if(supportResolve&&method==='PATCH'){
    const localId=decodeURIComponent(supportResolve[1]),resolvedAt=now();
    const{data,error}=await admin.from('branch_support_requests').update({status:'resolved',read_at:resolvedAt,resolved_by:user.id}).eq('branch_id',branchId).eq('local_id',localId).select('*').maybeSingle();
    if(error)throw error;if(!data)return json({success:false,status:404,code:'SUPPORT_NOT_FOUND',error:'Support request not found.'},200);
    await audit(admin,branch,user.id,'cloud.support.resolve','support_request',localId,{pcId:data.pc_id,memberId:data.member_id});
    return result({success:true,request:{id:data.local_id,status:data.status,readAt:data.read_at,resolvedBy:data.resolved_by}});
  }

  const feedbackStatus=route.match(/^\/feedback\/([^/]+)\/status$/);
  if(feedbackStatus&&method==='PATCH'){
    const localId=decodeURIComponent(feedbackStatus[1]),{data:row,error:readError}=await admin.from('branch_feedback').select('data').eq('branch_id',branchId).eq('local_id',localId).maybeSingle();if(readError)throw readError;if(!row)return json({success:false,status:404,error:'Feedback not found.'},200);const data={...(row.data||{}),status:String(body?.status||'new'),updatedAt:now()},{error}=await admin.from('branch_feedback').update({data}).eq('branch_id',branchId).eq('local_id',localId);if(error)throw error;await refreshManagedConfig(admin,branchId,user.id);return result({success:true,item:data});
  }
  if(route==='/feedback/archive'&&method==='POST'){
    for(const rawId of Array.isArray(body?.ids)?body.ids:[]){const localId=String(rawId),{data:row}=await admin.from('branch_feedback').select('data').eq('branch_id',branchId).eq('local_id',localId).maybeSingle();if(row){const data={...(row.data||{}),archived:true,archivedAt:now()};await admin.from('branch_feedback').update({data}).eq('branch_id',branchId).eq('local_id',localId)}}await refreshManagedConfig(admin,branchId,user.id);return result({success:true});
  }
  const feedbackRestore=route.match(/^\/feedback\/([^/]+)\/restore$/);
  if(feedbackRestore&&method==='POST'){
    const localId=decodeURIComponent(feedbackRestore[1]),{data:row}=await admin.from('branch_feedback').select('data').eq('branch_id',branchId).eq('local_id',localId).maybeSingle();if(row){const data={...(row.data||{}),archived:false,archivedAt:null};await admin.from('branch_feedback').update({data}).eq('branch_id',branchId).eq('local_id',localId)}await refreshManagedConfig(admin,branchId,user.id);return result({success:true});
  }

  if(method==='POST'&&route==='/members'){
    const username=String(body?.username||'').trim();if(!username)return json({success:false,status:400,code:'USERNAME_REQUIRED',error:'Username is required.'},200);const{data:dupe}=await admin.from('branch_members').select('local_id').eq('branch_id',branchId).ilike('username',username).limit(1);if(dupe?.length)return json({success:false,status:409,code:'USERNAME_EXISTS',error:'That username is already in use.'},200);const localId=String(body?.id||id()),timestamp=now(),startingWallet=n(body?.wallet??body?.walletBalance),row={branch_id:branchId,edge_id:null,local_id:localId,member_code:String(body?.memberCode||body?.member_code||`M-${localId.slice(0,8).toUpperCase()}`),name:String(body?.name||username),username,birthdate:body?.birthdate||null,phone:body?.phone||null,email:body?.email||null,tier:String(body?.tier||'Regular'),wallet_balance:startingWallet,session_seconds_remaining:n(body?.sessionSecondsRemaining),status:String(body?.status||'active'),pc_id:body?.pcId||null,pc_ip:body?.pcIp||null,created_at:timestamp,updated_at:timestamp};const{data,error}=await admin.from('branch_members').insert(row).select('*').single();if(error)throw error;if(startingWallet>0){const initialWalletId=`member-initial-wallet-${localId}`;const{error:walletError}=await admin.from('branch_wallet_ledger').insert({branch_id:branchId,edge_id:null,local_id:initialWalletId,member_id:localId,type:'admin_top_up',amount:startingWallet,balance_before:0,balance_after:startingWallet,reference_type:'member_create',reference_id:localId,created_at:timestamp,metadata:{authority:'cloud'}});if(walletError)throw walletError;const{error:receiptError}=await admin.from('branch_revenue_events').upsert({branch_id:branchId,edge_id:null,local_id:`wallet-receipt-${initialWalletId}`,event_type:'member_initial_wallet',source_type:'wallet_receipt',source_id:initialWalletId,amount_centavos:Math.round(startingWallet*100),occurred_at:timestamp,category:'initial_wallet',payment_method:'cash',member_id:localId,metadata:{walletLedgerId:initialWalletId,receiptRecorded:true,directGuard:true}},{onConflict:'branch_id,local_id',ignoreDuplicates:true});if(receiptError)throw receiptError}await setMemberCredential(admin,branchId,localId,username,'1234',true);await audit(admin,branch,user.id,'cloud.member.create','member',localId,{username});await refreshManagedConfig(admin,branchId,user.id);return result({success:true,member:memberShape(data),temporaryPassword:'1234',cloudCredential:true,edgeProvisioning:'mirrored'},201);
  }
  const memberMatch=route.match(/^\/members\/([^/]+)$/);
  if(memberMatch&&method==='PATCH'){
    const localId=decodeURIComponent(memberMatch[1]),patch:any={updated_at:now(),edge_id:null};const map:any={memberCode:'member_code',name:'name',username:'username',birthdate:'birthdate',phone:'phone',email:'email',tier:'tier',status:'status',pcId:'pc_id',pcIp:'pc_ip',sessionSecondsRemaining:'session_seconds_remaining'};for(const[k,col]of Object.entries(map))if(Object.prototype.hasOwnProperty.call(body,k))patch[col]=body[k];const{data,error}=await admin.from('branch_members').update(patch).eq('branch_id',branchId).eq('local_id',localId).select('*').maybeSingle();if(error)throw error;if(!data)return json({success:false,status:404,error:'Member not found.'},200);if(Object.prototype.hasOwnProperty.call(body,'password')&&String(body.password||'').length)await setMemberCredential(admin,branchId,localId,String(data.username||body.username||''),String(body.password),false);else if(Object.prototype.hasOwnProperty.call(body,'username')){const{data:cred}=await admin.from('branch_member_credentials').select('password_salt,password_hash,password_iterations,must_change_credentials').eq('branch_id',branchId).eq('member_id',localId).maybeSingle();if(cred){const{error:credError}=await admin.from('branch_member_credentials').update({username_ci:String(data.username||'').trim().toLowerCase(),updated_at:now()}).eq('branch_id',branchId).eq('member_id',localId);if(credError)throw credError}}await refreshManagedConfig(admin,branchId,user.id);return result({success:true,member:memberShape(data)});
  }
  if(memberMatch&&method==='DELETE'){
    const localId=decodeURIComponent(memberMatch[1]),{error}=await admin.from('branch_members').delete().eq('branch_id',branchId).eq('local_id',localId);if(error)throw error;await audit(admin,branch,user.id,'cloud.member.delete','member',localId,{});await refreshManagedConfig(admin,branchId,user.id);return result({success:true});
  }
  if(route==='/sessions/interrupted'&&method==='GET'){
    const [{data:sessions,error:sessionError},{data:stations,error:stationError},{data:members,error:memberError}]=await Promise.all([
      admin.from('branch_sessions').select('local_id,member_id,pc_id,customer_name,billing_type,ended_at,settlement_method,data').eq('branch_id',branchId).eq('status','ended').order('ended_at',{ascending:false}),
      admin.from('branch_stations').select('local_id,label,ip_address').eq('branch_id',branchId),
      admin.from('branch_members').select('local_id,name,username,wallet_balance').eq('branch_id',branchId),
    ]);
    if(sessionError)throw sessionError;if(stationError)throw stationError;if(memberError)throw memberError;
    const stationMap=new Map((stations||[]).map((row:any)=>[String(row.local_id),row]));
    const memberMap=new Map((members||[]).map((row:any)=>[String(row.local_id),row]));
    const interrupted=(sessions||[]).filter((row:any)=>{
      const data=row.data&&typeof row.data==='object'?row.data:{};
      const pending=row.billing_type==='postpaid'&&(String(row.settlement_method||'').toLowerCase()==='pending'||data.settlementPending===true||data.settlement_pending===true||String(data.settlementPending??data.settlement_pending??'').toLowerCase()==='true');
      const guestTime=row.billing_type==='prepaid'&&!row.member_id&&n(data.savedRemainingSeconds??data.saved_remaining_seconds)>0&&data.interruptionRecovered!==true&&data.interruption_recovered!==true&&String(data.interruptionRecovered??data.interruption_recovered??'').toLowerCase()!=='true';
      return pending||guestTime;
    });
    const pendingSettlements=interrupted.filter((row:any)=>row.billing_type==='postpaid').map((row:any)=>{const data=row.data||{},pc=stationMap.get(String(row.pc_id||'')),member=memberMap.get(String(row.member_id||''));return{id:row.local_id,pcId:row.pc_id||null,pcLabel:pc?.label||row.pc_id||'Station',pcIp:pc?.ip_address||null,memberId:row.member_id||null,customerName:row.customer_name||member?.name||member?.username||'Guest',amountDue:Math.max(0,n(data.unsettledAmountDue??data.unsettled_amount_due)),endedAt:row.ended_at||data.interruptedAt||null,endReason:data.endReason||data.end_reason||'station_exit',walletBalance:row.member_id?n(member?.wallet_balance):null,paymentMethods:row.member_id?['cash','wallet']:['cash']}});
    const recoverableGuestSessions=interrupted.filter((row:any)=>row.billing_type==='prepaid'&&!row.member_id).map((row:any)=>{const data=row.data||{},pc=stationMap.get(String(row.pc_id||''));return{id:row.local_id,pcId:row.pc_id||null,pcLabel:pc?.label||row.pc_id||'Station',pcIp:pc?.ip_address||null,customerName:row.customer_name||'Guest',remainingSeconds:Math.max(0,n(data.savedRemainingSeconds??data.saved_remaining_seconds)),endedAt:row.ended_at||data.interruptedAt||null,endReason:data.endReason||data.end_reason||'station_exit'}});
    return result({pendingSettlements,recoverableGuestSessions});
  }
  const interruptedSettleMatch=route.match(/^\/sessions\/([^/]+)\/settle-interrupted$/);
  if(interruptedSettleMatch&&method==='POST'){
    const sessionId=decodeURIComponent(interruptedSettleMatch[1]);
    const{data,error}=await admin.rpc('aezakmi_settle_interrupted_session',{p_branch_id:branchId,p_session_id:sessionId,p_payment_method:String(body?.paymentMethod||''),p_actor_id:user.id});
    if(error)throw error;const out=data&&typeof data==='object'?data:{};if(out.success===false)return json({success:false,status:Number(out.status||400),code:out.code||'SETTLEMENT_FAILED',error:out.error||'Unable to settle interrupted session.',data:out},200);
    await audit(admin,branch,user.id,'session.settle_interrupted','computer_session',sessionId,{pcId:out.pcId||null,memberId:out.memberId||null,amount:out.amountDue||0,paymentMethod:out.paymentMethod||null});
    return result(out,Number(out.status||200));
  }
  const interruptedForfeitMatch=route.match(/^\/sessions\/([^/]+)\/forfeit-interrupted-guest$/);
  if(interruptedForfeitMatch&&method==='POST'){
    const sessionId=decodeURIComponent(interruptedForfeitMatch[1]);
    const{data,error}=await admin.rpc('aezakmi_forfeit_interrupted_guest_session',{p_branch_id:branchId,p_session_id:sessionId,p_actor_id:user.id});
    if(error)throw error;const out=data&&typeof data==='object'?data:{};if(out.success===false)return json({success:false,status:Number(out.status||400),code:out.code||'GUEST_FORFEIT_FAILED',error:out.error||'Unable to forfeit interrupted guest time.',data:out},200);
    await audit(admin,branch,user.id,'session.forfeit_interrupted_guest','computer_session',sessionId,{pcId:out.pcId||null,forfeitedSeconds:out.forfeitedSeconds||0});
    if(out.pcId)await broadcastStationWakeup(admin,branchId,String(out.pcId),{kind:'session_changed',reason:'session_forfeited',sessionId});
    return result(out,Number(out.status||200));
  }
  const interruptedRestoreMatch=route.match(/^\/sessions\/([^/]+)\/restore-interrupted-guest$/);
  if(interruptedRestoreMatch&&method==='POST'){
    const sessionId=decodeURIComponent(interruptedRestoreMatch[1]);
    const{data:interrupted,error:interruptedError}=await admin.from('branch_sessions').select('pc_id').eq('branch_id',branchId).eq('local_id',sessionId).maybeSingle();if(interruptedError)throw interruptedError;if(!interrupted)throw Object.assign(new Error('Interrupted guest session was not found.'),{status:404,code:'SESSION_NOT_FOUND'});await requireAvailableStation(admin,branchId,String(interrupted.pc_id||''));
    const{data,error}=await admin.rpc('aezakmi_restore_interrupted_guest_session',{p_branch_id:branchId,p_session_id:sessionId,p_actor_id:user.id});
    if(error)throw error;const out=data&&typeof data==='object'?data:{};if(out.success===false)return json({success:false,status:Number(out.status||400),code:out.code||'GUEST_RESTORE_FAILED',error:out.error||'Unable to restore guest time.',data:out},200);
    await audit(admin,branch,user.id,'session.restore_interrupted_guest','computer_session',out.sessionId||sessionId,{pcId:out.pcId||null,resumedFromSessionId:sessionId,remainingSeconds:out.remainingSeconds||0});
    if(out.pcId)await broadcastStationWakeup(admin,branchId,String(out.pcId),{kind:'session_changed',reason:'session_restored',sessionId:out.sessionId||sessionId,memberId:null});
    return result(out,Number(out.status||201));
  }

  // Cloud-authoritative live session / wallet transaction engine.
  const settlementMatch=route.match(/^\/sessions\/([^/]+)\/settlement-preview$/);
  if(settlementMatch&&method==='GET')return cloudExecute(admin,branchId,'session.preview',{sessionId:decodeURIComponent(settlementMatch[1])},user.id,operationKey);
  if(route==='/sessions/start'&&method==='POST'){if(String(body?.billing||'prepaid').toLowerCase()!=='prepaid')return json({success:false,status:410,code:'POSTPAID_DISABLED',error:'Postpaid billing is disabled in this build. Use prepaid sessions.'},200);const pcId=String(body?.pcId||'');await requireAvailableStation(admin,branchId,pcId,body?.customerId?String(body.customerId):null);const response=await cloudExecute(admin,branchId,'session.start',{...(body||{}),billing:'prepaid'},user.id,operationKey);await broadcastStationWakeup(admin,branchId,pcId,{kind:'session_changed',reason:'session_started',pcId,memberId:body?.customerId?String(body.customerId):null});return response}
  const sessionEndMatch=route.match(/^\/sessions\/([^/]+)\/end$/);
  if(sessionEndMatch&&method==='POST'){
    const sessionId=decodeURIComponent(sessionEndMatch[1]);
    const{data:targetSession}=await admin.from('branch_sessions').select('pc_id').eq('branch_id',branchId).eq('local_id',sessionId).maybeSingle();
    const response=await cloudExecute(admin,branchId,'session.end',{...body,sessionId},user.id,operationKey);
    if(targetSession?.pc_id)await broadcastStationWakeup(admin,branchId,String(targetSession.pc_id),{kind:'session_changed',reason:String(body?.disposition||'save')==='forfeit'?'session_forfeited':'session_ended',sessionId});
    return response;
  }
  const sessionRefundMatch=route.match(/^\/sessions\/([^/]+)\/refund$/);
  if(sessionRefundMatch&&method==='POST'){
    const sessionId=decodeURIComponent(sessionRefundMatch[1]);
    const{data:targetSession}=await admin.from('branch_sessions').select('pc_id').eq('branch_id',branchId).eq('local_id',sessionId).maybeSingle();
    const response=await cloudExecute(admin,branchId,'session.refund',{...body,sessionId},user.id,operationKey);
    if(targetSession?.pc_id)await broadcastStationWakeup(admin,branchId,String(targetSession.pc_id),{kind:'session_changed',reason:'session_refunded',sessionId});
    return response;
  }
  const cloudWalletMatch=route.match(/^\/members\/([^/]+)\/wallet$/);
  if(cloudWalletMatch&&method==='PATCH')return cloudExecute(admin,branchId,'wallet.set',{...body,memberId:decodeURIComponent(cloudWalletMatch[1])},user.id,operationKey);
  if(route==='/wallet/adjustments'&&method==='POST')return cloudExecute(admin,branchId,'wallet.adjust',body,user.id,operationKey);
  const walletTransferMatch=route.match(/^\/members\/([^/]+)\/wallet-transfers$/);
  if(walletTransferMatch&&method==='POST')return cloudExecute(admin,branchId,'wallet.transfer',{...body,memberId:decodeURIComponent(walletTransferMatch[1])},user.id,operationKey);
  const memberTopupMatch=route.match(/^\/members\/([^/]+)\/session-topup$/);
  if(memberTopupMatch&&method==='POST'){
    const memberId=decodeURIComponent(memberTopupMatch[1]);
    const{data:activeSess}=await admin.from('branch_sessions').select('pc_id,local_id').eq('branch_id',branchId).eq('member_id',memberId).eq('status','active').maybeSingle();
    const response=await cloudExecute(admin,branchId,'session.topup',{...body,memberId},user.id,operationKey);
    const resData=response?.data||response||{};
    if(activeSess?.pc_id)await broadcastStationWakeup(admin,branchId,String(activeSess.pc_id),{kind:'session_changed',reason:'session_extended',sessionId:activeSess.local_id,memberId,remainingSeconds:resData.remainingSeconds??null,amount:resData.amount??null});
    return response;
  }
  const timeAdjustMatch=route.match(/^\/sessions\/([^/]+)\/time-adjustments$/);
  if(timeAdjustMatch&&method==='POST'){
    const sessionId=decodeURIComponent(timeAdjustMatch[1]);
    const{data:targetSession}=await admin.from('branch_sessions').select('pc_id,member_id').eq('branch_id',branchId).eq('local_id',sessionId).maybeSingle();
    const response=await cloudExecute(admin,branchId,'session.time_adjust',{...body,sessionId},user.id,operationKey);
    const resData=response?.data||response||{};
    if(targetSession?.pc_id)await broadcastStationWakeup(admin,branchId,String(targetSession.pc_id),{kind:'session_changed',reason:`session_time_${String(body?.kind||'add').toLowerCase()}`,sessionId,memberId:targetSession.member_id||null,remainingSeconds:resData.remainingSeconds??null,amount:resData.amount??null});
    return response;
  }
  const timeTransferMatch=route.match(/^\/members\/([^/]+)\/session-time-transfers$/);
  if(timeTransferMatch&&method==='POST')return cloudExecute(admin,branchId,'session.time_transfer',{...body,memberId:decodeURIComponent(timeTransferMatch[1])},user.id,operationKey);
  if(route==='/top-ups'&&method==='POST')return cloudExecute(admin,branchId,'topup.request',body,user.id,operationKey);
  const topupDecisionMatch=route.match(/^\/top-ups\/([^/]+)\/(approve|reject)$/);
  if(topupDecisionMatch&&method==='PATCH'){
    const topupId=decodeURIComponent(topupDecisionMatch[1]),action=topupDecisionMatch[2];
    const{data:topup}=await admin.from('branch_top_up_requests').select('pc_id,member_id,amount').eq('branch_id',branchId).eq('local_id',topupId).maybeSingle();
    const response=await cloudExecute(admin,branchId,`topup.${action}`,{id:topupId},user.id,operationKey);
    if(topup?.pc_id)await broadcastStationWakeup(admin,branchId,String(topup.pc_id),{kind:'topup_updated',status:action==='approve'?'approved':'rejected',memberId:topup.member_id,amount:topup.amount});
    return response;
  }
  if(route==='/top-ups/resolved'&&method==='DELETE')return cloudExecute(admin,branchId,'topup.clear_resolved',{},user.id,operationKey);
  if(route==='/session-extensions'&&method==='POST')return cloudExecute(admin,branchId,'extension.request',body,user.id,operationKey);
  const extensionDecisionMatch=route.match(/^\/session-extensions\/([^/]+)\/(confirm|reject)$/);
  if(extensionDecisionMatch&&method==='POST'){
    const extId=decodeURIComponent(extensionDecisionMatch[1]),action=extensionDecisionMatch[2];
    const{data:ext}=await admin.from('branch_session_extensions').select('pc_id,member_id,computer_session_id').eq('branch_id',branchId).eq('local_id',extId).maybeSingle();
    const response=await cloudExecute(admin,branchId,action==='confirm'?'extension.confirm':'extension.reject',{id:extId},user.id,operationKey);
    const resData=response?.data||response||{};
    if(ext?.pc_id)await broadcastStationWakeup(admin,branchId,String(ext.pc_id),{kind:'session_changed',reason:action==='confirm'?'extension_confirmed':'extension_rejected',sessionId:ext.computer_session_id,memberId:ext.member_id,remainingSeconds:resData.remainingSeconds??null});
    return response;
  }

  const walletMatch=route.match(/^\/members\/([^/]+)\/wallet$/);
  if(walletMatch&&method==='PATCH'){
    const localId=decodeURIComponent(walletMatch[1]),balance=n(body?.balance,NaN);if(!Number.isFinite(balance)||balance<0)return json({success:false,status:400,error:'Wallet balance must be zero or greater.'},200);const{data,error}=await admin.from('branch_members').update({wallet_balance:balance,updated_at:now(),edge_id:null}).eq('branch_id',branchId).eq('local_id',localId).select('wallet_balance').maybeSingle();if(error)throw error;if(!data)return json({success:false,status:404,error:'Member not found.'},200);await admin.from('branch_wallet_ledger').insert({branch_id:branchId,edge_id:null,local_id:id(),member_id:localId,type:'cloud_set_balance',amount:0,balance_before:balance,balance_after:balance,reference_type:'cloud_admin',reference_id:user.id,created_at:now()});await refreshManagedConfig(admin,branchId,user.id);return result({success:true,balance});
  }
  if(route==='/wallet/adjustments'&&method==='POST'){
    const memberId=String(body?.memberId||''),amount=n(body?.amount,NaN);if(!memberId||!Number.isFinite(amount)||amount===0)return json({success:false,status:400,error:'Provide a member and non-zero wallet adjustment.'},200);const{data:member,error:readError}=await admin.from('branch_members').select('wallet_balance').eq('branch_id',branchId).eq('local_id',memberId).maybeSingle();if(readError)throw readError;if(!member)return json({success:false,status:404,error:'Member not found.'},200);const before=n(member.wallet_balance),after=Math.max(0,before+amount);const{error}=await admin.from('branch_members').update({wallet_balance:after,updated_at:now(),edge_id:null}).eq('branch_id',branchId).eq('local_id',memberId);if(error)throw error;await admin.from('branch_wallet_ledger').insert({branch_id:branchId,edge_id:null,local_id:id(),member_id:memberId,type:String(body?.type||'adjustment'),amount,balance_before:before,balance_after:after,reference_type:'cloud_admin',reference_id:user.id,created_at:now()});await refreshManagedConfig(admin,branchId,user.id);return result({success:true,balance:after});
  }

  if(route==='/logs'&&(method==='DELETE'||method==='POST')){
    await admin.from('cloud_audit_logs').delete().eq('branch_id',branchId);
    return result({success:true,message:'All operational logs cleared.'});
  }

  if(method==='GET'&&route==='/analytics'){
    const range=String(url.searchParams.get('range')||'30d'),bounds=rangeBounds(range),[{data:sessions,error:sessionError},{data:revenue,error:revenueError},{data:rateRows,error:rateError}]=await Promise.all([admin.from('branch_sessions').select('*').eq('branch_id',branchId).gte('started_at',bounds.start).lte('started_at',bounds.end),admin.from('branch_revenue_events').select('*').eq('branch_id',branchId).gte('occurred_at',bounds.start).lte('occurred_at',bounds.end),admin.from('branch_rate_plans').select('local_id,data').eq('branch_id',branchId)]);if(sessionError)throw sessionError;if(revenueError)throw revenueError;if(rateError)throw rateError;const rateNames=new Map((rateRows||[]).map((r:any)=>[String(r.local_id),String(r.data?.name||r.local_id)])),seriesMap=new Map<string,any>(),revenueMap=new Map<string,number>();let durationTotal=0;for(const s of sessions||[]){const day=dayKey(s.started_at);if(!day)continue;const item=seriesMap.get(day)||{day,visits:0,members:0,guests:0};item.visits++;if(s.member_id)item.members++;else item.guests++;seriesMap.set(day,item);const start=new Date(s.started_at||0).getTime(),end=new Date(s.ended_at||Date.now()).getTime();if(Number.isFinite(start)&&Number.isFinite(end)&&end>=start)durationTotal+=(end-start)/1000}for(const r of revenue||[]){const day=dayKey(r.occurred_at);if(day&&n(r.amount_centavos)>0)revenueMap.set(day,(revenueMap.get(day)||0)+n(r.amount_centavos)/100)}const rateCount=new Map<string,number>();for(const s of sessions||[]){const key=String(s.rate_plan_id||s.billing_type||'Guest');rateCount.set(key,(rateCount.get(key)||0)+1)}const visits=(sessions||[]).length,members=(sessions||[]).filter((s:any)=>s.member_id).length;return result({success:true,metrics:{revenue:[...(revenue||[])].filter((r:any)=>n(r.amount_centavos)>0).reduce((sum:number,r:any)=>sum+n(r.amount_centavos)/100,0),visits,members,guests:visits-members,averageSessionSeconds:visits?Math.round(durationTotal/visits):0},series:[...seriesMap.values()].sort((a,b)=>a.day.localeCompare(b.day)),revenueSeries:[...revenueMap.entries()].sort().map(([day,value])=>({day,revenue:value})),expenseSeries:(revenue||[]).filter((r:any)=>n(r.amount_centavos)<0).map((r:any)=>({day:dayKey(r.occurred_at),expenses:Math.abs(n(r.amount_centavos))/100})),rateMix:[...rateCount.entries()].map(([key,value])=>({label:rateNames.get(key)||key,value}))});
  }
  if(method==='GET'&&route==='/earnings'){
    const period=String(url.searchParams.get('period')||'monthly'),date=String(url.searchParams.get('date')||''),bounds=earningsBounds(period,date),[rows,walletRows]=await Promise.all([revenueRows(admin,branchId,bounds.start,bounds.end),walletLedgerRows(admin,branchId,bounds.start,bounds.end)]);return result({success:true,...earningsFromRows(rows,walletRows,bounds)});
  }
  if(method==='GET'&&route==='/tax-estimate'){
    const estimate=await taxEstimate(admin,branchId,String(url.searchParams.get('date')||''),url.searchParams.get('rate'));return result({success:true,estimate});
  }
  if(method==='POST'&&route==='/expenses'){
    const amount=n(body?.amount,NaN),category=String(body?.category||'').trim();if(!category||!Number.isFinite(amount)||amount<=0)return json({success:false,status:400,error:'Provide a category and positive amount.'},200);const localId=id(),occurredAt=body?.recordedAt?new Date(body.recordedAt).toISOString():now(),metadata={kind:'custom',description:String(body?.description||'').slice(0,300)};const{error}=await admin.from('branch_revenue_events').insert({branch_id:branchId,edge_id:null,local_id:localId,event_type:'expense',source_type:'expense',source_id:localId,amount_centavos:-Math.round(amount*100),occurred_at:occurredAt,category,payment_method:null,metadata});if(error)throw error;return result({success:true,expense:{id:localId,kind:'custom',category,description:metadata.description,amount,recordedAt:occurredAt}},201);
  }
  const expenseMatch=route.match(/^\/expenses\/([^/]+)$/);
  if(expenseMatch&&method==='DELETE'){
    const localId=decodeURIComponent(expenseMatch[1]),{error}=await admin.from('branch_revenue_events').delete().eq('branch_id',branchId).eq('local_id',localId).eq('event_type','expense');if(error)throw error;return result({success:true});
  }
  if(route==='/expenses/fixed-definitions/isp'&&method==='PUT'){
    const monthlyAmount=n(body?.monthlyAmount,NaN),dueDay=n(body?.dueDay,NaN);if(!Number.isFinite(monthlyAmount)||monthlyAmount<0||!Number.isInteger(dueDay)||dueDay<1||dueDay>28)return json({success:false,status:400,error:'Provide a valid monthly amount and due day.'},200);const current=await readConfig(admin,branchId),finance={...(current.config.finance||{}),isp:{monthlyAmount,dueDay,effectiveFrom:body?.effectiveFrom||null,effectiveUntil:body?.effectiveUntil||null}},config={...current.config,finance};await writeConfig(admin,branchId,config,user.id);return result({success:true,definition:{sourceKey:'fixed:isp',category:'ISP Bill',...finance.isp,isActive:true}});
  }
  if(route==='/expenses/fixed-provisions'&&method==='POST'){
    const month=String(body?.month||''),taxRate=n(body?.taxRatePercent,8);if(!/^\d{4}-\d{2}$/.test(month))return json({success:false,status:400,error:'Provide a valid month.'},200);const current=await readConfig(admin,branchId),isp=current.config?.finance?.isp||{},ispAmount=n(isp.monthlyAmount),estimate=await taxEstimate(admin,branchId,`${month}-28`,taxRate),rows:any[]=[];if(ispAmount>0)rows.push({branch_id:branchId,edge_id:null,local_id:id(),event_type:'expense',source_type:'fixed_expense',source_id:`fixed:isp:${month}`,amount_centavos:-Math.round(ispAmount*100),occurred_at:`${month}-${String(Math.min(28,Math.max(1,n(isp.dueDay,1)))).padStart(2,'0')}T12:00:00+08:00`,category:'ISP Bill',metadata:{kind:'fixed',sourceKey:'fixed:isp',periodKey:month,monthlyAmount:ispAmount}});if(estimate.proposedProvision>0)rows.push({branch_id:branchId,edge_id:null,local_id:id(),event_type:'expense',source_type:'fixed_expense',source_id:`fixed:tax:${month}`,amount_centavos:-Math.round(estimate.proposedProvision*100),occurred_at:`${month}-28T12:00:00+08:00`,category:estimate.exceedsThreshold?'Custom Tax Estimate':'Estimated Tax Provision',metadata:{kind:'fixed',sourceKey:'fixed:business-tax',periodKey:month,taxRatePercent:taxRate,taxableBase:estimate.taxableGross,formulaSnapshot:estimate}});for(const row of rows){const{data:existing}=await admin.from('branch_revenue_events').select('local_id').eq('branch_id',branchId).eq('source_id',row.source_id).limit(1);if(!existing?.length){const{error}=await admin.from('branch_revenue_events').insert(row);if(error)throw error}}return result({success:true,provisions:rows.map(expenseFromRevenue),estimate},201);
  }
  if(route==='/earnings/reports'&&method==='POST'){
    const period=String(body?.period||'monthly'),bounds=earningsBounds(period,String(body?.date||'')),[rows,walletRows]=await Promise.all([revenueRows(admin,branchId,bounds.start,bounds.end),walletLedgerRows(admin,branchId,bounds.start,bounds.end)]),snapshot=earningsFromRows(rows,walletRows,bounds),tax=await taxEstimate(admin,branchId,String(body?.date||''),8),reportId=id(),createdAt=now(),reportNumber=`AEZ-${createdAt.slice(0,10).replaceAll('-','')}-${reportId.slice(0,6).toUpperCase()}`,report={...snapshot,taxEstimate:tax,reportNumber,createdAt,createdBy:user.id};await admin.from('cloud_audit_logs').insert({id:reportId,organization_id:branch.organization_id,branch_id:branchId,actor_user_id:user.id,action:'financial.report',entity_type:'financial_report',entity_id:reportId,details:{report},created_at:createdAt});return result({success:true,report:{id:reportId,...report}},201);
  }
  const reportMatch=route.match(/^\/earnings\/reports\/([^/]+)(?:\/pdf-data)?$/);
  if(reportMatch&&method==='GET'){
    const reportId=decodeURIComponent(reportMatch[1]),{data:row,error}=await admin.from('cloud_audit_logs').select('details').eq('branch_id',branchId).eq('id',reportId).eq('action','financial.report').maybeSingle();if(error)throw error;if(!row)return json({success:false,status:404,error:'Report not found.'},200);const report=row.details?.report||{},cfg=await readConfig(admin,branchId),settings=cfg.config.settings||{},payload:any={success:true,report:{id:reportId,...report}};if(route.endsWith('/pdf-data'))payload.branding={cafeName:settings.cafeName||'Aezakmi Cafe',branch:settings.branch||branch.name||'Main Branch',branchLocation:settings.branchLocation||'',logoDataUrl:settings.logoUrl||null};return result(payload);
  }

  if(method==='GET'&&route==='/launcher/categories'){
    const{data,error}=await admin.from('branch_launcher_categories').select('*').eq('branch_id',branchId).eq('is_active',true).order('sort_order',{ascending:true}).order('name',{ascending:true});
    if(error)throw error;
    return result({success:true,categories:(data||[]).map((r:any)=>({id:r.local_id||r.id,name:r.name,sortOrder:n(r.sort_order),isActive:Boolean(r.is_active),createdAt:r.created_at}))});
  }
  if(method==='POST'&&route==='/launcher/categories'){
    const catId=id(),nowStr=now();
    const{error}=await admin.from('branch_launcher_categories').insert({branch_id:branchId,local_id:catId,name:String(body?.name||'').trim(),sort_order:n(body?.sortOrder,0),is_active:true,created_at:nowStr});
    if(error)throw error;
    return result({success:true,category:{id:catId,name:String(body?.name||'').trim(),sortOrder:n(body?.sortOrder,0),isActive:true,createdAt:nowStr}},201);
  }
  const launcherCatMatch=route.match(/^\/launcher\/categories\/([^/]+)$/);
  if(launcherCatMatch&&method==='PATCH'){
    const localId=decodeURIComponent(launcherCatMatch[1]),patch:any={};
    if(body?.name!==undefined)patch.name=String(body.name).trim();
    if(body?.sortOrder!==undefined)patch.sort_order=n(body.sortOrder);
    if(body?.isActive!==undefined)patch.is_active=Boolean(body.isActive);
    const{error}=await admin.from('branch_launcher_categories').update(patch).eq('branch_id',branchId).eq('local_id',localId);
    if(error)throw error;
    return result({success:true});
  }
  if(launcherCatMatch&&method==='DELETE'){
    const localId=decodeURIComponent(launcherCatMatch[1]);
    const{error}=await admin.from('branch_launcher_categories').update({is_active:false}).eq('branch_id',branchId).eq('local_id',localId);
    if(error)throw error;
    return result({success:true});
  }

  if(method==='GET'&&route==='/launcher/apps'){
    const{data,error}=await admin.from('branch_launcher_apps').select('*').eq('branch_id',branchId).eq('is_enabled',true).order('sort_order',{ascending:true}).order('name',{ascending:true});
    if(error)throw error;
    return result({success:true,apps:(data||[]).map((r:any)=>({id:r.local_id||r.id,name:r.name,categoryId:r.category_id,categoryName:r.category_name||'Online Games',icon:r.icon,executablePath:r.executable_path,protocolUrl:r.protocol_url,launchArguments:r.launch_arguments,workingDirectory:r.working_directory,isEnabled:Boolean(r.is_enabled),sortOrder:n(r.sort_order),isPreset:Boolean(r.is_preset),createdAt:r.created_at,updatedAt:r.updated_at}))});
  }
  if(method==='POST'&&route==='/launcher/apps/batch'){
    const apps=Array.isArray(body?.apps)?body.apps:[];
    const rows=apps.map((a:any)=>({branch_id:branchId,local_id:id(),name:String(a.name||'').trim(),category_id:a.categoryId||null,category_name:String(a.categoryName||a.category||'Online Games'),icon:a.icon||'🎮',executable_path:a.executablePath||a.exe||null,protocol_url:a.protocolUrl||a.protocol||null,launch_arguments:a.launchArguments||null,working_directory:a.workingDirectory||null,is_enabled:a.isEnabled!==false,sort_order:n(a.sortOrder,0),is_preset:Boolean(a.isPreset),created_at:now(),updated_at:now()}));
    if(rows.length){const{error}=await admin.from('branch_launcher_apps').insert(rows);if(error)throw error;}
    return result({success:true,count:rows.length},201);
  }
  if(method==='POST'&&route==='/launcher/apps'){
    const appId=id(),nowStr=now();
    const row={branch_id:branchId,local_id:appId,name:String(body?.name||'').trim(),category_id:body?.categoryId||null,category_name:String(body?.categoryName||'Online Games'),icon:body?.icon||'🎮',executable_path:body?.executablePath||null,protocol_url:body?.protocolUrl||null,launch_arguments:body?.launchArguments||null,working_directory:body?.workingDirectory||null,is_enabled:body?.isEnabled!==false,sort_order:n(body?.sortOrder,0),is_preset:Boolean(body?.isPreset),created_at:nowStr,updated_at:nowStr};
    const{error}=await admin.from('branch_launcher_apps').insert(row);
    if(error)throw error;
    return result({success:true,app:{id:appId,...row}},201);
  }
  const launcherAppMatch=route.match(/^\/launcher\/apps\/([^/]+)$/);
  if(launcherAppMatch&&method==='PATCH'){
    const localId=decodeURIComponent(launcherAppMatch[1]),patch:any={updated_at:now()};
    const fields:any={name:'name',categoryId:'category_id',categoryName:'category_name',icon:'icon',executablePath:'executable_path',protocolUrl:'protocol_url',launchArguments:'launch_arguments',workingDirectory:'working_directory',isEnabled:'is_enabled',sortOrder:'sort_order'};
    for(const[k,c]of Object.entries(fields)){if(body?.[k]!==undefined)patch[c as string]=body[k];}
    const{error}=await admin.from('branch_launcher_apps').update(patch).eq('branch_id',branchId).eq('local_id',localId);
    if(error)throw error;
    return result({success:true});
  }
  if(launcherAppMatch&&method==='DELETE'){
    const localId=decodeURIComponent(launcherAppMatch[1]);
    const{error}=await admin.from('branch_launcher_apps').delete().eq('branch_id',branchId).eq('local_id',localId);
    if(error)throw error;
    return result({success:true});
  }

  if(method==='GET'&&route==='/menu-items'){
    const{data,error}=await admin.from('branch_menu_items').select('*').eq('branch_id',branchId).eq('is_active',true).order('category',{ascending:true}).order('name',{ascending:true});
    if(error)throw error;
    return result({success:true,menuItems:(data||[]).map((m:any)=>({id:m.local_id||m.id,name:m.name,category:m.category,description:m.description,price:n(m.price_centavos)/100,imageUrl:m.image_url,stockQuantity:m.stock_quantity!=null?n(m.stock_quantity):null,isAvailable:Boolean(m.is_available),isActive:Boolean(m.is_active),createdAt:m.created_at,updatedAt:m.updated_at}))});
  }
  if(method==='POST'&&route==='/menu-items'){
    const itemId=id(),nowStr=now();
    const row={branch_id:branchId,local_id:itemId,name:String(body?.name||'').trim(),category:String(body?.category||'snacks'),description:String(body?.description||''),price_centavos:Math.round(n(body?.price,0)*100),image_url:body?.imageUrl||null,stock_quantity:body?.stockQuantity!=null?n(body.stockQuantity):null,is_available:body?.isAvailable!==false,is_active:true,created_at:nowStr,updated_at:nowStr};
    const{error}=await admin.from('branch_menu_items').insert(row);
    if(error)throw error;
    return result({success:true,menuItem:{id:itemId,...row,price:n(row.price_centavos)/100}},201);
  }
  const menuItemMatch=route.match(/^\/menu-items\/([^/]+)$/);
  if(menuItemMatch&&method==='PATCH'){
    const localId=decodeURIComponent(menuItemMatch[1]),patch:any={updated_at:now()};
    if(body?.name!==undefined)patch.name=String(body.name).trim();
    if(body?.category!==undefined)patch.category=String(body.category);
    if(body?.description!==undefined)patch.description=String(body.description).trim();
    if(body?.price!==undefined)patch.price_centavos=Math.round(n(body.price,0)*100);
    if(body?.imageUrl!==undefined)patch.image_url=body.imageUrl;
    if(body?.stockQuantity!==undefined)patch.stock_quantity=body.stockQuantity!=null?n(body.stockQuantity):null;
    if(body?.isAvailable!==undefined)patch.is_available=Boolean(body.isAvailable);
    if(body?.isActive!==undefined)patch.is_active=Boolean(body.isActive);
    const{error}=await admin.from('branch_menu_items').update(patch).eq('branch_id',branchId).eq('local_id',localId);
    if(error)throw error;
    return result({success:true});
  }
  if(menuItemMatch&&method==='DELETE'){
    const localId=decodeURIComponent(menuItemMatch[1]);
    const{error}=await admin.from('branch_menu_items').update({is_active:false,updated_at:now()}).eq('branch_id',branchId).eq('local_id',localId);
    if(error)throw error;
    return result({success:true});
  }

  if(method==='GET'&&route==='/menu-orders'){
    const{data,error}=await admin.from('branch_menu_orders').select('*').eq('branch_id',branchId).order('created_at',{ascending:false}).limit(100);
    if(error)throw error;
    return result({success:true,orders:(data||[]).map((r:any)=>({id:r.local_id||r.id,customerId:r.customer_id,customerName:r.customer_name,pcId:r.pc_id,pcLabel:r.pc_label,items:typeof r.items_json==='string'?JSON.parse(r.items_json):(r.items_json||[]),total:n(r.total_centavos)/100,paymentMethod:r.payment_method,paymentStatus:r.payment_status,orderStatus:r.order_status,notes:r.notes,createdAt:r.created_at,fulfilledAt:r.fulfilled_at,cancelledAt:r.cancelled_at}))});
  }

  if(method==='GET'&&route==='/vouchers'){
    const{data,error}=await admin.from('branch_promo_vouchers').select('*').eq('branch_id',branchId).eq('is_active',true).order('created_at',{ascending:false});
    if(error)throw error;
    return result({success:true,vouchers:(data||[]).map((v:any)=>({id:v.local_id||v.id,code:v.code,benefitType:v.benefit_type,valueAmount:v.value_amount,maxRedemptions:v.max_redemptions,currentRedemptions:v.current_redemptions,expiresAt:v.expires_at,isActive:v.is_active,createdAt:v.created_at}))});
  }
  if(method==='POST'&&route==='/vouchers'){
    const vId=id(),nowStr=now();
    const row={branch_id:branchId,local_id:vId,code:String(body?.code||'').trim().toUpperCase(),benefit_type:body?.benefitType==='session_time'?'session_time':'wallet_credit',value_amount:n(body?.valueAmount,0),max_redemptions:body?.maxRedemptions!=null?n(body.maxRedemptions):null,current_redemptions:0,expires_at:body?.expiresAt||null,is_active:true,created_at:nowStr};
    const{error}=await admin.from('branch_promo_vouchers').insert(row);
    if(error)throw error;
    return result({success:true,voucher:{id:vId,...row}},201);
  }
  const voucherMatch=route.match(/^\/vouchers\/([^/]+)$/);
  if(voucherMatch&&method==='DELETE'){
    const localId=decodeURIComponent(voucherMatch[1]);
    const{error}=await admin.from('branch_promo_vouchers').update({is_active:false}).eq('branch_id',branchId).eq('local_id',localId);
    if(error)throw error;
    return result({success:true});
  }

  return null;
}

async function waitForCommand(admin:any,id:string){const deadline=Date.now()+18_000;let delayMs=350;while(Date.now()<deadline){const{data:current,error}=await admin.from('cloud_commands').select('status,result').eq('id',id).single();if(error)throw error;if(current.status==='completed')return json({success:true,commandId:id,status:Number(current.result?.status||200),data:current.result?.data??current.result??{}},200);if(current.status==='failed'||current.status==='expired')return json({success:false,commandId:id,status:Number(current.result?.status||502),code:current.result?.code||'EDGE_ACTION_FAILED',error:current.result?.error||'The Edge rejected the request.',data:current.result?.data??null},200);const remaining=Math.max(0,deadline-Date.now());if(!remaining)break;await sleep(Math.min(delayMs,remaining));delayMs=Math.min(1500,Math.round(delayMs*1.45))}return json({success:false,commandId:id,status:504,code:'EDGE_TIMEOUT',error:'The Café Edge did not respond in time. This operation requires local session/billing authority.'},200)}

Deno.serve(async req=>{const o=preflight(req);if(o)return o;try{const{user}=await userClient(req),admin=adminClient(),b=await req.json(),branchId=String(b.branchId||''),method=String(b.method||'GET').toUpperCase(),path=normalizePath(b.path),body=b.body&&typeof b.body==='object'?b.body:{},operationKey=String(b.operationKey||'').trim()||null;if(!branchId)return json({success:false,code:'BRANCH_REQUIRED',error:'Select a branch first.'},400);if(!METHODS.has(method))return json({success:false,code:'METHOD_NOT_ALLOWED',error:'Unsupported HTTP method.'},400);const{data:branch,error:branchError}=await admin.from('branches').select('id,organization_id,name').eq('id',branchId).single();if(branchError)throw branchError;await requireMembership(admin,user.id,branch.organization_id,method==='GET'?['owner','admin','manager','viewer']:['owner','admin','manager']);const native=await cloudNative(admin,user,branch,method,path,body,operationKey);if(native){if(method!=='GET')await wakeBranchEdge(admin,branchId,{kind:'cloud_mutation',path});return native;}
  const{data:edge,error:edgeError}=await admin.from('edge_servers').select('id,realtime_topic_key,revoked_at,last_seen_at').eq('branch_id',branchId).is('revoked_at',null).order('last_seen_at',{ascending:false}).limit(1).maybeSingle();if(edgeError)throw edgeError;if(!edge)return json({success:false,code:'EDGE_REQUIRED',error:'This live session or wallet operation still requires Café Edge. Normal Cloud Admin pages no longer depend on Edge.'},503);
  if(method!=='GET'&&operationKey){const{data:existing,error:existingError}=await admin.from('cloud_commands').select('id').eq('branch_id',branchId).eq('requested_by',user.id).eq('idempotency_key',operationKey).maybeSingle();if(existingError)throw existingError;if(existing?.id)return await waitForCommand(admin,existing.id)}const expiresAt=new Date(Date.now()+30_000).toISOString(),payload={organization_id:branch.organization_id,branch_id:branchId,edge_id:edge.id,command:'admin_api',payload:{method,path,body},requested_by:user.id,expires_at:expiresAt,...(method!=='GET'&&operationKey?{idempotency_key:operationKey}:{})};let command:any=null;const inserted=await admin.from('cloud_commands').insert(payload).select('id,status,requested_at,expires_at').single();if(inserted.error){if(inserted.error.code==='23505'&&operationKey){const{data:existing,error}=await admin.from('cloud_commands').select('id').eq('branch_id',branchId).eq('requested_by',user.id).eq('idempotency_key',operationKey).single();if(error)throw error;command=existing}else throw inserted.error}else command=inserted.data;if(method!=='GET')await audit(admin,branch,user.id,`admin.api.${method.toLowerCase()}`,'cloud_command',command.id,{path,idempotencyKey:operationKey});await broadcastWakeup(edge.realtime_topic_key,{commandId:command.id,kind:'admin_api'});return await waitForCommand(admin,command.id)}catch(e){return fail(e,'Unable to execute Admin request.')}})
