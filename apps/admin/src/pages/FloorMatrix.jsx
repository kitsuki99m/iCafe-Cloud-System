import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Clock3,
  Copy,
  Link2,
  LockKeyhole,
  Monitor,
  MonitorCheck,
  MonitorPlay,
  Play,
  Plus,
  Search,
  WifiOff,
  Wrench,
  Sparkles,
  LayoutGrid,
  Map,
  RotateCcw,
  Save,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Check,
} from 'lucide-react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PcCard from '../components/floor/PcCard.jsx'
import FloorMap2D from '../components/floor/FloorMap2D.jsx'
import StationDetailDrawer from '../components/floor/StationDetailDrawer.jsx'

import SessionModal from '../components/floor/SessionModal.jsx'
import StartSessionModal from '../components/floor/StartSessionModal.jsx'
import PcFormModal from '../components/floor/PcFormModal.jsx'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import ConfirmModal from '../components/common/ConfirmModal.jsx'
import SidePanel from '../components/common/SidePanel.jsx'
import AnchoredPopover from '../components/common/AnchoredPopover.jsx'
import StationActions from '../components/floor/StationActions.jsx'
import NumericInput from '../components/common/NumericInput.jsx'
import DurationInput from '../components/common/DurationInput.jsx'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useEsportsTheme } from '../context/EsportsThemeContext.jsx'
import { playLowTimeAlert } from '../lib/sound.js'
import BulkActionsDropdown from '../components/bulk/BulkActionsDropdown.jsx'
import BulkTopUpWalletModal from '../components/bulk/BulkTopUpWalletModal.jsx'
import BulkTopUpSessionModal from '../components/bulk/BulkTopUpSessionModal.jsx'
import BulkPowerModal from '../components/bulk/BulkPowerModal.jsx'
import BulkAddPcModal from '../components/bulk/BulkAddPcModal.jsx'
import { showToast } from '../lib/toast.js'
import { AdminEmptyState, AdminPageWorkspace } from '../components/layout/AdminPageWorkspace.jsx'
import { elapsedSessionSeconds, remainingSessionSeconds } from '../lib/sessionTime.js'
import { formatAdminPeso } from '../lib/numeric.js'
import { runBulkMutation } from '../lib/bulkMutation.js'
import { createOperationKey } from '../lib/api.js'
import { cloudStationAdmin, isCloudAdmin } from '../lib/cloudClient.js'
import { effectivePcStatus, isPcStationOnline } from '../lib/pcStatus.js'

const CLIENT_STATUS_FILTERS = ['all','occupied','available','reserved','locked','maintenance','offline']
const TIER_RANK = { Regular: 0, Gold: 1, VIP: 2 }
const planTierRank = (plan) => TIER_RANK[String(plan?.customerTier ?? 'Regular')] ?? 0
function allowedRatePlansForSession(ratePlans, members, session) {
  const member = members.find((item) => String(item.id) === String(session?.customerId)) ?? null
  const memberTierRank = TIER_RANK[String(member?.tier ?? 'Regular')] ?? 0
  return ratePlans.filter((plan) => plan.isActive !== false && (
    member
      ? planTierRank(plan) <= memberTierRank
      : String(plan.customerTier ?? 'Regular') === 'Regular'
  ))
}

export default function FloorMatrix() {
  const {
    pcs,
    members,
    ratePlans,
    settings,
    updateSettings,
    getSessionPreview,
    startSession,
    endSession,
    refundSession,
    setMaintenance,
    powerCommand,
    addPc,
    updatePcMeta,
    removePc,
    adminTopUp,
    topUpMemberSession,
    adjustSessionTime,
    refresh,
    menuOrders = [],
    currentShift,
  } = useAppData()
  const { user } = useAuth()
  const { isEsportsMode } = useEsportsTheme()
  const isStaffOrCashier = user?.role === 'cashier' || user?.role === 'staff' || user?.cloudRole === 'cashier' || user?.cloudRole === 'staff'
  const navigate = useNavigate()
  const [selectedId, setSelectedId] = useState(null)
  const [pcFormOpen, setPcFormOpen] = useState(false)
  const [startSessionModalOpen, setStartSessionModalOpen] = useState(false)
  const [editingPcId, setEditingPcId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [bulkWalletOpen, setBulkWalletOpen] = useState(false)
  const [bulkSessionOpen, setBulkSessionOpen] = useState(false)
  const [bulkPower, setBulkPower] = useState(null)
  const [bulkAddOpen, setBulkAddOpen] = useState(false)
  const [bulkWalletOperationKey,setBulkWalletOperationKey]=useState(null)
  const [bulkSessionOperationKey,setBulkSessionOperationKey]=useState(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [viewMode, setViewMode] = useState(() => {
    try {
      return localStorage.getItem('aezakmi:floor_view_mode') || 'grid'
    } catch {
      return 'grid'
    }
  })
  const floorMapRef = useRef(null)
  const [floorMapHasChanges, setFloorMapHasChanges] = useState(false)
  const [floorMapZoom, setFloorMapZoom] = useState(1)
  const [now, setNow] = useState(Date.now())

  const [controlsPcId, setControlsPcId] = useState(null)
  const controlsAnchorRef = useRef(null)
  const [commandBusy, setCommandBusy] = useState('')
  const [commandConfirmTarget,setCommandConfirmTarget]=useState(null)
  const [timeAction,setTimeAction]=useState(null)
  const [pendingTimeAction,setPendingTimeAction]=useState(null)
  const [timeMinutes,setTimeMinutes]=useState(15)
  const [timeRecipient,setTimeRecipient]=useState('')
  const [timeRatePlanId,setTimeRatePlanId]=useState('')
  const [timePesos,setTimePesos]=useState('')
  const [timeActionBusy,setTimeActionBusy]=useState(false)
  const timeActionOperationKeyRef=useRef({fingerprint:'',key:null})
  const [forfeitTarget,setForfeitTarget]=useState(null)
  const [forfeitBusy,setForfeitBusy]=useState(false)
  const [pauseSaveBusy,setPauseSaveBusy]=useState('')
  const [pauseSaveTarget,setPauseSaveTarget]=useState(null)
  const alerted = useRef(new Set())
  const [searchParams, setSearchParams] = useSearchParams()
  const [stationPairingOpen,setStationPairingOpen]=useState(false)
  const [stationPairingPcId,setStationPairingPcId]=useState('')
  const [stationPairingResult,setStationPairingResult]=useState(null)
  const [stationPairingBusy,setStationPairingBusy]=useState(false)
  const [stationPairingError,setStationPairingError]=useState('')

  useEffect(() => { const timer=setInterval(()=>setNow(Date.now()),1000); return ()=>clearInterval(timer) }, [])
  const requestedStatus=searchParams.get('status')
  const requestedPcId=searchParams.get('pc')
  const requestedStatusFilter = requestedStatus && CLIENT_STATUS_FILTERS.includes(requestedStatus) ? requestedStatus : 'all'
  useEffect(() => {
    if (requestedStatusFilter !== filter) setFilter(requestedStatusFilter)
  }, [requestedStatusFilter, filter])
  useEffect(() => { pcs.forEach(pc=>{const session=pc.session;if(effectivePcStatus(pc)!=='occupied'||session?.billing!=='prepaid')return;const remaining=remainingSessionSeconds(session,now);const key=`${pc.id}:${session.id}`;if(remaining>0&&remaining<=Number(settings.lowTimeWarningMinutes||5)*60&&!alerted.current.has(key)){alerted.current.add(key);playLowTimeAlert(key)}}) }, [now,pcs,settings.lowTimeWarningMinutes])

  useEffect(() => {
    if (!stationPairingOpen || !stationPairingResult?.pairingCode) return undefined
    const timer = setInterval(() => { void refresh() }, 3000)
    return () => clearInterval(timer)
  }, [stationPairingOpen, stationPairingResult?.pairingCode, refresh])

  const stats = useMemo(() => ({
    available:pcs.filter(p=>effectivePcStatus(p)==='available').length,
    occupied:pcs.filter(p=>effectivePcStatus(p)==='occupied').length,
    maintenance:pcs.filter(p=>effectivePcStatus(p)==='maintenance').length,
    offline:pcs.filter(p=>effectivePcStatus(p)==='offline').length,
    reserved:pcs.filter(p=>effectivePcStatus(p)==='reserved').length,
    locked:pcs.filter(p=>p.session?.isLocked).length,
    total:pcs.length,
  }), [pcs])

  const runningFloorDue = useMemo(() => {
    return pcs
      .filter((p) => p.session)
      .reduce((sum, p) => {
        const ratePerHour = Number(p.rate || p.hourlyRate || (p.isVip ? 60 : 35))
        const elapsedSec = elapsedSessionSeconds(p.session, now)
        const timeCharge = p.session.billing === 'prepaid'
          ? Number(p.session.totalAmount || p.session.paidAmount || 0)
          : Math.round((elapsedSec / 3600) * ratePerHour)
        return sum + timeCharge
      }, 0)
  }, [pcs, now])

  const occupancyPct = stats.total > 0 ? Math.round((stats.occupied / stats.total) * 100) : 0
  const todayRevenue = currentShift?.totalRevenue || currentShift?.cashRevenue || 0
  const closedSessionsCount = currentShift?.closedSessionsCount || currentShift?.sessionsCount || 0
  const avgSessionMins = useMemo(() => {
    const liveSessions = pcs.filter(p => p.session)
    if (!liveSessions.length) return 45
    const totalMins = liveSessions.reduce((acc, p) => acc + (elapsedSessionSeconds(p.session, now) / 60), 0)
    return Math.round(totalMins / liveSessions.length)
  }, [pcs, now])

  const selected = selectedId ? pcs.find((p) => String(p.id) === String(selectedId)) ?? null : null
  const detailPc = requestedPcId ? pcs.find((pc) => String(pc.id) === String(requestedPcId)) ?? null : null
  const editingPc = editingPcId ? pcs.find((p) => p.id === editingPcId) ?? null : null
  const controlsPc = controlsPcId ? pcs.find((p) => String(p.id) === String(controlsPcId)) ?? null : null
  const bulkMemberTargets = members.map((member) => ({ id:member.id, label:member.name, sublabel:`${member.username || member.memberCode || 'Member'} · ₱${Number(member.wallet || 0).toFixed(2)}` }))
  const bulkSessionTargets = members.filter((member) => pcs.some((pc) => effectivePcStatus(pc) === 'occupied' && String(pc.session?.customerId)===String(member.id))).map((member) => ({ id:member.id, label:member.name, sublabel:'Active session', tier:member.tier }))
  const bulkPcTargets = pcs.filter((pc) => !['maintenance','offline'].includes(effectivePcStatus(pc)) && isPcStationOnline(pc)).map((pc) => ({ id:pc.id, label:pc.label, sublabel:`${pc.ipAddress} · ${pc.status}` }))
  const removablePcTargets = pcs.filter((pc) => !['occupied','reserved'].includes(effectivePcStatus(pc)) && !pc.session).map((pc) => ({ id:pc.id, label:pc.label, sublabel:`${pc.ipAddress} · ${pc.status}` }))
  const sortedPcs = useMemo(() => {
    const term=query.trim().toLowerCase()
    const pcNumber = (pc) => {
      const numeric = String(pc.pcNumber ?? pc.label ?? pc.id ?? '').match(/\d+/)
      return numeric ? Number(numeric[0]) : Number.MAX_SAFE_INTEGER
    }
    const order = (pc) => {
      const status = effectivePcStatus(pc)
      if (pc.session || ['occupied', 'in_use', 'in-use', 'busy'].includes(status)) return 0
      if (status === 'available') return 1
      if (status === 'reserved') return 2
      if (status === 'maintenance') return 3
      return 4
    }
    return pcs.filter(pc => {
      const matchesFilter = filter==='all' || (filter==='locked' ? Boolean(pc.session?.isLocked) : effectivePcStatus(pc)===filter)
      if (!matchesFilter) return false
      if (!term) return true
      return [pc.label, pc.pcNumber, pc.ipAddress, pc.session?.username, pc.session?.customerName, pc.session?.memberName].some(v => String(v || '').toLowerCase().includes(term))
    }).sort((a, b) => order(a) - order(b) || pcNumber(a) - pcNumber(b) || String(a.label).localeCompare(String(b.label)))
  }, [pcs,query,filter])

  function setClientSearchParam(key, value) {
    const next = new URLSearchParams(searchParams)
    if (value == null || value === '') next.delete(key)
    else next.set(key, String(value))
    setSearchParams(next, { replace:true })
  }
  function setClientStatusFilter(value) {
    const nextValue = CLIENT_STATUS_FILTERS.includes(value) ? value : 'all'
    setFilter(nextValue)
    const next = new URLSearchParams(searchParams)
    if (nextValue === 'all') next.delete('status')
    else next.set('status', nextValue)
    next.delete('pc')
    setSearchParams(next, { replace:true })
  }

  function openPopover(pc){
    setControlsPcId(null)
    controlsAnchorRef.current = null
    setClientSearchParam('pc', pc.id)
  }
  function closePopover(){
    if(searchParams.has('pc')) setClientSearchParam('pc', null)
  }
  function openControls(pc,event){
    event?.stopPropagation?.()
    controlsAnchorRef.current = event?.currentTarget || null
    setControlsPcId(pc.id)
  }
  function closeControls(){
    setControlsPcId(null)
    controlsAnchorRef.current = null
  }


  function openSessionModal(pc){
    if (!pc?.id) return
    closeControls()
    if (searchParams.has('pc')) setClientSearchParam('pc', null)
    setSelectedId(String(pc.id))
  }
  function afterControlsClose(action){
    closeControls()
    window.requestAnimationFrame(action)
  }

  function afterPopoverClose(action){
    // Render the popover's removal before mounting another layer. A microtask
    // can still be React-batched with the click, which leaves both overlays in
    // the DOM for a frame and causes the modal/backdrop interaction bug.
    closePopover()
    window.requestAnimationFrame(action)
  }
  function openTimeAction(pc,kind){
    closePopover()
    closeControls()
    setPendingTimeAction({pc,kind})
  }
  useEffect(()=>{
    if(requestedPcId||!pendingTimeAction)return
    const {pc,kind}=pendingTimeAction
    const allowedPlans=allowedRatePlansForSession(ratePlans,members,pc.session)
    const configuredDefault = allowedPlans.some((item) => String(item.id) === String(settings.defaultAddTimeRatePlanId))
      ? settings.defaultAddTimeRatePlanId
      : null
    const regularPlan=allowedPlans.find(item=>String(item.customerTier||'').toLowerCase()==='regular'&&String(item.name||'').toLowerCase().includes('regular'))||allowedPlans.find(item=>String(item.customerTier||'').toLowerCase()==='regular')||allowedPlans[0]
    setTimeActionBusy(false)
    setTimeAction({session:pc.session,kind,pc})
    setTimeMinutes(15)
    setTimeRecipient('')
    setTimeRatePlanId(configuredDefault||regularPlan?.id||'')
    setTimePesos('')
    setPendingTimeAction(null)
  },[requestedPcId,pendingTimeAction,ratePlans,settings.defaultAddTimeRatePlanId])

  function isSelectedSessionPc(pc) {
    return Boolean(pc?.id) && String(selectedId ?? '') === String(pc.id)
  }

  // Session mutations can change a station from available -> occupied or
  // occupied -> available before their promise resolves. If the modal remains
  // selected during that state change, SessionModal legitimately switches its
  // content mode and appears to "jump" into another modal. Close the selected
  // station in the same click batch as the mutation, then restore it only when
  // the mutation fails. This keeps one user action bound to one modal lifecycle.
  async function handleStart(pc, sessionInput) {
    const restoreOnFailure = isSelectedSessionPc(pc)
    if (restoreOnFailure) setSelectedId(null)
    setActionError('')
    try {
      await startSession(pc, sessionInput)
    } catch (error) {
      setActionError(error?.message || 'Unable to start the session.')
      if (restoreOnFailure) setSelectedId(String(pc.id))
      throw error
    }
  }

  async function handleEnd(pc, disposition = 'save', options = {}) {
    const restoreOnFailure = isSelectedSessionPc(pc)
    if (restoreOnFailure) setSelectedId(null)
    setActionError('')
    try {
      await endSession(pc, disposition, options)
    } catch (error) {
      setActionError(error?.message || 'Unable to end the session.')
      if (restoreOnFailure) setSelectedId(String(pc.id))
      throw error
    }
  }

  async function handleSetMaintenance(pc, toMaintenance = true) {
    const restoreOnFailure = isSelectedSessionPc(pc)
    if (restoreOnFailure) setSelectedId(null)
    setActionError('')
    try {
      await setMaintenance(pc, toMaintenance)
    } catch (error) {
      setActionError(error?.message || 'Unable to update PC status.')
      if (restoreOnFailure) setSelectedId(String(pc.id))
      throw error
    }
  }
  async function handleRefund(pc) {
    const restoreOnFailure = isSelectedSessionPc(pc)
    if (restoreOnFailure) setSelectedId(null)
    setActionError('')
    try {
      await refundSession(pc)
    } catch (error) {
      setActionError(error?.message || 'Unable to refund the session.')
      if (restoreOnFailure) setSelectedId(String(pc.id))
      throw error
    }
  }

  async function handleBulkStartSessions(targetPcs, sessionPayload) {
    if (!targetPcs?.length) return
    const count = targetPcs.length
    for (const pc of targetPcs) {
      const pcPayload = {
        ...sessionPayload,
        customerName: count > 1 && sessionPayload.customerMode === 'walkin' && sessionPayload.customerName
          ? `${sessionPayload.customerName} (${pc.label})`
          : sessionPayload.customerName
      }
      await startSession(pc, pcPayload)
    }
    showToast({
      title: count === 1 ? 'Session Started' : 'Sessions Started',
      message: count === 1 ? `${targetPcs[0].label} is now in use.` : `Started sessions on ${count} stations.`,
      tone: 'success',
    })
    refresh()
  }

  async function forfeitOfflineSession() {
    if (!forfeitTarget?.session || forfeitBusy) return
    setForfeitBusy(true)
    setActionError('')
    try {
      await endSession(forfeitTarget, 'forfeit')
      setForfeitTarget(null)
    } catch (error) {
      setActionError(error?.message || 'Unable to forfeit the paused session time.')
    } finally {
      setForfeitBusy(false)
    }
  }
  async function pauseAndSaveTime(pc) {
    if (!pc?.session || pauseSaveBusy) return
    setPauseSaveBusy(pc.id)
    setActionError('')
    try {
      await handleEnd(pc, 'save')
      setPauseSaveTarget(null)
    } catch {
      // handleEnd already surfaces the backend error in actionError. Keep the
      // confirmation open so the operator can retry or cancel intentionally.
    } finally {
      setPauseSaveBusy('')
    }
  }
  async function requestStationCommand(pc, command) {
    setActionError('')
    try {
      await powerCommand(pc, command)
    } catch (error) { setActionError(error?.message || 'Unable to send the command.'); throw error }
  }
  async function generateStationPairingCode(){
    if(!stationPairingPcId||stationPairingBusy)return
    setStationPairingBusy(true);setStationPairingError('');setStationPairingResult(null)
    try{
      const result=await cloudStationAdmin('pairing_code',{stationId:stationPairingPcId})
      setStationPairingResult(result)
    }catch(error){setStationPairingError(error?.message||'Unable to generate Customer Station pairing code.')}
    finally{setStationPairingBusy(false)}
  }
  function openStationPairing(){
    const first=pcs.find(pc=>!pc.stationDeviceId)
    setStationPairingPcId(first?.id||'');setStationPairingResult(null);setStationPairingError('');setStationPairingOpen(true)
  }
  async function copyStationPairing(){
    if(!stationPairingResult?.pairingCode)return
    try{await navigator.clipboard.writeText(stationPairingResult.pairingCode);showToast({title:'Pairing code copied',message:'Paste it into the Customer Station setup screen.'})}
    catch{setStationPairingError('Copy failed. Select the code manually.')}
  }
  async function executeQuickCommand(pc,command){
    if(commandBusy)return
    setCommandBusy(command)
    const commandRequest=requestStationCommand(pc,command)
    // The command has already been optimistically applied to the card; do not
    // leave the action menu in the way while the station acknowledgement travels.
    closePopover()
    closeControls()
    try {
      await commandRequest
    } finally {
      setCommandBusy('')
    }
  }
  function quickCommand(pc,command){
    if (command==='restart'||command==='shutdown') {
      setCommandConfirmTarget({ pc, command })
      return
    }
    void executeQuickCommand(pc,command)
  }
  function confirmQuickCommand(){
    if(!commandConfirmTarget||commandBusy)return
    const {pc,command}=commandConfirmTarget
    setCommandConfirmTarget(null)
    void executeQuickCommand(pc,command)
  }
  const timeActionRatePlans = allowedRatePlansForSession(ratePlans, members, timeAction?.session)
  const selectedTimeRatePlan = useMemo(() => timeActionRatePlans.find(plan => String(plan.id) === String(timeRatePlanId)) || null, [timeActionRatePlans, timeRatePlanId])
  const timeActionAmount=useMemo(()=>{
    if(timeAction?.kind!=='add') return 0
    if(!selectedTimeRatePlan) return Number(timePesos)||0
    if(selectedTimeRatePlan.mode==='package') return Number(selectedTimeRatePlan.amount)||0
    return Number(timePesos)||0
  },[timeAction,selectedTimeRatePlan,timePesos])
  const timeActionMinutes=useMemo(()=>{
    if(timeAction?.kind!=='add') return Number(timeMinutes)||0
    if(!selectedTimeRatePlan) return 0
    if(selectedTimeRatePlan.mode==='package') return Number(selectedTimeRatePlan.minutes)||0
    const pesoUnit=Number(selectedTimeRatePlan.pesoUnit||1)
    const minutesPerUnit=Number(selectedTimeRatePlan.minutesPerUnit||1)
    return pesoUnit>0?Math.floor((Number(timePesos)||0)/pesoUnit*minutesPerUnit):0
  },[timeAction,selectedTimeRatePlan,timePesos,timeMinutes])
  const canSubmitTimeAction=useMemo(()=>{
    if(!timeAction)return false
    if(timeAction.kind==='add'){
      if(!selectedTimeRatePlan)return false
      if(selectedTimeRatePlan.mode==='package')return timeActionMinutes>0
      return Number(timePesos)>0 && timeActionMinutes>0
    }
    if(timeAction.kind==='transfer') return Number(timeMinutes)>0 && Boolean(timeRecipient)
    return Number(timeMinutes)>0
  },[timeAction,selectedTimeRatePlan,timePesos,timeActionMinutes,timeMinutes,timeRecipient])
  function getTimeActionOperationKey(){
    const fingerprint=JSON.stringify([
      timeAction?.kind||'',
      timeAction?.session?.id||'',
      timeRatePlanId||'',
      timePesos||'',
      timeMinutes||'',
      timeRecipient||'',
    ])
    if(timeActionOperationKeyRef.current.fingerprint!==fingerprint||!timeActionOperationKeyRef.current.key){
      timeActionOperationKeyRef.current={fingerprint,key:createOperationKey()}
    }
    return timeActionOperationKeyRef.current.key
  }
  async function submitTimeAction(){
    if(!canSubmitTimeAction||timeActionBusy)return
    const operationKey=getTimeActionOperationKey()
    setTimeActionBusy(true);setActionError('')
    try{
      if(timeAction.kind==='add'){
        if(timeAction.session.customerId)await topUpMemberSession(timeAction.session.customerId,timeRatePlanId,selectedTimeRatePlan.mode==='package'?null:timeActionAmount,{ operationKey:operationKey })
        else await adjustSessionTime(timeAction.session.id,{kind:'add',seconds:timeActionMinutes*60,amount:timeActionAmount},{ operationKey:operationKey })
      }else await adjustSessionTime(timeAction.session.id,{kind:timeAction.kind,seconds:Number(timeMinutes)*60,destinationPcId:timeAction.kind==='transfer'?timeRecipient:undefined},{ operationKey:operationKey })
      timeActionOperationKeyRef.current={fingerprint:'',key:null}
      setTimeAction(null)
    }catch(error){setActionError(error?.message||'Unable to update session time.')}
    finally{setTimeActionBusy(false)}
  }
  function closeTimeAction(){
    timeActionOperationKeyRef.current={fingerprint:'',key:null}
    setPendingTimeAction(null)
    setTimeAction(null)
    closePopover()
  }
  const availableCount = (pcs || []).filter((pc) => effectivePcStatus(pc) === 'available').length

  const bulkDropdownItems = [
    { id: 'start', icon: 'start', label: 'Start sessions', hint: `${availableCount} available station${availableCount === 1 ? '' : 's'}` },
    { id: 'wallet', icon: 'wallet', label: 'Top up wallets', hint: 'Select multiple members' },
    { id: 'session', icon: 'session', label: 'Add session time', hint: `${bulkSessionTargets.length} active session${bulkSessionTargets.length === 1 ? '' : 's'}` },
    { id: 'lock', icon: 'lock', label: 'Lock stations', hint: 'Pause active sessions' },
    { id: 'unlock', icon: 'unlock', label: 'Unlock stations', hint: 'Resume locked sessions' },
    { id: 'restart', icon: 'restart', label: 'Restart stations', hint: 'Shows a 5-second station warning' },
    { id: 'shutdown', icon: 'shutdown', label: 'Shutdown stations', hint: 'Shows a 5-second station warning' },
    ...(!isStaffOrCashier ? [{ id: 'remove', icon: 'remove', label: 'Remove PCs', hint: `${removablePcTargets.length} removable station${removablePcTargets.length === 1 ? '' : 's'}` }] : []),
  ]

  const handleBulkAction = (id) => {
    if (id === 'start') {
      setStartSessionModalOpen(true)
    } else if (id === 'wallet') {
      setBulkWalletOperationKey(createOperationKey())
      setBulkWalletOpen(true)
    } else if (id === 'session') {
      setBulkSessionOperationKey(createOperationKey())
      setBulkSessionOpen(true)
    } else {
      setBulkPower(id)
    }
  }

  const toolbarActions = (
    <div className="flex flex-wrap items-center gap-2">
      <BulkActionsDropdown items={bulkDropdownItems} onAction={handleBulkAction} />
      <Button icon={Play} variant="primary" size="sm" onClick={() => setStartSessionModalOpen(true)}>
        Start Session
      </Button>
      {!isStaffOrCashier && isCloudAdmin() && (
        <Button icon={Link2} variant="subtle" size="sm" onClick={openStationPairing}>
          Pair Customer PC
        </Button>
      )}
      {!isStaffOrCashier && (
        <Button icon={Monitor} variant="ghost" size="sm" onClick={() => setBulkAddOpen(true)}>
          Bulk add
        </Button>
      )}
      {!isStaffOrCashier && (
        <Button icon={Plus} variant="primary" size="sm" onClick={() => setPcFormOpen(true)}>
          Add PC
        </Button>
      )}
    </div>
  )



  return (
    <AdminPageWorkspace>
      <h1 className="sr-only">Clients</h1>
      {actionError && (
        <div className="mb-4 rounded-lg border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-dim">
          {actionError}
        </div>
      )}

      {/* 2-COLUMN LIVE CYBERCAFE WORKSPACE */}
      {/* FULL-WIDTH LIVE ESPORTS FLOOR MATRIX */}
      <section className="clients-floor-workspace w-full space-y-4">
        {/* CONSOLE FLOOR KPI METRICS STRIP */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="overview-card flex flex-col justify-between p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 shadow-card">
            <span className="text-xs font-semibold text-[var(--muted)]">Stations in use</span>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
              {stats.occupied} <span className="text-sm font-normal text-[var(--faint)]">of {stats.total}</span>
            </div>
            <div className="mt-1 text-xs text-[var(--faint)]">{stats.available} open now</div>
            <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--line-soft)]">
              <i className="block h-full rounded-full bg-[var(--brand)] transition-all duration-300" style={{ width: `${occupancyPct}%` }} />
            </div>
          </div>

          <div className="overview-card flex flex-col justify-between p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 shadow-card">
            <span className="text-xs font-semibold text-[var(--muted)]">Taken tonight / shift</span>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
              {formatAdminPeso(todayRevenue)}
            </div>
            <div className="mt-1 text-xs text-[var(--faint)]">{closedSessionsCount} sessions settled</div>
            <div className="mt-2.5 h-1.5 w-full" />
          </div>

          <div className="overview-card flex flex-col justify-between p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 shadow-card">
            <span className="text-xs font-semibold text-[var(--muted)]">Running on the floor</span>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold tracking-tight text-[var(--live,#FFB020)]">
              {formatAdminPeso(runningFloorDue)}
            </div>
            <div className="mt-1 text-xs text-[var(--faint)]">Uncollected active charges</div>
            <div className="mt-2.5 h-1.5 w-full" />
          </div>

          <div className="overview-card flex flex-col justify-between p-4 rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 shadow-card">
            <span className="text-xs font-semibold text-[var(--muted)]">Average session</span>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
              {avgSessionMins} <span className="text-sm font-normal text-[var(--faint)]">min</span>
            </div>
            <div className="mt-1 text-xs text-[var(--faint)]">Across active stations</div>
            <div className="mt-2.5 h-1.5 w-full" />
          </div>
        </div>

        {/* STATUS LEGEND matching Claude artifact */}
        <div className="flex items-center gap-4 text-xs text-[var(--muted)] flex-wrap py-1 px-1">
          <div className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--free,#2ED3A0)]" /> Open</div>
          <div className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--live,#FFB020)] animate-pulse" /> In use</div>
          <div className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--hold,#4CC2FF)]" /> Reserved</div>
          <div className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-[var(--down,#6B7688)]" /> Down for repair</div>
          <div className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-slate-soft/50" /> Offline</div>
        </div>

        <div className="admin-page-toolbar space-y-2.5">
          {/* Row 1: View Switcher, Search Bar, and Action Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5">
              {/* View Mode Toggle: Grid Matrix vs 2D Floor Plan */}
              <div className="flex items-center rounded-xl bg-surface-raised border border-surface-line p-0.5 shadow-xs shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('grid')
                    try { localStorage.setItem('aezakmi:floor_view_mode', 'grid') } catch {}
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === 'grid'
                      ? 'bg-midnight text-soft-white shadow-xs'
                      : 'text-slate-soft hover:text-ink-900'
                  }`}
                  title="Grid Matrix View"
                >
                  <LayoutGrid size={13} />
                  <span>Grid Matrix</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setViewMode('map')
                    try { localStorage.setItem('aezakmi:floor_view_mode', 'map') } catch {}
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    viewMode === 'map'
                      ? 'bg-midnight text-soft-white shadow-xs'
                      : 'text-slate-soft hover:text-ink-900'
                  }`}
                  title="2D Floor Plan Layout (Drag & Drop Stations)"
                >
                  <Map size={13} />
                  <span>2D Floor Map</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="admin-search-field min-w-[200px] flex-1 max-w-sm">
                <Search size={14} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search PC, IP, or customer…"
                  className="min-w-0 flex-1 bg-transparent text-xs text-ink-900 outline-none placeholder:text-slate-soft"
                />
              </div>
            </div>

            {/* Right Side: Stat Figure + Mode Actions */}
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              <span className="stat-figure text-xs text-slate-soft mr-1">
                <b className="text-ink-900">{stats.available}</b> of {stats.total} free
              </span>

              {viewMode === 'map' ? (
                <div className="flex items-center gap-2">
                  {/* Zoom Controls */}
                  <div className="flex items-center gap-0.5 rounded-lg border border-surface-line bg-surface-raised p-0.5 shadow-xs">
                    <button
                      type="button"
                      onClick={() => floorMapRef.current?.zoomOut()}
                      className="p-1 rounded-md text-slate-soft hover:text-ink-900 hover:bg-surface transition cursor-pointer"
                      title="Zoom Out"
                    >
                      <ZoomOut size={13} />
                    </button>
                    <span className="text-[10px] font-mono font-bold text-slate-soft w-8 text-center select-none">
                      {Math.round(floorMapZoom * 100)}%
                    </span>
                    <button
                      type="button"
                      onClick={() => floorMapRef.current?.zoomIn()}
                      className="p-1 rounded-md text-slate-soft hover:text-ink-900 hover:bg-surface transition cursor-pointer"
                      title="Zoom In"
                    >
                      <ZoomIn size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => floorMapRef.current?.zoomReset()}
                      className="p-1 rounded-md text-slate-soft hover:text-ink-900 hover:bg-surface transition cursor-pointer"
                      title="Fit to Screen (100%)"
                    >
                      <Maximize2 size={12} />
                    </button>
                  </div>

                  {/* Reset Layout */}
                  <button
                    type="button"
                    onClick={() => floorMapRef.current?.resetLayout()}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-soft border border-surface-line bg-surface hover:bg-surface-raised hover:text-ink-900 transition cursor-pointer"
                    title="Auto-Arrange Layout"
                  >
                    <RotateCcw size={12} />
                    <span>Reset</span>
                  </button>

                  {/* Save Layout */}
                  <button
                    type="button"
                    onClick={() => floorMapRef.current?.saveLayout()}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs cursor-pointer ${
                      floorMapHasChanges
                        ? 'bg-midnight text-soft-white ring-2 ring-teal/50 animate-pulse'
                        : 'bg-midnight text-soft-white hover:bg-surface-line'
                    }`}
                  >
                    {floorMapHasChanges ? <Save size={13} /> : <Check size={13} className="text-teal" />}
                    <span>Save Layout</span>
                  </button>

                  <Button icon={Play} variant="primary" size="sm" onClick={() => setStartSessionModalOpen(true)}>
                    Start Session
                  </Button>
                  {!isStaffOrCashier && (
                    <Button icon={Plus} variant="primary" size="sm" onClick={() => setPcFormOpen(true)}>
                      Add PC
                    </Button>
                  )}
                </div>
              ) : (
                toolbarActions
              )}
            </div>
          </div>

          {/* Row 2: Status Filter Strip */}
          <div className="flex items-center justify-between gap-3 pt-1 border-t border-surface-line/50">
            <div className="admin-segmented-control flex-nowrap overflow-x-auto max-w-full">
              {CLIENT_STATUS_FILTERS.map((value) => (
                <button
                  type="button"
                  key={value}
                  onClick={()=>setClientStatusFilter(value)}
                  className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold capitalize whitespace-nowrap transition-colors cursor-pointer ${
                    filter === value ? 'bg-midnight text-soft-white' : 'text-slate-soft hover:text-ink-900'
                  }`}
                >
                  {value === 'occupied' ? 'In use' : value}
                </button>
              ))}
            </div>

            {viewMode === 'map' && (
              <div className="hidden lg:flex items-center gap-2">
                {!isStaffOrCashier && isCloudAdmin() && (
                  <Button icon={Link2} variant="subtle" size="sm" onClick={openStationPairing}>
                    Pair Customer PC
                  </Button>
                )}
                <BulkActionsDropdown
                  items={bulkDropdownItems}
                  onAction={handleBulkAction}
                />
              </div>
            )}
          </div>
        </div>

        <div>
          {viewMode === 'map' ? (
            <FloorMap2D
              ref={floorMapRef}
              pcs={sortedPcs}
              now={now}
              settings={settings}
              onSaveLayoutSettings={updateSettings}
              lowTimeWarningMinutes={settings.lowTimeWarningMinutes}
              onSelect={openPopover}
              onControls={(e, pc) => {
                controlsAnchorRef.current = e.currentTarget
                setControlsPcId(pc.id)
              }}
              activeFilter={filter}
              onHasChangesChange={setFloorMapHasChanges}
              onZoomChange={setFloorMapZoom}
            />
          ) : (
            <>
              {pcs.length ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1920px]:grid-cols-6">
                  {sortedPcs.map((pc) => (
                    <PcCard
                      key={pc.id}
                      pc={pc}
                      now={now}
                      lowTimeWarningMinutes={settings.lowTimeWarningMinutes}
                      onSelect={openPopover}
                      onControls={openControls}
                    />
                  ))}
                </div>
              ) : (
                <AdminEmptyState
                  icon={Monitor}
                  title="No PC clients registered"
                  description="Add a PC to begin."
                  action={
                    <Button icon={Plus} variant="primary" size="sm" onClick={() => setPcFormOpen(true)}>
                      Add PC
                    </Button>
                  }
                />
              )}
            </>
          )}
        </div>

        {/* CLOSING SOON & SHIFT FEED PANELS (Claude artifact cols) */}
        {pcs.some((p) => p.session) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
            {/* Closing Soon Panel */}
            <div className="overview-card rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 p-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--line-soft)] mb-3">
                <h3 className="font-display text-sm font-bold text-[var(--text)]">Closing Soonest</h3>
                <span className="text-xs text-[var(--muted)]">Active sessions</span>
              </div>
              <div className="space-y-2">
                {pcs
                  .filter((p) => p.session)
                  .sort((a, b) => {
                    const remA = a.session?.billing === 'prepaid' ? remainingSessionSeconds(a.session, now) : 99999
                    const remB = b.session?.billing === 'prepaid' ? remainingSessionSeconds(b.session, now) : 99999
                    return remA - remB
                  })
                  .slice(0, 5)
                  .map((p) => {
                    const rem = p.session?.billing === 'prepaid' ? remainingSessionSeconds(p.session, now) : null
                    const remText = rem != null ? `${Math.ceil(rem / 60)} min left` : 'Postpaid'
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-[var(--surface-2)]/70 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[var(--text)]">{p.label || `PC-${p.id}`}</span>
                          <span className="text-[var(--muted)] truncate max-w-[120px]">
                            {p.session?.customerName || p.session?.username || 'Guest'}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-[var(--live,#FFB020)] font-semibold">{remText}</span>
                          <button
                            type="button"
                            onClick={() => openPopover(p)}
                            className="rounded px-2 py-0.5 text-[11px] font-semibold text-[var(--brand)] border border-[var(--brand)]/30 hover:bg-[var(--brand)]/15 cursor-pointer"
                          >
                            Inspect
                          </button>
                        </div>
                      </div>
                    )
                  })}
              </div>
            </div>

            {/* Shift Activity Stream */}
            <div className="overview-card rounded-xl border border-[var(--line)] bg-[var(--surface)]/80 p-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--line-soft)] mb-3">
                <h3 className="font-display text-sm font-bold text-[var(--text)]">Shift Operations Log</h3>
                <span className="text-xs text-[var(--muted)]">Live telemetry</span>
              </div>
              <div className="space-y-2 text-xs max-h-48 overflow-y-auto pr-1">
                {currentShift?.activityLog?.length ? (
                  currentShift.activityLog.slice(0, 5).map((log, idx) => (
                    <div key={idx} className="flex items-start gap-2 py-1 border-b border-[var(--line-soft)]/40 last:border-0">
                      <span className="font-mono text-[10px] text-[var(--faint)] shrink-0">
                        {log.timestamp ? new Date(log.timestamp).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                      </span>
                      <span className="text-[var(--text)]">{log.message || log.description || JSON.stringify(log)}</span>
                    </div>
                  ))
                ) : (
                  <div className="py-4 text-center text-xs text-[var(--muted)]">
                    Floor shift active · {stats.occupied} sessions in progress
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>


      <AnchoredPopover
        open={Boolean(controlsPc)}
        anchorRef={controlsAnchorRef}
        onClose={closeControls}
        ariaLabel={controlsPc ? `${controlsPc.label} station controls` : 'Station controls'}
      >
        {controlsPc && <StationActions
          pc={controlsPc}
          variant="popover"
          commandBusy={commandBusy}
          pauseSaveBusy={pauseSaveBusy === controlsPc.id}
          onSession={openSessionModal}
          onTimeAction={openTimeAction}
          onForfeit={(pc)=>afterControlsClose(()=>setForfeitTarget(pc))}
          onCommand={quickCommand}
          onPauseSave={(pc)=>afterControlsClose(()=>setPauseSaveTarget(pc))}
          onMaintenance={(pc,toMaintenance)=>afterControlsClose(()=>handleSetMaintenance(pc,toMaintenance).catch(()=>{}))}
          onEdit={(pc)=>afterControlsClose(()=>setEditingPcId(pc.id))}
        />}
      </AnchoredPopover>

      {detailPc && !pendingTimeAction && !timeAction && (
        <StationDetailDrawer
          pc={detailPc}
          now={now}
          members={members}
          ratePlans={ratePlans}
          menuOrders={menuOrders}
          onClose={closePopover}
          onOpenSessionModal={(pc) => {
            closePopover()
            openSessionModal(pc)
          }}
          onOpenStartModal={() => {
            closePopover()
            setStartSessionModalOpen(true)
          }}
          onEndSession={(pc, disposition) => handleEnd(pc, disposition)}
          onSetMaintenance={(pc, toMaint) => handleSetMaintenance(pc, toMaint)}
          onQuickCommand={quickCommand}
          onTransferSession={(pc) => {
            closePopover()
            openTimeAction(pc, 'transfer')
          }}
        />
      )}

      <Modal
        open={stationPairingOpen}
        onClose={()=>!stationPairingBusy&&setStationPairingOpen(false)}
        eyebrow="Aezakmi Cloud"
        title="Pair Customer Station"
        maxWidth="max-w-lg"
        busy={stationPairingBusy}
        footer={<><Button variant="ghost" disabled={stationPairingBusy} onClick={()=>setStationPairingOpen(false)}>Close</Button>{stationPairingResult?.pairingCode?<Button variant="primary" icon={Copy} onClick={copyStationPairing}>Copy code</Button>:<Button variant="primary" icon={Link2} disabled={!stationPairingPcId||stationPairingBusy} onClick={generateStationPairingCode}>{stationPairingBusy?'Generating…':'Generate pairing code'}</Button>}</>}
      >
        <div className="space-y-4">
          <p className="text-xs leading-5 text-slate-soft">Generate a one-time code for the selected logical PC. The code itself is scoped to this business, branch, and station.</p>
          <label className="block"><span className="eyebrow mb-1.5 block">Customer PC</span><select value={stationPairingPcId} onChange={event=>{setStationPairingPcId(event.target.value);setStationPairingResult(null);setStationPairingError('')}} disabled={stationPairingBusy||Boolean(stationPairingResult)} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900"><option value="">Choose an unpaired PC</option>{pcs.filter(pc=>!pc.stationDeviceId).map(pc=><option key={pc.id} value={pc.id}>{pc.label} · {pc.ipAddress||'Cloud-first'}</option>)}</select></label>
          {pcs.length>0&&!pcs.some(pc=>!pc.stationDeviceId)&&!stationPairingResult&&<div className="rounded-xl border border-teal/20 bg-teal/5 p-3 text-xs text-slate-soft">Every registered PC in this branch is already paired to a Customer Station.</div>}
          {stationPairingResult&&<div className="rounded-2xl border border-teal/25 bg-teal/5 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Station</p><p className="mt-1 text-sm font-semibold text-ink-900">{stationPairingResult.station?.label||stationPairingPcId}</p></div><span className="rounded-full bg-teal/10 px-2.5 py-1 text-[10px] font-semibold text-teal-dim">15 minute code</span></div><div className="mt-4 rounded-xl border border-surface-line bg-surface px-4 py-4 text-center"><p className="eyebrow">Pairing code</p><p className="stat-figure mt-2 select-all font-mono text-2xl font-bold tracking-[0.18em] text-ink-900">{stationPairingResult.pairingCode}</p></div><div className="mt-3 text-[11px] text-slate-soft"><b className="text-ink-900">Expires</b><br/>{stationPairingResult.expiresAt?new Date(stationPairingResult.expiresAt).toLocaleString():'15 minutes'}</div></div>}
          {stationPairingError&&<p className="rounded-xl border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">{stationPairingError}</p>}
          <div className="rounded-xl border border-surface-line bg-surface-raised/50 p-3 text-[11px] leading-5 text-slate-soft"><b className="text-ink-900">On the client PC:</b> open Aezakmi Customer Station → enter this one-time code → Connect this PC. Cloud becomes primary immediately; Café Edge remains the LAN fallback.</div>
        </div>
      </Modal>


      <PcFormModal
        open={pcFormOpen}
        pc={null}
        onClose={() => setPcFormOpen(false)}
        onCreate={addPc}
        onSave={updatePcMeta}
        onRemove={removePc}
        existingPcs={pcs}
        cloudManaged={isCloudAdmin()}
      />
      <PcFormModal
        open={!!editingPc}
        pc={editingPc}
        onClose={() => setEditingPcId(null)}
        onCreate={addPc}
        onSave={updatePcMeta}
        onRemove={removePc}
        existingPcs={pcs}
        cloudManaged={isCloudAdmin()}
      />

      <StartSessionModal
        open={startSessionModalOpen}
        pcs={pcs}
        ratePlans={ratePlans}
        members={members}
        onClose={() => setStartSessionModalOpen(false)}
        onStartSessions={handleBulkStartSessions}
      />

      <SessionModal
        pc={selected}
        ratePlans={ratePlans}
        members={members}
        defaultBilling={settings.defaultBilling}
        settings={settings}
        onPreview={getSessionPreview}
        onClose={() => setSelectedId(null)}
        onStart={handleStart}
        onEnd={handleEnd}
        onRefund={handleRefund}
        onSetMaintenance={handleSetMaintenance}
        onPowerCommand={requestStationCommand}
      />
      <ConfirmModal
        open={Boolean(commandConfirmTarget)}
        onClose={() => !commandBusy && setCommandConfirmTarget(null)}
        onConfirm={() => executeQuickCommand(commandConfirmTarget?.pc, commandConfirmTarget?.command)}
        busy={Boolean(commandBusy)}
        eyebrow="Remote station command"
        title={`${commandConfirmTarget?.command === 'shutdown' ? 'Shutdown' : 'Restart'} ${commandConfirmTarget?.pc?.label || 'this station'}?`}
        message={commandConfirmTarget?.command === 'shutdown' ? 'The Customer Station will receive a shutdown warning, preserve recoverable prepaid time, and then power off.' : 'The Customer Station will receive a restart warning, preserve recoverable prepaid time, and then reboot.'}
        confirmLabel={commandConfirmTarget?.command === 'shutdown' ? 'Shutdown' : 'Restart'}
        variant={commandConfirmTarget?.command === 'shutdown' ? 'danger' : 'primary'}
      />
      <ConfirmModal
        open={Boolean(forfeitTarget)}
        onClose={() => !forfeitBusy && setForfeitTarget(null)}
        onConfirm={forfeitOfflineSession}
        busy={forfeitBusy}
        eyebrow="Offline station recovery"
        title="Forfeit saved time?"
        confirmLabel="Forfeit time"
        variant="danger"
        message={forfeitTarget ? <><b className="text-ink-900">{forfeitTarget.label}</b> is offline with a paused prepaid session. This permanently ends the session and removes any remaining saved time. It cannot be undone.</> : ''}
      />
      <ConfirmModal
        open={Boolean(pauseSaveTarget)}
        onClose={() => !pauseSaveBusy && setPauseSaveTarget(null)}
        onConfirm={() => pauseAndSaveTime(pauseSaveTarget)}
        busy={Boolean(pauseSaveTarget?.id && pauseSaveBusy === pauseSaveTarget.id)}
        eyebrow="Session control"
        title="Pause & save this session?"
        confirmLabel="Pause & save"
        variant="primary"
        message={pauseSaveTarget ? <>End the active session on <b className="text-ink-900">{pauseSaveTarget.label}</b>, return the Customer Station to login, and preserve its remaining prepaid time for later use?</> : ''}
      />
      <BulkTopUpWalletModal open={bulkWalletOpen} targets={bulkMemberTargets} onClose={() => setBulkWalletOpen(false)} onConfirm={async (ids, amount) => { const key=bulkWalletOperationKey||createOperationKey(); if(!bulkWalletOperationKey)setBulkWalletOperationKey(key); await runBulkMutation(ids,(id,operationKey)=>adminTopUp(id,amount,{operationKey,refresh:false}),key); setBulkWalletOperationKey(null); setBulkWalletOpen(false) }} />
      <BulkTopUpSessionModal open={bulkSessionOpen} targets={bulkSessionTargets} ratePlans={ratePlans.filter((plan) => plan.isActive !== false)} onClose={() => setBulkSessionOpen(false)} onConfirm={async (ids, ratePlanId, amount) => { const key=bulkSessionOperationKey||createOperationKey(); if(!bulkSessionOperationKey)setBulkSessionOperationKey(key); await runBulkMutation(ids,(id,operationKey)=>topUpMemberSession(id,ratePlanId,amount,{operationKey,refresh:false}),key); setBulkSessionOperationKey(null); setBulkSessionOpen(false) }} />
      <BulkPowerModal open={!!bulkPower} command={bulkPower} targets={bulkPower==='remove'?removablePcTargets:bulkPcTargets.filter(target=>{const pc=pcs.find(item=>item.id===target.id);if(bulkPower==='lock')return pc?.session&&!pc.session.isLocked;if(bulkPower==='unlock')return pc?.session?.isLocked;return true})} onClose={() => setBulkPower(null)} onConfirm={async (ids) => { if(bulkPower==='remove'){await Promise.all(ids.map((id) => removePc(id,{silent:true})));showToast({title:'PCs removed',message:`${ids.length} station${ids.length===1?'':'s'} removed from the floor.`})}else{await Promise.all(ids.map((id) => powerCommand(pcs.find((pc) => pc.id === id), bulkPower,{suppressToast:true})));showToast({title:`${bulkPower==='restart'?'Restart':bulkPower==='shutdown'?'Shutdown':bulkPower==='lock'?'Lock':'Unlock'} sent`,message:`Command sent to ${ids.length} station${ids.length===1?'':'s'}.`})} setBulkPower(null) }} />
      <BulkAddPcModal open={bulkAddOpen} onClose={() => setBulkAddOpen(false)} onCreate={addPc} existingPcs={pcs} cloudManaged={isCloudAdmin()} />
      <Modal open={!!timeAction} onClose={()=>!timeActionBusy&&closeTimeAction()} eyebrow="Active prepaid session" title={`${timeAction?.kind==='add'?'Add':timeAction?.kind==='reduce'?'Reduce':'Transfer'} session time`} maxWidth="max-w-md" onSubmit={submitTimeAction} canSubmit={canSubmitTimeAction} busy={timeActionBusy} footer={<><Button variant="ghost" onClick={closeTimeAction} disabled={timeActionBusy}>Cancel</Button><Button variant={timeAction?.kind==='reduce'?'danger':'primary'} disabled={!canSubmitTimeAction||timeActionBusy} onClick={submitTimeAction}>{timeActionBusy?'Saving…':timeAction?.kind==='add'?'Add time':timeAction?.kind==='transfer'?'Transfer time':'Save change'}</Button></>}><div className="space-y-3">{timeAction?.kind==='add'?<><p className="text-xs text-slate-soft">Add Time charges the chosen rate in pesos. The configured default is selected first.</p><label className="block"><span className="eyebrow mb-1.5 block">Rate plan</span><select value={timeRatePlanId} onChange={event=>setTimeRatePlanId(event.target.value)} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900"><option value="">Choose rate</option>{timeActionRatePlans.map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {plan.mode==='package'?`₱${Number(plan.amount||0).toFixed(2)}`:`₱${Number(plan.pesoUnit||0).toFixed(2)} / ${plan.minutesPerUnit} min`}</option>)}</select></label>{selectedTimeRatePlan?.mode !== 'package' && (
  <div>
    <label className="eyebrow mb-1.5 block">Cash amount (₱)</label>
    <div className="mb-2 grid grid-cols-4 gap-1.5">
      {[5, 10, 15, 20].map((p) => (
        <button
          type="button"
          key={p}
          onClick={() => setTimePesos(String(p))}
          className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
            Number(timePesos) === p
              ? 'border-gold/50 bg-gold/10 text-gold-dim'
              : 'border-surface-line text-slate-soft hover:text-ink-900'
          }`}
        >
          ₱{p}
        </button>
      ))}
    </div>
    <NumericInput
      value={timePesos}
      onChange={(event) => setTimePesos(event.target.value)}
      placeholder="0"
      className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900"
    />
  </div>
)}</>:<><p className="text-xs text-slate-soft">Choose a preset or set hours and minutes. Transfer moves time directly to another active prepaid PC, whether it is a member or guest session.</p><div className="grid grid-cols-5 gap-1">{[15,30,60,120].map(value=><button type="button" key={value} onClick={()=>setTimeMinutes(value)} className={`rounded-md border px-1 py-2 text-[11px] ${Number(timeMinutes)===value?'border-gold/50 bg-gold/10 text-gold-dim':'border-surface-line text-slate-soft'}`}>{value<60?`${value}m`:`${value/60}h`}</button>)}<button type="button" onClick={()=>setTimeMinutes(Math.max(1,Math.floor((Number(timeAction?.session?.expiresAt||Date.now())-Date.now())/60000)))} className="rounded-md border border-surface-line px-1 py-2 text-[11px] text-slate-soft">Full</button></div><DurationInput label="Session time" valueMinutes={timeMinutes} onChange={setTimeMinutes} disabled={timeActionBusy}/>{timeAction?.kind==='transfer'&&<label className="block"><span className="eyebrow mb-1.5 block">Destination PC</span><select value={timeRecipient} onChange={event=>setTimeRecipient(event.target.value)} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900"><option value="">Choose active prepaid PC</option>{pcs.filter(candidate=>candidate.id!==timeAction?.pc?.id&&candidate.session?.billing==='prepaid').map(candidate=><option value={candidate.id} key={candidate.id}>{candidate.label} · {candidate.session?.username||candidate.session?.customerName||'Guest'}</option>)}</select></label>}</>}</div></Modal>
    </AdminPageWorkspace>
  )
}
