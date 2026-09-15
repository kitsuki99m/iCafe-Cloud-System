import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { enforceRateLimit, reportCloudError, requestIp, sha256Text } from '../_shared/security.ts'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200,extra:Record<string,string>={}){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json',...extra}})}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const value=Deno.env.get('SUPABASE_URL')||'';if(!value)throw new Error('SUPABASE_URL unavailable.');return value.replace(/\/+$/,'')}
function secretKey(){const value=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!value)throw new Error('Supabase privileged key unavailable.');return value}
function adminClient():SupabaseClient{return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}
function clean(value:unknown,max:number){return String(value||'').trim().slice(0,max)}
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}
function captchaCode(){const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);return String(bytes[0]%1_000_000).padStart(6,'0')}

async function issueCaptcha(req:Request,admin:SupabaseClient){
  const ip=requestIp(req)
  await enforceRateLimit(admin,'registration_captcha',ip,20,600)
  const code=captchaCode(),expiresAt=new Date(Date.now()+10*60_000).toISOString(),requesterHash=await sha256Text(`registration:${ip}`)
  const{data,error}=await admin.from('registration_captcha_challenges').insert({code_hash:await sha256Text(code),requester_hash:requesterHash,expires_at:expiresAt}).select('id').single()
  if(error)throw error
  return json({success:true,captchaChallengeId:data.id,captchaCode:code,expiresAt})
}

async function verifyCaptcha(req:Request,admin:SupabaseClient,body:any){
  const id=clean(body.captchaChallengeId,80),answer=clean(body.captchaAnswer,12)
  if(!id||!/^[0-9]{6}$/.test(answer))throw Object.assign(new Error('Enter the 6-digit verification code.'),{status:400,code:'CAPTCHA_REQUIRED',exposeMessage:true})
  const{data:challenge,error}=await admin.from('registration_captcha_challenges').select('*').eq('id',id).maybeSingle()
  if(error)throw error
  if(!challenge||challenge.consumed_at||new Date(challenge.expires_at).getTime()<=Date.now())throw Object.assign(new Error('Verification code expired. Generate a new one.'),{status:409,code:'CAPTCHA_EXPIRED',exposeMessage:true})
  const requesterHash=await sha256Text(`registration:${requestIp(req)}`)
  if(String(challenge.requester_hash)!==requesterHash)throw Object.assign(new Error('Verification code is no longer valid. Generate a new one.'),{status:409,code:'CAPTCHA_INVALID',exposeMessage:true})
  const attempts=Number(challenge.attempts||0)+1
  const valid=(await sha256Text(answer))===String(challenge.code_hash)
  const patch:any={attempts}
  if(valid)patch.consumed_at=new Date().toISOString()
  await admin.from('registration_captcha_challenges').update(patch).eq('id',id).is('consumed_at',null)
  if(!valid){
    if(attempts>=5)await admin.from('registration_captcha_challenges').update({consumed_at:new Date().toISOString()}).eq('id',id).is('consumed_at',null)
    throw Object.assign(new Error(attempts>=5?'Too many incorrect codes. Generate a new one.':'Verification code does not match.'),{status:400,code:attempts>=5?'CAPTCHA_EXHAUSTED':'CAPTCHA_INVALID',exposeMessage:true})
  }
}

Deno.serve(async req=>{
  const o=preflight(req);if(o)return o
  if(req.method!=='POST')return json({success:false,error:'Method not allowed.'},405)
  let admin:SupabaseClient|null=null
  try{
    const b=await req.json().catch(()=>({}))
    admin=adminClient()
    if(String(b.action||'').toLowerCase()==='captcha')return await issueCaptcha(req,admin)

    // Honeypot: bots that populate hidden fields receive a generic success response.
    if(clean(b.website,200))return json({success:true,message:'Application received.'},202)

    const email=clean(b.email,254).toLowerCase(),ownerName=clean(b.ownerName,120),businessName=clean(b.businessName,160)
    const phone=clean(b.phone,40)||null,location=clean(b.location,160)||null,note=clean(b.note,1000)||null
    const stationCount=Math.max(1,Math.min(10000,Math.trunc(Number(b.expectedStationCount)||1)))
    if(!validEmail(email)||ownerName.length<2||businessName.length<2)return json({success:false,code:'INVALID_APPLICATION',error:'Enter a valid email, owner name, and business name.'},400)

    const ip=requestIp(req)
    await enforceRateLimit(admin,'registration_submit_ip',ip,5,3600)
    await enforceRateLimit(admin,'registration_submit_email',email,3,3600)
    await verifyCaptcha(req,admin,b)

    const now=new Date().toISOString()
    const{data:existing,error:existingError}=await admin.from('registration_requests').select('id,status,updated_at').eq('email',email).maybeSingle()
    if(existingError)throw existingError
    if(existing){
      if(existing.status==='rejected'){
        const last=existing.updated_at?new Date(existing.updated_at).getTime():0
        if(Date.now()-last>60*60*1000){
          const{error}=await admin.from('registration_requests').update({owner_name:ownerName,business_name:businessName,phone,location,expected_station_count:stationCount,note,status:'pending',review_notes:null,reviewed_by:null,reviewed_at:null,updated_at:now}).eq('id',existing.id)
          if(error)throw error
          await admin.from('registration_audit_logs').insert({registration_request_id:existing.id,action:'reapplied',details:{source:'public_request'}})
        }
      }
      return json({success:true,message:'Application received.'},202)
    }

    const{data:created,error}=await admin.from('registration_requests').insert({email,owner_name:ownerName,business_name:businessName,phone,location,expected_station_count:stationCount,note,status:'pending',updated_at:now}).select('id').single()
    if(error)throw error
    await admin.from('registration_audit_logs').insert({registration_request_id:created.id,action:'submitted',details:{source:'public_request'}})
    return json({success:true,message:'Application received.'},202)
  }catch(error:any){
    if(admin)await reportCloudError(admin,'request-business-access',error,{path:'/request-business-access'})
    if(Number(error?.status||0)===429)return json({success:false,code:error.code||'RATE_LIMITED',error:error.message,retryAfterSeconds:error.retryAfterSeconds||null},429,error.retryAfterSeconds?{'Retry-After':String(error.retryAfterSeconds)}:{})
    if(Number(error?.status||0)>=400&&Number(error?.status||0)<500)return json({success:false,code:error.code||'REQUEST_FAILED',error:error.message||'Unable to submit the application.'},Number(error.status))
    console.error('request-business-access',error)
    return json({success:false,code:'REQUEST_FAILED',error:'Unable to submit the application right now.'},500)
  }
})
