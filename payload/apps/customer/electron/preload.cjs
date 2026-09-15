const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('aezakmiClient', {
  getLocalIPv4:() => ipcRenderer.sendSync('client:get-local-ipv4'),
  getStationCredential:() => ipcRenderer.sendSync('client:get-station-credential'),
  getCloudStationCredential:() => ipcRenderer.sendSync('client:get-cloud-station-credential'),
  getInstallationId:() => ipcRenderer.sendSync('client:get-installation-id'),
  getLocalDataPath:() => ipcRenderer.sendSync('client:get-local-data-path'),
  getSoftwareInfo:() => ipcRenderer.sendSync('client:get-software-info'),
  getServerConfig:() => ipcRenderer.sendSync('client:server-config:get'),
  setServerConfig:value => ipcRenderer.invoke('client:server-config:set',value),
  verifyStationSetupMasterPin:value => ipcRenderer.invoke('client:verify-setup-master-pin',value),
  setStationCredential:value => ipcRenderer.invoke('client:set-station-credential',value),
  setCloudStationCredential:value => ipcRenderer.invoke('client:set-cloud-station-credential',value),
  clearCloudStationCredential:() => ipcRenderer.invoke('client:clear-cloud-station-credential'),
  app:'customer',
  activateSession:data => ipcRenderer.invoke('client:activate-session', data),
  beginSessionStart:() => ipcRenderer.invoke('client:begin-session-start'),
  completeSessionStart:() => ipcRenderer.invoke('client:complete-session-start'),
  cancelSessionStart:() => ipcRenderer.invoke('client:cancel-session-start'),
  updateWidget:data => ipcRenderer.invoke('client:update-widget', data),
  lockClient:() => ipcRenderer.invoke('client:lock'),
  unlockClient:() => ipcRenderer.invoke('client:unlock'),
  unlockClientOnly:() => ipcRenderer.invoke('client:unlock-only'),
  showIdleDashboard:() => ipcRenderer.invoke('client:show-idle-dashboard'),
  showLoginKiosk:() => ipcRenderer.invoke('client:show-login-kiosk'),
  deactivateSession:() => ipcRenderer.invoke('client:deactivate-session'),
  getSessionLifecycleMarker:() => ipcRenderer.sendSync('client:get-session-lifecycle-marker'),
  markSessionExit:data => ipcRenderer.invoke('client:mark-session-exit', data),
  clearSessionLifecycleMarker:() => ipcRenderer.invoke('client:clear-session-lifecycle-marker'),
  executeRemoteCommand:command => ipcRenderer.invoke('client:remote-command', command),
  shutdownClient:() => ipcRenderer.invoke('client:shutdown'),
  restartClient:() => ipcRenderer.invoke('client:restart'),
  restartCustomerStation:() => ipcRenderer.invoke('client:restart-app'),
  executeEmergencyCommand:command => ipcRenderer.invoke('client:emergency-command', command),
  showMiniDashboard:() => ipcRenderer.invoke('client:show-dashboard'),
  hideMiniDashboard:() => ipcRenderer.invoke('client:hide-dashboard'),
  getTimerPreferences:() => ipcRenderer.sendSync('client:get-timer-preferences'),
  setTimerPreferences:patch => ipcRenderer.invoke('client:set-timer-preferences', patch),
  onTimerPreferencesChanged:handler => {
    const listener=(_event,prefs)=>handler(prefs)
    ipcRenderer.on('client:timer-preferences-changed',listener)
    return ()=>ipcRenderer.removeListener('client:timer-preferences-changed',listener)
  },
  onWidgetAction:handler => {
    const listener=(_event,action)=>handler(action)
    ipcRenderer.on('widget:action',listener)
    return ()=>ipcRenderer.removeListener('widget:action',listener)
  },
  onTrayLogout:handler => {
    const listener=()=>handler()
    ipcRenderer.on('tray:logout',listener)
    return ()=>ipcRenderer.removeListener('tray:logout',listener)
  },
  onEmergencyCommand:handler => {
    const listener=(_event,command)=>handler(command)
    ipcRenderer.on('emergency:command',listener)
    return ()=>ipcRenderer.removeListener('emergency:command',listener)
  },
  onStationLocked:handler => {
    const listener=(_event,locked)=>handler(locked)
    ipcRenderer.on('client:station-locked',listener)
    return ()=>ipcRenderer.removeListener('client:station-locked',listener)
  },
  onPowerWarning:handler => {
    const listener=(_event,payload)=>handler(payload)
    ipcRenderer.on('station:power-warning',listener)
    return ()=>ipcRenderer.removeListener('station:power-warning',listener)
  },
  onPowerCommandResult:handler => {
    const listener=(_event,payload)=>handler(payload)
    ipcRenderer.on('station:power-command-result',listener)
    return ()=>ipcRenderer.removeListener('station:power-command-result',listener)
  },
  onAppExitRequested:handler => {
    const listener=(_event,payload)=>handler(payload)
    ipcRenderer.on('station:app-exit-requested',listener)
    return ()=>ipcRenderer.removeListener('station:app-exit-requested',listener)
  },
})
