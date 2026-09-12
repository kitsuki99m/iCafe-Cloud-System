import { createClient,type SupabaseClient } from 'npm:@supabase/supabase-js@2'

function namedKey(envName:string){
  const raw=Deno.env.get(envName)||''
  if(!raw)return''
  try{
    const parsed=JSON.parse(raw)
    if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')
  }catch{}
  return''
}

export function projectUrl(){
  const value=Deno.env.get('SUPABASE_URL')||''
  if(!value)throw Object.assign(new Error('SUPABASE_URL unavailable.'),{status:500})
  return value.replace(/\/+$/,'')
}

export function publishableKey(){
  return Deno.env.get('SUPABASE_PUBLISHABLE_KEY')||namedKey('SUPABASE_PUBLISHABLE_KEYS')||Deno.env.get('SUPABASE_ANON_KEY')||''
}

export function secretKey(){
  const value=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||''
  if(!value)throw Object.assign(new Error('Supabase privileged key is unavailable in this Edge Function.'),{status:500})
  return value
}

export function adminClient():SupabaseClient{
  return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})
}

export async function userClient(req:Request){
  const authorization=req.headers.get('authorization')||''
  if(!authorization.startsWith('Bearer '))throw Object.assign(new Error('Sign in first.'),{status:401,code:'AUTH_REQUIRED'})
  const key=publishableKey()
  if(!key)throw Object.assign(new Error('Supabase publishable key is unavailable in this Edge Function.'),{status:500})
  const client=createClient(projectUrl(),key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}})
  const {data,error}=await client.auth.getUser()
  if(error||!data.user)throw Object.assign(new Error('Cloud session invalid.'),{status:401,code:'AUTH_INVALID'})
  return{client,user:data.user}
}

export async function requireMembership(admin:SupabaseClient,userId:string,organizationId:string,roles:string[]=[]){
  const{data,error}=await admin.from('organization_members').select('role').eq('organization_id',organizationId).eq('user_id',userId).maybeSingle()
  if(error)throw error
  if(!data||(roles.length&&!roles.includes(data.role)))throw Object.assign(new Error('Forbidden.'),{status:403,code:'FORBIDDEN'})
  return data
}
