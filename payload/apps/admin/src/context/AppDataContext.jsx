import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/api.js'
import { connectSocket, disconnectSocket } from '../lib/socket.js'
import { showToast } from '../lib/toast.js'
import { readSnapshot, writeSnapshot } from '../lib/localCache.js'
import { isCloudAdmin, cloudBranchId } from '../lib/cloudClient.js'

const AppDataContext = createContext(null)
const suppressedCommandToastIds = new Set()

const EMPTY_SETTINGS = {
  cafeName:'Aezakmi Cafe',
  branch:'Davao City',
  currency:'PHP',
  defaultBilling:'prepaid',
  postpaidMinutesPerPeso:1,
  lowTimeWarningMinutes:5,
  gcashName:'',
  gcashNumber:'',
  numberFormat:'decimal',
  decimalPlaces:3,
}

function normalizePc(pc) {
  if (!pc) return pc
  return {
    ...pc,
    id: pc.id != null ? String(pc.id) : pc.id,
    ipAddress: pc.ipAddress ?? pc.ip_address ?? '',
    session: pc.session ? {
      ...pc.session,
      id: pc.session.id != null ? String(pc.session.id) : pc.session.id,
      customerId: pc.session.customerId ?? pc.session.customer_id ?? null,
      ratePlanId: pc.session.ratePlanId ?? pc.session.rate_plan_id ?? null,
    } : null,
  }
}

function normalizeRatePlan(plan) {
  if (!plan) return plan
  return {
    ...plan,
    id: plan.id != null ? String(plan.id) : plan.id,
    isActive: plan.isActive ?? Boolean(plan.is_active ?? true),
    customerSelfService: plan.customerSelfService ?? Boolean(plan.customer_self_service),
  }
}

function normalizeMember(member) {
  if (!member) return member
  const wallet = Number(member.wallet ?? member.walletBalance ?? 0)
  return { ...member, wallet, walletBalance: wallet }
}

function normalizeSessionExtension(extension) {
  if (!extension) return extension
  return {
    ...extension,
    id: String(extension.id),
    sessionId: extension.sessionId ?? extension.computer_session_id ?? null,
    memberId: extension.memberId ?? extension.member_id ?? null,
    ratePlanId: extension.ratePlanId ?? extension.rate_plan_id ?? null,
    pcId: extension.pcId ?? extension.pc_id ?? null,
    pcLabel: extension.pcLabel ?? extension.pc_label ?? 'Unknown PC',
    pcIp: extension.pcIp ?? extension.pc_ip ?? null,
    customerName: extension.customerName ?? extension.customer_name ?? 'Customer',
    amount: Number(extension.amount ?? 0),
    minutesAdded: Number(extension.minutesAdded ?? extension.minutes_added ?? 0),
    paymentMethod: extension.paymentMethod ?? extension.payment_method ?? 'cash',
    gcashNumber: extension.gcashNumber ?? extension.gcash_number ?? null,
    requestedAt: extension.requestedAt ?? extension.requested_at ?? null,
  }
}

export function AppDataProvider({ children }) {
  const { user } = useAuth()
  const [state, setState] = useState({
    pcs: [],
    members: [],
    ratePlans: [],
    topUpRequests: [],
    supportRequests: [],
    sessionExtensions: [],
    announcements: [],
    settings: EMPTY_SETTINGS,
    loading: true,
    serverError: '',
    realtimeConnected: false,
    clientContext: null,
  })
  const cacheKey=user ? (isCloudAdmin() ? `admin:cloud:${user.id}:${cloudBranchId() || 'unselected'}` : `admin:${user.id}:${user.role}`) : null
  const refreshGenerationRef=useRef(0)

  const refresh = useCallback(async () => {
    const generation=refreshGenerationRef.current
    if (!user) {
      if (generation !== refreshGenerationRef.current) return
      setState((s) => ({ ...s, loading:false, serverError:'' }))
      return
    }
    if (isCloudAdmin() && !cloudBranchId()) {
      if (generation !== refreshGenerationRef.current) return
      setState((s) => ({ ...s, loading:false, serverError:'', realtimeConnected:false }))
      return
    }
    try {
      if (user.role === 'guest') {
        const guestData = await apiGet('/guest/session')
        if (!guestData.session) throw new Error('No active guest session on this PC.')
        const snapshot={
          pcs: guestData.pc ? [{
            id:guestData.pc.id, label:guestData.pc.label, ipAddress:guestData.pc.ipAddress, spec:guestData.pc.spec, status:guestData.pc.status, session:guestData.session
          }] : [],
          members:[], ratePlans:[], topUpRequests:[], supportRequests:[], sessionExtensions:[], announcements:[], settings:EMPTY_SETTINGS, loading:false, serverError:'', clientContext:null,
        }
        if (generation !== refreshGenerationRef.current) return
        setState((current) => ({ ...current, ...snapshot }))
        return
      }

      const [pcsData, plansData, clientContextData] = await Promise.all([
        apiGet('/pcs'),
        apiGet('/rate-plans'),
        apiGet('/client/context'),
      ])
      let members = []
      let topUpRequests = []
      let supportRequests = []
      let sessionExtensions = []
      let announcements = []
      let settings = EMPTY_SETTINGS

      if (user.role === 'admin') {
        const [membersData, topUpsData, supportData, extensionsData, settingsData, announcementsData] = await Promise.all([
          apiGet('/members'),
          apiGet('/top-ups'),
          apiGet('/support'),
          apiGet('/session-extensions'),
          apiGet('/settings'),
          apiGet('/announcements'),
        ])
        members = (membersData.members ?? []).map(normalizeMember)
        topUpRequests = topUpsData.topUpRequests ?? []
        supportRequests = (supportData.supportRequests ?? []).map((request) => ({ ...request }))
        sessionExtensions = (extensionsData.extensions ?? []).map(normalizeSessionExtension)
        announcements = announcementsData.announcements ?? []
        settings = { ...EMPTY_SETTINGS, ...(settingsData.settings ?? {}) }
      } else {
        const [memberData, settingsData, announcementsData] = await Promise.all([
          apiGet('/members/me'),
          apiGet('/settings'),
          apiGet('/announcements'),
        ])
        members = memberData.member ? [normalizeMember(memberData.member)] : []
        settings = { ...EMPTY_SETTINGS, ...(settingsData.settings ?? {}) }
        announcements = announcementsData.announcements ?? []
      }

      const snapshot={
        pcs:(pcsData.pcs ?? []).map(normalizePc),
        members,
        ratePlans:(plansData.ratePlans ?? []).map(normalizeRatePlan),
        topUpRequests,
        supportRequests,
        sessionExtensions,
        announcements,
        settings,
        loading:false,
        serverError:'',
        clientContext:clientContextData ?? null,
      }
      if (generation !== refreshGenerationRef.current) return
      setState((current) => ({ ...current, ...snapshot }))
      if(cacheKey) writeSnapshot(cacheKey,snapshot)
    } catch (error) {
      if (generation !== refreshGenerationRef.current) return
      setState((s) => ({ ...s, loading:false, serverError:error.message || 'Backend unavailable.' }))
    }
  }, [user])

  useEffect(() => {
    const effectGeneration=++refreshGenerationRef.current
    let active=true
    if (cacheKey) readSnapshot(cacheKey).then((snapshot)=>{if(active&&snapshot)setState((current)=>({...current,...snapshot,loading:false,serverError:''}))}).finally(()=>{if(active)refresh()})
    else refresh()
    if (!user) return undefined
    if (isCloudAdmin()) {
      let timer=null
      const cloudRefresh=async()=>{
        try{
          await refresh()
          if(active)setState(current=>({...current,realtimeConnected:navigator.onLine}))
        }catch{if(active)setState(current=>({...current,realtimeConnected:false}))}
      }
      const onOnline=()=>cloudRefresh()
      const onBranch=()=>cloudRefresh()
      window.addEventListener('online',onOnline)
      window.addEventListener('aezakmi:cloud-branch-changed',onBranch)
      timer=setInterval(cloudRefresh,5000)
      return()=>{active=false;if(refreshGenerationRef.current===effectGeneration)refreshGenerationRef.current+=1;clearInterval(timer);window.removeEventListener('online',onOnline);window.removeEventListener('aezakmi:cloud-branch-changed',onBranch)}
    }
    const socket = connectSocket()
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
    const onSocketConnect = () => { setState((current) => ({ ...current, realtimeConnected:true })); queueRefresh() }
    const onSocketDisconnect = () => { setState((current) => ({ ...current, realtimeConnected:false })) }
    const onSocketError = () => { setState((current) => ({ ...current, realtimeConnected:false })) }
    const onAuthRevoked = (payload) => window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid',{detail:payload}))

    // data:changed is the authoritative invalidation event. It performs an
    // in-app data refresh; it never reloads the browser/Electron window.
    const onChanged = queueRefresh
    const onRatePlansUpdated = queueRefresh
    const onAnnouncementsUpdated = queueRefresh
    const onSessionUpdated = queueRefresh
    const onTopUpUpdated = queueRefresh
    const onCommandStatus = (payload) => {
      queueRefresh()
      if (payload?.id && suppressedCommandToastIds.has(payload.id)) {
        if (payload.status === 'completed' || payload.status === 'failed') suppressedCommandToastIds.delete(payload.id)
        return
      }
      if(payload?.status==='completed') showToast({title:'Station command completed',message:'The customer station acknowledged the command.'})
      if(payload?.status==='failed') showToast({title:'Station command failed',message:payload?.result?.error || 'The station did not complete the command.',tone:'warning'})
    }
    const onPcPresence = (payload) => {
      if (!payload?.pcId) return
      setState((current) => ({ ...current, pcs: current.pcs.map((pc) => String(pc.id) === String(payload.pcId) ? { ...pc, status:payload.online ? (pc.session ? 'occupied' : 'available') : 'offline' } : pc) }))
    }

    // Top-ups are inserted immediately so the pending queue updates without
    // waiting for a manual refresh. data:changed remains the authoritative
    // follow-up for any related wallet/session changes.
    const onTopUp = (request) => {
      setState((current) => {
        if (!['admin'].includes(user.role)) return current
        if (current.topUpRequests.some((item) => item.id === request.id)) return current
        const next = {
          id: request.id,
          status: request.status || 'pending',
          createdAt: request.createdAt ?? request.at ?? Date.now(),
          customerId: request.memberId ?? null,
          customerName: request.customerName ?? 'Customer',
          pcId: request.pcId ?? null,
          pcLabel: request.pcLabel ?? 'Unknown PC',
          pcIp: request.pcIp ?? null,
          amount: Number(request.amount ?? 0),
          method: request.method ?? 'cash',
          gcashNumber: request.gcashNumber ?? null,
        }
        return { ...current, topUpRequests: [next, ...current.topUpRequests] }
      })
    }

    const onExtensionRequest = (request) => {
      if (user.role !== 'admin' || !request?.id) return
      const normalized = normalizeSessionExtension(request)
      setState((current) => ({
        ...current,
        sessionExtensions: current.sessionExtensions.some((item) => String(item.id) === String(normalized.id))
          ? current.sessionExtensions.map((item) => String(item.id) === String(normalized.id) ? { ...item, ...normalized } : item)
          : [normalized, ...current.sessionExtensions],
      }))
    }

    const onExtensionUpdated = (payload) => {
      if (!payload?.id) return
      setState((current) => ({
        ...current,
        sessionExtensions: current.sessionExtensions.map((item) =>
          String(item.id) === String(payload.id) ? normalizeSessionExtension({ ...item, ...payload }) : item
        ),
      }))
      queueRefresh()
    }

    const onWalletChanged = (payload) => {
      if (!payload?.memberId) return
      setState((current) => ({
        ...current,
        members: current.members.map((member) =>
          String(member.id) === String(payload.memberId)
            ? { ...member, wallet: Number(payload.balance ?? member.wallet ?? 0), walletBalance: Number(payload.balance ?? member.wallet ?? 0) }
            : member
        ),
      }))
    }

    const onSupport = (request) => {
      setState((current) => {
        if (!['admin'].includes(user.role)) return current
        if (current.supportRequests.some((item) => item.id === request.id)) return current
        const next = {
          id: request.id,
          status: request.status || 'open',
          createdAt: request.createdAt ?? request.at ?? Date.now(),
          memberId: request.memberId ?? null,
          pcId: request.pcId ?? null,
          pcLabel: request.pcLabel ?? 'Unknown PC',
          pcIp: request.pcIp ?? null,
          customerName: request.customerName ?? 'Customer',
          message: request.message ?? 'Customer needs assistance.',
        }
        return { ...current, supportRequests: [next, ...current.supportRequests] }
      })
    }

    socket.on('connect', onSocketConnect)
    socket.on('connect_error', onSocketError)
    socket.on('disconnect', onSocketDisconnect)
    socket.on('data:changed', onChanged)
    socket.on('rate-plans:updated', onRatePlansUpdated)
    socket.on('announcements:updated', onAnnouncementsUpdated)
    socket.on('pc:presence', onPcPresence)
    socket.on('topup:new_request', onTopUp)
    socket.on('wallet:updated', onWalletChanged)
    socket.on('session:updated', onSessionUpdated)
    socket.on('topup:updated', onTopUpUpdated)
    socket.on('remote:command-status', onCommandStatus)
    socket.on('auth:revoked', onAuthRevoked)
    socket.on('support:new_request', onSupport)
    socket.on('extension:new_request', onExtensionRequest)
    socket.on('extension:updated', onExtensionUpdated)

    return () => {
      socket.off('connect', onSocketConnect)
      socket.off('connect_error', onSocketError)
      socket.off('disconnect', onSocketDisconnect)
      socket.off('data:changed', onChanged)
      socket.off('rate-plans:updated', onRatePlansUpdated)
      socket.off('announcements:updated', onAnnouncementsUpdated)
      socket.off('pc:presence', onPcPresence)
      socket.off('topup:new_request', onTopUp)
      socket.off('wallet:updated', onWalletChanged)
      socket.off('session:updated', onSessionUpdated)
      socket.off('topup:updated', onTopUpUpdated)
      socket.off('remote:command-status', onCommandStatus)
      socket.off('auth:revoked', onAuthRevoked)
      socket.off('support:new_request', onSupport)
      socket.off('extension:new_request', onExtensionRequest)
      socket.off('extension:updated', onExtensionUpdated)
      clearTimeout(refreshTimer)
      active=false
      if (refreshGenerationRef.current === effectGeneration) refreshGenerationRef.current += 1
      disconnectSocket()
    }
  }, [refresh, user])

  function refreshAfter(promise) {
    return promise.finally(() => refresh())
  }

  function optimisticState(updater) {
    setState((current) => {
      const next = updater(current)
      if (cacheKey) writeSnapshot(cacheKey, { ...next, loading:false }).catch?.(() => {})
      return next
    })
  }

  function startSession(pc, sessionInput) {
    const pendingId=`pending:${Date.now()}`
    optimisticState((current)=>({...current,pcs:current.pcs.map((item)=>String(item.id)===String(pc.id)?{...item,status:'occupied',session:{id:pendingId,pcId:pc.id,customerId:sessionInput.customerId??null,customerName:sessionInput.customerName??'Starting…',billing:sessionInput.billing??'prepaid',ratePlanId:sessionInput.ratePlanId??null,startedAt:Date.now(),observedAt:Date.now(),pending:true}}:item)}))
    return apiPost('/sessions/start', { pcId:pc.id, pcIp:pc.ipAddress, ...sessionInput }).then((result) => { showToast({ title:'Session started', message:`${pc.label} is now in use.` }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  function getSessionPreview(pc) {
    if (!pc?.session?.id) return Promise.resolve(null)
    return apiGet(`/sessions/${pc.session.id}/settlement-preview`)
  }

  function endSession(pc, disposition = 'save', options = {}) {
    if (!pc?.session?.id) return Promise.resolve()
    const sessionId=pc.session.id
    optimisticState((current)=>({...current,pcs:current.pcs.map((item)=>String(item.id)===String(pc.id)?{...item,status:'available',session:null,pendingSessionEnd:sessionId}:item)}))
    return apiPost(`/sessions/${sessionId}/end`, { disposition, ...options }).then((result) => { showToast({ title:disposition==='settle'?'Postpaid settled':disposition==='forfeit'?'Session forfeited':'Session saved', message:disposition==='settle'?`₱${Number(result.amountDue||0).toFixed(2)} paid by ${result.paymentMethod}.`:`${pc.label} is available again.` }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  function refundSession(pc) {
    if (!pc?.session?.id) return Promise.resolve()
    return refreshAfter(apiPost(`/sessions/${pc.session.id}/refund`)).then((result) => { showToast({ title:'Session refunded', message:`₱${Number(result.refundAmount||0).toFixed(2)} returned by ${result.destination}.` }); return result })
  }

  function setMaintenance(pc, toMaintenance = true) {
    // Ending maintenance does not prove the station is reachable. It remains
    // offline until the paired Customer Station reconnects and reports
    // presence through Socket.IO.
    return refreshAfter(apiPatch(`/pcs/${pc.id}`, { status:toMaintenance ? 'maintenance' : 'offline' })).then((result) => { showToast({ title:toMaintenance ? 'Maintenance enabled' : 'PC restored', message:toMaintenance ? pc.label : `${pc.label} is waiting for station connection.` }); return result })
  }

  function powerCommand(pc, command, options = {}) {
    const normalizedCommand = command === 'restart' ? 'reboot' : command
    const isSessionLockCommand = normalizedCommand === 'lock' || normalizedCommand === 'unlock'
    let previousPc = null

    // Lock/unlock should feel immediate at the desk.  The station still ACKs
    // before the server commits the billing pause/resume, but we freeze/unfreeze
    // the visible clock as soon as the command is dispatched and roll it back
    // if the command cannot be queued.
    if (isSessionLockCommand && pc?.session) {
      const dispatchedAt = Date.now()
      setState((current) => {
        const target = current.pcs.find((item) => String(item.id) === String(pc.id))
        if (!target?.session) return current
        previousPc = target
        const nextSession = normalizedCommand === 'lock'
          ? { ...target.session, isLocked:true, pausedAt:dispatchedAt, pauseReason:'admin_lock', pendingCommand:'lock' }
          : { ...target.session, isLocked:false, pausedAt:null, pauseReason:null, pendingCommand:'unlock', observedAt:dispatchedAt }
        return {
          ...current,
          pcs: current.pcs.map((item) => String(item.id) === String(pc.id) ? { ...item, session:nextSession } : item),
        }
      })
    }

    return apiPost('/remote-commands', { pcId:pc.id, command:normalizedCommand })
      .then((result) => {
        if (options.suppressToast && result?.commandId) suppressedCommandToastIds.add(result.commandId)
        if (isSessionLockCommand && result?.commandId) {
          setState((current) => ({
            ...current,
            pcs: current.pcs.map((item) => String(item.id) === String(pc.id) && item.session?.pendingCommand === normalizedCommand
              ? { ...item, session:{ ...item.session, pendingCommandId:result.commandId } }
              : item),
          }))
        }
        return result
      })
      .catch((error) => {
        if (previousPc) {
          setState((current) => ({
            ...current,
            pcs: current.pcs.map((item) => String(item.id) === String(pc.id) && item.session?.pendingCommand === normalizedCommand
              ? previousPc
              : item),
          }))
        }
        throw error
      })
  }

  function addPc(pc, options = {}) {
    return apiPost('/pcs', pc, { operationKey:options.operationKey }).then(async (result) => {
      showToast({ title:result?.duplicate ? 'PC already registered' : 'PC added', message:result?.duplicate ? `${pc.label} was already saved and has been restored to the floor.` : `${pc.label} is now registered.` })
      await refresh()
      return result
    }).catch(async (error)=>{await refresh();throw error})
  }

  function updatePcMeta(id, patch) {
    optimisticState((current)=>({...current,pcs:current.pcs.map((pc)=>String(pc.id)===String(id)?normalizePc({...pc,...patch,pending:true}):pc)}))
    return apiPatch(`/pcs/${id}`, patch).then((result) => { showToast({ title:'PC updated', message:'Station details saved.' }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  function removePc(id, options = {}) {
    return apiDelete(`/pcs/${id}`).then(async (result) => { if (!options.silent) showToast({ title:'PC removed', message:'The station was removed from the floor.' }); await refresh(); return result }).catch(async (error)=>{await refresh();throw error})
  }

  function getMemberWallet(memberId) {
    return Number(state.members.find((m) => String(m.id) === String(memberId))?.wallet ?? 0)
  }

  function requestTopUp(payload) {
    return apiPost('/top-ups', {
      amount:payload.amount,
      method:payload.method === 'counter' ? 'cash' : payload.method,
      gcashNumber:payload.gcashNumber ?? null,
      pcId:payload.pcId ?? user?.pcId ?? null,
    }).then((data) => {
      refresh()
      return data.request
    })
  }

  function approveTopUp(id) {
    optimisticState((current)=>({...current,topUpRequests:current.topUpRequests.map((r)=>String(r.id)===String(id)?{...r,status:'approved',pending:true}:r)}))
    return apiPatch(`/top-ups/${id}/approve`).then((result) => { showToast({ title:'Top up approved', message:'Wallet balance was updated.' }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  function rejectTopUp(id) {
    optimisticState((current)=>({...current,topUpRequests:current.topUpRequests.map((r)=>String(r.id)===String(id)?{...r,status:'rejected',pending:true}:r)}))
    return apiPatch(`/top-ups/${id}/reject`).then((result) => { showToast({ title:'Top up rejected', tone:'warning' }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  function confirmSessionExtension(id) {
    return refreshAfter(apiPost(`/session-extensions/${id}/confirm`, {})).then((result) => {
      showToast({ title:'Time extension approved', message:'The purchased time was added to the active session.' })
      return result
    })
  }

  function rejectSessionExtension(id) {
    return refreshAfter(apiPost(`/session-extensions/${id}/reject`, {})).then((result) => {
      showToast({ title:'Time extension rejected', tone:'warning' })
      return result
    })
  }

  function clearResolvedTopUps() {
    return refreshAfter(apiDelete('/top-ups/resolved'))
  }

  function startSelfServiceSession(pcId, memberId, ratePlanId, amount) {
    return apiPost('/sessions/start', {
      pcId,
      customerId:memberId,
      ratePlanId,
      amount,
      billing:'prepaid',
    }).then(() => {
      refresh()
      return { ok:true }
    }).catch((error) => ({ ok:false, error:error.message }))
  }

  function extendSessionFromWallet(pcId, memberId, amount) {
    const pc = state.pcs.find((p) => String(p.id) === String(pcId))
    if (!pc?.session?.id) return Promise.resolve({ ok:false, error:'No active session to extend.' })
    return apiPost('/session-extensions', {
      sessionId:pc.session.id,
      amount,
      paymentMethod:'wallet',
    }).then(() => {
      refresh()
      return { ok:true }
    }).catch((error) => ({ ok:false, error:error.message }))
  }

  function requestSessionExtension(pcId, memberId, amount, paymentMethod, refNo = null) {
    const pc = state.pcs.find((p) => String(p.id) === String(pcId))
    if (!pc?.session?.id) return Promise.resolve({ ok:false, error:'No active session to extend.' })
    return apiPost('/session-extensions', {
      sessionId:pc.session.id,
      amount,
      paymentMethod,
      refNo,
    }).then((data) => {
      refresh()
      return { ok:true, ...data }
    }).catch((error) => ({ ok:false, error:error.message }))
  }

  function resolveSupport(id) {
    return refreshAfter(apiPatch(`/support/${id}/resolve`))
  }

  function addMember(member) {
    const optimistic=normalizeMember({...member,id:member.id||`pending:${Date.now()}`,wallet:Number(member.wallet||0),status:'active',pending:true})
    optimisticState((current)=>({...current,members:[optimistic,...current.members]}))
    return apiPost('/members', member).then((result) => { showToast({ title:'Member added', message:`${member.name} can now sign in.` }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  function updateMember(id, patch) {
    optimisticState((current)=>({...current,members:current.members.map((m)=>String(m.id)===String(id)?normalizeMember({...m,...patch,pending:true}):m)}))
    return apiPatch(`/members/${id}`, patch).then((result) => { showToast({ title:'Member updated', message:'Account details saved.' }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  function deleteMember(id) {
    optimisticState((current)=>({...current,members:current.members.filter((m)=>String(m.id)!==String(id))}))
    return apiDelete(`/members/${id}`).then((result) => { showToast({ title:'Member deleted', tone:'warning' }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  function adminTopUp(memberId, amount, options = {}) {
    if (!(amount > 0)) return Promise.resolve()
    optimisticState((current)=>({...current,members:current.members.map((m)=>String(m.id)===String(memberId)?{...m,wallet:Number(m.wallet||0)+Number(amount),walletBalance:Number(m.wallet||0)+Number(amount),pendingWallet:true}:m)}))
    const { refresh:shouldRefresh=true, ...apiOptions }=options
    const promise=apiPost('/wallet/adjustments', { memberId, amount, type:'top_up' }, apiOptions).catch((error)=>{refresh();throw error})
    return shouldRefresh ? promise.finally(()=>refresh()) : promise
  }

  function adminRefund(memberId, amount) {
    if (!(amount > 0)) return Promise.resolve()
    optimisticState((current)=>({...current,members:current.members.map((m)=>String(m.id)===String(memberId)?{...m,wallet:Math.max(0,Number(m.wallet||0)-Number(amount)),walletBalance:Math.max(0,Number(m.wallet||0)-Number(amount)),pendingWallet:true}:m)}))
    return apiPost('/wallet/adjustments', { memberId, amount:-amount, type:'refund' }).finally(()=>refresh())
  }

  function setMemberWallet(memberId, balance, options = {}) {
    const value = Number(balance)
    if (!Number.isFinite(value) || value < 0) return Promise.reject(new Error('Wallet balance must be zero or greater.'))
    return apiPatch(`/members/${memberId}/wallet`, { balance:value }, options).then((data) => {
      const next = Number(data?.balance ?? value)
      setState((current) => ({
        ...current,
        members: current.members.map((member) => String(member.id) === String(memberId) ? { ...member, wallet:next, walletBalance:next } : member),
      }))
      return data
    }).finally(() => refresh())
  }

  function topUpMemberSession(memberId, ratePlanId, amount = null, options = {}) {
    const { refresh:shouldRefresh=true, ...apiOptions }=options
    const promise=apiPost(`/members/${memberId}/session-topup`, { ratePlanId, amount }, apiOptions)
    return shouldRefresh ? refreshAfter(promise) : promise
  }
  function transferMemberWallet(memberId, destinationMemberId, amount, options = {}) {
    return refreshAfter(apiPost(`/members/${memberId}/wallet-transfers`, { destinationMemberId, amount }, options))
  }
  function adjustSessionTime(sessionId, payload, options = {}) {
    return refreshAfter(apiPost(`/sessions/${sessionId}/time-adjustments`, payload, options))
  }
  function transferMemberSessionTime(memberId, destinationMemberId, seconds, options = {}) {
    return refreshAfter(apiPost(`/members/${memberId}/session-time-transfers`, { destinationMemberId, seconds }, options))
  }

  function findMemberByIp(ip) {
    return state.members.find((m) => m.pcIp === ip) ?? null
  }

  function findMemberByNameAndPassword() {
    // Authentication is backend-only now. Kept as a compatibility surface for
    // older components; LoginForm uses AuthContext's API-backed login directly.
    return null
  }

  function addRatePlan(plan) {
    const optimistic = normalizeRatePlan({ ...plan, isActive: plan.isActive !== false })
    setState((current) => ({ ...current, ratePlans: [...current.ratePlans, optimistic] }))
    return apiPost('/rate-plans', plan)
      .then((result) => {
        const canonical = result?.ratePlan
        if (canonical) setState((current) => ({ ...current, ratePlans: current.ratePlans.map((item) => item.id === optimistic.id ? normalizeRatePlan(canonical) : item) }))
        showToast({ title:'Rate plan added', message:plan.name })
        return result
      })
      .catch((error) => {
        setState((current) => ({ ...current, ratePlans: current.ratePlans.filter((item) => item.id !== optimistic.id) }))
        throw error
      })
  }

  function updateRatePlan(id, updated) {
    const previous = state.ratePlans.find((item) => item.id === id)
    const optimistic = normalizeRatePlan({ ...previous, ...updated, id })
    setState((current) => ({ ...current, ratePlans: current.ratePlans.map((item) => item.id === id ? optimistic : item) }))
    return apiPatch(`/rate-plans/${id}`, updated)
      .then((result) => {
        const canonical = result?.ratePlan
        if (canonical) setState((current) => ({ ...current, ratePlans: current.ratePlans.map((item) => item.id === id ? normalizeRatePlan(canonical) : item) }))
        showToast({ title:'Rate plan updated', message:updated.name })
        return result
      })
      .catch((error) => {
        if (previous) setState((current) => ({ ...current, ratePlans: current.ratePlans.map((item) => item.id === id ? previous : item) }))
        throw error
      })
  }

  function deleteRatePlan(id) {
    const previous = state.ratePlans.find((item) => item.id === id)
    // The backend performs a soft delete, so reflect that immediately while
    // keeping the inactive plan visible to staff for audit/history.
    setState((current) => ({ ...current, ratePlans: current.ratePlans.map((item) => item.id === id ? { ...item, isActive:false, customerSelfService:false } : item) }))
    return apiDelete(`/rate-plans/${id}`)
      .then((result) => { showToast({ title:'Rate plan removed', tone:'warning' }); return result })
      .catch((error) => {
        if (previous) setState((current) => ({ ...current, ratePlans: current.ratePlans.map((item) => item.id === id ? previous : item) }))
        throw error
      })
  }

  function planUsageCount(id) {
    return state.pcs.filter((p) => p.status === 'occupied' && p.session?.ratePlanId === id).length
  }

  function updateSettings(patch) {
    return refreshAfter(apiPatch('/settings', patch)).then((result) => { showToast({ title:'Settings saved', message:'Cafe configuration is up to date.' }); return result })
  }
  function updateSessionPolicy(patch){return refreshAfter(apiPatch('/billing-policy/session',patch)).then(result=>{showToast({title:'Session policy saved'});return result})}
  function updatePostpaidRate(postpaidMinutesPerPeso){return refreshAfter(apiPatch('/billing-policy/postpaid-rate',{postpaidMinutesPerPeso})).then(result=>{showToast({title:'Postpaid rate saved',message:`${Number(postpaidMinutesPerPeso).toFixed(2)} minutes per peso`});return result})}

  function createAnnouncement(payload) { return refreshAfter(apiPost('/announcements', payload)) }
  function updateAnnouncement(id, payload) { return refreshAfter(apiPatch(`/announcements/${id}`, payload)) }
  function deleteAnnouncement(id) { return refreshAfter(apiDelete(`/announcements/${id}`)) }

  return (
    <AppDataContext.Provider value={{
      pcs:state.pcs,
      members:state.members,
      ratePlans:state.ratePlans,
      topUpRequests:state.topUpRequests,
      supportRequests:state.supportRequests,
      sessionExtensions:state.sessionExtensions,
      announcements:state.announcements,
      settings:state.settings,
      loading:state.loading,
      serverError:state.serverError,
      realtimeConnected:state.realtimeConnected,
      clientContext:state.clientContext,
      refresh,
      startSession,
      getSessionPreview,
      endSession,
      refundSession,
      setMaintenance,
      powerCommand,
      addPc,
      updatePcMeta,
      removePc,
      getMemberWallet,
      requestTopUp,
      approveTopUp,
      rejectTopUp,
      confirmSessionExtension,
      rejectSessionExtension,
      clearResolvedTopUps,
      resolveSupport,
      startSelfServiceSession,
      extendSessionFromWallet,
      requestSessionExtension,
      addMember,
      updateMember,
      deleteMember,
      adminTopUp,
      adminRefund,
      setMemberWallet,
      topUpMemberSession,
      transferMemberWallet,
      adjustSessionTime,
      transferMemberSessionTime,
      createAnnouncement,
      updateAnnouncement,
      deleteAnnouncement,
      findMemberByIp,
      findMemberByNameAndPassword,
      addRatePlan,
      updateRatePlan,
      deleteRatePlan,
      planUsageCount,
      updateSettings,
      updateSessionPolicy,
      updatePostpaidRate,
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
