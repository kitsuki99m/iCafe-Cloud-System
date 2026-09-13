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
async function requireDeveloper(admin:SupabaseClient,userId:string){const{data,error}=await admin.from('platform_developers').select('user_id,email,is_active').eq('user_id',userId).eq('is_active',true).maybeSingle();if(error)throw error;if(!data)throw Object.assign(new Error('Developer approval required.'),{status:403,code:'DEVELOPER_REQUIRED'});return data}
function note(value:unknown){return String(value||'').trim().slice(0,2000)||null}

Deno.serve(async req=>{
  const o=preflight(req);if(o)return o
  if(req.method!=='POST')return json({success:false,error:'Method not allowed.'},405)
  try{
    const user=await authenticatedUser(req),admin=adminClient();await requireDeveloper(admin,user.id)
    const b=await req.json().catch(()=>({})),action=String(b.action||'list'),requestId=String(b.requestId||''),reviewNotes=note(b.reviewNotes)

    if(action==='list'){
      const{data,error}=await admin.from('registration_requests').select('id,email,owner_name,business_name,phone,location,expected_station_count,note,status,review_notes,reviewed_by,reviewed_at,auth_user_id,organization_id,branch_id,invite_sent_at,activated_at,created_at,updated_at').order('created_at',{ascending:false}).limit(500)
      if(error)throw error
      return json({success:true,requests:data||[]})
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
      await admin.from('registration_audit_logs').insert({registration_request_id:requestId,actor_user_id:user.id,action:next,details:reviewNotes?{reviewNotes}:{}})
      return json({success:true,request:data})
    }

    if(action==='approve'){
      if(r.status==='activated'||r.status==='invited')return json({success:true,request:r,alreadyApproved:true})
      if(r.status==='rejected')throw Object.assign(new Error('Reopen the application before approving it.'),{status:409,code:'REGISTRATION_REJECTED'})
      let authUserId=r.auth_user_id as string|null
      if(!authUserId){
        const redirectTo=String(Deno.env.get('AEZAKMI_ADMIN_URL')||'').trim()
        const options:any={data:{name:r.owner_name,business_name:r.business_name,aezakmi_registration_id:r.id}}
        if(redirectTo)options.redirectTo=redirectTo
        const{data:invite,error:inviteError}=await admin.auth.admin.inviteUserByEmail(r.email,options)
        if(inviteError)throw Object.assign(new Error(inviteError.message||'Unable to send invitation.'),{status:409,code:'INVITE_FAILED'})
        authUserId=invite.user?.id||null
        if(!authUserId)throw Object.assign(new Error('Supabase did not return the invited user.'),{status:500,code:'INVITE_USER_MISSING'})
        const{error:markError}=await admin.from('registration_requests').update({status:'approved',auth_user_id:authUserId,reviewed_by:user.id,reviewed_at:new Date().toISOString(),review_notes:reviewNotes,invite_sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',requestId)
        if(markError)throw markError
      }
      const{data:finalized,error:finalizeError}=await admin.rpc('aezakmi_finalize_registration_approval',{p_request_id:requestId,p_auth_user_id:authUserId,p_reviewer_id:user.id,p_review_notes:reviewNotes})
      if(finalizeError)throw finalizeError
      const tenant=Array.isArray(finalized)?finalized[0]:finalized
      const{data:updated}=await admin.from('registration_requests').select('*').eq('id',requestId).single()
      return json({success:true,request:updated,tenant})
    }

    throw Object.assign(new Error('Unsupported developer action.'),{status:400,code:'INVALID_ACTION'})
  }catch(error){console.error('developer-registrations',error);return fail(error,'Unable to process registration request.')}
})
