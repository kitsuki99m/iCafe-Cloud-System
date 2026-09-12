const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('aezakmiAdmin',{
  setLocked:(locked)=>ipcRenderer.send('admin:set-locked',Boolean(locked)),
  setAuthenticated:(authenticated)=>ipcRenderer.send('admin:set-authenticated',Boolean(authenticated)),
  onQuitRequest:(listener)=>{const fn=()=>listener?.();ipcRenderer.on('admin:request-quit',fn);return()=>ipcRenderer.removeListener('admin:request-quit',fn)},
  quitAck:()=>ipcRenderer.send('admin:quit-ack'),
  getServerConfig:()=>ipcRenderer.sendSync('admin:server-config:get'),
  setServerConfig:(value)=>ipcRenderer.invoke('admin:server-config:set',value),
})
