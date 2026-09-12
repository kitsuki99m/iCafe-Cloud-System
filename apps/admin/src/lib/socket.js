import { io } from 'socket.io-client'
import { getToken, apiUrl } from './api.js'

function socketOrigin() {
  return new URL(apiUrl('/'), document.baseURI).origin
}
let socket

export function getSocket() {
  if (!socket) {
    socket = io(socketOrigin(), {
      transports: ['websocket', 'polling'],
      auth: { token: getToken() || undefined },
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
  s.auth = { token: getToken() || undefined }
  if (!s.connected) s.connect()
  return s
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect()
}
