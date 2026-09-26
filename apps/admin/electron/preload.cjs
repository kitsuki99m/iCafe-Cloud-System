const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('aezakmiAdmin',{
  isElectron: true,
  getLocalIPv4:()=>ipcRenderer.sendSync('admin:get-local-ipv4'),
  setLocked:(locked)=>ipcRenderer.send('admin:set-locked',Boolean(locked)),
  setAuthenticated:(authenticated)=>ipcRenderer.send('admin:set-authenticated',Boolean(authenticated)),
  onQuitRequest:(listener)=>{const fn=()=>listener?.();ipcRenderer.on('admin:request-quit',fn);return()=>ipcRenderer.removeListener('admin:request-quit',fn)},
  quitAck:()=>ipcRenderer.send('admin:quit-ack'),
  getServerConfig:()=>ipcRenderer.sendSync('admin:server-config:get'),
  setServerConfig:(value)=>ipcRenderer.invoke('admin:server-config:set',value),
  minimizeWindow:()=>ipcRenderer.send('admin:window:minimize'),
  maximizeWindow:()=>ipcRenderer.send('admin:window:maximize'),
  closeWindow:()=>ipcRenderer.send('admin:window:close'),
  isWindowMaximized:()=>ipcRenderer.sendSync('admin:window:is-maximized'),
  onMaximizedChange:(listener)=>{
    const fn=(_e,max)=>listener?.(max)
    ipcRenderer.on('admin:window:maximized-change',fn)
    return()=>ipcRenderer.removeListener('admin:window:maximized-change',fn)
  },
})

