const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '')
const PUBLISHABLE_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '')
const DEV_CREDENTIAL_KEY = 'aezakmi.cloud.station.credential.v1'
const DEV_INSTALLATION_KEY = 'aezakmi.cloud.station.installation.v1'
let wakeSocket = null
let reconnectTimer = null
let pollTimer = null
let heartbeatTimer = null
let polling = false
let transport = 'cloud'
let usedFallback = false

export function cloudStationFeatureEnabled() { return Boolean(SUPABASE_URL && PUBLISHABLE_KEY) }
export function cloudStationTransport() { return transport }

function emitTransport(next, detail = {}) {
  if (transport === next && !detail.force) return
  transport = next
  if (next === 'fallback') usedFallback = true
  window.dispatchEvent(new CustomEvent('aezakmi:station-transport', { detail:{ mode:next, ...detail } }))
}
export function markCloudStationFallback(reason = 'Cloud unavailable') { emitTransport('fallback', { reason }) }
export function markCloudStationOnline() { const recovered = usedFallback; emitTransport('cloud', { recovered }); if (recovered) usedFallback = false }

function readRawCredential() {
  try { return window.aezakmiClient?.getCloudStationCredential?.() || localStorage.getItem(DEV_CREDENTIAL_KEY) || '' } catch { return '' }
}
export function getCloudStationCredential() {
  const raw = readRawCredential()
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}
async function saveCredential(value) {
  const raw = value ? JSON.stringify(value) : ''
  if (window.aezakmiClient?.setCloudStationCredential) await window.aezakmiClient.setCloudStationCredential(raw)
  else if (raw) localStorage.setItem(DEV_CREDENTIAL_KEY, raw)
  else localStorage.removeItem(DEV_CREDENTIAL_KEY)
}
export async function clearCloudStationCredential() {
  stopCloudStationRuntime()
  if (window.aezakmiClient?.clearCloudStationCredential) await window.aezakmiClient.clearCloudStationCredential()
  else localStorage.removeItem(DEV_CREDENTIAL_KEY)
  window.dispatchEvent(new CustomEvent('aezakmi:cloud-station-unpaired'))
}
export async function unpairCloudStation() {
  if (!cloudStationPaired()) {
    await clearCloudStationCredential()
    return { success:true, alreadyUnpaired:true }
  }
  try {
    const response=await fetch(`${SUPABASE_URL}/functions/v1/station-runtime`,{method:'POST',headers:stationHeaders(),body:JSON.stringify({action:'unpair'})})
    const data=await parse(response)
    await clearCloudStationCredential()
    return data
  } catch (error) {
    // If Cloud already revoked/deleted this device, the local credential is stale
    // and can be safely discarded. Network/server failures keep the credential so
    // we do not create a ghost pairing that cannot revoke itself later.
    if (['STATION_AUTH_INVALID','STATION_AUTH_REQUIRED'].includes(String(error?.code||''))) {
      await clearCloudStationCredential()
      return { success:true, alreadyRevoked:true }
    }
    throw error
  }
}
export function cloudStationPaired() { const c=getCloudStationCredential();return Boolean(c?.stationId&&c?.stationToken&&c?.branchId&&c?.organizationId) }
export function installationId() {
  try { const id=window.aezakmiClient?.getInstallationId?.();if(id)return id } catch {}
  let id=localStorage.getItem(DEV_INSTALLATION_KEY)
  if (!id) { id=crypto.randomUUID();localStorage.setItem(DEV_INSTALLATION_KEY,id) }
  return id
}

async function parse(response) {
  let data=null
  try { data=await response.json() } catch {}
  if (!response.ok) {
    const error=new Error(data?.error||data?.message||`Cloud request failed (${response.status})`)
    error.status=response.status;error.code=data?.code;error.data=data;throw error
  }
  return data
}
function publicHeaders(extra={}) { return { apikey:PUBLISHABLE_KEY, 'Content-Type':'application/json', ...extra } }
function stationHeaders(extra={}) {
  const credential=getCloudStationCredential()
  if (!credential?.stationId || !credential?.stationToken) throw Object.assign(new Error('This PC is not paired to Aezakmi Cloud.'),{status:401,code:'STATION_NOT_PAIRED'})
  return publicHeaders({ 'x-aezakmi-station-id':credential.stationId, 'x-aezakmi-station-token':credential.stationToken, ...extra })
}

export async function pairCloudStation({ pairingCode }) {
  if (!cloudStationFeatureEnabled()) throw Object.assign(new Error('Cloud Station is not configured in this Customer build.'),{code:'CLOUD_CONFIG_MISSING'})
  const response=await fetch(`${SUPABASE_URL}/functions/v1/pair-station`,{method:'POST',headers:publicHeaders(),body:JSON.stringify({pairingCode:String(pairingCode||'').trim(),installationId:installationId()})})
  const data=await parse(response)
  const credential={stationId:data.stationId,stationToken:data.stationToken,realtimeTopicKey:data.realtimeTopicKey,organizationId:data.organizationId,organizationName:data.organizationName,branchId:data.branchId,branchName:data.branchName,localStationId:data.localStationId,stationName:data.stationName,pairedAt:data.pairedAt}
  await saveCredential(credential)
  // Pairing intentionally requires a clean Electron restart. Do not start the
  // runtime heartbeat in the old process, otherwise Cloud Admin can treat this
  // PC as available and start paid time while the restart-required modal still
  // blocks Customer Station. bootstrapStation() starts runtime after relaunch.
  window.dispatchEvent(new CustomEvent('aezakmi:cloud-station-paired',{detail:credential}))
  return credential
}

export async function cloudStationApiFetch(path, { method='GET', body, operationKey=null, localAuthToken='' }={}) {
  try {
    const response=await fetch(`${SUPABASE_URL}/functions/v1/station-api`,{method:'POST',headers:stationHeaders(),body:JSON.stringify({method,path,body:body??{},operationKey:operationKey||null,localAuthToken:localAuthToken||''})})
    const data=await parse(response)
    markCloudStationOnline()
    return data
  } catch (error) {
    if ([401,403].includes(Number(error?.status)) && error?.code==='STATION_AUTH_INVALID') {
      await clearCloudStationCredential()
      window.dispatchEvent(new CustomEvent('aezakmi:cloud-station-invalid',{detail:error.data}))
    }
    throw error
  }
}
export async function cloudStationRuntime(action, payload={}) {
  try {
    const response=await fetch(`${SUPABASE_URL}/functions/v1/station-runtime`,{method:'POST',headers:stationHeaders(),body:JSON.stringify({action,...payload})})
    const data=await parse(response)
    markCloudStationOnline()
    return data
  } catch (error) {
    if ([401,403].includes(Number(error?.status)) && error?.code==='STATION_AUTH_INVALID') {
      await clearCloudStationCredential()
      window.dispatchEvent(new CustomEvent('aezakmi:cloud-station-invalid',{detail:error.data}))
    }
    throw error
  }
}
export async function acknowledgeCloudStationCommand(commandId,status,result={}) { return cloudStationRuntime('ack',{commandId,status,result}) }

async function pollCommands() {
  if (polling || !cloudStationPaired() || transport==='fallback') return
  polling=true
  try {
    const data=await cloudStationRuntime('poll')
    for (const command of data?.commands||[]) window.dispatchEvent(new CustomEvent('aezakmi:cloud-station-command',{detail:{...command,cloudStationCommand:true}}))
  } catch (error) {
    if ([401,403].includes(Number(error?.status)) && error?.code==='STATION_AUTH_INVALID') {
      await clearCloudStationCredential()
      window.dispatchEvent(new CustomEvent('aezakmi:cloud-station-invalid',{detail:error.data}))
    } else {
      markCloudStationFallback(error?.message||'Cloud unavailable')
    }
  } finally { polling=false }
}
async function heartbeat() {
  if (!cloudStationPaired()) return
  try {
    let localIp='',software={}
    try { localIp=String(window.aezakmiClient?.getLocalIPv4?.()||'') } catch {}
    try { software=window.aezakmiClient?.getSoftwareInfo?.()||{} } catch {}
    await cloudStationRuntime('heartbeat',{
      recoveredFromFallback:usedFallback,
      usedFallback,
      localIp,
      softwareVersion:String(software.currentVersion||'').slice(0,64),
    })
    if(transport!=='cloud') { markCloudStationOnline(); connectWakeSocket(); void pollCommands() }
  } catch(error){
    if ([401,403].includes(Number(error?.status)) && error?.code==='STATION_AUTH_INVALID') {
      await clearCloudStationCredential()
      window.dispatchEvent(new CustomEvent('aezakmi:cloud-station-invalid',{detail:error.data}))
    } else {
      markCloudStationFallback(error?.message||'Cloud unavailable')
    }
  }
}
let pingTimer = null

function closeWakeSocket() {
  try { wakeSocket?.close() } catch {}
  wakeSocket = null
  if (reconnectTimer) clearTimeout(reconnectTimer)
  if (pingTimer) clearInterval(pingTimer)
  reconnectTimer = null
  pingTimer = null
}

function connectWakeSocket() {
  closeWakeSocket()
  const credential = getCloudStationCredential()
  if (!cloudStationFeatureEnabled() || !credential?.realtimeTopicKey || transport === 'fallback') return
  const wsUrl = SUPABASE_URL.replace(/^https:/, 'wss:') + `/realtime/v1/websocket?apikey=${encodeURIComponent(PUBLISHABLE_KEY)}&vsn=1.0.0`
  const ws = new WebSocket(wsUrl)
  wakeSocket = ws
  let ref = 1
  const topic = `realtime:station-wakeup:${credential.realtimeTopicKey}`

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ topic, event: 'phx_join', payload: { config: { broadcast: { self: false, ack: false }, presence: { enabled: false }, postgres_changes: [] } }, ref: String(ref++) }))
    void pollCommands()
    if (pingTimer) clearInterval(pingTimer)
    pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(ref++) })) } catch {}
      }
    }, 25000)
  })

  ws.addEventListener('message', (event) => {
    try {
      const msg = JSON.parse(String(event.data || ''))
      if (msg?.event === 'broadcast' || msg?.event === 'station_wakeup' || msg?.event === 'sync' || msg?.event === 'phx_reply') {
        const outer = msg?.payload && typeof msg.payload === 'object' ? msg.payload : {}
        const detail=outer?.payload&&typeof outer.payload==='object'?outer.payload:outer
        window.dispatchEvent(new CustomEvent('aezakmi:cloud-station-wakeup', { detail }))
        void pollCommands()
      }
    } catch {}
  })

  ws.addEventListener('close', () => {
    if (wakeSocket === ws) {
      wakeSocket = null
      if (pingTimer) clearInterval(pingTimer)
      pingTimer = null
      reconnectTimer = setTimeout(connectWakeSocket, 3000)
    }
  })

  ws.addEventListener('error', () => {
    try { ws.close() } catch {}
  })
}
export function startCloudStationRuntime() {
  if (!cloudStationFeatureEnabled() || !cloudStationPaired()) return
  // Realtime wakeups deliver commands immediately. This is only the recovery
  // path for a missed wakeup, kept short enough that a station command never
  // sits queued for minutes after a transient WebSocket reconnect.
  if (!pollTimer) pollTimer=setInterval(()=>void pollCommands(),300000)
  if (!heartbeatTimer) heartbeatTimer=setInterval(()=>void heartbeat(),60000)
  connectWakeSocket();void heartbeat();void pollCommands()
}
export function resumeCloudStationRuntime() { transport='cloud';startCloudStationRuntime() }
export function stopCloudStationRuntime() { closeWakeSocket();if(pollTimer)clearInterval(pollTimer);if(heartbeatTimer)clearInterval(heartbeatTimer);pollTimer=null;heartbeatTimer=null;polling=false }
export function setFallbackTransportActive(active, reason='') { if(active){markCloudStationFallback(reason);closeWakeSocket()}else{markCloudStationOnline();connectWakeSocket();void heartbeat();void pollCommands()} }
