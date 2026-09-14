import { createContext, useContext, useEffect, useState } from 'react'
import { apiGet, apiPost, setToken, getToken } from '../lib/api.js'
import { isCloudAdmin, cloudConfigReady, cloudGetUser, cloudResolveAccess, cloudSignIn, cloudSignOut, cloudUpdatePassword, cloudConsumeAuthCallback, cloudInvitationSetupPending, cloudClearInvitationSetup, cloudActivateRegistration } from '../lib/cloudClient.js'

const C=createContext(null)
function cloudUserShape(cloudUser,access){const status=access.organizationStatus||null,suspended=status==='suspended'||status==='terminated',metadata=cloudUser.user_metadata||{},cloudName=metadata.display_name||metadata.full_name||metadata.name||cloudUser.email||'Administrator';return{id:cloudUser.id,email:cloudUser.email,name:cloudName,role:'admin',cloudRole:access.role,authMethod:'password',cloud:true,cloudNeedsSetup:!access.branchId&&!suspended,cloudDeveloper:Boolean(access.platformDeveloper),cloudInviteSetup:cloudInvitationSetupPending(),cloudBusinessStatus:status,cloudBusinessReason:access.organizationReason||null,cloudBusinessSuspended:suspended}}

export function AuthProvider({children}){
  const [user,setUser]=useState(null),[authLoading,setLoading]=useState(true),[mustChange,setMustChange]=useState(false)
  const cloud=isCloudAdmin()

  useEffect(()=>{let cancelled=false;(async()=>{
    if(cloud){
      try{
        if(!cloudConfigReady())throw new Error('Cloud Admin environment is not configured.')
        cloudConsumeAuthCallback()
        const cloudUser=await cloudGetUser()
        const access=await cloudResolveAccess(cloudUser.id)
        if(cancelled)return
        setUser(cloudUserShape(cloudUser,access));setMustChange(false)
      }catch{if(!cancelled)setUser(null)}finally{if(!cancelled)setLoading(false)}
      return
    }
    window.aezakmiAdmin?.setAuthenticated?.(Boolean(getToken()))
    if(!getToken()){setLoading(false);return}
    try{const d=await apiGet('/auth/me');if(cancelled)return;setUser(d.user);window.aezakmiAdmin?.setAuthenticated?.(true);setMustChange(Boolean(d.user?.mustChangeCredentials))}
    catch{setToken(null);window.aezakmiAdmin?.setAuthenticated?.(false);if(!cancelled)setUser(null)}
    finally{if(!cancelled)setLoading(false)}
  })();return()=>{cancelled=true}},[cloud])

  useEffect(()=>{const f=()=>{if(cloud)cloudSignOut().catch(()=>{});else setToken(null);setUser(null);setMustChange(false);window.aezakmiAdmin?.setAuthenticated?.(false)};window.addEventListener('aezakmi:auth-invalid',f);return()=>window.removeEventListener('aezakmi:auth-invalid',f)},[cloud])
  useEffect(()=>{if(cloud||!user||!getToken())return;const t=setInterval(()=>apiPost('/auth/heartbeat').catch(()=>{}),30000);return()=>clearInterval(t)},[user,cloud])
  useEffect(()=>{const off=window.aezakmiAdmin?.onQuitRequest?.(async()=>{try{await logout()}finally{window.aezakmiAdmin?.quitAck?.()}});return()=>off?.()},[cloud])

  async function loginAdminPin(pin){if(cloud)return{ok:false,error:'Cloud Admin uses email and password.'};try{const d=await apiPost('/auth/login',{role:'admin',pin});setToken(d.token);setUser(d.user);window.aezakmiAdmin?.setAuthenticated?.(true);setMustChange(Boolean(d.user?.mustChangeCredentials));return{ok:true}}catch(e){return{ok:false,error:e.message}}}
  async function loginAdminPassword(username,password,pin=null){
    try{
      if(cloud){const d=await cloudSignIn(username,password),cloudUser=d.user||await cloudGetUser(),access=await cloudResolveAccess(cloudUser.id);setUser(cloudUserShape(cloudUser,access));setMustChange(false);return{ok:true,setupRequired:!access.branchId,developer:Boolean(access.platformDeveloper)}}
      const d=await apiPost('/auth/login',{role:'admin',username,password,...(pin?{pin}:{})});setToken(d.token);setUser(d.user);window.aezakmiAdmin?.setAuthenticated?.(true);setMustChange(Boolean(d.user?.mustChangeCredentials));return{ok:true}
    }catch(e){return{ok:false,error:e.message}}
  }
  async function completeCloudInvitation(password){
    if(!cloud)return{ok:false,error:'Cloud invitation setup is available only in Cloud Admin.'}
    if(String(password||'').length<8)return{ok:false,error:'Use at least 8 characters for the new password.'}
    try{await cloudUpdatePassword(password);await cloudActivateRegistration();cloudClearInvitationSetup();const cloudUser=await cloudGetUser(),access=await cloudResolveAccess(cloudUser.id);setUser(cloudUserShape(cloudUser,access));return{ok:true}}
    catch(e){return{ok:false,error:e.message}}
  }
  async function setupCredentials(payload){if(cloud)return{ok:true};try{const d=await apiPost('/auth/setup-credentials',payload);setUser(d.user);window.aezakmiAdmin?.setAuthenticated?.(true);setMustChange(false);return{ok:true}}catch(e){return{ok:false,error:e.message}}}
  async function updateCredentials(payload){try{if(cloud){if(!payload?.password&&!payload?.newPassword)return{ok:false,error:'Enter a new password.'};await cloudUpdatePassword(payload.newPassword||payload.password);return{ok:true,user}}const d=await apiPost('/auth/update-credentials',payload);setUser(d.user);return{ok:true,user:d.user,adminPinReady:Boolean(d.adminPinReady)}}catch(e){return{ok:false,error:e.message,code:e.code}}}
  async function refreshCloudAccess(){if(!cloud||!user)return null;const access=await cloudResolveAccess(user.id);setUser(current=>current?{...current,cloudRole:access.role,cloudNeedsSetup:!access.branchId&&!['suspended','terminated'].includes(access.organizationStatus||''),cloudDeveloper:Boolean(access.platformDeveloper),cloudBusinessStatus:access.organizationStatus||null,cloudBusinessReason:access.organizationReason||null,cloudBusinessSuspended:['suspended','terminated'].includes(access.organizationStatus||'')}:current);return access}
  async function logout(){try{if(cloud)await cloudSignOut();else if(getToken())await apiPost('/auth/logout')}catch{}if(!cloud)setToken(null);setUser(null);setMustChange(false);window.aezakmiAdmin?.setAuthenticated?.(false)}
  return <C.Provider value={{user,authLoading,mustChange,loginAdminPin,loginAdminPassword,completeCloudInvitation,setupCredentials,updateCredentials,refreshCloudAccess,logout}}>{children}</C.Provider>
}
export function useAuth(){const c=useContext(C);if(!c)throw Error('useAuth must be used within AuthProvider');return c}
