import { io } from 'socket.io-client'
import { getToken, apiUrl } from './api.js'

function socketOrigin() {
  return new URL(apiUrl('/'), document.baseURI).origin
}
let socket
let removeUpdateListener=null

function stationIp() {
  try { return window.aezakmiClient?.getLocalIPv4?.() || import.meta.env.VITE_CLIENT_IP || undefined } catch { return undefined }
}
function stationToken(){try{return window.aezakmiClient?.getStationCredential?.()||localStorage.getItem('aezakmi.dev.station-token')||undefined}catch{return undefined}}
function softwareInfo(){try{const value=window.aezakmiClient?.getSoftwareInfo?.()||{};return{softwareVersion:String(value.currentVersion||'').slice(0,64)||undefined,updateState:String(value.status||'').slice(0,40)||undefined,updateVersion:String(value.downloadedVersion||value.availableVersion||'').slice(0,64)||undefined,updateProgress:Number.isFinite(Number(value.progress))?Math.max(0,Math.min(100,Number(value.progress))):undefined,updateInstallWhenIdle:Boolean(value.installWhenIdle)}}catch{return{}}}
function bindUpdateTelemetry(){
  if(removeUpdateListener||!window.aezakmiClient?.onUpdateState)return
  removeUpdateListener=window.aezakmiClient.onUpdateState((value)=>{
    if(!socket?.connected)return
    const info=value&&typeof value==='object'?value:{}
    socket.emit('station:software',{softwareVersion:String(info.currentVersion||'').slice(0,64),updateState:String(info.status||'').slice(0,40),updateVersion:String(info.downloadedVersion||info.availableVersion||'').slice(0,64),updateProgress:Number.isFinite(Number(info.progress))?Math.max(0,Math.min(100,Number(info.progress))):null,updateInstallWhenIdle:Boolean(info.installWhenIdle)})
  })
}

export function getSocket() {
  if (!socket) {
    socket = io(socketOrigin(), {
      transports: ['websocket', 'polling'],
      auth: { token: getToken() || undefined, clientIp: stationIp(), stationToken:stationToken(), ...softwareInfo() },
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5000,
      timeout: 4000,
    })
  }
  return socket
}

export function connectSocket() {
  const s = getSocket()
  s.auth = { token: getToken() || undefined, clientIp: stationIp(), stationToken:stationToken(), ...softwareInfo() }
  bindUpdateTelemetry()
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect()
}
