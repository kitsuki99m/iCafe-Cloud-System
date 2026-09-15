import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export async function sha256Text(value:string){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(String(value||'')))
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')
}

export function requestIp(req:Request){
  const forwarded=String(req.headers.get('x-forwarded-for')||'').split(',')[0]?.trim()
  return forwarded || String(req.headers.get('cf-connecting-ip')||req.headers.get('x-real-ip')||'unknown').trim() || 'unknown'
}

export async function enforceRateLimit(admin:SupabaseClient,scope:string,key:string,limit:number,windowSeconds:number){
  const keyHash=await sha256Text(`${scope}:${key}`)
  const{data,error}=await admin.rpc('aezakmi_check_rate_limit',{p_scope:scope,p_key_hash:keyHash,p_limit:limit,p_window_seconds:windowSeconds})
  if(error)throw error
  const result:any=(data&&typeof data==='object')?data:{}
  if(result.allowed===false){
    const retryAfterSeconds=Math.max(1,Number(result.retryAfterSeconds||windowSeconds)||windowSeconds)
    throw Object.assign(new Error(`Too many attempts. Try again in ${Math.ceil(retryAfterSeconds/60)} minute${retryAfterSeconds>60?'s':''}.`),{status:429,code:'RATE_LIMITED',retryAfterSeconds,exposeMessage:true})
  }
  return result
}

function redactContext(value:any):any{
  if(!value||typeof value!=='object')return value
  const out:any=Array.isArray(value)?[]:{}
  for(const[key,item]of Object.entries(value)){
    if(/password|secret|token|authorization|cookie|pin|api[_-]?key/i.test(key))out[key]='[REDACTED]'
    else out[key]=item&&typeof item==='object'?redactContext(item):item
  }
  return out
}
function safeContext(value:any){
  try{
    const text=JSON.stringify(redactContext(value??{}))
    if(text.length<=4000)return JSON.parse(text)
    return {truncated:true,preview:text.slice(0,3800)}
  }catch{return{}}
}

export async function reportCloudError(admin:SupabaseClient,source:string,error:any,context:any={}){
  try{
    const code=String(error?.code||'UNHANDLED_ERROR').slice(0,120)
    const message=String(error?.message||error||'Unknown error').slice(0,1000)
    const fingerprint=await sha256Text(`${source}|${code}|${message}`)
    await admin.rpc('aezakmi_record_observability_event',{
      p_source:source,
      p_severity:Number(error?.status||500)>=500?'error':'warning',
      p_fingerprint:fingerprint,
      p_code:code,
      p_message:message,
      p_context:safeContext(context),
    })
  }catch{}
}
