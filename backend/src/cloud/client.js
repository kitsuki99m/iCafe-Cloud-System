import { env } from '../config/env.js'
import { getCloudIdentity } from './store.js'

async function request(functionName,{body={},edgeAuth=false}={}){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),env.cloudRequestTimeoutMs)
  try{
    const identity=edgeAuth?getCloudIdentity():null
    if(edgeAuth&&(!identity?.edge_id||!identity?.edge_token)){const e=new Error('This Edge server is not paired with Aezakmi Cloud.');e.code='CLOUD_NOT_PAIRED';e.status=409;throw e}
    const headers={apikey:env.supabasePublishableKey,'Content-Type':'application/json'}
    if(edgeAuth){headers['x-aezakmi-edge-id']=identity.edge_id;headers['x-aezakmi-edge-token']=identity.edge_token}
    const response=await fetch(`${env.supabaseUrl}/functions/v1/${functionName}`,{method:'POST',headers,body:JSON.stringify(body),signal:controller.signal})
    const data=await response.json().catch(()=>({}))
    if(!response.ok){const e=new Error(data?.error||`Cloud request failed (${response.status})`);e.status=response.status;e.code=data?.code;e.data=data;throw e}
    return data
  }catch(error){if(error?.name==='AbortError'){const e=new Error('Cloud request timed out.');e.code='CLOUD_TIMEOUT';e.status=504;throw e}throw error}finally{clearTimeout(timer)}
}
export const pairEdge=(payload)=>request('pair-edge',{body:payload})
export const syncEdge=(payload)=>request('edge-sync',{body:payload,edgeAuth:true})
export const unpairEdge=()=>request('edge-unpair',{edgeAuth:true})

let wakeSocket=null,wakeTimer=null
export function stopCloudWakeup(){if(wakeTimer)clearTimeout(wakeTimer);wakeTimer=null;try{wakeSocket?.close()}catch{}wakeSocket=null}
export function startCloudWakeup(onWake){stopCloudWakeup();const identity=getCloudIdentity();if(!env.cloudEnabled||!identity?.realtime_topic_key)return
  const connect=()=>{const wsUrl=env.supabaseUrl.replace(/^https:/,'wss:')+`/realtime/v1/websocket?apikey=${encodeURIComponent(env.supabasePublishableKey)}&vsn=1.0.0`;const ws=new WebSocket(wsUrl);wakeSocket=ws;let ref=1;const topic=`realtime:edge-wakeup:${identity.realtime_topic_key}`;ws.addEventListener('open',()=>{ws.send(JSON.stringify({topic,event:'phx_join',payload:{config:{broadcast:{self:false,ack:false},presence:{enabled:false},postgres_changes:[]}},ref:String(ref++)}))});ws.addEventListener('message',(event)=>{try{const msg=JSON.parse(String(event.data||''));if(msg?.event==='broadcast'||msg?.event==='edge_wakeup')onWake?.(msg?.payload||{})}catch{}});ws.addEventListener('close',()=>{if(wakeSocket===ws){wakeSocket=null;wakeTimer=setTimeout(connect,5000);wakeTimer.unref?.()}});ws.addEventListener('error',()=>{try{ws.close()}catch{}})}
  connect()
}
