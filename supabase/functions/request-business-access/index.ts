import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const value=Deno.env.get('SUPABASE_URL')||'';if(!value)throw new Error('SUPABASE_URL unavailable.');return value.replace(/\/+$/,'')}
function secretKey(){const value=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!value)throw new Error('Supabase privileged key unavailable.');return value}
function adminClient():SupabaseClient{return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}
function clean(value:unknown,max:number){return String(value||'').trim().slice(0,max)}
function validEmail(value:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)}

Deno.serve(async req=>{
  const o=preflight(req);if(o)return o
  if(req.method!=='POST')return json({success:false,error:'Method not allowed.'},405)
  try{
    const b=await req.json().catch(()=>({}))
    // Honeypot: bots that populate hidden fields receive a generic success response.
    if(clean(b.website,200))return json({success:true,message:'Application received.'},202)
    const email=clean(b.email,254).toLowerCase(),ownerName=clean(b.ownerName,120),businessName=clean(b.businessName,160)
    const phone=clean(b.phone,40)||null,location=clean(b.location,160)||null,note=clean(b.note,1000)||null
    const stationCount=Math.max(1,Math.min(10000,Math.trunc(Number(b.expectedStationCount)||1)))
    if(!validEmail(email)||ownerName.length<2||businessName.length<2)return json({success:false,code:'INVALID_APPLICATION',error:'Enter a valid email, owner name, and business name.'},400)

    const admin=adminClient(),now=new Date().toISOString()
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
  }catch(error){console.error('request-business-access',error);return json({success:false,code:'REQUEST_FAILED',error:'Unable to submit the application right now.'},500)}
})
