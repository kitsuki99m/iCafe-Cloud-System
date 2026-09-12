import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'
import { apiGet, apiPost, apiPatch } from '../lib/api.js'
import { connectSocket, disconnectSocket } from '../lib/socket.js'
import { showToast } from '../lib/toast.js'
import { playBroadcastChime } from '../lib/sound.js'
import { readSnapshot, writeSnapshot } from '../lib/localCache.js'

const AppDataContext = createContext(null)
const handledRemoteCommands = new Set()

function cachedCustomerBranding() {
  try {
    const value = JSON.parse(localStorage.getItem('aezakmi.customer.branding') || '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

const cachedBranding = cachedCustomerBranding()

const EMPTY_SETTINGS = {
  cafeName:cachedBranding.cafeName || 'Aezakmi Cafe',
  branch:cachedBranding.branch || 'Davao City',
  branchLocation:cachedBranding.branchLocation || '',
  currency:'PHP',
  defaultBilling:'prepaid',
  postpaidMinutesPerPeso:1,
  lowTimeWarningMinutes:5,
  gcashName:'',
  gcashNumber:'',
  numberFormat:'decimal',
}

function normalizePc(pc) {
  if (!pc) return null
  return {
    ...pc,
    id:pc.id != null ? String(pc.id) : pc.id,
    session:pc.session ? {
      ...pc.session,
      id:pc.session.id != null ? String(pc.session.id) : pc.session.id,
      customerId:pc.session.customerId != null ? String(pc.session.customerId) : null,
      ratePlanId:pc.session.ratePlanId != null ? String(pc.session.ratePlanId) : null,
    } : null,
  }
}

function normalizeRatePlan(plan) {
  return plan ? { ...plan, id:plan.id != null ? String(plan.id) : plan.id } : plan
}

function normalizeMember(member) {
  if (!member) return null
  const wallet=Number(member.wallet ?? member.walletBalance ?? 0)
  return { ...member, id:member.id != null ? String(member.id) : member.id, wallet, walletBalance:wallet }
}

function sameId(left,right) {
  return left != null && right != null && String(left) === String(right)
}

export function createPublicState(overrides = {}) {
  return {
    pcs:[],
    members:[],
    ratePlans:[],
    topUpRequests:[],
    announcements:[],
    settings:{...EMPTY_SETTINGS},
    loading:false,
    serverError:'',
    currentClientPc:null,
    realtimeToast:null,
    ...overrides,
  }
}

export function AppDataProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState(() => createPublicState({ loading:true }))
  const cacheKey=user ? `customer:${user.id}:${user.role}` : 'customer:public'
  const refreshGenerationRef=useRef(0)

  const refresh = useCallback(async () => {
    const generation=refreshGenerationRef.current
    try {
      if (!user) {
        const [publicSettings, clientContext, announcementData, ratePlansData] = await Promise.all([
          apiGet('/public/settings'),
          apiGet('/client/context'),
          apiGet('/public/announcements'),
          apiGet('/public/rate-plans'),
        ])
        const snapshot=createPublicState({
          settings:{...EMPTY_SETTINGS,...(publicSettings.settings ?? {})},
          currentClientPc:normalizePc(clientContext.pc),
          announcements:announcementData.announcements ?? [],
          ratePlans:(ratePlansData.ratePlans ?? []).map(normalizeRatePlan),
        })
        if (generation !== refreshGenerationRef.current) return
        setState(snapshot)
        writeSnapshot(cacheKey,snapshot)
        return
      }

      if (user.role === 'guest') {
        const [guestData, publicSettings, announcementData, ratePlansData] = await Promise.all([
          apiGet('/guest/session'),
          apiGet('/public/settings'),
          apiGet('/public/announcements'),
          apiGet('/public/rate-plans'),
        ])
        if (!guestData.session) {
          window.dispatchEvent(new CustomEvent('aezakmi:session-expired', { detail:{ reason:'guest_session_expired' } }))
          throw new Error('No active guest session on this PC.')
        }
        const currentPc=normalizePc(guestData.pc ? {...guestData.pc,session:guestData.session} : null)
        const snapshot=createPublicState({
          pcs:currentPc ? [currentPc] : [],
          ratePlans:(ratePlansData.ratePlans ?? []).map(normalizeRatePlan),
          announcements:announcementData.announcements ?? [],
          settings:{...EMPTY_SETTINGS,...(publicSettings.settings ?? {})},
          currentClientPc:currentPc,
        })
        if (generation !== refreshGenerationRef.current) return
        setState(snapshot)
        writeSnapshot(cacheKey,snapshot)
        return
      }

      const [pcData, plansData, clientContext, memberData, walletData, settingsData, announcementData] = await Promise.all([
        apiGet('/pcs/current'),
        apiGet('/rate-plans'),
        apiGet('/client/context'),
        apiGet('/members/me'),
        apiGet('/wallet'),
        apiGet('/settings'),
        apiGet('/announcements'),
      ])
      const member=memberData.member ? normalizeMember({
        ...memberData.member,
        wallet:Number(walletData.balance ?? memberData.member.wallet ?? memberData.member.walletBalance ?? 0),
        walletBalance:Number(walletData.balance ?? memberData.member.wallet ?? memberData.member.walletBalance ?? 0),
      }) : null
      const currentPc=normalizePc(pcData.pc ?? clientContext.pc ?? null)
      const snapshot=createPublicState({
        pcs:currentPc ? [currentPc] : [],
        currentClientPc:normalizePc(clientContext.pc ?? currentPc),
        members:member ? [member] : [],
        ratePlans:(plansData.ratePlans ?? []).map(normalizeRatePlan),
        announcements:announcementData.announcements ?? [],
        settings:{...EMPTY_SETTINGS,...(settingsData.settings ?? {})},
      })
      if (generation !== refreshGenerationRef.current) return
      setState(snapshot)
      writeSnapshot(cacheKey,snapshot)
    } catch (error) {
      if (generation !== refreshGenerationRef.current) return
      setState((current) => ({ ...current, loading:false, serverError:error.message || 'Backend unavailable.' }))
    }
  }, [user, cacheKey])

  useEffect(() => {
    const effectGeneration=++refreshGenerationRef.current
    let active=true
    // Identity changes must not inherit the previous account's private state.
    setState(createPublicState({ loading:true }))
    readSnapshot(cacheKey)
      .then((snapshot)=>{if(active&&snapshot)setState(createPublicState({ ...snapshot, loading:false, serverError:'' }))})
      .finally(()=>{if(active)refresh()})

    let socket = null
    let refreshTimer = null
    let refreshRunning = false
    let refreshTrailing = false
    const runRefresh = async () => {
      if (refreshRunning) { refreshTrailing = true; return }
      refreshRunning = true
      try { do { refreshTrailing = false; await refresh() } while (refreshTrailing) }
      finally { refreshRunning = false }
    }
    const queueRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(runRefresh, 75) }
    const onSocketConnect = queueRefresh
    const onSocketError = () => { /* REST remains authoritative while realtime reconnects. */ }
    const onAuthRevoked = (payload) => window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid',{detail:payload}))
    const onChanged = (payload) => {
      if (payload?.path === '/branding/logo' || payload?.path === '/settings') window.dispatchEvent(new CustomEvent('aezakmi:branding-updated', { detail:payload }))
      queueRefresh()
    }
    const onRatePlansUpdated = () => { queueRefresh(); if (user?.role === 'customer' || user?.role === 'guest') { showToast({ title:'New rates available', message:'The counter updated the available session plans.', tone:'info' });playBroadcastChime() } }
    const onAnnouncementsUpdated = () => { queueRefresh(); if (user?.role === 'customer' || user?.role === 'guest') { showToast({ title:'New announcement', message:'The cafe posted an update for this station.', tone:'info' });playBroadcastChime() } }
    const onWalletChanged = (payload) => {
      if(!payload?.memberId) return
      setState((current) => ({ ...current, members:current.members.map((member) => sameId(member.id,payload.memberId) ? { ...member, wallet:Number(payload.balance ?? member.wallet ?? 0), walletBalance:Number(payload.balance ?? member.walletBalance ?? 0) } : member) }))
    }
    const onSessionChanged = (payload) => {
      queueRefresh()
      if (user?.role === 'customer' && String(payload?.memberId) === String(user.memberId) && payload?.reason === 'session_expired') {
        window.dispatchEvent(new CustomEvent('aezakmi:session-expired', { detail: payload }))
      }
    }
    const onTopUpUpdated = (payload) => {
      queueRefresh()
      if (user?.role === 'customer' && String(payload?.memberId) === String(user.memberId) && payload?.status === 'approved') {
        const amount = Number(payload.amount ?? 0)
        showToast({ title:'Top up successful', message:amount > 0 ? `₱${Math.floor(amount)} has been added to your wallet.` : 'Your wallet has been updated successfully.', tone:'success' })
      }
    }
    const onExtensionUpdated = (payload) => {
      const belongsToMember = user?.role === 'customer' && sameId(payload?.memberId,user.memberId)
      const belongsToPc = (user?.role === 'guest' || user?.role === 'customer') && sameId(payload?.pcId,user?.pcId)
      if (!belongsToMember && !belongsToPc) return
      queueRefresh()
      if (payload?.status === 'approved' && payload?.paymentMethod !== 'wallet') showToast({ title:'Time added', message:`${Math.max(0,Number(payload.minutesAdded||0))} minute(s) were added to your session.`, tone:'success' })
      if (payload?.status === 'rejected') showToast({ title:'Extension request rejected', message:'Staff rejected the pending session extension.', tone:'warning' })
    }
    const onRemoteCommand = async (payload) => {
      if (!payload?.id || !payload?.command || handledRemoteCommands.has(payload.id)) return
      handledRemoteCommands.add(payload.id)
      try {
        const expiresAtMs = payload.expiresAt ? new Date(payload.expiresAt).getTime() : NaN
        const warningExpiresAtMs = payload.warningExpiresAt ? new Date(payload.warningExpiresAt).getTime() : NaN
        const stalePowerWarning = ['shutdown','reboot'].includes(String(payload.command).toLowerCase()) && Number.isFinite(warningExpiresAtMs) && warningExpiresAtMs <= Date.now()
        if ((Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) || stalePowerWarning) {
          try { await apiPatch(`/public/remote-commands/${payload.id}`, { status:'failed', result:{ error:'Remote command expired before execution.', code:'REMOTE_COMMAND_EXPIRED' } }) } catch {}
          return
        }
        await apiPatch(`/public/remote-commands/${payload.id}`, { status:'running', result:{ received:true, warningSeconds:payload.warningSeconds || 0, warningExpiresAt:payload.warningExpiresAt || null, expiresAt:payload.expiresAt || null } })
        const bridge = window.aezakmiClient?.executeRemoteCommand
        const executed = bridge ? await bridge({ command:payload.command, warningSeconds:payload.warningSeconds || 0, warningExpiresAt:payload.warningExpiresAt || null, expiresAt:payload.expiresAt || null }) : false
        await apiPatch(`/public/remote-commands/${payload.id}`, { status:executed === false ? 'failed' : 'completed', result:{ executed:executed !== false, developmentSimulation:!bridge } })
      } catch (error) {
        if (error?.status === 409) return
        try { await apiPatch(`/public/remote-commands/${payload.id}`, { status:'failed', result:{ error:error?.message || 'Command failed', code:error?.code || null } }) } catch {}
      } finally {
        setTimeout(() => handledRemoteCommands.delete(payload.id), 5 * 60 * 1000)
      }
    }

    function bindSocket(target) {
      if (!target) return
      target.on('connect', onSocketConnect)
      target.on('connect_error', onSocketError)
      target.on('data:changed', onChanged)
      target.on('rate-plans:updated', onRatePlansUpdated)
      target.on('announcements:updated', onAnnouncementsUpdated)
      target.on('wallet:updated', onWalletChanged)
      target.on('session:updated', onSessionChanged)
      target.on('topup:updated', onTopUpUpdated)
      target.on('extension:updated', onExtensionUpdated)
      target.on('remote:command', onRemoteCommand)
      target.on('auth:revoked', onAuthRevoked)
    }
    function unbindSocket(target) {
      if (!target) return
      target.off('connect', onSocketConnect)
      target.off('connect_error', onSocketError)
      target.off('data:changed', onChanged)
      target.off('rate-plans:updated', onRatePlansUpdated)
      target.off('announcements:updated', onAnnouncementsUpdated)
      target.off('wallet:updated', onWalletChanged)
      target.off('session:updated', onSessionChanged)
      target.off('topup:updated', onTopUpUpdated)
      target.off('extension:updated', onExtensionUpdated)
      target.off('remote:command', onRemoteCommand)
      target.off('auth:revoked', onAuthRevoked)
    }
    try {
      socket = connectSocket()
      bindSocket(socket)
    } catch (error) {
      setState((current) => ({ ...current, serverError:error?.message || 'Realtime connection is not configured.' }))
    }
    const onStationEnrolled=()=>{
      unbindSocket(socket)
      disconnectSocket()
      try {
        socket = connectSocket()
        bindSocket(socket)
        queueRefresh()
      } catch(error) {
        socket = null
        setState((current)=>({...current,serverError:error?.message||'Realtime connection is not configured.'}))
      }
    }
    window.addEventListener('aezakmi:station-enrolled',onStationEnrolled)

    return () => {
      unbindSocket(socket)
      window.removeEventListener('aezakmi:station-enrolled',onStationEnrolled)
      clearTimeout(refreshTimer)
      active=false
      if (refreshGenerationRef.current === effectGeneration) refreshGenerationRef.current += 1
      disconnectSocket()
    }
  }, [refresh, user, cacheKey])

  function refreshAfter(promise) { return promise.finally(() => refresh()) }

  function optimisticState(updater) {
    setState((current) => {
      const next=updater(current)
      writeSnapshot(cacheKey,{...next,loading:false}).catch?.(()=>{})
      return next
    })
  }

  function endSession(pc) {
    if (!pc?.session?.id) return Promise.resolve()
    const sessionId=pc.session.id
    const path = user?.role === 'guest' ? `/public/sessions/${sessionId}/end` : `/sessions/${sessionId}/end`
    optimisticState((current)=>({...current,pcs:current.pcs.map((item)=>sameId(item.id,pc.id)?{...item,status:'available',session:null,pendingSessionEnd:sessionId}:item),currentClientPc:sameId(current.currentClientPc?.id,pc.id)?{...current.currentClientPc,status:'available',session:null,pendingSessionEnd:sessionId}:current.currentClientPc}))
    return apiPost(path).then((data)=>{refresh();return data}).catch((error)=>{refresh();throw error})
  }

  function getMemberWallet(memberId) {
    const member = state.members.find((item) => sameId(item.id,memberId))
    return Number(member?.wallet ?? member?.walletBalance ?? 0)
  }

  function requestTopUp(payload, options = {}) {
    const tempId=`pending:${Date.now()}`
    optimisticState((current)=>({...current,topUpRequests:[{id:tempId,status:'pending',amount:Number(payload.amount||0),method:payload.method,pcId:payload.pcId??user?.pcId??null,pending:true},...(current.topUpRequests||[])]}))
    showToast({ title:'Top-up request sending', message:'Your request is being sent to the local café server.', tone:'info' })
    return apiPost('/top-ups', {
      amount:payload.amount,
      method:payload.method === 'counter' ? 'cash' : payload.method,
      gcashNumber:payload.gcashNumber ?? null,
      pcId:payload.pcId ?? user?.pcId ?? null,
    }, options).then((data) => {
      refresh()
      showToast({ title:'Top-up request sent', message:'Staff will review your request shortly.', tone:'info' })
      return data.request
    }).catch((error)=>{refresh();throw error})
  }

  function startSelfServiceSession(pcId, memberId, ratePlanId=null, amount=null, options = {}) {
    const pendingSession={id:`pending:${Date.now()}`,pcId,customerId:memberId,ratePlanId,billing:'prepaid',startedAt:Date.now(),observedAt:Date.now(),pending:true}
    optimisticState((current)=>({...current,pcs:current.pcs.map((pc)=>sameId(pc.id,pcId)?{...pc,status:'occupied',session:pendingSession}:pc),currentClientPc:sameId(current.currentClientPc?.id,pcId)?{...current.currentClientPc,status:'occupied',session:pendingSession}:current.currentClientPc}))
    showToast({ title:'Starting session', message:'Confirming with the local café server…', tone:'session' })
    return apiPost('/sessions/start', {
      pcId,
      customerId:memberId,
      ...(ratePlanId ? { ratePlanId } : {}),
      ...(amount != null ? { amount } : {}),
      billing:'prepaid',
    }, options).then(() => {
      refresh()
      showToast({ title:'Session started', message:'Your station session is now active.', tone:'session' })
      return { ok:true }
    }).catch((error) => { refresh(); return { ok:false, error:error.message, code:error.code } })
  }

  function requestSessionExtension(pcId, memberId, amount, paymentMethod, refNo = null, ratePlanId = null, options = {}) {
    const pc = state.pcs.find((item) => sameId(item.id,pcId))
    if (!pc?.session?.id) return Promise.resolve({ ok:false, error:'No active session to extend.' })
    const path = user?.role === 'guest' ? '/public/session-extensions' : '/session-extensions'
    optimisticState((current)=>({...current,pcs:current.pcs.map((item)=>sameId(item.id,pcId)&&item.session?{...item,session:{...item.session,pendingExtension:{amount,paymentMethod,ratePlanId}}}:item),currentClientPc:sameId(current.currentClientPc?.id,pcId)&&current.currentClientPc?.session?{...current.currentClientPc,session:{...current.currentClientPc.session,pendingExtension:{amount,paymentMethod,ratePlanId}}}:current.currentClientPc}))
    return apiPost(path, {
      sessionId:pc.session.id,
      amount,
      paymentMethod,
      refNo,
      ...(ratePlanId ? { ratePlanId } : {}),
    }, options).then((data) => {
      refresh()
      if (data.status === 'approved') showToast({ title:'Time added', message:`${Math.max(0,Number(data.minutesAdded||0))} minute(s) were added to your session.`, tone:'success' })
      else showToast({ title:'Extension request sent', message:'Your payment request is pending staff confirmation.', tone:'info' })
      return { ok:true, ...data }
    }).catch((error) => { refresh(); return { ok:false, error:error.message, code:error.code } })
  }

  function requestHelp(message = 'Customer needs assistance.', options = {}) {
    const body = { message: String(message || 'Customer needs assistance.').slice(0, 500) }
    optimisticState((current)=>({...current,realtimeToast:{title:'Help request sending',message:'Contacting café staff…',tone:'info',createdAt:Date.now()}}))
    const request = user?.role === 'guest' ? apiPost('/public/support', { ...body, username: user?.name || 'Guest' }, options) : apiPost('/support', body, options)
    return request.then((data) => { refresh(); return data.request }).catch((error)=>{refresh();throw error})
  }

  function submitFeedback(message, options = {}) {
    const request=user?.role==='guest' ? apiPost('/public/feedback',{message},options) : apiPost('/feedback',{message},options)
    return request.then(data=>{showToast({title:'Feedback sent',message:'Thank you for helping us improve.',tone:'success'});return data})
  }

  function getFeedbackHistory() {
    return apiGet(user?.role==='guest' ? '/public/feedback/me' : '/feedback/me').then(data=>data.quota)
  }

  return (
    <AppDataContext.Provider value={{
      pcs:state.pcs,
      members:state.members,
      ratePlans:state.ratePlans,
      announcements:state.announcements,
      topUpRequests:state.topUpRequests,
      settings:state.settings,
      realtimeToast:state.realtimeToast,
      dismissRealtimeToast:() => setState((current) => ({ ...current, realtimeToast:null })),
      loading:state.loading,
      serverError:state.serverError,
      currentClientPc:state.currentClientPc,
      refresh,
      endSession,
      getMemberWallet,
      requestTopUp,
      requestHelp,
      submitFeedback,
      getFeedbackHistory,
      startSelfServiceSession,
      requestSessionExtension,
    }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within an AppDataProvider')
  return ctx
}
