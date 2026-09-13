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
function requiredReason(value:unknown){const valueText=note(value);if(!valueText)throw Object.assign(new Error('Enter a reason for this developer action.'),{status:400,code:'REASON_REQUIRED'});return valueText}
function addDays(iso:string|Date,days:number){const d=new Date(iso);d.setUTCDate(d.getUTCDate()+days);return d.toISOString()}
async function audit(admin:SupabaseClient,requestId:string,actor:string,action:string,details:Record<string,unknown>={}){const{error}=await admin.from('registration_audit_logs').insert({registration_request_id:requestId,actor_user_id:actor,action,details});if(error)throw error}
async function activationLink(admin:SupabaseClient,email:string){
  const base=String(Deno.env.get('AEZAKMI_ADMIN_URL')||'').trim().replace(/\/+$/,'')
  const redirectTo=base?`${base}?aezakmi=activate`:undefined
  const params:any={type:'recovery',email}
  if(redirectTo)params.options={redirectTo}
  const{data,error}=await admin.auth.admin.generateLink(params)
  if(error)throw Object.assign(new Error(error.message||'Unable to generate activation link.'),{status:409,code:'ACTIVATION_LINK_FAILED'})
  const props:any=(data as any)?.properties||{}
  return String(props.action_link||props.actionLink||'')||null
}
async function maybeActivationLink(admin:SupabaseClient,email:string){try{return await activationLink(admin,email)}catch{return null}}
async function lifecycle(admin:SupabaseClient,organizationId:string){const{data,error}=await admin.from('organizations').select('id,name,lifecycle_status,lifecycle_reason,lifecycle_updated_at,suspended_at,terminated_at').eq('id',organizationId).maybeSingle();if(error)throw error;return data}

Deno.serve(async req=>{
  const o=preflight(req);if(o)return o
  if(req.method!=='POST')return json({success:false,error:'Method not allowed.'},405)
  try{
    const user=await authenticatedUser(req),admin=adminClient();await requireDeveloper(admin,user.id)
    const b=await req.json().catch(()=>({})),action=String(b.action||'list'),requestId=String(b.requestId||''),reviewNotes=note(b.reviewNotes)

    if(action==='list'){
      const{data:requests,error}=await admin.from('registration_requests').select('id,email,owner_name,business_name,phone,location,expected_station_count,note,status,review_notes,reviewed_by,reviewed_at,auth_user_id,organization_id,branch_id,invite_sent_at,invite_cancelled_at,activated_at,owner_deleted_at,purged_at,created_at,updated_at').order('created_at',{ascending:false}).limit(500)
      if(error)throw error
      const orgIds=[...new Set((requests||[]).map((r:any)=>r.organization_id).filter(Boolean))] as string[]
      let orgs:any[]=[];let subs:any[]=[]
      if(orgIds.length){
        const[orgResult,subResult]=await Promise.all([
          admin.from('organizations').select('id,name,lifecycle_status,lifecycle_reason,lifecycle_updated_at,suspended_at,terminated_at').in('id',orgIds),
          admin.from('subscriptions').select('organization_id,plan,status,trial_ends_at,grace_until,current_period_end').in('organization_id',orgIds),
        ])
        if(orgResult.error)throw orgResult.error;if(subResult.error)throw subResult.error
        orgs=orgResult.data||[];subs=subResult.data||[]
      }
      const orgMap=new Map(orgs.map((x:any)=>[x.id,x])),subMap=new Map(subs.map((x:any)=>[x.organization_id,x]))
      const merged=(requests||[]).map((r:any)=>{const org:any=r.organization_id?orgMap.get(r.organization_id):null,sub:any=r.organization_id?subMap.get(r.organization_id):null;return{...r,organization_status:org?.lifecycle_status||null,organization_reason:org?.lifecycle_reason||null,lifecycle_updated_at:org?.lifecycle_updated_at||null,suspended_at:org?.suspended_at||null,terminated_at:org?.terminated_at||null,subscription_plan:sub?.plan||null,subscription_status:sub?.status||null,grace_until:sub?.grace_until||null,current_period_end:sub?.current_period_end||null,purge_eligible_at:org?.terminated_at?addDays(org.terminated_at,30):null}})
      return json({success:true,requests:merged})
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

    if(action==='approve'){
      if(r.status==='activated')return json({success:true,request:r,alreadyApproved:true})
      if(r.status==='invited')return json({success:true,request:r,alreadyApproved:true,activationLink:await maybeActivationLink(admin,r.email)})
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
        const{error:markError}=await admin.from('registration_requests').update({status:'approved',auth_user_id:authUserId,reviewed_by:user.id,reviewed_at:new Date().toISOString(),review_notes:reviewNotes,invite_sent_at:new Date().toISOString(),invite_cancelled_at:null,owner_deleted_at:null,updated_at:new Date().toISOString()}).eq('id',requestId)
        if(markError)throw markError
      }
      const{data:finalized,error:finalizeError}=await admin.rpc('aezakmi_finalize_registration_approval',{p_request_id:requestId,p_auth_user_id:authUserId,p_reviewer_id:user.id,p_review_notes:reviewNotes})
      if(finalizeError)throw finalizeError
      const tenant=Array.isArray(finalized)?finalized[0]:finalized
      const{data:updated}=await admin.from('registration_requests').select('*').eq('id',requestId).single()
      return json({success:true,request:updated,tenant,activationLink:await maybeActivationLink(admin,r.email)})
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
