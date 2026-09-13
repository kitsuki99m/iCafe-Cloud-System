import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'
import { apiGet, apiPost, apiPatch } from '../lib/api.js'
import { connectSocket, disconnectSocket } from '../lib/socket.js'
import { showToast } from '../lib/toast.js'
import { playBroadcastChime } from '../lib/sound.js'
import { readSnapshot, writeSnapshot } from '../lib/localCache.js'
import { acknowledgeCloudStationCommand, cloudStationFeatureEnabled, cloudStationPaired, cloudStationTransport } from '../lib/cloudStation.js'
import { clearStationLifecycleMarker, hasActiveStationLifecycle, releaseStationLifecycle } from '../lib/sessionLifecycle.js'

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
  postpaidMinutesPerPeso:0,
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

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase())
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function normalizeRatePlan(plan) {
  if (!plan) return plan
  const eligibleRaw = plan.eligible
  return {
    ...plan,
    id:plan.id != null ? String(plan.id) : plan.id,
    isActive:normalizeBoolean(plan.isActive ?? plan.is_active, true),
    customerSelfService:normalizeBoolean(plan.customerSelfService ?? plan.customer_self_service, false),
    customerTier:String(plan.customerTier ?? plan.customer_tier ?? 'Regular'),
    pesoUnit:nullableNumber(plan.pesoUnit ?? plan.peso_unit),
    minutesPerUnit:nullableNumber(plan.minutesPerUnit ?? plan.minutes_per_unit),
    minAmount:nullableNumber(plan.minAmount ?? plan.min_amount),
    amount:nullableNumber(plan.amount),
    minutes:nullableNumber(plan.minutes),
    baseMinutes:nullableNumber(plan.baseMinutes ?? plan.base_minutes),
    bonusMinutes:nullableNumber(plan.bonusMinutes ?? plan.bonus_minutes),
    promoKind:String(plan.promoKind ?? plan.promo_kind ?? 'none'),
    startsAt:plan.startsAt ?? plan.starts_at ?? null,
    endsAt:plan.endsAt ?? plan.ends_at ?? null,
    timeStart:plan.timeStart ?? plan.time_start ?? null,
    timeEnd:plan.timeEnd ?? plan.time_end ?? null,
    daysOfWeek:plan.daysOfWeek ?? plan.days_of_week ?? null,
    graceMinutes:Number(plan.graceMinutes ?? plan.grace_minutes ?? 0) || 0,
    ...(eligibleRaw === undefined ? {} : { eligible:normalizeBoolean(eligibleRaw, false) }),
    ...((plan.walletStartEligible ?? plan.wallet_start_eligible) === undefined
      ? {}
      : { walletStartEligible:normalizeBoolean(plan.walletStartEligible ?? plan.wallet_start_eligible, false) }),
    walletStartReason:plan.walletStartReason ?? plan.wallet_start_reason ?? null,
  }
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
  // Guest identity is derived from the currently-active station session. Never
  // hydrate it from a previous guest snapshot: an old prepaid timer/session id
  // can otherwise flash back in and race the newly-started guest session.
  const cacheKey=user?.role === 'guest' ? null : (user ? `customer:${user.id}:${user.role}` : 'customer:public')
  const refreshGenerationRef=useRef(0)
  const guestAbsentConfirmationsRef=useRef(0)

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
          settings:{...EMPTY_SETTINGS,...(publicSettings.settings ?? {}),defaultBilling:'prepaid',postpaidMinutesPerPeso:0},
          currentClientPc:normalizePc(clientContext.pc),
          announcements:announcementData.announcements ?? [],
          ratePlans:(ratePlansData.ratePlans ?? []).map(normalizeRatePlan),
        })
        if (generation !== refreshGenerationRef.current) return
        setState(snapshot)
        if (cacheKey) writeSnapshot(cacheKey,snapshot)
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
          // Never tear down Guest UI on one Cloud-sync miss. A Guest has no
          // member token, and Cloud can briefly report null while the LAN Edge
          // already owns the active walk-in session. api.js marks absence as
          // confirmed only when both reachable authorities agree. Require two
          // consecutive confirmed reads before treating it as a real end.
          if (guestData.guestSessionAbsentConfirmed) guestAbsentConfirmationsRef.current += 1
          else guestAbsentConfirmationsRef.current = 0
          if (guestAbsentConfirmationsRef.current >= 2) {
            guestAbsentConfirmationsRef.current = 0
            window.dispatchEvent(new CustomEvent('aezakmi:guest-session-ended', { detail:{ reason:'guest_session_ended' } }))
          }
          throw new Error(guestData.guestSessionReconcilePending
            ? 'Guest session is reconnecting…'
            : 'Checking the active guest session…')
        }
        guestAbsentConfirmationsRef.current = 0
        const guestPc=guestData.pc || { id:user.pcId ?? guestData.session?.pcId ?? null, ipAddress:user.pcIp ?? '', label:'Customer Station', status:'occupied' }
        const currentPc=normalizePc({...guestPc,session:guestData.session})
        const snapshot=createPublicState({
          pcs:currentPc ? [currentPc] : [],
          ratePlans:(ratePlansData.ratePlans ?? []).map(normalizeRatePlan),
          announcements:announcementData.announcements ?? [],
          settings:{...EMPTY_SETTINGS,...(publicSettings.settings ?? {}),defaultBilling:'prepaid',postpaidMinutesPerPeso:0},
          currentClientPc:currentPc,
        })
        if (generation !== refreshGenerationRef.current) return
        setState(snapshot)
        if (cacheKey) writeSnapshot(cacheKey,snapshot)
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
        settings:{...EMPTY_SETTINGS,...(settingsData.settings ?? {}),defaultBilling:'prepaid',postpaidMinutesPerPeso:0},
      })
      if (generation !== refreshGenerationRef.current) return
      setState(snapshot)
      if (cacheKey) writeSnapshot(cacheKey,snapshot)
    } catch (error) {
      if (generation !== refreshGenerationRef.current) return
      setState((current) => ({ ...current, loading:false, serverError:error.message || 'Backend unavailable.' }))
    }
  }, [user, cacheKey])

  useEffect(() => {
    const effectGeneration=++refreshGenerationRef.current
    let active=true
    // Identity changes must not inherit the previous account's private state.
    guestAbsentConfirmationsRef.current = 0
    setState(createPublicState({ loading:true }))
    if (cacheKey) {
      readSnapshot(cacheKey)
        .then((snapshot)=>{if(active&&snapshot)setState(createPublicState({ ...snapshot, loading:false, serverError:'' }))})
        .finally(()=>{if(active)refresh()})
    } else {
      // Guest session state must always come from the live station session.
      // Do not render a stale prior guest while the authoritative refresh runs.
      refresh()
    }

    let socket = null
    let refreshTimer = null
    let stationDisconnectTimer = null
    let stationDisconnectReason = null
    let refreshRunning = false
    let refreshTrailing = false
    const runRefresh = async () => {
      if (refreshRunning) { refreshTrailing = true; return }
      refreshRunning = true
      try { do { refreshTrailing = false; await refresh() } while (refreshTrailing) }
      finally { refreshRunning = false }
    }
    const queueRefresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(runRefresh, 75) }
    const clearStationDisconnectWatch = () => {
      clearTimeout(stationDisconnectTimer)
      stationDisconnectTimer = null
      stationDisconnectReason = null
    }
    const scheduleStationDisconnect = (reason = 'station_disconnect') => {
      if (user?.role !== 'customer' && user?.role !== 'guest') return
      if (stationDisconnectTimer) return
      stationDisconnectReason=reason
      // A Cloud-primary station is healthy when either Supabase is live or
      // Café Edge fallback has established its socket. Only a sustained loss
      // of both transports is a logout boundary.
      stationDisconnectTimer=setTimeout(async () => {
        stationDisconnectTimer=null
        const disconnectReason=stationDisconnectReason || reason
        stationDisconnectReason=null
        if (cloudPrimary && cloudStationTransport() === 'cloud') return
        if (socket?.connected) return
        if (hasActiveStationLifecycle()) {
          // A real transport interruption converts the healthy active marker
          // into pending recovery before local auth/UI is cleared. If the
          // network is already gone, the marker survives for startup recovery.
          await releaseStationLifecycle('station_disconnect',{allowDeferred:true}).catch(() => {})
        }
        window.dispatchEvent(new CustomEvent('aezakmi:station-session-interruption',{detail:{reason:'station_disconnect',transportReason:disconnectReason}}))
      },3000)
    }
    const onSocketConnect = () => {
      clearStationDisconnectWatch()
      queueRefresh()
    }
    const onSocketDisconnect = (socketReason) => {
      if (cloudPrimary && cloudStationTransport() === 'cloud') return
      scheduleStationDisconnect(socketReason || 'socket_disconnect')
    }
    const onSocketError = (error) => {
      if (cloudPrimary && cloudStationTransport() === 'cloud') return
      scheduleStationDisconnect(error?.message || 'socket_connect_error')
    }
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
    const onSessionChanged = () => {
      // Session state and authentication are separate lifecycles. In
      // particular, natural prepaid expiry must refresh the member dashboard
      // without clearing a valid member login.
      queueRefresh()
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
      const cloudCommand = Boolean(payload.cloudStationCommand)
      const expiresAt = payload.expiresAt || payload.expires_at || null
      const warningSeconds = Number(payload.warningSeconds ?? (['shutdown','reboot'].includes(String(payload.command).toLowerCase()) ? 5 : 0))
      const warningExpiresAt = payload.warningExpiresAt || (warningSeconds ? new Date(Date.now()+warningSeconds*1000).toISOString() : null)
      const ack = async (status,result={}) => cloudCommand
        ? acknowledgeCloudStationCommand(payload.id,status,result)
        : apiPatch(`/public/remote-commands/${payload.id}`, { status, result })
      try {
        const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : NaN
        if (Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now()) {
          try { await ack('failed',{ error:'Remote command expired before execution.', code:'REMOTE_COMMAND_EXPIRED' }) } catch {}
          return
        }
        await ack('running',{ received:true, warningSeconds, warningExpiresAt, expiresAt })
        if (['shutdown','reboot'].includes(String(payload.command).toLowerCase())) {
          const interruptionReason=String(payload.command).toLowerCase()
          await releaseStationLifecycle(interruptionReason, { allowDeferred:true })
          // The backend/Cloud already checkpointed this session when Admin
          // issued the command. Drop the local member/guest identity before the
          // power warning begins so the UI can never continue looking signed in.
          window.dispatchEvent(new CustomEvent('aezakmi:admin-session-interruption',{detail:{reason:interruptionReason,commandId:payload.id}}))
        }
        const bridge = window.aezakmiClient?.executeRemoteCommand
        const executed = bridge ? await bridge({ command:payload.command, warningSeconds, warningExpiresAt, expiresAt }) : false
        await ack(executed === false ? 'failed' : 'completed',{ executed:executed !== false, developmentSimulation:!bridge })
        queueRefresh()
      } catch (error) {
        if (error?.status === 409) return
        try { await ack('failed',{ error:error?.message || 'Command failed', code:error?.code || null }) } catch {}
      } finally {
        setTimeout(() => handledRemoteCommands.delete(payload.id), 5 * 60 * 1000)
      }
    }

    function bindSocket(target) {
      if (!target) return
      target.on('connect', onSocketConnect)
      target.on('disconnect', onSocketDisconnect)
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
      target.off('disconnect', onSocketDisconnect)
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
    const cloudPrimary = cloudStationFeatureEnabled() && cloudStationPaired()
    let cloudRefreshInterval = null
    const connectFallbackSocket = () => {
      if (socket) return
      try { socket=connectSocket();bindSocket(socket);queueRefresh() }
      catch(error){socket=null;setState((current)=>({...current,serverError:error?.message||'Café Edge fallback is not configured.'}))}
    }
    const disconnectFallbackSocket = () => {
      unbindSocket(socket);socket=null;disconnectSocket()
    }
    const onTransport = (event) => {
      if (event?.detail?.mode === 'fallback') {
        connectFallbackSocket()
        if (!socket?.connected) scheduleStationDisconnect(event?.detail?.reason || 'cloud_fallback_unavailable')
      }
      else {
        clearStationDisconnectWatch()
        disconnectFallbackSocket();queueRefresh()
      }
    }
    const onCloudCommand = (event) => onRemoteCommand(event?.detail || {})
    if (cloudPrimary) {
      if (cloudStationTransport()==='fallback') {
        connectFallbackSocket()
        if (!socket?.connected) scheduleStationDisconnect('initial_cloud_fallback')
      }
      cloudRefreshInterval=setInterval(queueRefresh,user?.role === 'customer' ? 1000 : 5000)
      window.addEventListener('aezakmi:station-transport',onTransport)
      window.addEventListener('aezakmi:cloud-station-command',onCloudCommand)
    } else connectFallbackSocket()

    const onStationEnrolled=()=>{ if(!cloudPrimary || cloudStationTransport()==='fallback'){disconnectFallbackSocket();connectFallbackSocket()} }
    window.addEventListener('aezakmi:station-enrolled',onStationEnrolled)

    return () => {
      disconnectFallbackSocket()
      window.removeEventListener('aezakmi:station-enrolled',onStationEnrolled)
      window.removeEventListener('aezakmi:station-transport',onTransport)
      window.removeEventListener('aezakmi:cloud-station-command',onCloudCommand)
      if(cloudRefreshInterval)clearInterval(cloudRefreshInterval)
      clearTimeout(refreshTimer)
      clearStationDisconnectWatch()
      active=false
      if (refreshGenerationRef.current === effectGeneration) refreshGenerationRef.current += 1
    }
  }, [refresh, user, cacheKey])

  function refreshAfter(promise) { return promise.finally(() => refresh()) }

  function optimisticState(updater) {
    // Optimistic UI is memory-only. Persistent snapshots are last-known-good
    // authority data and are written only after successful Cloud/Café Edge
    // reads. A failed mutation must never replace the emergency offline cache.
    setState((current) => updater(current))
  }

  function endSession(pc) {
    if (!pc?.session?.id) return Promise.resolve()
    const sessionId=pc.session.id
    const path = user?.role === 'guest' ? `/public/sessions/${sessionId}/end` : `/sessions/${sessionId}/end`
    optimisticState((current)=>({...current,pcs:current.pcs.map((item)=>sameId(item.id,pc.id)?{...item,status:'available',session:null,pendingSessionEnd:sessionId}:item),currentClientPc:sameId(current.currentClientPc?.id,pc.id)?{...current.currentClientPc,status:'available',session:null,pendingSessionEnd:sessionId}:current.currentClientPc}))
    return apiPost(path).then(async(data)=>{await clearStationLifecycleMarker();refresh();return data}).catch((error)=>{refresh();throw error})
  }

  function getMemberWallet(memberId) {
    const member = state.members.find((item) => sameId(item.id,memberId))
    return Number(member?.wallet ?? member?.walletBalance ?? 0)
  }

  function requestTopUp(payload, options = {}) {
    const tempId=`pending:${Date.now()}`
    optimisticState((current)=>({...current,topUpRequests:[{id:tempId,status:'pending',amount:Number(payload.amount||0),method:payload.method,pcId:payload.pcId??user?.pcId??null,pending:true},...(current.topUpRequests||[])]}))
    showToast({ title:'Top-up request sending', message:'Your request is being sent through Aezakmi Cloud. Café Edge will be used automatically if needed.', tone:'info' })
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
    // Do not fabricate an active `pending:` session before the backend commits
    // the wallet deduction/session row. CustomerSessionView treats session
    // presence as authoritative and would otherwise call Electron
    // activateSession(), writing an active lifecycle marker for a purchase that
    // might still fail. Keep the existing modal busy state as the optimistic UX
    // and switch to active only after the authoritative refresh sees the session.
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
