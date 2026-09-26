import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'
import { apiGet, apiPost, apiPatch, apiDelete, invalidateApiCache } from '../lib/api.js'
import { connectSocket, disconnectSocket } from '../lib/socket.js'
import { showToast } from '../lib/toast.js'
import { readSnapshot, writeSnapshot } from '../lib/localCache.js'
import { scopedPageCacheKey } from '../lib/pageCache.js'
import { isCloudAdmin, cloudBranchId, startCloudRealtime } from '../lib/cloudClient.js'
import { elapsedSessionSeconds, remainingSessionSeconds } from '../lib/sessionTime.js'
import { playAdminSound } from '../lib/sound.js'
import { effectivePcStatus } from '../lib/pcStatus.js'
import { useOptimisticAction as useQueuedOptimisticAction } from '../lib/useOptimisticAction.js'
import { useOptimisticAction } from '../hooks/useOptimisticAction.js'
import { createSeqGuard } from '../lib/seqGuard.js'

const AppDataContext = createContext(null)
const suppressedCommandToastIds = new Set()

const EMPTY_SETTINGS = {
  displayName:'',
  cafeName:'Aezakmi Cafe',
  branch:'Davao City',
  currency:'PHP',
  defaultBilling:'prepaid',
  postpaidMinutesPerPeso:0,
  lowTimeWarningMinutes:5,
  gcashName:'',
  gcashNumber:'',
  numberFormat:'decimal',
  decimalPlaces:3,
}

function normalizePc(pc) {
  if (!pc) return pc
  const session = pc.session ? {
    ...pc.session,
    id: pc.session.id != null ? String(pc.session.id) : pc.session.id,
    customerId: pc.session.customerId ?? pc.session.customer_id ?? null,
    ratePlanId: pc.session.ratePlanId ?? pc.session.rate_plan_id ?? null,
    amount: finiteOr(pc.session.amount ?? pc.session.amount_paid, 0),
    prepaidSeconds: finiteOrNull(pc.session.prepaidSeconds ?? pc.session.prepaid_seconds),
    pausedRemainingSeconds: finiteOrNull(pc.session.pausedRemainingSeconds ?? pc.session.paused_remaining_seconds),
    remainingSeconds: finiteOrNull(pc.session.remainingSeconds ?? pc.session.remaining_seconds),
    accruedAmount: finiteOrNull(pc.session.accruedAmount ?? pc.session.accrued_amount),
    postpaidRatePerMinute: finiteOrNull(pc.session.postpaidRatePerMinute ?? pc.session.postpaid_rate_per_minute),
  } : null
  const rawStatus=String(pc.status || '').toLowerCase()
  return {
    ...pc,
    id: pc.id != null ? String(pc.id) : pc.id,
    ipAddress: pc.ipAddress ?? pc.ip_address ?? '',
    // An active session is authoritative for the desk state. Presence is kept
    // in stationOnline/cloudOnline so a dropped heartbeat cannot relabel an
    // occupied PC as Offline.
    status: effectivePcStatus({ ...pc, status:rawStatus, session }),
    session,
  }
}

function sanitizeCachedSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return snapshot
  const pcs = Array.isArray(snapshot.pcs)
    ? snapshot.pcs.filter((pc) => !(pc?.pending && !pc?.createdAt && !pc?.created_at))
    : snapshot.pcs
  return { ...snapshot, ...(Array.isArray(pcs) ? { pcs } : {}) }
}

function finiteOr(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeRatePlan(plan) {
  if (!plan) return plan
  return {
    ...plan,
    id: plan.id != null ? String(plan.id) : plan.id,
    isActive: plan.isActive ?? Boolean(plan.is_active ?? true),
    customerSelfService: plan.customerSelfService ?? Boolean(plan.customer_self_service),
    pesoUnit: finiteOrNull(plan.pesoUnit ?? plan.peso_unit),
    minutesPerUnit: finiteOrNull(plan.minutesPerUnit ?? plan.minutes_per_unit),
    minAmount: finiteOrNull(plan.minAmount ?? plan.min_amount),
    amount: finiteOrNull(plan.amount),
    minutes: finiteOrNull(plan.minutes),
  }
}

function normalizeMember(member) {
  if (!member) return member
  const wallet = finiteOr(member.wallet ?? member.walletBalance, 0)
  return {
    ...member,
    wallet,
    walletBalance: wallet,
    sessionSecondsRemaining: finiteOr(member.sessionSecondsRemaining ?? member.session_seconds_remaining, 0),
  }
}

function normalizeSettings(settings = {}) {
  return {
    ...EMPTY_SETTINGS,
    ...settings,
    defaultBilling:'prepaid',
    postpaidMinutesPerPeso: 0,
    lowTimeWarningMinutes: finiteOr(settings.lowTimeWarningMinutes ?? settings.low_time_warning_minutes, EMPTY_SETTINGS.lowTimeWarningMinutes),
    decimalPlaces: finiteOr(settings.decimalPlaces ?? settings.decimal_places, EMPTY_SETTINGS.decimalPlaces),
  }
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
    menuItems: [],
    menuOrders: [],
    currentShift: null,
    shiftsHistory: [],
    vouchers: [],
    launcherCategories: [],
    launcherApps: [],
    settings: EMPTY_SETTINGS,
    loading: true,
    serverError: '',
    realtimeConnected: false,
    clientContext: null,
  })
  const cacheKey=scopedPageCacheKey('app-data',user)
  const refreshGenerationRef=useRef(0)
  const runOptimistic = useQueuedOptimisticAction(setState)
  const seqGuardRef = useRef(null)
  if (!seqGuardRef.current) seqGuardRef.current = createSeqGuard()

  const refresh = useCallback(async () => {
    const generation=refreshGenerationRef.current
    const requestCacheKey=scopedPageCacheKey('app-data',user)
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
          members:[], ratePlans:[], topUpRequests:[], supportRequests:[], sessionExtensions:[], announcements:[], menuItems:[], menuOrders:[], currentShift:null, shiftsHistory:[], vouchers:[], settings:EMPTY_SETTINGS, loading:false, serverError:'', clientContext:null,
        }
        if (generation !== refreshGenerationRef.current) return
        setState((current) => ({ ...current, ...snapshot }))
        return
      }

      let snapshot
      const isStaff = ['admin', 'cashier'].includes(user.role)
      if (isCloudAdmin() && isStaff) {
        // Cloud Admin receives one branch snapshot instead of fanning a single
        // refresh into many duplicate PostgREST reads. The Cloud client still
        // queries the authoritative tables, but shared lookups happen once.
        const data=await apiGet('/app-data')
        snapshot={
          pcs:(data.pcs ?? []).map(normalizePc),
          members:(data.members ?? []).map(normalizeMember),
          ratePlans:(data.ratePlans ?? []).map(normalizeRatePlan),
          topUpRequests:data.topUpRequests ?? [],
          supportRequests:(data.supportRequests ?? []).map((request)=>({...request})),
          sessionExtensions:(data.extensions ?? []).map(normalizeSessionExtension),
          announcements:data.announcements ?? [],
          menuItems:data.menuItems ?? [],
          menuOrders:data.menuOrders ?? [],
          currentShift:data.currentShift ?? null,
          shiftsHistory:data.shiftsHistory ?? [],
          vouchers:data.vouchers ?? [],
          launcherCategories:data.launcherCategories ?? [],
          launcherApps:data.launcherApps ?? [],
          settings:normalizeSettings(data.settings ?? {}),
          loading:false,
          serverError:'',
          clientContext:data.clientContext ?? { cloud:true, branchId:cloudBranchId(), transport:'supabase' },
        }
      } else {
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
        let menuItems = []
        let menuOrders = []
        let currentShift = null
        let vouchers = []
        let launcherCategories = []
        let launcherApps = []
        let settings = EMPTY_SETTINGS

        if (isStaff) {
          const [membersData, topUpsData, supportData, extensionsData, settingsData, announcementsData, menuItemsData, menuOrdersData, shiftData, vouchersData, launcherCatsData, launcherAppsData] = await Promise.all([
            apiGet('/members').catch(() => ({ members: [] })),
            apiGet('/top-ups').catch(() => ({ topUpRequests: [] })),
            apiGet('/support').catch(() => ({ supportRequests: [] })),
            apiGet('/session-extensions').catch(() => ({ extensions: [] })),
            apiGet('/settings').catch(() => ({ settings: {} })),
            apiGet('/announcements').catch(() => ({ announcements: [] })),
            apiGet('/menu-items').catch(() => ({ menuItems: [] })),
            apiGet('/menu-orders').catch(() => ({ orders: [] })),
            apiGet('/shifts/current').catch(() => ({ activeShift: null })),
            apiGet('/vouchers').catch(() => ({ vouchers: [] })),
            apiGet('/launcher/categories').catch(() => ({ categories: [] })),
            apiGet('/launcher/apps').catch(() => ({ apps: [] })),
          ])
          members = (membersData.members ?? []).map(normalizeMember)
          topUpRequests = topUpsData.topUpRequests ?? []
          supportRequests = (supportData.supportRequests ?? []).map((request) => ({ ...request }))
          sessionExtensions = (extensionsData.extensions ?? []).map(normalizeSessionExtension)
          announcements = announcementsData.announcements ?? []
          menuItems = menuItemsData.menuItems ?? []
          menuOrders = menuOrdersData.orders ?? []
          currentShift = shiftData.activeShift ?? null
          vouchers = vouchersData.vouchers ?? []
          launcherCategories = launcherCatsData.categories ?? []
          launcherApps = launcherAppsData.apps ?? []
          settings = normalizeSettings(settingsData.settings ?? {})
        } else {
          const [memberData, settingsData, announcementsData, menuItemsData, launcherCatsData, launcherAppsData] = await Promise.all([
            apiGet('/members/me').catch(() => ({ member: null })),
            apiGet('/settings').catch(() => ({ settings: {} })),
            apiGet('/announcements').catch(() => ({ announcements: [] })),
            apiGet('/menu-items').catch(() => ({ menuItems: [] })),
            apiGet('/launcher/categories').catch(() => ({ categories: [] })),
            apiGet('/launcher/apps').catch(() => ({ apps: [] })),
          ])
          members = memberData.member ? [normalizeMember(memberData.member)] : []
          settings = normalizeSettings(settingsData.settings ?? {})
          announcements = announcementsData.announcements ?? []
          menuItems = menuItemsData.menuItems ?? []
          launcherCategories = launcherCatsData.categories ?? []
          launcherApps = launcherAppsData.apps ?? []
        }

        snapshot={
          pcs:(pcsData.pcs ?? []).map(normalizePc),
          members,
          ratePlans:(plansData.ratePlans ?? []).map(normalizeRatePlan),
          topUpRequests,
          supportRequests,
          sessionExtensions,
          announcements,
          menuItems,
          menuOrders,
          currentShift,
          shiftsHistory:[],
          vouchers,
          launcherCategories,
          launcherApps,
          settings,
          loading:false,
          serverError:'',
          clientContext:clientContextData ?? null,
        }
      }
      if (generation !== refreshGenerationRef.current || requestCacheKey !== scopedPageCacheKey('app-data',user)) return
      setState((current) => ({ ...current, ...snapshot }))
      if(requestCacheKey) void writeSnapshot(requestCacheKey,snapshot)
    } catch (error) {
      if (generation !== refreshGenerationRef.current) return
      setState((s) => ({ ...s, loading:false, serverError:error.message || 'Backend unavailable.' }))
    }
  }, [user])

  useEffect(() => {
    const effectGeneration=++refreshGenerationRef.current
    let active=true
    if (cacheKey) readSnapshot(cacheKey).then((snapshot)=>{if(active&&snapshot){const confirmed=sanitizeCachedSnapshot(snapshot);setState((current)=>({...current,...confirmed,loading:false,serverError:''}));void writeSnapshot(cacheKey,confirmed)}}).finally(()=>{if(active)refresh()})
    else refresh()
    if (!user) return undefined
    if (isCloudAdmin()) {
      let timer=null
      let stopRealtime=null
      const cloudRefresh=async({ allowHidden=false }={})=>{
        if (!allowHidden && document.visibilityState === 'hidden') return
        try{
          await refresh()
          if(active)setState(current=>({...current,realtimeConnected:navigator.onLine}))
        }catch{if(active)setState(current=>({...current,realtimeConnected:false}))}
      }
      const onOnline=()=>cloudRefresh()
      const onBranch=()=>{
        refreshGenerationRef.current += 1
        const nextKey=scopedPageCacheKey('app-data',user)
        if(nextKey) void readSnapshot(nextKey).then(snapshot=>{if(active&&snapshot){const confirmed=sanitizeCachedSnapshot(snapshot);setState(current=>({...current,...confirmed,loading:false,serverError:''}));void writeSnapshot(nextKey,confirmed)}}).finally(()=>{if(active)void cloudRefresh()})
        else void cloudRefresh()
      }
      const onVisible=()=>{if(document.visibilityState==='visible')void cloudRefresh()}
      // Station pairing/availability is staff-facing and time-sensitive (an admin
      // is often staring at the Floor Matrix waiting to see a PC go from
      // "unpaired"/occupied to available). Re-focusing the window is a much more
      // common gesture than a full tab hide/show, so it needs its own listener
      // rather than relying on visibilitychange alone.
      window.addEventListener('online',onOnline)
      window.addEventListener('focus',onVisible)
      window.addEventListener('aezakmi:cloud-branch-changed',onBranch)
      document.addEventListener('visibilitychange',onVisible)
      stopRealtime=startCloudRealtime({
        branchId:cloudBranchId(),
        // A realtime change means the cached app-data snapshot is stale.
        // Without invalidating it first, apiGet('/app-data') can return its
        // 20-second cached value and defer customer requests until the cache
        // expires. Realtime events must also update a minimized Admin window
        // so the pending queue is ready the moment staff returns to it.
        onChange:()=>{invalidateApiCache();void cloudRefresh({allowHidden:true})},
        onStatus:(connected)=>{if(active)setState(current=>({...current,realtimeConnected:connected}))},
      })
      // Realtime is the fast path; this only heals missed events or a
      // temporarily unavailable subscription.
      timer=setInterval(cloudRefresh,60000)
      return()=>{active=false;if(refreshGenerationRef.current===effectGeneration)refreshGenerationRef.current+=1;clearInterval(timer);stopRealtime?.();window.removeEventListener('online',onOnline);window.removeEventListener('focus',onVisible);window.removeEventListener('aezakmi:cloud-branch-changed',onBranch);document.removeEventListener('visibilitychange',onVisible)}
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
    const invalidateAndRefresh = () => { invalidateApiCache(); queueRefresh() }
    const onSocketConnect = () => { setState((current) => ({ ...current, realtimeConnected:true })); invalidateAndRefresh() }
    const onSocketDisconnect = () => { setState((current) => ({ ...current, realtimeConnected:false })) }
    const onSocketError = () => { setState((current) => ({ ...current, realtimeConnected:false })) }
    const onAuthRevoked = (payload) => window.dispatchEvent(new CustomEvent('aezakmi:auth-invalid',{detail:payload}))

    // data:changed is the authoritative invalidation event. It performs an
    // in-app data refresh; it never reloads the browser/Electron window.
    const onChanged = invalidateAndRefresh
    const onRatePlansUpdated = invalidateAndRefresh
    const onAnnouncementsUpdated = invalidateAndRefresh

    // session:updated / topup:updated used to be a plain invalidateAndRefresh,
    // meaning "+1 Hour", lock/unlock, and top-up approvals only appeared on
    // the dashboard after a full REST refetch (~75ms debounce + round trip).
    // We now patch the live-watched fields into state the instant the event
    // arrives (true zero-latency, no refresh needed), and keep
    // invalidateAndRefresh() running underneath as the reconciliation pass
    // for everything a hand-patch doesn't cover (session start/end,
    // status transitions, fields this particular event didn't carry).
    const onSessionUpdated = (payload = {}) => {
      if (!seqGuardRef.current(payload, 'admin')) return
      const pcId = payload.pcId
      if (pcId) {
        setState((current) => ({
          ...current,
          pcs: current.pcs.map((pc) => {
            if (String(pc.id) !== String(pcId) || !pc.session) return pc
            const patch = {}
            if (payload.remainingSeconds != null) patch.remainingSeconds = Number(payload.remainingSeconds)
            if (payload.amount != null) patch.amount = Number(payload.amount)
            if (payload.locked != null) patch.isLocked = Boolean(payload.locked)
            if (Object.keys(patch).length === 0) return pc
            return { ...pc, session: { ...pc.session, ...patch, pending: false } }
          }),
        }))
      }
      invalidateAndRefresh()
    }
    const onTopUpUpdated = (payload = {}) => {
      if (!seqGuardRef.current(payload, 'admin')) return
      const requestId = payload.id ?? payload.requestId
      if (requestId) {
        setState((current) => ({
          ...current,
          topUpRequests: current.topUpRequests.map((r) =>
            String(r.id) === String(requestId) ? { ...r, ...payload, id: r.id, pending: false } : r
          ),
        }))
      }
      invalidateAndRefresh()
    }
    const onCommandStatus = (payload) => {
      invalidateAndRefresh()
      if (payload?.id && suppressedCommandToastIds.has(payload.id)) {
        if (payload.status === 'completed' || payload.status === 'failed') suppressedCommandToastIds.delete(payload.id)
        return
      }
      if(payload?.status==='completed') {
        playAdminSound('success', { dedupeKey:`command:${payload.id || 'completed'}` })
        showToast({title:'Station command completed',message:'The customer station acknowledged the command.'})
      }
      if(payload?.status==='failed') {
        playAdminSound('station-warning', { dedupeKey:`command:${payload.id || 'failed'}` })
        showToast({title:'Station command failed',message:payload?.result?.error || 'The station did not complete the command.',tone:'warning'})
      }
    }
    const onPcPresence = (payload) => {
      if (!payload?.pcId) return
      setState((current) => {
        const previous=current.pcs.find((pc)=>String(pc.id)===String(payload.pcId))
        const hasSession=Boolean(previous?.session)
        const nextStatus=hasSession ? 'occupied' : payload.online ? 'available' : 'offline'
        if (!payload.online && previous && previous.stationOnline !== false && previous.cloudOnline !== false) {
          playAdminSound('station-warning', { dedupeKey:`offline:${payload.pcId}`, dedupeMs:10000 })
        }
        return { ...current, pcs: current.pcs.map((pc) => String(pc.id) === String(payload.pcId) ? {
          ...pc,
          status:nextStatus,
          stationOnline:Boolean(payload.online),
          isOnline:Boolean(payload.online),
          cloudOnline:Boolean(payload.online),
          cloudConnectionStatus:payload.online ? 'online' : 'offline',
          stationLastSeenAt:payload.online ? (payload.at || new Date().toISOString()) : pc.stationLastSeenAt,
        } : pc) }
      })
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
      invalidateAndRefresh()
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
        if (!['admin', 'cashier'].includes(user.role)) return current
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

    const onOrderNewRequest = (order) => {
      if (!['admin', 'cashier'].includes(user.role)) return
      playAdminSound('order')
      setState((current) => ({
        ...current,
        menuOrders: [order, ...current.menuOrders.filter((o) => o.id !== order.id)],
      }))
    }

    const onOrderUpdated = (order) => {
      setState((current) => ({
        ...current,
        menuOrders: current.menuOrders.map((o) => (o.id === order.id ? { ...o, ...order } : o)),
      }))
    }

    const onShiftUpdated = (payload) => {
      if (payload?.activeShift !== undefined) {
        setState((current) => ({ ...current, currentShift: payload.activeShift }))
      } else {
        invalidateAndRefresh()
      }
    }

    const onVouchersUpdated = () => {
      invalidateAndRefresh()
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
    socket.on('order:new_request', onOrderNewRequest)
    socket.on('order:updated', onOrderUpdated)
    socket.on('menu:order_updated', onOrderUpdated)
    socket.on('shift:updated', onShiftUpdated)
    socket.on('vouchers:updated', onVouchersUpdated)

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
      socket.off('order:new_request', onOrderNewRequest)
      socket.off('order:updated', onOrderUpdated)
      socket.off('menu:order_updated', onOrderUpdated)
      socket.off('shift:updated', onShiftUpdated)
      socket.off('vouchers:updated', onVouchersUpdated)
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
    // Optimistic UI is memory-only. IndexedDB remains the last confirmed server
    // snapshot so failed mutations cannot become stale authority after reload.
    setState((current) => updater(current))
  }

  function startSession(pc, sessionInput) {
    const pendingId=`pending:${Date.now()}`
    optimisticState((current)=>({...current,pcs:current.pcs.map((item)=>String(item.id)===String(pc.id)?{...item,status:'occupied',session:{id:pendingId,pcId:pc.id,customerId:sessionInput.customerId??null,customerName:sessionInput.customerName??'Starting…',billing:sessionInput.billing??'prepaid',ratePlanId:sessionInput.ratePlanId??null,startedAt:Date.now(),observedAt:Date.now(),pending:true}}:item)}))
    return apiPost('/sessions/start', { pcId:pc.id, pcIp:pc.ipAddress, ...sessionInput }).then((result) => { playAdminSound('success', { dedupeKey:`session-start:${pc.id}` }); showToast({ title:'Session started', message:`${pc.label} is now in use.` }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  function getSessionPreview(pc) {
    if (!pc?.session?.id) return Promise.resolve(null)
    return apiGet(`/sessions/${pc.session.id}/settlement-preview`)
  }

  async function waitForStationCommand(commandId, timeoutMs = 22000) {
    const deadline=Date.now()+timeoutMs
    let lastStatus='queued'
    // Realtime normally wakes the station immediately, so status polling is only
    // a completion fallback. Back off instead of hammering station-admin 4x/sec.
    let pollDelayMs=500
    while (Date.now() < deadline) {
      try {
        const response=await apiGet(`/remote-commands/${encodeURIComponent(commandId)}`, { force:true })
        const command=response?.command || response
        lastStatus=String(command?.status || lastStatus).toLowerCase()
        if (lastStatus === 'completed') return command
        if (lastStatus === 'failed' || lastStatus === 'expired') {
          const message=command?.result?.error || 'Customer Station could not confirm the session exit.'
          const error=new Error(message)
          error.code=command?.result?.code || 'STATION_EXIT_FAILED'
          throw error
        }
      } catch (error) {
        if (error?.code !== 'COMMAND_NOT_FOUND' && error?.status !== 404) throw error
      }
      const remaining=Math.max(0,deadline-Date.now())
      if (!remaining) break
      await new Promise((resolve)=>setTimeout(resolve,Math.min(pollDelayMs,remaining)))
      pollDelayMs=Math.min(2000,Math.round(pollDelayMs*1.5))
    }
    const error=new Error(`Customer Station did not confirm the session exit (last status: ${lastStatus}). No Pause & Save, forfeit, or refund was committed.`)
    error.code='STATION_EXIT_TIMEOUT'
    throw error
  }

  async function prepareSessionClose(pc, disposition) {
    if (!pc?.session?.id) return null
    // If presence is definitively offline there is no renderer that can race
    // this action. The interrupted-session path already owns persistence.
    if (String(pc.status || '').toLowerCase() === 'offline' || pc.stationOnline === false || pc.isOnline === false || pc.cloudConnectionStatus === 'offline') return null
    // Session close preparation must never mutate billing state. `game_update`
    // is only the transport envelope. Customer Station interprets sessionClose:
    // Forfeit logs the user out to the login kiosk immediately; Save/Refund use
    // the reversible protected-close state. Only after that local boundary ACKs
    // does Admin mutate the authoritative session.
    const queued=await apiPost('/remote-commands', {
      pcId:pc.id,
      command:'game_update',
      payload:{ sessionClose:true, sessionId:pc.session.id, disposition, requestedAt:new Date().toISOString() },
    })
    if (!queued?.commandId) throw Object.assign(new Error('Customer Station close command was not created.'),{code:'STATION_EXIT_COMMAND_MISSING'})
    const command=await waitForStationCommand(queued.commandId)
    const memberId=pc.session?.customerId ?? pc.session?.memberId ?? null
    return { commandId:queued.commandId, command, pcId:pc.id, sessionId:pc.session.id, disposition, memberId, guestSession:memberId == null }
  }

  async function releasePreparedSessionClose(pc, prepared) {
    if (!prepared?.sessionId || !pc?.id) return null
    try {
      return await apiPost('/remote-commands', {
        pcId:pc.id,
        command:'game_update',
        payload:{ sessionCloseRelease:true, sessionId:prepared.sessionId, disposition:prepared.disposition || null, requestedAt:new Date().toISOString() },
      })
    } catch {
      // Best-effort local rollback. The original accounting error remains the
      // actionable Admin error; Customer also has a short self-expiring fence.
      return null
    }
  }

  async function commitPreparedSessionClose(pc, prepared, result = null) {
    if (!prepared?.sessionId || !pc?.id) return null
    try {
      return await apiPost('/remote-commands', {
        pcId:pc.id,
        command:'game_update',
        payload:{
          sessionCloseCommit:true,
          sessionId:prepared.sessionId,
          disposition:prepared.disposition || null,
          memberId:result?.memberId ?? prepared.memberId ?? null,
          guestSession:result?.memberId != null ? false : prepared.guestSession === true,
          remainingSeconds:Number(result?.remainingSeconds ?? result?.savedRemainingSeconds ?? 0),
          requestedAt:new Date().toISOString(),
        },
      })
    } catch {
      // The accounting transaction is already committed. Never undo it because
      // a final UI signal could not be queued; Cloud wakeup/polling is the
      // independent terminal-session backstop on Customer Station.
      return null
    }
  }

  async function endSession(pc, disposition = 'save', options = {}) {
    if (!pc?.session?.id) return
    const sessionId=pc.session.id
    const memberId=pc.session?.customerId ?? pc.session?.memberId ?? null
    const guestSession=memberId == null
    try {
      // Admin session closure is server-authoritative. Do NOT make Pause & Save
      // or Forfeit depend on a remote-command ACK first: a stale/pending station
      // command used to surface the generic "Unable to manage Customer Station"
      // error and leave billing active. Commit the close first, then send the
      // terminal station signal as best effort. Cloud/local backends independently
      // revoke Customer auth and broadcast the terminal close as another backstop.
      const result=await apiPost(`/sessions/${sessionId}/end`, { disposition, ...options })
      if (disposition === 'save' || disposition === 'forfeit') {
        const committed={ pcId:pc.id, sessionId, disposition, memberId, guestSession }
        await commitPreparedSessionClose(pc, committed, result)
      }
      optimisticState((current)=>({...current,pcs:current.pcs.map((item)=>String(item.id)===String(pc.id)?{...item,status:'available',session:null,pendingSessionEnd:sessionId}:item)}))
      playAdminSound('success', { dedupeKey:`session-end:${pc.id}` })
      showToast({ title:disposition==='settle'?'Legacy session settled':disposition==='forfeit'?'Session forfeited':'Session saved', message:disposition==='settle'?`₱${Number(result.amountDue||0).toFixed(2)} paid by ${result.paymentMethod}.`:`${pc.label} is available again.` })
      refresh()
      return result
    } catch (error) {
      refresh()
      throw error
    }
  }

  async function refundSession(pc) {
    if (!pc?.session?.id) return
    const sessionId=pc.session.id
    const memberId=pc.session?.customerId ?? pc.session?.memberId ?? null
    const guestSession=memberId == null
    let prepared=null
    try {
      // Same authority rule as Guest Forfeit/Pause & Save: refund must not be
      // blocked by Customer Station command delivery. The DB transaction is
      // authoritative; realtime + best-effort commit command logs the Guest out.
      if (!guestSession) prepared=await prepareSessionClose(pc, 'refund')
      const result=await apiPost(`/sessions/${sessionId}/refund`)
      if (guestSession) prepared={ pcId:pc.id, sessionId, disposition:'refund', memberId:null, guestSession:true }
      if (prepared) await commitPreparedSessionClose(pc, prepared, result)
      await refresh()
      showToast({ title:'Session refunded', message:`₱${Number(result.refundAmount||0).toFixed(2)} returned by ${result.destination}.` })
      return result
    } catch (error) {
      if (prepared) await releasePreparedSessionClose(pc, prepared)
      await refresh()
      throw error
    }
  }

  const setMaintenance = useOptimisticAction(setState, refresh, {
    optimistic: (current, pc, toMaintenance = true) => ({
      ...current,
      pcs: current.pcs.map((item) =>
        String(item.id) === String(pc.id)
          ? { ...item, status: toMaintenance ? 'maintenance' : 'offline', pending: true }
          : item
      ),
    }),
    action: (pc, toMaintenance = true) => apiPatch(`/pcs/${pc.id}`, { status: toMaintenance ? 'maintenance' : 'offline' }),
    onSuccess: (_, pc, toMaintenance = true) =>
      showToast({
        title: toMaintenance ? 'Maintenance enabled' : 'PC restored',
        message: toMaintenance ? pc.label : `${pc.label} is waiting for station connection.`,
      }),
  })

  function powerCommand(pc, command, options = {}) {
    const normalizedCommand = command === 'restart' ? 'reboot' : command
    const isSessionLockCommand = normalizedCommand === 'lock' || normalizedCommand === 'unlock'
    const isPowerInterruption = normalizedCommand === 'reboot' || normalizedCommand === 'shutdown'
    let previousPc = null

    // Admin-induced blocking is authoritative immediately. Lock freezes the
    // visible timer while keeping the session resumable; restart/shutdown
    // removes the live session from the desk immediately because the backend
    // has already saved it and revoked the Customer identity before dispatch.
    if ((isSessionLockCommand || isPowerInterruption) && pc?.session) {
      const dispatchedAt = Date.now()
      setState((current) => {
        const target = current.pcs.find((item) => String(item.id) === String(pc.id))
        if (!target?.session) return current
        previousPc = target
        if (isPowerInterruption) {
          return {
            ...current,
            pcs: current.pcs.map((item) => String(item.id) === String(pc.id)
              ? { ...item, status:'offline', session:null, pendingPowerCommand:normalizedCommand, interruptedAt:dispatchedAt }
              : item),
          }
        }
        const nextSession = normalizedCommand === 'lock'
          ? {
              ...target.session,
              isLocked:true,
              isPaused:true,
              pausedAt:dispatchedAt,
              pauseReason:'admin_lock',
              pendingCommand:'lock',
              observedAt:dispatchedAt,
              ...(target.session.billing === 'prepaid'
                ? { remainingSeconds:remainingSessionSeconds(target.session,dispatchedAt), pausedRemainingSeconds:remainingSessionSeconds(target.session,dispatchedAt) }
                : { billableSeconds:elapsedSessionSeconds(target.session,dispatchedAt), elapsedBillableSeconds:elapsedSessionSeconds(target.session,dispatchedAt) }),
            }
          : { ...target.session, isLocked:false, isPaused:false, pausedAt:null, pauseReason:null, pendingCommand:'unlock', observedAt:dispatchedAt }
        return {
          ...current,
          pcs: current.pcs.map((item) => String(item.id) === String(pc.id) ? { ...item, session:nextSession } : item),
        }
      })
    }

    return apiPost('/remote-commands', { pcId:pc.id, command:normalizedCommand, payload:options.payload || null })
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
            pcs: current.pcs.map((item) => String(item.id) === String(pc.id) && (
              isPowerInterruption || item.session?.pendingCommand === normalizedCommand
            ) ? previousPc : item),
          }))
        }
        throw error
      })
  }

  function addPc(pc, options = {}) {
    // Adding a PC is confirmation-first: never insert a temporary optimistic row
    // into the local array. A station create assigns the canonical ID and capacity slot.
    return apiPost('/pcs', pc, { operationKey:options.operationKey }).then((result) => {
      showToast({
        title: result?.duplicate ? 'PC already registered' : 'PC added',
        message: result?.duplicate ? `${pc.label} was already saved and has been restored to the floor.` : `${pc.label} is now registered.`,
      })
      refresh().catch(() => {})
      return result
    }).catch((error) => {
      refresh().catch(() => {})
      throw error
    })
  }

  function updatePcMeta(id, patch) {
    optimisticState((current)=>({...current,pcs:current.pcs.map((pc)=>String(pc.id)===String(id)?normalizePc({...pc,...patch,pending:true}):pc)}))
    return apiPatch(`/pcs/${id}`, patch).then((result) => { showToast({ title:'PC updated', message:'Station details saved.' }); refresh(); return result }).catch((error)=>{refresh();throw error})
  }

  async function removePc(id, options = {}) {
    // Removing a PC is confirmation-first: wait for server confirmation before
    // removing from state.
    const result = await apiDelete(`/pcs/${id}`)
    if (!options.silent) showToast({ title: 'PC removed', message: 'The station was removed from the floor.' })
    await refresh()
    return result
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

  const approveTopUp = useOptimisticAction(setState, refresh, {
    optimistic: (current, id) => ({
      ...current,
      topUpRequests: current.topUpRequests.map((r) =>
        String(r.id) === String(id) ? { ...r, status:'approved', pending:true } : r
      ),
    }),
    action: (id) => apiPatch(`/top-ups/${id}/approve`),
    onSuccess: (_, id) => {
      playAdminSound('success', { dedupeKey:`topup-approved:${id}` })
      showToast({ title:'Top up approved', message:'Wallet balance was updated.' })
    },
  })

  const rejectTopUp = useOptimisticAction(setState, refresh, {
    optimistic: (current, id) => ({
      ...current,
      topUpRequests: current.topUpRequests.map((r) =>
        String(r.id) === String(id) ? { ...r, status:'rejected', pending:true } : r
      ),
    }),
    action: (id) => apiPatch(`/top-ups/${id}/reject`),
    onSuccess: () => showToast({ title:'Top up rejected', tone:'warning' }),
  })

  const confirmSessionExtension = useOptimisticAction(setState, refresh, {
    optimistic: (current, id) => ({
      ...current,
      sessionExtensions: current.sessionExtensions.map((e) =>
        String(e.id) === String(id) ? { ...e, status:'approved', pending:true } : e
      ),
    }),
    action: (id) => apiPost(`/session-extensions/${id}/confirm`, {}),
    onSuccess: () => showToast({ title:'Time extension approved', message:'The purchased time was added to the active session.' }),
  })

  const rejectSessionExtension = useOptimisticAction(setState, refresh, {
    optimistic: (current, id) => ({
      ...current,
      sessionExtensions: current.sessionExtensions.map((e) =>
        String(e.id) === String(id) ? { ...e, status:'rejected', pending:true } : e
      ),
    }),
    action: (id) => apiPost(`/session-extensions/${id}/reject`, {}),
    onSuccess: () => showToast({ title:'Time extension rejected', tone:'warning' }),
  })

  const clearResolvedTopUps = useOptimisticAction(setState, refresh, {
    optimistic: (current) => ({
      ...current,
      topUpRequests: current.topUpRequests.filter((r) => r.status === 'pending'),
    }),
    action: () => apiDelete('/top-ups/resolved'),
  })

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

  const resolveSupport = useOptimisticAction(setState, refresh, {
    optimistic: (current, id) => ({
      ...current,
      supportRequests: current.supportRequests.map((s) =>
        String(s.id) === String(id) ? { ...s, status:'resolved', pending:true } : s
      ),
    }),
    action: (id) => apiPatch(`/support/${id}/resolve`),
    onSuccess: () => showToast({ title:'Support request resolved' }),
  })

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
    const kind = payload?.kind
    const seconds = Number(payload?.seconds || 0)
    const targetPc = state.pcs.find((pc) => String(pc.session?.id) === String(sessionId))

    // "add"/"reduce" get an instant local patch — the delta on this PC's own
    // remaining time is unambiguous. "transfer" touches a second PC and is
    // left on the plain refreshAfter path below rather than guessed locally.
    if (targetPc && (kind === 'add' || kind === 'reduce') && seconds > 0) {
      const delta = kind === 'add' ? seconds : -seconds
      return runOptimistic({
        queueKey: `session:${sessionId}`,
        apply: (current) => ({
          ...current,
          pcs: current.pcs.map((pc) =>
            String(pc.id) === String(targetPc.id) && pc.session
              ? { ...pc, session: { ...pc.session, remainingSeconds: Math.max(0, Number(pc.session.remainingSeconds || 0) + delta), pendingTimeAdjust: true } }
              : pc
          ),
        }),
        rollback: (current) => ({
          ...current,
          pcs: current.pcs.map((pc) =>
            String(pc.id) === String(targetPc.id) && pc.session?.pendingTimeAdjust
              ? { ...pc, session: { ...pc.session, remainingSeconds: Math.max(0, Number(pc.session.remainingSeconds || 0) - delta), pendingTimeAdjust: false } }
              : pc
          ),
        }),
        request: (autoKey) => apiPost(`/sessions/${sessionId}/time-adjustments`, payload, { ...options, operationKey: options.operationKey || autoKey }),
        reconcile: (current, result) => ({
          ...current,
          pcs: current.pcs.map((pc) =>
            String(pc.id) === String(targetPc.id) && pc.session
              ? { ...pc, session: { ...pc.session, remainingSeconds: Number(result?.remainingSeconds ?? pc.session.remainingSeconds), amount: Number(result?.amount ?? pc.session.amount), pendingTimeAdjust: false } }
              : pc
          ),
        }),
        errorMessage: 'Could not adjust session time — reverted.',
      })
    }

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
    const prevSettings = state.settings
    setState((curr) => ({ ...curr, settings: normalizeSettings({ ...curr.settings, ...patch }) }))
    return apiPatch('/settings', patch)
      .then((result) => {
        const canonical = result?.settings
        if (canonical) {
          setState((curr) => ({ ...curr, settings: normalizeSettings(canonical) }))
        }
        refresh().catch(() => {})
        return result
      })
      .catch((err) => {
        setState((curr) => ({ ...curr, settings: prevSettings }))
        refresh().catch(() => {})
        throw err
      })
  }
  function updateSessionPolicy(patch) {
    const prevSettings = state.settings
    setState((curr) => ({ ...curr, settings: normalizeSettings({ ...curr.settings, ...patch }) }))
    return apiPatch('/billing-policy/session', patch)
      .then((result) => {
        refresh().catch(() => {})
        return result
      })
      .catch((err) => {
        setState((curr) => ({ ...curr, settings: prevSettings }))
        refresh().catch(() => {})
        throw err
      })
  }

  function createAnnouncement(payload) {
    const tempId = `temp:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
    const optimistic = {
      id: tempId,
      title: payload.title || '',
      message: payload.message || '',
      priority: payload.priority || 'normal',
      isActive: payload.isActive !== false,
      createdAt: new Date().toISOString(),
      pending: true,
    }
    setState((curr) => ({ ...curr, announcements: [optimistic, ...(curr.announcements || [])] }))
    return apiPost('/announcements', payload)
      .then((res) => {
        const canonical = res?.announcement
        if (canonical) {
          setState((curr) => ({
            ...curr,
            announcements: (curr.announcements || []).map((a) => a.id === tempId ? { ...canonical, pending: false } : a)
          }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({
          ...curr,
          announcements: (curr.announcements || []).filter((a) => a.id !== tempId)
        }))
        refresh().catch(() => {})
        throw err
      })
  }
  function updateAnnouncement(id, payload) {
    const prev = (state.announcements || []).find((a) => String(a.id) === String(id))
    setState((curr) => ({
      ...curr,
      announcements: (curr.announcements || []).map((a) =>
        String(a.id) === String(id) ? { ...a, ...payload, pending: true } : a
      )
    }))
    return apiPatch(`/announcements/${id}`, payload)
      .then((res) => {
        const canonical = res?.announcement
        if (canonical) {
          setState((curr) => ({
            ...curr,
            announcements: (curr.announcements || []).map((a) =>
              String(a.id) === String(id) ? { ...a, ...canonical, pending: false } : a
            )
          }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        if (prev) {
          setState((curr) => ({
            ...curr,
            announcements: (curr.announcements || []).map((a) =>
              String(a.id) === String(id) ? prev : a
            )
          }))
        }
        refresh().catch(() => {})
        throw err
      })
  }
  function deleteAnnouncement(id) {
    const prev = (state.announcements || []).find((a) => String(a.id) === String(id))
    setState((curr) => ({
      ...curr,
      announcements: (curr.announcements || []).filter((a) => String(a.id) !== String(id))
    }))
    return apiDelete(`/announcements/${id}`)
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        if (prev) {
          setState((curr) => ({
            ...curr,
            announcements: [prev, ...(curr.announcements || [])]
          }))
        }
        refresh().catch(() => {})
        throw err
      })
  }

  // Menu Items & Orders
  function createMenuItem(payload) {
    const tempId = `temp:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
    const optimisticItem = {
      id: tempId,
      name: payload.name,
      category: payload.category || 'Food',
      description: payload.description || '',
      price: Number(payload.price || 0),
      imageUrl: payload.imageUrl || '',
      stockQuantity: payload.stockQuantity != null ? Number(payload.stockQuantity) : null,
      isAvailable: payload.isAvailable !== false,
      isActive: true,
      pending: true,
    }
    setState((curr) => ({ ...curr, menuItems: [optimisticItem, ...(curr.menuItems || [])] }))
    return apiPost('/menu-items', payload)
      .then((res) => {
        const canonical = res?.menuItem
        if (canonical) {
          setState((curr) => ({
            ...curr,
            menuItems: (curr.menuItems || []).map((m) => m.id === tempId ? { ...canonical, pending: false } : m)
          }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({
          ...curr,
          menuItems: (curr.menuItems || []).filter((m) => m.id !== tempId)
        }))
        refresh().catch(() => {})
        throw err
      })
  }
  function batchCreateMenuItems(items) {
    const optimisticItems = items.map((item, idx) => ({
      id: `temp:${Date.now()}:${idx}`,
      name: item.name,
      category: item.category || 'Food',
      description: item.description || '',
      price: Number(item.price || 0),
      imageUrl: item.imageUrl || '',
      stockQuantity: item.stockQuantity != null ? Number(item.stockQuantity) : null,
      isAvailable: item.isAvailable !== false,
      isActive: true,
      pending: true,
    }))
    const prevItems = state.menuItems || []
    setState((curr) => ({ ...curr, menuItems: [...optimisticItems, ...(curr.menuItems || [])] }))
    return apiPost('/menu-items/batch', { items })
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({ ...curr, menuItems: prevItems }))
        refresh().catch(() => {})
        throw err
      })
  }
  function updateMenuItem(id, payload) {
    const prevItem = (state.menuItems || []).find((m) => String(m.id) === String(id))
    setState((curr) => ({
      ...curr,
      menuItems: (curr.menuItems || []).map((m) =>
        String(m.id) === String(id) ? { ...m, ...payload, pending: true } : m
      )
    }))
    return apiPatch(`/menu-items/${id}`, payload)
      .then((res) => {
        const canonical = res?.menuItem
        if (canonical) {
          setState((curr) => ({
            ...curr,
            menuItems: (curr.menuItems || []).map((m) =>
              String(m.id) === String(id) ? { ...m, ...canonical, pending: false } : m
            )
          }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        if (prevItem) {
          setState((curr) => ({
            ...curr,
            menuItems: (curr.menuItems || []).map((m) =>
              String(m.id) === String(id) ? prevItem : m
            )
          }))
        }
        refresh().catch(() => {})
        throw err
      })
  }
  function deleteMenuItem(id) {
    const prevItem = (state.menuItems || []).find((m) => String(m.id) === String(id))
    setState((curr) => ({
      ...curr,
      menuItems: (curr.menuItems || []).filter((m) => String(m.id) !== String(id))
    }))
    return apiDelete(`/menu-items/${id}`)
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        if (prevItem) {
          setState((curr) => ({
            ...curr,
            menuItems: [prevItem, ...(curr.menuItems || [])]
          }))
        }
        refresh().catch(() => {})
        throw err
      })
  }
  function updateOrderStatus(id, status) {
    const prevOrders = state.menuOrders || []
    setState((curr) => ({
      ...curr,
      menuOrders: (curr.menuOrders || []).map((o) =>
        String(o.id) === String(id) ? { ...o, status, order_status: status, orderStatus: status, pending: true } : o
      )
    }))
    return apiPatch(`/menu-orders/${id}/status`, { status })
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({ ...curr, menuOrders: prevOrders }))
        refresh().catch(() => {})
        throw err
      })
  }
  function cancelMenuOrder(id) {
    const prevOrders = state.menuOrders || []
    setState((curr) => ({
      ...curr,
      menuOrders: (curr.menuOrders || []).map((o) =>
        String(o.id) === String(id) ? { ...o, status: 'cancelled', order_status: 'cancelled', orderStatus: 'cancelled', pending: true } : o
      )
    }))
    return apiPost(`/menu-orders/${id}/cancel`, {})
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({ ...curr, menuOrders: prevOrders }))
        refresh().catch(() => {})
        throw err
      })
  }

  // Shifts
  function openShift(payload) {
    const prevShift = state.currentShift
    const optimistic = {
      id: `temp:${Date.now()}`,
      openingFloat: Number(payload.openingFloat || 0),
      openedAt: new Date().toISOString(),
      cashierName: user?.name || 'Staff',
      status: 'open',
      pending: true,
    }
    setState((curr) => ({ ...curr, currentShift: optimistic }))
    return apiPost('/shifts/open', payload)
      .then((res) => {
        const canonical = res?.shift || res?.activeShift
        if (canonical) {
          setState((curr) => ({ ...curr, currentShift: { ...canonical, pending: false } }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({ ...curr, currentShift: prevShift }))
        refresh().catch(() => {})
        throw err
      })
  }
  function closeShift(payload) {
    const prevShift = state.currentShift
    setState((curr) => ({ ...curr, currentShift: null }))
    return apiPost('/shifts/close', payload)
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({ ...curr, currentShift: prevShift }))
        refresh().catch(() => {})
        throw err
      })
  }
  function fetchShiftHistory() { return apiGet('/shifts/history') }

  // Vouchers
  function createVoucher(payload) {
    const tempId = `temp:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
    const optimistic = {
      id: tempId,
      code: payload.code,
      benefitType: payload.benefitType,
      benefit_type: payload.benefitType,
      valueAmount: payload.valueAmount,
      value_amount: payload.valueAmount,
      maxRedemptions: payload.maxRedemptions,
      max_redemptions: payload.maxRedemptions,
      redemptionsCount: 0,
      redemptions_count: 0,
      isActive: true,
      is_active: true,
      expiresAt: payload.expiresAt,
      expires_at: payload.expiresAt,
      pending: true,
    }
    setState((curr) => ({ ...curr, vouchers: [optimistic, ...(curr.vouchers || [])] }))
    return apiPost('/vouchers', payload)
      .then((res) => {
        const canonical = res?.voucher
        if (canonical) {
          setState((curr) => ({
            ...curr,
            vouchers: (curr.vouchers || []).map((v) => v.id === tempId ? { ...canonical, pending: false } : v)
          }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({
          ...curr,
          vouchers: (curr.vouchers || []).filter((v) => v.id !== tempId)
        }))
        refresh().catch(() => {})
        throw err
      })
  }
  function deleteVoucher(id) {
    const prevVoucher = (state.vouchers || []).find((v) => String(v.id) === String(id))
    setState((curr) => ({
      ...curr,
      vouchers: (curr.vouchers || []).filter((v) => String(v.id) !== String(id))
    }))
    return apiDelete(`/vouchers/${id}`)
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        if (prevVoucher) {
          setState((curr) => ({
            ...curr,
            vouchers: [prevVoucher, ...(curr.vouchers || [])]
          }))
        }
        refresh().catch(() => {})
        throw err
      })
  }

  // Launcher Categories & Apps
  function createLauncherCategory(payload) {
    const tempId = `temp:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
    const optimistic = {
      id: tempId,
      name: payload.name,
      sortOrder: payload.sortOrder || 0,
      isActive: true,
      pending: true,
    }
    setState((curr) => ({ ...curr, launcherCategories: [...(curr.launcherCategories || []), optimistic] }))
    return apiPost('/launcher/categories', payload)
      .then((res) => {
        const canonical = res?.category
        if (canonical) {
          setState((curr) => ({
            ...curr,
            launcherCategories: (curr.launcherCategories || []).map((c) => c.id === tempId ? { ...canonical, pending: false } : c)
          }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({
          ...curr,
          launcherCategories: (curr.launcherCategories || []).filter((c) => c.id !== tempId)
        }))
        refresh().catch(() => {})
        throw err
      })
  }
  function updateLauncherCategory(id, payload) {
    const prevCat = (state.launcherCategories || []).find((c) => String(c.id) === String(id))
    setState((curr) => ({
      ...curr,
      launcherCategories: (curr.launcherCategories || []).map((c) =>
        String(c.id) === String(id) ? { ...c, ...payload, pending: true } : c
      )
    }))
    return apiPatch(`/launcher/categories/${id}`, payload)
      .then((res) => {
        const canonical = res?.category
        if (canonical) {
          setState((curr) => ({
            ...curr,
            launcherCategories: (curr.launcherCategories || []).map((c) =>
              String(c.id) === String(id) ? { ...c, ...canonical, pending: false } : c
            )
          }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        if (prevCat) {
          setState((curr) => ({
            ...curr,
            launcherCategories: (curr.launcherCategories || []).map((c) =>
              String(c.id) === String(id) ? prevCat : c
            )
          }))
        }
        refresh().catch(() => {})
        throw err
      })
  }
  function deleteLauncherCategory(id) {
    const prevCat = (state.launcherCategories || []).find((c) => String(c.id) === String(id))
    setState((curr) => ({
      ...curr,
      launcherCategories: (curr.launcherCategories || []).filter((c) => String(c.id) !== String(id))
    }))
    return apiDelete(`/launcher/categories/${id}`)
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        if (prevCat) {
          setState((curr) => ({
            ...curr,
            launcherCategories: [...(curr.launcherCategories || []), prevCat]
          }))
        }
        refresh().catch(() => {})
        throw err
      })
  }

  function createLauncherApp(payload) {
    const tempId = `temp:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`
    const optimistic = {
      id: tempId,
      name: payload.name,
      categoryId: payload.categoryId || null,
      categoryName: payload.categoryName || 'Online Games',
      icon: payload.icon || '🎮',
      executablePath: payload.executablePath || '',
      protocolUrl: payload.protocolUrl || '',
      launchArguments: payload.launchArguments || '',
      workingDirectory: payload.workingDirectory || '',
      isEnabled: payload.isEnabled !== false,
      sortOrder: Number(payload.sortOrder || 0),
      isPreset: Boolean(payload.isPreset),
      pending: true,
    }
    setState((curr) => ({ ...curr, launcherApps: [...(curr.launcherApps || []), optimistic] }))
    return apiPost('/launcher/apps', payload)
      .then((res) => {
        const canonical = res?.app
        if (canonical) {
          setState((curr) => ({
            ...curr,
            launcherApps: (curr.launcherApps || []).map((a) => a.id === tempId ? { ...canonical, pending: false } : a)
          }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({
          ...curr,
          launcherApps: (curr.launcherApps || []).filter((a) => a.id !== tempId)
        }))
        refresh().catch(() => {})
        throw err
      })
  }
  function batchCreateLauncherApps(apps) {
    const optimisticApps = apps.map((app, idx) => ({
      id: `temp:${Date.now()}:${idx}`,
      name: app.name,
      categoryId: app.categoryId || null,
      categoryName: app.categoryName || 'Online Games',
      icon: app.icon || '🎮',
      executablePath: app.executablePath || app.exe || '',
      protocolUrl: app.protocolUrl || app.protocol || '',
      launchArguments: app.launchArguments || '',
      workingDirectory: app.workingDirectory || '',
      isEnabled: app.isEnabled !== false,
      sortOrder: Number(app.sortOrder || 0),
      isPreset: Boolean(app.isPreset),
      pending: true,
    }))
    const prevApps = state.launcherApps || []
    setState((curr) => ({ ...curr, launcherApps: [...(curr.launcherApps || []), ...optimisticApps] }))
    return apiPost('/launcher/apps/batch', { apps })
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        setState((curr) => ({ ...curr, launcherApps: prevApps }))
        refresh().catch(() => {})
        throw err
      })
  }
  function updateLauncherApp(id, payload) {
    const prevApp = (state.launcherApps || []).find((a) => String(a.id) === String(id))
    setState((curr) => ({
      ...curr,
      launcherApps: (curr.launcherApps || []).map((a) =>
        String(a.id) === String(id) ? { ...a, ...payload, pending: true } : a
      )
    }))
    return apiPatch(`/launcher/apps/${id}`, payload)
      .then((res) => {
        const canonical = res?.app
        if (canonical) {
          setState((curr) => ({
            ...curr,
            launcherApps: (curr.launcherApps || []).map((a) =>
              String(a.id) === String(id) ? { ...a, ...canonical, pending: false } : a
            )
          }))
        }
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        if (prevApp) {
          setState((curr) => ({
            ...curr,
            launcherApps: (curr.launcherApps || []).map((a) =>
              String(a.id) === String(id) ? prevApp : a
            )
          }))
        }
        refresh().catch(() => {})
        throw err
      })
  }
  function deleteLauncherApp(id) {
    const prevApp = (state.launcherApps || []).find((a) => String(a.id) === String(id))
    setState((curr) => ({
      ...curr,
      launcherApps: (curr.launcherApps || []).filter((a) => String(a.id) !== String(id))
    }))
    return apiDelete(`/launcher/apps/${id}`)
      .then((res) => {
        refresh().catch(() => {})
        return res
      })
      .catch((err) => {
        if (prevApp) {
          setState((curr) => ({
            ...curr,
            launcherApps: [...(curr.launcherApps || []), prevApp]
          }))
        }
        refresh().catch(() => {})
        throw err
      })
  }

  // Reports
  function sendEmailSummary(period = 'daily', recipientEmail = '') {
    return apiPost('/reports/send-summary', { period, recipientEmail })
  }

  return (
    <AppDataContext.Provider value={{
      pcs:state.pcs,
      members:state.members,
      ratePlans:state.ratePlans,
      topUpRequests:state.topUpRequests,
      supportRequests:state.supportRequests,
      sessionExtensions:state.sessionExtensions,
      announcements:state.announcements,
      menuItems:state.menuItems,
      menuOrders:state.menuOrders,
      currentShift:state.currentShift,
      vouchers:state.vouchers,
      launcherCategories:state.launcherCategories,
      launcherApps:state.launcherApps,
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
      createMenuItem,
      batchCreateMenuItems,
      updateMenuItem,
      deleteMenuItem,
      updateOrderStatus,
      cancelMenuOrder,
      openShift,
      closeShift,
      fetchShiftHistory,
      createVoucher,
      deleteVoucher,
      createLauncherCategory,
      updateLauncherCategory,
      deleteLauncherCategory,
      createLauncherApp,
      batchCreateLauncherApps,
      updateLauncherApp,
      deleteLauncherApp,
      sendEmailSummary,
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
