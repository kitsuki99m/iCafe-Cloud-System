import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function fail(error:any,fallback='Request failed.'){const status=Number(error?.status||500);return json({success:false,code:error?.code||'SERVER_ERROR',error:status>=500&&!error?.exposeMessage?fallback:(error?.message||fallback)},status)}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const value=Deno.env.get('SUPABASE_URL')||'';if(!value)throw Object.assign(new Error('SUPABASE_URL unavailable.'),{status:500});return value.replace(/\/+$/,'')}
function publishableKey(){return Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||namedKey('SUPABASE_PUBLISHABLE_KEYS')||Deno.env.get('SUPABASE_ANON_KEY')||''}
function secretKey(){const value=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!value)throw Object.assign(new Error('Supabase privileged key unavailable.'),{status:500});return value}
function adminClient():SupabaseClient{return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}
async function authenticatedUser(req:Request){const authorization=req.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))throw Object.assign(new Error('Sign in first.'),{status:401,code:'AUTH_REQUIRED'});const key=publishableKey();if(!key)throw Object.assign(new Error('Supabase publishable key unavailable.'),{status:500});const client=createClient(projectUrl(),key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});const{data,error}=await client.auth.getUser();if(error||!data.user)throw Object.assign(new Error('Cloud session invalid.'),{status:401,code:'AUTH_INVALID'});return data.user}
async function requireDeveloper(admin:SupabaseClient,userId:string){const{data,error}=await admin.from('platform_developers').select('user_id,email,is_active').eq('user_id',userId).eq('is_active',true).maybeSingle();if(error)throw error;if(!data)throw Object.assign(new Error('Developer approval required.'),{status:403,code:'DEVELOPER_REQUIRED'});return data}
function note(value:unknown){return String(value||'').trim().slice(0,2000)||null}
function requiredReason(value:unknown){const valueText=note(value);if(!valueText)throw Object.assign(new Error('Enter a reason for this developer action.'),{status:400,code:'REASON_REQUIRED'});return valueText}
function addDays(iso:string|Date,days:number){const d=new Date(iso);d.setUTCDate(d.getUTCDate()+days);return d.toISOString()}

async function packageCatalog(admin:SupabaseClient){
  const{data,error}=await admin.from('platform_subscription_packages').select('id,label,display_order,max_stations,monthly_price,price_suffix,description,is_active,updated_at').eq('is_active',true).order('display_order',{ascending:true})
  if(error)throw error
  return data||[]
}
async function pricingSettings(admin:SupabaseClient){
  const{data,error}=await admin.from('platform_pricing_settings').select('currency,deployment_fee_min,deployment_fee_max,quote_valid_days,updated_at').eq('singleton',true).maybeSingle()
  if(error)throw error
  return data||{currency:'PHP',deployment_fee_min:2500,deployment_fee_max:5000,quote_valid_days:14}
}
async function subscriptionPackage(admin:SupabaseClient,planValue:unknown,customValue:unknown,expectedStations=1){
  const catalog:any[]=await packageCatalog(admin)
  if(!catalog.length)throw Object.assign(new Error('Subscription package catalog is empty.'),{status:500,code:'PACKAGE_CATALOG_EMPTY'})
  let plan=String(planValue||'').trim().toLowerCase()
  const expected=Math.max(1,Math.floor(Number(expectedStations)||1))
  if(!plan){
    const fixed=catalog.find((item:any)=>item.max_stations!==null&&expected<=Number(item.max_stations))
    plan=String(fixed?.id||catalog.find((item:any)=>item.id==='ultra')?.id||catalog.at(-1)?.id||'bronze')
  }
  const selected:any=catalog.find((item:any)=>String(item.id)===plan)
  if(!selected)throw Object.assign(new Error('Choose Bronze, Silver, Gold, or Ultra.'),{status:400,code:'INVALID_SUBSCRIPTION_PLAN'})
  const fixed=selected.max_stations==null?null:Number(selected.max_stations)
  const goldCap=Math.max(0,Number(catalog.find((item:any)=>String(item.id)==='gold')?.max_stations||0))
  const ultraFloor=Math.max(1,goldCap+1)
  let maxStations=fixed
  if(plan==='ultra'||fixed===null){
    const requested=Math.floor(Number(customValue))
    maxStations=Number.isInteger(requested)&&requested>0?requested:Math.max(expected,ultraFloor)
    if(Number(maxStations)<ultraFloor)throw Object.assign(new Error(`Ultra station limit must be at least ${ultraFloor}.`),{status:400,code:'ULTRA_LIMIT_TOO_LOW'})
  }
  if(!Number.isInteger(maxStations)||Number(maxStations)<1||Number(maxStations)>10000)throw Object.assign(new Error('Station limit must be between 1 and 10,000.'),{status:400,code:'INVALID_STATION_LIMIT'})
  return{plan,maxStations:Number(maxStations),ultraFloor,package:selected}
}
async function organizationStationCount(admin:SupabaseClient,organizationId:string){const{data:branches,error:branchError}=await admin.from('branches').select('id').eq('organization_id',organizationId);if(branchError)throw branchError;const ids=(branches||[]).map((x:any)=>x.id);if(!ids.length)return 0;const{count,error}=await admin.from('branch_stations').select('local_id',{count:'exact',head:true}).in('branch_id',ids);if(error)throw error;return Number(count||0)}
async function applySubscription(admin:SupabaseClient,organizationId:string,planValue:unknown,customValue:unknown,expectedStations=1){const pkg=await subscriptionPackage(admin,planValue,customValue,expectedStations),used=await organizationStationCount(admin,organizationId);if(used>pkg.maxStations)throw Object.assign(new Error(`This business already has ${used} stations. Choose a package that supports at least ${used}.`),{status:409,code:'SUBSCRIPTION_BELOW_USAGE'});const{data,error}=await admin.from('subscriptions').update({plan:pkg.plan,max_stations:pkg.maxStations,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).select('plan,status,max_branches,max_stations,trial_ends_at,grace_until,current_period_end').single();if(error)throw error;return{...data,station_count:used}}
async function audit(admin:SupabaseClient,requestId:string,actor:string,action:string,details:Record<string,unknown>={}){const{error}=await admin.from('registration_audit_logs').insert({registration_request_id:requestId,actor_user_id:actor,action,details});if(error)throw error}
function activationRedirect(){
  const base=String(Deno.env.get('AEZAKMI_ADMIN_URL')||'https://icafe-aezakmi.vercel.app').trim().replace(/\/+$/,'')
  return `${base}/?aezakmi=activate`
}
async function activationLink(admin:SupabaseClient,email:string){
  const redirectTo=activationRedirect()
  const params:any={type:'recovery',email,options:{redirectTo}}
  const{data,error}=await admin.auth.admin.generateLink(params)
  if(error)throw Object.assign(new Error(error.message||'Unable to generate activation link.'),{status:409,code:'ACTIVATION_LINK_FAILED'})
  const props:any=(data as any)?.properties||{}
  return String(props.action_link||props.actionLink||'')||null
}
async function maybeActivationLink(admin:SupabaseClient,email:string){try{return await activationLink(admin,email)}catch{return null}}
function inviteMetadata(registration:any,pkg:{plan:string,maxStations:number}){return{name:registration.owner_name,business_name:registration.business_name,aezakmi_registration_id:registration.id,subscription_plan:pkg.plan,max_stations:pkg.maxStations}}
function resendConfig(){
  const apiKey=String(Deno.env.get('RESEND_API_KEY')||'').trim()
  const from=String(Deno.env.get('AEZAKMI_EMAIL_FROM')||'Aezakmi Cafe <onboarding@resend.dev>').trim()
  const replyTo=String(Deno.env.get('AEZAKMI_REPLY_TO')||'').trim()
  const explicitTestRecipient=String(Deno.env.get('AEZAKMI_EMAIL_TEST_RECIPIENT')||'').trim()
  if(!apiKey)throw Object.assign(new Error('Resend is not configured. Add RESEND_API_KEY to Supabase Edge Function secrets.'),{status:503,code:'EMAIL_NOT_CONFIGURED',exposeMessage:true})
  return{apiKey,from,replyTo,explicitTestRecipient,testSender:/@resend\.dev(?:>|$)/i.test(from)}
}
async function sendResendEmail(input:{to:string;subject:string;html:string;tags?:Array<{name:string;value:string}>;developerEmail?:string}){
  const{apiKey,from,replyTo,explicitTestRecipient,testSender}=resendConfig()
  const intendedTo=String(input.to||'').trim()
  const fallbackTestRecipient=String(explicitTestRecipient||input.developerEmail||'').trim()
  const deliveredTo=testSender&&fallbackTestRecipient?fallbackTestRecipient:intendedTo
  const redirected=testSender&&Boolean(deliveredTo)&&deliveredTo.toLowerCase()!==intendedTo.toLowerCase()
  const subject=redirected?`[TEST for ${intendedTo}] ${input.subject}`:input.subject
  const testBanner=redirected?`<div style="margin:0 0 18px;padding:12px 14px;border-radius:10px;background:#fff3cd;color:#664d03;font:12px Arial,sans-serif"><strong>Resend test mode:</strong> this message was intended for ${htmlEscape(intendedTo)} but was delivered to the developer email because onboarding@resend.dev cannot send to arbitrary recipients.</div>`:''
  const payload:any={from,to:[deliveredTo],subject,html:testBanner+input.html}
  if(replyTo)payload.reply_to=replyTo
  if(input.tags?.length)payload.tags=input.tags
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload)})
  const data=await response.json().catch(()=>({}))
  if(!response.ok){
    const providerMessage=String(data?.message||data?.error||'Email provider rejected the message.')
    const message=response.status===403&&testSender
      ?`${providerMessage} Resend test mode can only deliver to the email address that owns the Resend account. If that is not ${deliveredTo}, set AEZAKMI_EMAIL_TEST_RECIPIENT to the Resend account email.`
      :providerMessage
    throw Object.assign(new Error(message),{status:502,code:'EMAIL_DELIVERY_FAILED',exposeMessage:true})
  }
  return{id:String(data?.id||'')||null,intendedTo,deliveredTo,testMode:testSender,redirected}
}
async function generateInviteLink(admin:SupabaseClient,registration:any,pkg:{plan:string,maxStations:number}){
  const options:any={data:inviteMetadata(registration,pkg),redirectTo:activationRedirect()}
  const{data,error}=await admin.auth.admin.generateLink({type:'invite',email:registration.email,options} as any)
  if(error)throw Object.assign(new Error(error.message||'Unable to generate invitation link.'),{status:409,code:'INVITE_LINK_FAILED',exposeMessage:true})
  const userId=(data as any)?.user?.id||null
  const props:any=(data as any)?.properties||{}
  const link=String(props.action_link||props.actionLink||'')||null
  if(!userId||!link)throw Object.assign(new Error('Supabase did not return a complete invitation link.'),{status:500,code:'INVITE_LINK_MISSING'})
  return{userId,link}
}
async function sendInviteEmail(admin:SupabaseClient,registration:any,pkg:{plan:string,maxStations:number},developerEmail=''){
  const generated=await generateInviteLink(admin,registration,pkg)
  try{
    const delivery=await sendResendEmail({to:registration.email,developerEmail,subject:`You're invited to Aezakmi Café Cloud — ${registration.business_name}`,html:inviteHtml({...registration,actionLink:generated.link,packageLabel:String(pkg.plan||'').replace(/^./,(c)=>c.toUpperCase()),maxStations:pkg.maxStations}),tags:[{name:'category',value:'business-invite'}]})
    return{userId:generated.userId,delivery}
  }catch(error){
    try{await admin.auth.admin.deleteUser(generated.userId)}catch{}
    throw error
  }
}
async function resendActivationEmail(admin:SupabaseClient,registration:any,pkg:{plan:string,maxStations:number},developerEmail=''){
  const link=await activationLink(admin,registration.email)
  if(!link)throw Object.assign(new Error('Unable to generate activation link.'),{status:409,code:'ACTIVATION_LINK_FAILED'})
  return await sendResendEmail({to:registration.email,developerEmail,subject:`Your Aezakmi Café Cloud activation link — ${registration.business_name}`,html:inviteHtml({...registration,actionLink:link,packageLabel:String(pkg.plan||'').replace(/^./,(c)=>c.toUpperCase()),maxStations:pkg.maxStations,resend:true}),tags:[{name:'category',value:'business-activation'}]})
}

function htmlEscape(value:unknown){return String(value??'').replace(/[&<>"']/g,(ch)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]||ch))}
function peso(value:unknown){return `₱${Number(value||0).toLocaleString('en-PH',{minimumFractionDigits:0,maximumFractionDigits:2})}`}
function inviteHtml(input:any){
  const logoUrl=String(Deno.env.get('AEZAKMI_BRAND_LOGO_URL')||'').trim()
  const logo=logoUrl?`<img src="${htmlEscape(logoUrl)}" width="48" height="48" alt="Aezakmi Café" style="display:block;border-radius:12px;object-fit:contain;background:#ffffff">`:`<div style="width:48px;height:48px;border-radius:12px;background:#E8A33D;color:#0B1017;font-weight:800;font-size:22px;line-height:48px;text-align:center">A</div>`
  const title=input.resend?'Your activation link':'Your workspace is ready'
  const intro=input.resend?'Here is a fresh secure link to finish activating your account.':'Your Aezakmi Café Cloud application has been approved.'
  return `<!doctype html><html><body style="margin:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;color:#111827"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f2;padding:28px 12px"><tr><td align="center"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb"><tr><td style="background:#0B1017;padding:24px 28px"><table role="presentation" width="100%"><tr><td width="60">${logo}</td><td><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#E8A33D;font-weight:700">Aezakmi Café</div><div style="margin-top:4px;font-size:22px;color:#ffffff;font-weight:700">${htmlEscape(title)}</div></td></tr></table></td></tr><tr><td style="padding:30px 28px"><p style="margin:0 0 8px;font-size:15px">Hello ${htmlEscape(input.owner_name||input.recipientName||'there')},</p><p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7">${htmlEscape(intro)} Use the secure button below to set your password and open the workspace for <strong style="color:#111827">${htmlEscape(input.business_name||input.businessName)}</strong>.</p><div style="margin:22px 0;padding:16px;border-radius:14px;background:#f4f1e8"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:5px 0;color:#6b7280;font-size:13px">Package</td><td align="right" style="padding:5px 0;font-size:13px;font-weight:700">${htmlEscape(input.packageLabel||'Cloud')}</td></tr><tr><td style="padding:5px 0;color:#6b7280;font-size:13px">Station limit</td><td align="right" style="padding:5px 0;font-size:13px;font-weight:700">${htmlEscape(input.maxStations||'—')}</td></tr></table></div><div style="text-align:center;margin:26px 0"><a href="${htmlEscape(input.actionLink)}" style="display:inline-block;background:#0B1017;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:14px 22px;border-radius:12px">Activate Aezakmi Cloud</a></div><p style="margin:0;color:#6b7280;font-size:12px;line-height:1.6">For security, use this link only for the invited owner account. If the button does not open, copy this URL into your browser:</p><p style="margin:8px 0 0;word-break:break-all;color:#6b7280;font-size:11px;line-height:1.6">${htmlEscape(input.actionLink)}</p><p style="margin:24px 0 0;font-size:13px;color:#111827"><strong>Aezakmi Café</strong><br><span style="color:#6b7280">Cloud café management · Customer Stations · Branch operations</span></p></td></tr></table></td></tr></table></body></html>`
}
function quoteHtml(input:any){
  const logoUrl=String(Deno.env.get('AEZAKMI_BRAND_LOGO_URL')||'').trim()
  const noteHtml=input.message?`<div style="margin-top:22px;padding:16px;border-radius:14px;background:#f4f1e8;color:#4b5563;font-size:14px;line-height:1.6"><strong style="color:#111827">Message from Aezakmi</strong><br>${htmlEscape(input.message).replace(/\n/g,'<br>')}</div>`:''
  const logo=logoUrl?`<img src="${htmlEscape(logoUrl)}" width="48" height="48" alt="Aezakmi Café" style="display:block;border-radius:12px;object-fit:contain;background:#ffffff">`:`<div style="width:48px;height:48px;border-radius:12px;background:#E8A33D;color:#0B1017;font-weight:800;font-size:22px;line-height:48px;text-align:center">A</div>`
  return `<!doctype html><html><body style="margin:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;color:#111827"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef0f2;padding:28px 12px"><tr><td align="center"><table role="presentation" width="640" cellspacing="0" cellpadding="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:20px;overflow:hidden;border:1px solid #e5e7eb"><tr><td style="background:#0B1017;padding:24px 28px"><table role="presentation" width="100%"><tr><td width="60">${logo}</td><td><div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#E8A33D;font-weight:700">Aezakmi Café</div><div style="margin-top:4px;font-size:22px;color:#ffffff;font-weight:700">Business quotation</div></td></tr></table></td></tr><tr><td style="padding:30px 28px"><p style="margin:0 0 8px;font-size:15px">Hello ${htmlEscape(input.recipientName||'there')},</p><p style="margin:0;color:#4b5563;font-size:14px;line-height:1.7">Thank you for considering Aezakmi Café for <strong style="color:#111827">${htmlEscape(input.businessName)}</strong>. Based on the information provided, here is a tailored estimate for your café.</p><div style="margin:24px 0 0;padding:18px;border:1px solid #e5e7eb;border-radius:16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="padding:7px 0;color:#6b7280;font-size:13px">Quotation</td><td align="right" style="padding:7px 0;font-size:13px;font-weight:700">${htmlEscape(input.quoteNumber)}</td></tr><tr><td style="padding:7px 0;color:#6b7280;font-size:13px">Package</td><td align="right" style="padding:7px 0;font-size:13px;font-weight:700">${htmlEscape(input.packageLabel)}</td></tr><tr><td style="padding:7px 0;color:#6b7280;font-size:13px">PCs</td><td align="right" style="padding:7px 0;font-size:13px;font-weight:700">${htmlEscape(input.stationCount)}</td></tr><tr><td style="padding:7px 0;color:#6b7280;font-size:13px">Branches</td><td align="right" style="padding:7px 0;font-size:13px;font-weight:700">${htmlEscape(input.branchCount)}</td></tr><tr><td style="padding:12px 0 7px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:13px">Monthly subscription</td><td align="right" style="padding:12px 0 7px;border-top:1px solid #e5e7eb;font-size:18px;color:#0B1017;font-weight:800">${htmlEscape(input.monthlyLabel||`${peso(input.monthlyPrice)} / month`)}</td></tr><tr><td style="padding:7px 0;color:#6b7280;font-size:13px">Initial deployment</td><td align="right" style="padding:7px 0;font-size:13px;font-weight:700">${peso(input.deploymentFeePerBranch)} × ${htmlEscape(input.branchCount)} branch${Number(input.branchCount)===1?'':'es'}</td></tr><tr><td style="padding:7px 0;color:#6b7280;font-size:13px">Deployment total</td><td align="right" style="padding:7px 0;font-size:16px;color:#E8A33D;font-weight:800">${peso(input.deploymentFeeTotal)}</td></tr></table></div>${noteHtml}<div style="margin-top:24px;padding:16px 18px;border-left:4px solid #E8A33D;background:#fffaf0;color:#4b5563;font-size:13px;line-height:1.6">This quotation is valid until <strong style="color:#111827">${htmlEscape(input.validUntilLabel)}</strong>. Final pricing may change if the requested PC count, number of branches, onsite requirements, networking, or deployment scope changes.</div><p style="margin:24px 0 0;color:#4b5563;font-size:13px;line-height:1.7">If you would like to proceed, simply reply to this email and we can finalize the deployment scope and onboarding schedule.</p><p style="margin:24px 0 0;font-size:13px;color:#111827"><strong>Aezakmi Café</strong><br><span style="color:#6b7280">Cloud café management · Customer Stations · Branch operations</span></p></td></tr></table><div style="max-width:640px;padding:16px 8px;color:#9ca3af;font-size:11px;line-height:1.5;text-align:center">This quotation was generated by the Aezakmi developer console for ${htmlEscape(input.businessName)}.</div></td></tr></table></body></html>`
}
async function sendQuotationEmail(input:any,developerEmail=''){
  return await sendResendEmail({to:input.recipientEmail,developerEmail,subject:`Aezakmi Café quotation — ${input.businessName}`,html:quoteHtml(input),tags:[{name:'category',value:'quotation'}]})
}
async function lifecycle(admin:SupabaseClient,organizationId:string){const{data,error}=await admin.from('organizations').select('id,name,lifecycle_status,lifecycle_reason,lifecycle_updated_at,suspended_at,terminated_at').eq('id',organizationId).maybeSingle();if(error)throw error;return data}

Deno.serve(async req=>{
  const o=preflight(req);if(o)return o
  if(req.method!=='POST')return json({success:false,error:'Method not allowed.'},405)
  try{
    const user=await authenticatedUser(req),admin=adminClient();const developer=await requireDeveloper(admin,user.id)
    const b=await req.json().catch(()=>({})),action=String(b.action||'list'),requestId=String(b.requestId||''),reviewNotes=note(b.reviewNotes)

    if(action==='list'){
      const{data:requests,error}=await admin.from('registration_requests').select('id,email,owner_name,business_name,phone,location,expected_station_count,note,status,review_notes,reviewed_by,reviewed_at,auth_user_id,organization_id,branch_id,invite_sent_at,invite_cancelled_at,activated_at,owner_deleted_at,purged_at,created_at,updated_at').order('created_at',{ascending:false}).limit(500)
      if(error)throw error
      const orgIds=[...new Set((requests||[]).map((r:any)=>r.organization_id).filter(Boolean))] as string[]
      let orgs:any[]=[];let subs:any[]=[]
      if(orgIds.length){
        const[orgResult,subResult]=await Promise.all([
          admin.from('organizations').select('id,name,lifecycle_status,lifecycle_reason,lifecycle_updated_at,suspended_at,terminated_at').in('id',orgIds),
          admin.from('subscriptions').select('organization_id,plan,status,max_branches,max_stations,trial_ends_at,grace_until,current_period_end').in('organization_id',orgIds),
        ])
        if(orgResult.error)throw orgResult.error;if(subResult.error)throw subResult.error
        orgs=orgResult.data||[];subs=subResult.data||[]
      }
      const orgMap=new Map(orgs.map((x:any)=>[x.id,x])),subMap=new Map(subs.map((x:any)=>[x.organization_id,x]))
      const merged=(requests||[]).map((r:any)=>{const org:any=r.organization_id?orgMap.get(r.organization_id):null,sub:any=r.organization_id?subMap.get(r.organization_id):null;return{...r,organization_status:org?.lifecycle_status||null,organization_reason:org?.lifecycle_reason||null,lifecycle_updated_at:org?.lifecycle_updated_at||null,suspended_at:org?.suspended_at||null,terminated_at:org?.terminated_at||null,subscription_plan:sub?.plan||null,subscription_status:sub?.status||null,subscription_max_stations:sub?.max_stations??null,subscription_max_branches:sub?.max_branches??null,grace_until:sub?.grace_until||null,current_period_end:sub?.current_period_end||null,purge_eligible_at:org?.terminated_at?addDays(org.terminated_at,30):null}})
      const[packages,pricing]=await Promise.all([packageCatalog(admin),pricingSettings(admin)])
      const emailCfg=(()=>{try{const cfg=resendConfig();return{configured:true,from:cfg.from,testMode:cfg.testSender,testRecipient:cfg.explicitTestRecipient||developer.email||user.email||null,adminUrl:activationRedirect()}}catch(error:any){return{configured:false,error:error?.message||'Email not configured.',from:'Aezakmi Cafe <onboarding@resend.dev>',testMode:true,testRecipient:developer.email||user.email||null,adminUrl:activationRedirect()}}})()
      return json({success:true,requests:merged,packageCatalog:packages,pricingSettings:pricing,emailDelivery:emailCfg})
    }

    if(action==='update_pricing_catalog'){
      const packages=Array.isArray(b.packages)?b.packages:[]
      if(packages.length!==4)throw Object.assign(new Error('Bronze, Silver, Gold, and Ultra are required.'),{status:400,code:'PACKAGE_CATALOG_INCOMPLETE'})
      const normalized=packages.map((item:any)=>({id:String(item?.id||'').trim().toLowerCase(),maxStations:item?.maxStations==null||item?.maxStations===''?null:Math.floor(Number(item.maxStations)),monthlyPrice:Number(item?.monthlyPrice),description:note(item?.description)}))
      const ids=new Set(normalized.map((item:any)=>item.id))
      if(ids.size!==4||!['bronze','silver','gold','ultra'].every(id=>ids.has(id)))throw Object.assign(new Error('Bronze, Silver, Gold, and Ultra are required.'),{status:400,code:'PACKAGE_CATALOG_INVALID'})
      const byId=Object.fromEntries(normalized.map((item:any)=>[item.id,item])) as Record<string,any>
      if(![byId.bronze.maxStations,byId.silver.maxStations,byId.gold.maxStations].every((value:any)=>Number.isInteger(value)&&value>=1&&value<=10000)||!(byId.bronze.maxStations<byId.silver.maxStations&&byId.silver.maxStations<byId.gold.maxStations))throw Object.assign(new Error('PC limits must increase from Bronze to Silver to Gold.'),{status:400,code:'PACKAGE_LIMIT_ORDER_INVALID'})
      for(const item of normalized)if(!Number.isFinite(item.monthlyPrice)||item.monthlyPrice<0||item.monthlyPrice>1000000)throw Object.assign(new Error(`${item.id} monthly price is invalid.`),{status:400,code:'INVALID_PACKAGE_PRICE'})
      const min=Number(b.deploymentFeeMin),max=Number(b.deploymentFeeMax),days=Math.floor(Number(b.quoteValidDays))
      if(!Number.isFinite(min)||min<0||!Number.isFinite(max)||max<min)throw Object.assign(new Error('Deployment fee range is invalid.'),{status:400,code:'INVALID_DEPLOYMENT_FEES'})
      if(!Number.isInteger(days)||days<1||days>90)throw Object.assign(new Error('Quotation validity must be from 1 to 90 days.'),{status:400,code:'INVALID_QUOTE_VALIDITY'})
      const{data,error}=await admin.rpc('aezakmi_update_platform_pricing_catalog',{p_packages:normalized,p_deployment_fee_min:min,p_deployment_fee_max:max,p_quote_valid_days:days})
      if(error){const message=String(error.message||'');if(/aezakmi_update_platform_pricing_catalog|schema cache|could not find|does not exist/i.test(message))throw Object.assign(new Error('Cloud database schema is behind this Developer build. Apply migration 20260914000025_atomic_platform_pricing_catalog.sql, then redeploy developer-registrations.'),{status:503,code:'CLOUD_SCHEMA_OUTDATED',exposeMessage:true});throw error}
      return json(data&&typeof data==='object'?data:{success:true,packageCatalog:await packageCatalog(admin),pricingSettings:await pricingSettings(admin)})
    }

    if(action==='update_package'){
      const packageId=String(b.packageId||'').trim().toLowerCase()
      if(!['bronze','silver','gold','ultra'].includes(packageId))throw Object.assign(new Error('Unknown package.'),{status:400,code:'INVALID_SUBSCRIPTION_PLAN'})
      const monthlyPrice=Number(b.monthlyPrice),maxStations=b.maxStations==null||b.maxStations===''?null:Math.floor(Number(b.maxStations))
      if(!Number.isFinite(monthlyPrice)||monthlyPrice<0||monthlyPrice>1000000)throw Object.assign(new Error('Enter a valid monthly price.'),{status:400,code:'INVALID_PACKAGE_PRICE'})
      if(packageId!=='ultra'&&(!Number.isInteger(maxStations)||Number(maxStations)<1||Number(maxStations)>10000))throw Object.assign(new Error('Enter a station cap from 1 to 10,000.'),{status:400,code:'INVALID_STATION_LIMIT'})
      const description=note(b.description)
      if(packageId!=='ultra'){
        const current:any[]=await packageCatalog(admin)
        const candidate=Object.fromEntries(current.filter((item:any)=>['bronze','silver','gold'].includes(String(item.id))).map((item:any)=>[String(item.id),Number(item.id===packageId?maxStations:item.max_stations)]))
        if(!(candidate.bronze>=1&&candidate.bronze<candidate.silver&&candidate.silver<candidate.gold))throw Object.assign(new Error('PC limits must increase from Bronze to Silver to Gold.'),{status:400,code:'PACKAGE_LIMIT_ORDER_INVALID'})
      }
      const{data,error}=await admin.from('platform_subscription_packages').update({monthly_price:monthlyPrice,max_stations:packageId==='ultra'?null:maxStations,description,updated_at:new Date().toISOString()}).eq('id',packageId).select('*').single()
      if(error)throw error
      return json({success:true,package:data})
    }
    if(action==='update_pricing_settings'){
      const min=Number(b.deploymentFeeMin),max=Number(b.deploymentFeeMax),days=Math.floor(Number(b.quoteValidDays))
      if(!Number.isFinite(min)||min<0||!Number.isFinite(max)||max<min)throw Object.assign(new Error('Deployment fee range is invalid.'),{status:400,code:'INVALID_DEPLOYMENT_FEES'})
      if(!Number.isInteger(days)||days<1||days>90)throw Object.assign(new Error('Quotation validity must be from 1 to 90 days.'),{status:400,code:'INVALID_QUOTE_VALIDITY'})
      const{data,error}=await admin.from('platform_pricing_settings').update({deployment_fee_min:min,deployment_fee_max:max,quote_valid_days:days,updated_at:new Date().toISOString()}).eq('singleton',true).select('*').single()
      if(error)throw error
      return json({success:true,pricingSettings:data})
    }

    if(action==='test_email'){
      const target=String(Deno.env.get('AEZAKMI_EMAIL_TEST_RECIPIENT')||developer.email||user.email||'').trim()
      if(!target)throw Object.assign(new Error('No developer email is available for the Resend test.'),{status:400,code:'TEST_EMAIL_REQUIRED'})
      const delivery=await sendResendEmail({to:target,developerEmail:target,subject:'Aezakmi Café email test',html:`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#eef0f2;padding:24px"><div style="max-width:560px;margin:auto;background:#fff;border-radius:16px;padding:24px"><h2 style="margin:0 0 10px">Email delivery is working</h2><p style="color:#4b5563">This message was sent from the Aezakmi Developer Console through Resend.</p><p style="color:#6b7280;font-size:12px">Admin URL: ${htmlEscape(activationRedirect())}</p></div></body></html>`,tags:[{name:'category',value:'email-test'}]})
      return json({success:true,emailSent:true,email:delivery.deliveredTo,intendedEmail:delivery.intendedTo,testMode:delivery.testMode,redirected:delivery.redirected})
    }

    if(!requestId)throw Object.assign(new Error('Registration request is required.'),{status:400,code:'REQUEST_REQUIRED'})
    const{data:r,error:requestError}=await admin.from('registration_requests').select('*').eq('id',requestId).maybeSingle()
    if(requestError)throw requestError
    if(!r)throw Object.assign(new Error('Registration request not found.'),{status:404,code:'NOT_FOUND'})

    if(action==='reviewing'||action==='needs_info'||action==='reject'){
      if(['invited','activated'].includes(r.status))throw Object.assign(new Error('An invited or activated business cannot be moved back to review.'),{status:409,code:'ALREADY_INVITED'})
      const next=action==='reject'?'rejected':action
      const{data,error}=await admin.from('registration_requests').update({status:next,review_notes:reviewNotes,reviewed_by:user.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',requestId).select('*').single()
      if(error)throw error
      await audit(admin,requestId,user.id,next,reviewNotes?{reviewNotes}:{})
      return json({success:true,request:data})
    }

    if(action==='send_quote'){
      const pkg=await subscriptionPackage(admin,b.subscriptionPlan,b.ultraStationLimit||b.stationCount,r.expected_station_count)
      const settings:any=await pricingSettings(admin)
      const stationCount=Math.floor(Number(b.stationCount ?? r.expected_station_count ?? 1))
      const branchCount=Math.floor(Number(b.branchCount ?? 1))
      const monthlyPrice=Number(b.monthlyPrice ?? pkg.package?.monthly_price ?? 0)
      const deploymentFeePerBranch=Number(b.deploymentFeePerBranch ?? settings.deployment_fee_min ?? 2500)
      const validDays=Math.floor(Number(b.validDays ?? settings.quote_valid_days ?? 14))
      if(!Number.isInteger(stationCount)||stationCount<1||stationCount>10000)throw Object.assign(new Error('Quotation PC count must be between 1 and 10,000.'),{status:400,code:'INVALID_QUOTE_STATION_COUNT'})
      if(pkg.plan==='ultra'&&stationCount<pkg.ultraFloor)throw Object.assign(new Error(`Ultra quotations require at least ${pkg.ultraFloor} PCs.`),{status:400,code:'ULTRA_LIMIT_TOO_LOW'})
      if(!Number.isInteger(branchCount)||branchCount<1||branchCount>1000)throw Object.assign(new Error('Quotation branch count must be between 1 and 1,000.'),{status:400,code:'INVALID_QUOTE_BRANCH_COUNT'})
      if(!Number.isFinite(monthlyPrice)||monthlyPrice<0||monthlyPrice>1000000)throw Object.assign(new Error('Quotation monthly price is invalid.'),{status:400,code:'INVALID_QUOTE_PRICE'})
      if(!Number.isFinite(deploymentFeePerBranch)||deploymentFeePerBranch<0||deploymentFeePerBranch>1000000)throw Object.assign(new Error('Quotation deployment fee is invalid.'),{status:400,code:'INVALID_QUOTE_DEPLOYMENT_FEE'})
      if(!Number.isInteger(validDays)||validDays<1||validDays>90)throw Object.assign(new Error('Quotation validity must be from 1 to 90 days.'),{status:400,code:'INVALID_QUOTE_VALIDITY'})
      const deploymentFeeTotal=deploymentFeePerBranch*branchCount
      const validUntil=new Date(Date.now()+validDays*86400000)
      const quoteNumber=`AEZ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${crypto.randomUUID().slice(0,8).toUpperCase()}`
      const message=note(b.message)
      const suffix=String(pkg.package?.price_suffix||'/month').trim();const monthlyLabel=`${peso(monthlyPrice)}${suffix?(suffix.startsWith('+')?suffix:` ${suffix}`):''}`
      const emailInput={quoteNumber,recipientEmail:r.email,recipientName:r.owner_name,businessName:r.business_name,packageLabel:String(pkg.package?.label||pkg.plan),stationCount,branchCount,monthlyPrice,monthlyLabel,deploymentFeePerBranch,deploymentFeeTotal,message,validUntilLabel:validUntil.toLocaleDateString('en-PH',{year:'numeric',month:'long',day:'numeric',timeZone:'Asia/Manila'})}
      const delivery=await sendQuotationEmail(emailInput,developer.email||user.email||'')
      const providerMessageId=delivery.id
      const{data:quotation,error:quoteError}=await admin.from('platform_quotations').insert({quote_number:quoteNumber,registration_request_id:r.id,recipient_email:r.email,recipient_name:r.owner_name,business_name:r.business_name,package_id:pkg.plan,station_count:stationCount,branch_count:branchCount,monthly_price:monthlyPrice,deployment_fee_per_branch:deploymentFeePerBranch,deployment_fee_total:deploymentFeeTotal,valid_until:validUntil.toISOString().slice(0,10),message,provider_message_id:providerMessageId,status:'sent',created_by:user.id,sent_at:new Date().toISOString()}).select('*').single()
      if(quoteError)throw quoteError
      await audit(admin,requestId,user.id,'quotation_sent',{quoteNumber,email:r.email,package:pkg.plan,stationCount,branchCount,monthlyPrice,deploymentFeePerBranch})
      return json({success:true,emailSent:true,email:delivery.deliveredTo,intendedEmail:r.email,testMode:delivery.testMode,redirected:delivery.redirected,quotation})
    }

    if(action==='approve'){
      if(r.status==='activated')return json({success:true,request:r,alreadyApproved:true})
      if(r.status==='invited')return json({success:true,request:r,alreadyApproved:true,emailSent:true,email:r.email})
      if(r.status==='rejected')throw Object.assign(new Error('Reopen the application before approving it.'),{status:409,code:'REGISTRATION_REJECTED'})
      const pkg=await subscriptionPackage(admin,b.subscriptionPlan,b.ultraStationLimit,r.expected_station_count)
      let authUserId=r.auth_user_id as string|null
      const inviteSentAt=new Date().toISOString()
      let delivery:any=null
      if(!authUserId){const sent=await sendInviteEmail(admin,r,pkg,developer.email||user.email||'');authUserId=sent.userId;delivery=sent.delivery}
      else{await admin.auth.admin.updateUserById(authUserId,{user_metadata:inviteMetadata(r,pkg)});delivery=await resendActivationEmail(admin,r,pkg,developer.email||user.email||'')}
      const{error:markError}=await admin.from('registration_requests').update({status:'approved',auth_user_id:authUserId,reviewed_by:user.id,reviewed_at:inviteSentAt,review_notes:reviewNotes,invite_sent_at:inviteSentAt,invite_cancelled_at:null,owner_deleted_at:null,updated_at:inviteSentAt}).eq('id',requestId)
      if(markError)throw markError
      const{data:finalized,error:finalizeError}=await admin.rpc('aezakmi_finalize_registration_approval',{p_request_id:requestId,p_auth_user_id:authUserId,p_reviewer_id:user.id,p_review_notes:reviewNotes})
      if(finalizeError)throw finalizeError
      const tenant=Array.isArray(finalized)?finalized[0]:finalized
      const subscription=await applySubscription(admin,String(tenant?.organization_id||r.organization_id||''),pkg.plan,pkg.maxStations,r.expected_station_count)
      const{data:updated}=await admin.from('registration_requests').select('*').eq('id',requestId).single()
      await audit(admin,requestId,user.id,'invite_email_sent',{email:r.email,automatic:true,subscriptionPlan:pkg.plan,maxStations:pkg.maxStations})
      return json({success:true,request:updated,tenant,subscription,emailSent:true,email:delivery?.deliveredTo||r.email,intendedEmail:r.email,testMode:Boolean(delivery?.testMode),redirected:Boolean(delivery?.redirected)})
    }

    if(action==='resend_invite'){
      if(!['approved','invited'].includes(r.status)||!r.auth_user_id||r.activated_at)throw Object.assign(new Error('Only an outstanding invitation can be resent.'),{status:409,code:'INVITE_NOT_ACTIVE'})
      const{data:sub,error:subError}=await admin.from('subscriptions').select('plan,max_stations').eq('organization_id',r.organization_id).maybeSingle();if(subError)throw subError
      if(r.auth_user_id&&sub)await admin.auth.admin.updateUserById(r.auth_user_id,{user_metadata:inviteMetadata(r,{plan:String(sub.plan||'bronze'),maxStations:Number(sub.max_stations||50)})})
      const delivery=await resendActivationEmail(admin,r,{plan:String(sub?.plan||'bronze'),maxStations:Number(sub?.max_stations||50)},developer.email||user.email||'')
      const now=new Date().toISOString()
      const{data,error}=await admin.from('registration_requests').update({invite_sent_at:now,updated_at:now}).eq('id',requestId).select('*').single()
      if(error)throw error
      await audit(admin,requestId,user.id,'invite_email_resent',{email:r.email})
      return json({success:true,request:data,emailSent:true,email:delivery.deliveredTo,intendedEmail:r.email,testMode:delivery.testMode,redirected:delivery.redirected,resent:true})
    }

    if(action==='copy_activation_link'){
      if(!['approved','invited'].includes(r.status)||!r.auth_user_id)throw Object.assign(new Error('Only an outstanding approved invitation can generate an activation link.'),{status:409,code:'INVITE_NOT_ACTIVE'})
      const link=await activationLink(admin,r.email)
      await audit(admin,requestId,user.id,'activation_link_generated',{})
      return json({success:true,activationLink:link})
    }

    if(action==='cancel_invite'){
      if(!['approved','invited'].includes(r.status)||r.activated_at)throw Object.assign(new Error('Only an unactivated invitation can be cancelled.'),{status:409,code:'INVITE_NOT_CANCELLABLE'})
      const reason=requiredReason(reviewNotes),now=new Date().toISOString(),oldOrgId=r.organization_id,oldUserId=r.auth_user_id
      if(oldUserId){const{error}=await admin.auth.admin.deleteUser(oldUserId);if(error&&!/not found/i.test(error.message||''))throw error}
      if(oldOrgId){const{error}=await admin.from('organizations').delete().eq('id',oldOrgId);if(error)throw error}
      const{data,error}=await admin.from('registration_requests').update({status:'invite_cancelled',auth_user_id:null,organization_id:null,branch_id:null,invite_cancelled_at:now,review_notes:reason,updated_at:now}).eq('id',requestId).select('*').single()
      if(error)throw error
      await audit(admin,requestId,user.id,'invite_cancelled',{reason,organizationId:oldOrgId,authUserId:oldUserId})
      return json({success:true,request:data})
    }

    if(action==='set_subscription'){
      if(!r.organization_id)throw Object.assign(new Error('Approve the business before assigning a subscription package.'),{status:409,code:'ORGANIZATION_REQUIRED'})
      const subscription=await applySubscription(admin,r.organization_id,b.subscriptionPlan,b.ultraStationLimit,r.expected_station_count)
      if(r.auth_user_id)await admin.auth.admin.updateUserById(r.auth_user_id,{user_metadata:inviteMetadata(r,{plan:String(subscription.plan),maxStations:Number(subscription.max_stations)})})
      await audit(admin,requestId,user.id,'subscription_package_changed',{plan:subscription.plan,maxStations:subscription.max_stations,stationCount:subscription.station_count})
      return json({success:true,subscription})
    }

    if(['grace_period','suspend','reactivate','terminate','delete_owner','purge_business'].includes(action)){
      if(!r.organization_id)throw Object.assign(new Error('This registration has no provisioned business.'),{status:409,code:'ORGANIZATION_REQUIRED'})
      const org:any=await lifecycle(admin,r.organization_id)
      if(!org)throw Object.assign(new Error('Business organization not found.'),{status:404,code:'ORGANIZATION_NOT_FOUND'})
      const now=new Date().toISOString()

      if(action==='grace_period'){
        const reason=requiredReason(reviewNotes),days=Math.min(30,Math.max(1,Number(b.graceDays)||7)),graceUntil=addDays(now,days)
        if(org.lifecycle_status==='terminated')throw Object.assign(new Error('A terminated business cannot enter grace period.'),{status:409,code:'BUSINESS_TERMINATED'})
        const{error}=await admin.from('organizations').update({lifecycle_status:'grace_period',lifecycle_reason:reason,lifecycle_updated_by:user.id,lifecycle_updated_at:now,suspended_at:null,terminated_at:null}).eq('id',org.id);if(error)throw error
        const{error:subError}=await admin.from('subscriptions').update({status:'grace_period',grace_until:graceUntil,updated_at:now}).eq('organization_id',org.id);if(subError)throw subError
        await audit(admin,requestId,user.id,'business_grace_period',{reason,graceUntil,days})
        return json({success:true,status:'grace_period',graceUntil})
      }

      if(action==='suspend'){
        const reason=requiredReason(reviewNotes)
        if(org.lifecycle_status==='terminated')throw Object.assign(new Error('A terminated business cannot be suspended.'),{status:409,code:'BUSINESS_TERMINATED'})
        const{error}=await admin.from('organizations').update({lifecycle_status:'suspended',lifecycle_reason:reason,lifecycle_updated_by:user.id,lifecycle_updated_at:now,suspended_at:now,terminated_at:null}).eq('id',org.id);if(error)throw error
        const{error:subError}=await admin.from('subscriptions').update({status:'suspended',updated_at:now}).eq('organization_id',org.id);if(subError)throw subError
        await audit(admin,requestId,user.id,'business_suspended',{reason,localEdgeUnaffected:true})
        return json({success:true,status:'suspended'})
      }

      if(action==='reactivate'){
        if(!['suspended','grace_period'].includes(org.lifecycle_status))throw Object.assign(new Error('Only a suspended or grace-period business can be reactivated.'),{status:409,code:'BUSINESS_NOT_SUSPENDED'})
        const reason=note(reviewNotes)
        const{error}=await admin.from('organizations').update({lifecycle_status:'active',lifecycle_reason:null,lifecycle_updated_by:user.id,lifecycle_updated_at:now,suspended_at:null,terminated_at:null}).eq('id',org.id);if(error)throw error
        const{error:subError}=await admin.from('subscriptions').update({status:'active',grace_until:null,updated_at:now}).eq('organization_id',org.id);if(subError)throw subError
        await audit(admin,requestId,user.id,'business_reactivated',reason?{reason}:{})
        return json({success:true,status:'active'})
      }

      if(action==='terminate'){
        const reason=requiredReason(reviewNotes)
        if(org.lifecycle_status==='terminated')return json({success:true,status:'terminated',alreadyTerminated:true})
        const{error}=await admin.from('organizations').update({lifecycle_status:'terminated',lifecycle_reason:reason,lifecycle_updated_by:user.id,lifecycle_updated_at:now,terminated_at:now}).eq('id',org.id);if(error)throw error
        const{error:subError}=await admin.from('subscriptions').update({status:'terminated',updated_at:now}).eq('organization_id',org.id);if(subError)throw subError
        await admin.from('edge_pairing_codes').update({expires_at:now}).eq('organization_id',org.id).is('used_at',null)
        await admin.from('edge_servers').update({revoked_at:now,updated_at:now}).eq('organization_id',org.id).is('revoked_at',null)
        await admin.from('cloud_commands').update({status:'expired',completed_at:now,result:{code:'BUSINESS_TERMINATED',error:'Cloud command cancelled because the business was terminated.'}}).eq('organization_id',org.id).in('status',['queued','dispatched','running'])
        await audit(admin,requestId,user.id,'business_terminated',{reason,cloudEdgesRevoked:true,localOperationUnaffected:true})
        return json({success:true,status:'terminated',purgeEligibleAt:addDays(now,30)})
      }

      if(action==='delete_owner'){
        const reason=requiredReason(reviewNotes)
        if(org.lifecycle_status!=='terminated')throw Object.assign(new Error('Terminate the business before deleting the owner login.'),{status:409,code:'TERMINATION_REQUIRED'})
        if(!r.auth_user_id)return json({success:true,ownerDeleted:true,alreadyDeleted:true})
        const oldUserId=r.auth_user_id
        const{error}=await admin.auth.admin.deleteUser(oldUserId);if(error&&!/not found/i.test(error.message||''))throw error
        const{error:updateError}=await admin.from('registration_requests').update({owner_deleted_at:now,updated_at:now}).eq('id',requestId);if(updateError)throw updateError
        await audit(admin,requestId,user.id,'owner_login_deleted',{reason,authUserId:oldUserId})
        return json({success:true,ownerDeleted:true})
      }

      if(action==='purge_business'){
        const reason=requiredReason(reviewNotes),confirmName=String(b.confirmBusinessName||'').trim()
        if(org.lifecycle_status!=='terminated'||!org.terminated_at)throw Object.assign(new Error('Terminate the business before permanent deletion.'),{status:409,code:'TERMINATION_REQUIRED'})
        const eligibleAt=new Date(addDays(org.terminated_at,30))
        if(Date.now()<eligibleAt.getTime())throw Object.assign(new Error(`Permanent deletion is available after ${eligibleAt.toLocaleString('en-US',{timeZone:'UTC'})} UTC.`),{status:409,code:'RETENTION_PERIOD'})
        if(confirmName!==r.business_name)throw Object.assign(new Error('Type the exact business name to confirm permanent deletion.'),{status:400,code:'CONFIRMATION_MISMATCH'})
        const oldUserId=r.auth_user_id
        if(oldUserId){const{error}=await admin.auth.admin.deleteUser(oldUserId);if(error&&!/not found/i.test(error.message||''))throw error}
        const{error:deleteError}=await admin.from('organizations').delete().eq('id',org.id);if(deleteError)throw deleteError
        const{error:updateError}=await admin.from('registration_requests').update({auth_user_id:null,organization_id:null,branch_id:null,owner_deleted_at:r.owner_deleted_at||now,purged_at:now,updated_at:now}).eq('id',requestId);if(updateError)throw updateError
        await audit(admin,requestId,user.id,'business_data_purged',{reason,businessName:r.business_name})
        return json({success:true,purged:true})
      }
    }

    throw Object.assign(new Error('Unsupported developer action.'),{status:400,code:'INVALID_ACTION'})
  }catch(error){console.error('developer-registrations',error);return fail(error,'Unable to process registration request.')}
})
