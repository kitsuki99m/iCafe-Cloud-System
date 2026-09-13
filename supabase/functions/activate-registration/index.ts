import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST,OPTIONS'}
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function fail(error:any,fallback='Request failed.'){const status=Number(error?.status||500);return json({success:false,code:error?.code||'SERVER_ERROR',error:status>=500?fallback:(error?.message||fallback)},status)}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const value=Deno.env.get('SUPABASE_URL')||'';if(!value)throw Object.assign(new Error('SUPABASE_URL unavailable.'),{status:500});return value.replace(/\/+$/,'')}
function publishableKey(){return Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||namedKey('SUPABASE_PUBLISHABLE_KEYS')||Deno.env.get('SUPABASE_ANON_KEY')||''}
function secretKey(){const value=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!value)throw Object.assign(new Error('Supabase privileged key unavailable.'),{status:500});return value}
function adminClient():SupabaseClient{return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}
async function authenticatedUser(req:Request){const authorization=req.headers.get('authorization')||'';if(!authorization.startsWith('Bearer '))throw Object.assign(new Error('Sign in first.'),{status:401,code:'AUTH_REQUIRED'});const key=publishableKey();if(!key)throw Object.assign(new Error('Supabase publishable key unavailable.'),{status:500});const client=createClient(projectUrl(),key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});const{data,error}=await client.auth.getUser();if(error||!data.user)throw Object.assign(new Error('Cloud session invalid.'),{status:401,code:'AUTH_INVALID'});return data.user}

Deno.serve(async req=>{
  const o=preflight(req);if(o)return o
  if(req.method!=='POST')return json({success:false,error:'Method not allowed.'},405)
  try{
    const user=await authenticatedUser(req),admin=adminClient(),now=new Date().toISOString()
    const{data:r,error}=await admin.from('registration_requests').select('id,status,organization_id,branch_id,activated_at').eq('auth_user_id',user.id).maybeSingle()
    if(error)throw error
    if(!r)throw Object.assign(new Error('No approved business invitation is linked to this account.'),{status:403,code:'APPROVAL_REQUIRED'})
    if(!r.organization_id||!r.branch_id)throw Object.assign(new Error('Business provisioning is incomplete. Contact Aezakmi support.'),{status:409,code:'PROVISIONING_INCOMPLETE'})
    if(r.status!=='activated'){
      const{error:updateError}=await admin.from('registration_requests').update({status:'activated',activated_at:now,updated_at:now}).eq('id',r.id)
      if(updateError)throw updateError
      await admin.from('registration_audit_logs').insert({registration_request_id:r.id,actor_user_id:user.id,action:'activated',details:{organizationId:r.organization_id,branchId:r.branch_id}})
    }
    return json({success:true,organizationId:r.organization_id,branchId:r.branch_id,activatedAt:r.activated_at||now})
  }catch(error){return fail(error,'Unable to activate the approved business account.')}
})
