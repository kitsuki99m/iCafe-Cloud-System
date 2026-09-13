import { io } from 'socket.io-client'
import { getToken, apiUrl } from './api.js'

function socketOrigin() {
  return new URL(apiUrl('/'), document.baseURI).origin
}
let socket

function stationIp() {
  try { return window.aezakmiClient?.getLocalIPv4?.() || import.meta.env.VITE_CLIENT_IP || undefined } catch { return undefined }
}
function stationToken(){try{return window.aezakmiClient?.getStationCredential?.()||localStorage.getItem('aezakmi.dev.station-token')||undefined}catch{return undefined}}
function softwareInfo(){try{const value=window.aezakmiClient?.getSoftwareInfo?.()||{};return{softwareVersion:String(value.currentVersion||'').slice(0,64)||undefined}}catch{return{}}}

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
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect()
}
