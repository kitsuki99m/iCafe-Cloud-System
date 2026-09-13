import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders={
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':'POST,OPTIONS',
}
function preflight(req:Request){if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});return null}
function json(value:unknown,status=200){return new Response(JSON.stringify(value),{status,headers:{...corsHeaders,'Content-Type':'application/json'}})}
function fail(error:any,fallback='Request failed.'){const status=Number(error?.status||500);return json({success:false,code:error?.code||'SERVER_ERROR',error:status>=500?fallback:(error?.message||fallback)},status)}
async function sha256(value:string){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('')}
function token(bytes=32){const v=new Uint8Array(bytes);crypto.getRandomValues(v);return btoa(String.fromCharCode(...v)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function namedKey(envName:string){const raw=Deno.env.get(envName)||'';if(!raw)return'';try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object')return String(parsed.default||Object.values(parsed)[0]||'')}catch{}return''}
function projectUrl(){const v=Deno.env.get('SUPABASE_URL')||'';if(!v)throw Object.assign(new Error('SUPABASE_URL unavailable.'),{status:500});return v.replace(/\/+$/,'')}
function secretKey(){const v=Deno.env.get('SUPABASE_SECRET_KEY')||namedKey('SUPABASE_SECRET_KEYS')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';if(!v)throw Object.assign(new Error('Supabase privileged key is unavailable.'),{status:500});return v}
function adminClient(){return createClient(projectUrl(),secretKey(),{auth:{persistSession:false,autoRefreshToken:false}})}

Deno.serve(async req=>{
  const pre=preflight(req);if(pre)return pre
  try{
    const admin=adminClient()
    const body=await req.json().catch(()=>({}))
    const pairingCode=String(body.pairingCode||'').trim().toUpperCase()
    const installationId=String(body.installationId||'').trim()

    // The pairing code is already created by an authenticated organization
    // owner/admin/manager and is scoped to exactly one branch + logical PC.
    // Requiring the owner email to be retyped on the kiosk adds no security and
    // caused otherwise-valid business pairing codes to fail on simple mismatch.
    if(!pairingCode||!installationId){
      return json({success:false,code:'PAIRING_FIELDS_REQUIRED',error:'Pairing code and station installation ID are required.'},400)
    }
    if(!/^[A-Fa-f0-9-]{36}$/.test(installationId)){
      return json({success:false,code:'INSTALLATION_ID_INVALID',error:'Station installation identity is invalid.'},400)
    }

    const hash=await sha256(pairingCode)
    const now=new Date().toISOString()
    const{data:pairing,error:pairError}=await admin.from('station_pairing_codes').select('*').eq('code_hash',hash).is('used_at',null).gt('expires_at',now).maybeSingle()
    if(pairError)throw pairError
    if(!pairing)return json({success:false,code:'PAIRING_EXPIRED',error:'Station pairing code is invalid or expired.'},409)

    const{data:org,error:orgError}=await admin.from('organizations').select('name,lifecycle_status').eq('id',pairing.organization_id).maybeSingle()
    if(orgError)throw orgError
    if(!org||!['active','grace_period'].includes(String(org.lifecycle_status||'active'))){
      return json({success:false,code:org?.lifecycle_status==='terminated'?'BUSINESS_TERMINATED':'BUSINESS_SUSPENDED',error:org?.lifecycle_status==='terminated'?'This business has been terminated.':'Cloud access for this business is suspended.'},403)
    }

    const{data:branch,error:branchError}=await admin.from('branches').select('name').eq('id',pairing.branch_id).maybeSingle()
    if(branchError)throw branchError
    const{data:station,error:stationError}=await admin.from('branch_stations').select('local_id,label,pc_number,station_device_id,status').eq('branch_id',pairing.branch_id).eq('local_id',pairing.local_station_id).maybeSingle()
    if(stationError)throw stationError
    if(!station)return json({success:false,code:'STATION_NOT_FOUND',error:'The PC assigned to this pairing code no longer exists.'},404)
    if(station.station_device_id){
      const linked=await admin.from('station_devices').select('id,revoked_at').eq('id',station.station_device_id).maybeSingle()
      if(linked.error)throw linked.error
      if(linked.data&&!linked.data.revoked_at)return json({success:false,code:'STATION_ALREADY_PAIRED',error:'This PC is already paired to another Customer Station installation.'},409)
      // Heal a stale branch pointer left by an interrupted/reset pairing.
      const healed=await admin.from('branch_stations').update({station_device_id:null,cloud_connection_status:'unpaired',cloud_last_seen_at:null,updated_at:now}).eq('branch_id',pairing.branch_id).eq('local_id',pairing.local_station_id).eq('station_device_id',station.station_device_id)
      if(healed.error)throw healed.error
    }

    // A reset/reinstall may leave a revoked historical station_devices row. The
    // active-only uniqueness migration permits a fresh installation to claim the
    // same logical PC while retaining that revoked row for audit/history.
    const activeForStation=await admin.from('station_devices').select('id').eq('branch_id',pairing.branch_id).eq('local_station_id',pairing.local_station_id).is('revoked_at',null).maybeSingle()
    if(activeForStation.error)throw activeForStation.error
    if(activeForStation.data)return json({success:false,code:'STATION_ALREADY_PAIRED',error:'This PC is already paired to another Customer Station installation. Reset its pairing first.'},409)

    const rawToken=token(32)
    const tokenHash=await sha256(rawToken)
    const topicKey=token(24)
    const stationName=String(station.label||station.pc_number||'Customer Station').slice(0,120)
    let device:any=null

    const existing=await admin.from('station_devices').select('id,revoked_at').eq('installation_id',installationId).maybeSingle()
    if(existing.error)throw existing.error
    if(existing.data){
      if(!existing.data.revoked_at){
        return json({success:false,code:'INSTALLATION_ALREADY_PAIRED',error:'This Customer Station installation is already paired. Reset its Cloud pairing before pairing again.'},409)
      }
      const updated=await admin.from('station_devices').update({
        organization_id:pairing.organization_id,
        branch_id:pairing.branch_id,
        local_station_id:pairing.local_station_id,
        station_name:stationName,
        device_token_hash:tokenHash,
        realtime_topic_key:topicKey,
        status:'paired',
        cloud_last_seen_at:null,
        revoked_at:null,
        updated_at:now,
      }).eq('id',existing.data.id).select('id').single()
      if(updated.error)throw updated.error
      device=updated.data
    }else{
      const inserted=await admin.from('station_devices').insert({
        organization_id:pairing.organization_id,
        branch_id:pairing.branch_id,
        local_station_id:pairing.local_station_id,
        installation_id:installationId,
        station_name:stationName,
        device_token_hash:tokenHash,
        realtime_topic_key:topicKey,
        status:'paired',
        cloud_last_seen_at:null,
      }).select('id').single()
      if(inserted.error)throw inserted.error
      device=inserted.data
    }

    const claimed=await admin.from('station_pairing_codes').update({used_at:now,used_by_station_device_id:device.id}).eq('id',pairing.id).is('used_at',null).select('id').maybeSingle()
    if(claimed.error)throw claimed.error
    if(!claimed.data){
      await admin.from('station_devices').update({status:'revoked',revoked_at:now,updated_at:now}).eq('id',device.id)
      return json({success:false,code:'PAIRING_USED',error:'Station pairing code was already used.'},409)
    }

    const persistedStatus=String(station.status||'offline').toLowerCase()
    const stationPatch=await admin.from('branch_stations').update({station_device_id:device.id,cloud_connection_status:'paired',cloud_last_seen_at:null,status:['maintenance','reserved'].includes(persistedStatus)?persistedStatus:'offline',updated_at:now}).eq('branch_id',pairing.branch_id).eq('local_id',pairing.local_station_id)
    if(stationPatch.error)throw stationPatch.error

    return json({
      success:true,
      stationId:device.id,
      stationToken:rawToken,
      realtimeTopicKey:topicKey,
      organizationId:pairing.organization_id,
      organizationName:org.name,
      branchId:pairing.branch_id,
      branchName:branch?.name||'Main Branch',
      localStationId:pairing.local_station_id,
      stationName,
      ownerEmail:pairing.owner_email||null,
      pairedAt:now,
    },201)
  }catch(e){
    return fail(e,'Unable to pair Customer Station.')
  }
})
