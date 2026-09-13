import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Clock3, Copy, Link2, LockKeyhole, Monitor, MonitorCheck, MonitorPlay, Plus, Search, WifiOff, Wrench } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import PcCard from '../components/floor/PcCard.jsx'
import SessionModal from '../components/floor/SessionModal.jsx'
import PcFormModal from '../components/floor/PcFormModal.jsx'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import SidePanel from '../components/common/SidePanel.jsx'
import AnchoredPopover from '../components/common/AnchoredPopover.jsx'
import StationActions from '../components/floor/StationActions.jsx'
import NumericInput from '../components/common/NumericInput.jsx'
import DurationInput from '../components/common/DurationInput.jsx'
import { useAppData } from '../context/AppDataContext.jsx'
import { playLowTimeAlert } from '../lib/sound.js'
import BulkActionsDropdown from '../components/bulk/BulkActionsDropdown.jsx'
import BulkTopUpWalletModal from '../components/bulk/BulkTopUpWalletModal.jsx'
import BulkTopUpSessionModal from '../components/bulk/BulkTopUpSessionModal.jsx'
import BulkPowerModal from '../components/bulk/BulkPowerModal.jsx'
import BulkAddPcModal from '../components/bulk/BulkAddPcModal.jsx'
import { showToast } from '../lib/toast.js'
import { AdminEmptyState, AdminMetricCard, AdminPageWorkspace } from '../components/layout/AdminPageWorkspace.jsx'
import { remainingSessionSeconds } from '../lib/sessionTime.js'
import { runBulkMutation } from '../lib/bulkMutation.js'
import { createOperationKey } from '../lib/api.js'
import { cloudStationAdmin, isCloudAdmin } from '../lib/cloudClient.js'

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
  } = useAppData()
  const [selectedId, setSelectedId] = useState(null)
  const [pcFormOpen, setPcFormOpen] = useState(false)
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
  const [now, setNow] = useState(Date.now())
  const [controlsPcId, setControlsPcId] = useState(null)
  const controlsAnchorRef = useRef(null)
  const [commandBusy, setCommandBusy] = useState('')
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
  useEffect(() => { pcs.forEach(pc=>{const session=pc.session;if(pc.status!=='occupied'||session?.billing!=='prepaid')return;const remaining=remainingSessionSeconds(session,now);const key=`${pc.id}:${session.id}`;if(remaining>0&&remaining<=Number(settings.lowTimeWarningMinutes||5)*60&&!alerted.current.has(key)){alerted.current.add(key);playLowTimeAlert()}}) }, [now,pcs,settings.lowTimeWarningMinutes])

  const stats = useMemo(() => ({
    available:pcs.filter(p=>p.status==='available').length,
    occupied:pcs.filter(p=>p.status==='occupied').length,
    maintenance:pcs.filter(p=>p.status==='maintenance').length,
    offline:pcs.filter(p=>p.status==='offline').length,
    locked:pcs.filter(p=>p.session?.isLocked).length,
    total:pcs.length,
  }), [pcs])
  const selected = selectedId ? pcs.find((p) => String(p.id) === String(selectedId)) ?? null : null
  const detailPc = requestedPcId ? pcs.find((pc) => String(pc.id) === String(requestedPcId)) ?? null : null
  const editingPc = editingPcId ? pcs.find((p) => p.id === editingPcId) ?? null : null
  const controlsPc = controlsPcId ? pcs.find((p) => String(p.id) === String(controlsPcId)) ?? null : null
  const bulkMemberTargets = members.map((member) => ({ id:member.id, label:member.name, sublabel:`${member.username || member.memberCode || 'Member'} · ₱${Number(member.wallet || 0).toFixed(2)}` }))
  const bulkSessionTargets = members.filter((member) => pcs.some((pc) => pc.status === 'occupied' && String(pc.session?.customerId)===String(member.id))).map((member) => ({ id:member.id, label:member.name, sublabel:'Active session', tier:member.tier }))
  const bulkPcTargets = pcs.filter((pc) => !['maintenance','offline'].includes(pc.status)).map((pc) => ({ id:pc.id, label:pc.label, sublabel:`${pc.ipAddress} · ${pc.status}` }))
  const removablePcTargets = pcs.filter((pc) => !['occupied','reserved'].includes(pc.status) && !pc.session).map((pc) => ({ id:pc.id, label:pc.label, sublabel:`${pc.ipAddress} · ${pc.status}` }))
  const sortedPcs = useMemo(() => {
    const term=query.trim().toLowerCase()
    const pcNumber = (pc) => {
      const numeric = String(pc.pcNumber ?? pc.label ?? pc.id ?? '').match(/\d+/)
      return numeric ? Number(numeric[0]) : Number.MAX_SAFE_INTEGER
    }
    const order = (pc) => {
      const status = String(pc.status || '').toLowerCase()
      // A live session is the primary operational priority. This also keeps a
      // recovering/legacy station with a session from being mixed in with
      // idle units before the next presence reconciliation.
      if (pc.session || ['occupied', 'in_use', 'in-use', 'busy'].includes(status)) return 0
      if (status === 'available') return 1
      if (status === 'reserved') return 2
      if (status === 'maintenance') return 3
      // Offline and unknown/unreachable stations always remain at the end.
      return 4
    }
    return [...pcs]
      .filter(pc => (filter==='all' || (filter==='locked' ? Boolean(pc.session?.isLocked) : pc.status===filter)) && (term===''||[pc.label,pc.ipAddress,pc.spec,pc.session?.customerName,pc.session?.username].some(value=>String(value||'').toLowerCase().includes(term))))
      .sort((a, b) => order(a) - order(b) || pcNumber(a) - pcNumber(b) || String(a.label).localeCompare(String(b.label), undefined, { numeric:true }))
  }, [pcs,filter,query])


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

  async function handleStart(pc, sessionInput) {
    setActionError('')
    try {
      await startSession(pc, sessionInput)
      setSelectedId(null)
    } catch (error) {
      setActionError(error?.message || 'Unable to start the session.')
      throw error
    }
  }

  async function handleEnd(pc, disposition = 'save', options = {}) {
    setActionError('')
    try {
      await endSession(pc, disposition, options)
      setSelectedId(null)
    } catch (error) {
      setActionError(error?.message || 'Unable to end the session.')
      throw error
    }
  }

  async function handleSetMaintenance(pc, toMaintenance = true) {
    setActionError('')
    try {
      await setMaintenance(pc, toMaintenance)
      setSelectedId(null)
    } catch (error) {
      setActionError(error?.message || 'Unable to update PC status.')
      throw error
    }
  }
  async function handleRefund(pc) {
    setActionError('')
    try {
      await refundSession(pc)
      setSelectedId(null)
    } catch (error) {
      setActionError(error?.message || 'Unable to refund the session.')
      throw error
    }
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
    } catch {
      // handleEnd already surfaces the backend error in actionError.
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
  async function quickCommand(pc,command){
    if(commandBusy)return
    setCommandBusy(command)
    const commandRequest=requestStationCommand(pc,command)
    // The command has already been optimistically applied to the card; do not
    // leave the action menu in the way while the station acknowledgement travels.
    closePopover()
    closeControls()
    try{await commandRequest}finally{setCommandBusy('')}
  }
  const timeActionRatePlans = allowedRatePlansForSession(ratePlans, members, timeAction?.session)
  const selectedTimeRatePlan=timeActionRatePlans.find(item=>String(item.id)===String(timeRatePlanId))
  const timeActionAmount=selectedTimeRatePlan?.mode==='package'?Number(selectedTimeRatePlan.amount):Number(timePesos)
  const timeActionMinutes=selectedTimeRatePlan?.mode==='package'?Number(selectedTimeRatePlan.minutes):Math.floor(timeActionAmount*(Number(selectedTimeRatePlan?.minutesPerUnit)/Number(selectedTimeRatePlan?.pesoUnit)))
  const canSubmitTimeAction=Boolean(timeAction&&(timeAction.kind==='add'
    ? selectedTimeRatePlan&&Number.isFinite(timeActionAmount)&&timeActionAmount>0&&Number.isInteger(timeActionMinutes)&&timeActionMinutes>0
    : Number(timeMinutes)>0&&(timeAction.kind!=='transfer'||timeRecipient)))
  function getTimeActionOperationKey(){
    const fingerprint=JSON.stringify([
      timeAction?.session?.id||'',
      timeAction?.kind||'',
      timeRatePlanId||'',
      Number.isFinite(timeActionAmount)?timeActionAmount:null,
      Number.isFinite(timeActionMinutes)?timeActionMinutes:null,
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
  const toolbarActions=<div className="flex flex-wrap items-center gap-2">{isCloudAdmin()&&<Button icon={Link2} variant="subtle" size="sm" onClick={openStationPairing}>Pair Customer PC</Button>}<BulkActionsDropdown items={[{id:'wallet',icon:'wallet',label:'Top up wallets',hint:'Select multiple members'},{id:'session',icon:'session',label:'Add session time',hint:`${bulkSessionTargets.length} active session${bulkSessionTargets.length===1?'':'s'}`},{id:'lock',icon:'lock',label:'Lock stations',hint:'Pause active sessions'},{id:'unlock',icon:'unlock',label:'Unlock stations',hint:'Resume locked sessions'},{id:'restart',icon:'restart',label:'Restart stations',hint:'Shows a 5-second station warning'},{id:'shutdown',icon:'shutdown',label:'Shutdown stations',hint:'Shows a 5-second station warning'},{id:'remove',icon:'remove',label:'Remove PCs',hint:`${removablePcTargets.length} removable station${removablePcTargets.length===1?'':'s'}`}]} onAction={(id)=>{if(id==='wallet'){setBulkWalletOperationKey(createOperationKey());setBulkWalletOpen(true)}else if(id==='session'){setBulkSessionOperationKey(createOperationKey());setBulkSessionOpen(true)}else setBulkPower(id)}} /><Button icon={Monitor} variant="ghost" size="sm" onClick={() => setBulkAddOpen(true)}>Bulk add</Button><Button icon={Plus} variant="primary" size="sm" onClick={() => setPcFormOpen(true)}>Add PC</Button></div>



  return (
    <AdminPageWorkspace>
      <h1 className="sr-only">Clients</h1>
      {actionError && (
        <div className="mb-4 rounded-lg border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-dim">
          {actionError}
        </div>
      )}

      <div className="clients-metric-grid admin-metric-grid mb-4">
        <AdminMetricCard label="Available" value={stats.available} hint="Ready for a new session" icon={MonitorCheck} tone="success" onClick={()=>setClientStatusFilter('available')}/>
        <AdminMetricCard label="In use" value={stats.occupied} hint="Stations with active sessions" icon={MonitorPlay} tone="warning" onClick={()=>setClientStatusFilter('occupied')}/>
        <AdminMetricCard label="Locked sessions" value={stats.locked} hint="Paused or access restricted" icon={LockKeyhole} onClick={()=>setClientStatusFilter('locked')}/>
        <AdminMetricCard label="Maintenance" value={stats.maintenance} hint="Temporarily unavailable" icon={Wrench} tone="danger" onClick={()=>setClientStatusFilter('maintenance')}/>
        <AdminMetricCard label="Offline" value={stats.offline} hint={`${stats.total} stations registered`} icon={WifiOff} onClick={()=>setClientStatusFilter('offline')}/>
      </div>

      <section className="clients-floor-workspace">
        <div className="admin-page-toolbar flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <div className="admin-search-field min-w-[220px] flex-1 sm:max-w-sm"><Search size={14}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search PC, IP, or customer" className="min-w-0 flex-1 bg-transparent text-xs text-ink-900 outline-none placeholder:text-slate-soft"/></div>
            <div className="admin-segmented-control">{CLIENT_STATUS_FILTERS.map(value=><button type="button" key={value} onClick={()=>setClientStatusFilter(value)} className={`rounded-md px-2.5 py-1.5 text-[11px] font-semibold capitalize transition-colors ${filter===value?'bg-midnight text-soft-white':'text-slate-soft hover:text-ink-900'}`}>{value==='occupied'?'In use':value}</button>)}</div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3"><span className="stat-figure text-xs text-slate-soft"><b className="text-ink-900">{stats.available}</b> of {stats.total} free</span>{toolbarActions}</div>
        </div>
        <div className="mt-4">
          {pcs.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 min-[1800px]:grid-cols-6">
              {sortedPcs.map((pc) => (
                <PcCard key={pc.id} pc={pc} now={now} lowTimeWarningMinutes={settings.lowTimeWarningMinutes} onSelect={openPopover} onControls={openControls} />
              ))}
            </div>
          ) : (
            <AdminEmptyState icon={Monitor} title="No PC clients registered" description="Add a logical PC, then generate its Cloud pairing code. The Customer Station binds to your organization, branch, and PC identity; the LAN IP is used only for local fallback." action={<Button icon={Plus} variant="primary" size="sm" onClick={() => setPcFormOpen(true)}>Add PC</Button>}/>
          )}
        </div>
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
          onPauseSave={(pc)=>afterControlsClose(()=>pauseAndSaveTime(pc))}
          onMaintenance={(pc,toMaintenance)=>afterControlsClose(()=>handleSetMaintenance(pc,toMaintenance).catch(()=>{}))}
          onEdit={(pc)=>afterControlsClose(()=>setEditingPcId(pc.id))}
        />}
      </AnchoredPopover>

      {detailPc && !pendingTimeAction && !timeAction && (() => {
        const pc=detailPc
        const statusLabel=pc.session?.isLocked ? 'Session locked' : pc.status==='occupied' ? 'In use' : pc.status
        return <SidePanel
          open
          onClose={closePopover}
          eyebrow="Station details"
          title={pc.label}
          ariaLabel={`${pc.label} station details`}
        >
          <div className="space-y-5">
            <section className="overview-soft-card p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="eyebrow">Station</p><p className="mt-1 text-sm font-semibold text-ink-900">{pc.spec || 'Cafe PC'}</p><p className="stat-figure mt-1 text-[11px] text-slate-soft">{pc.ipAddress}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${pc.status==='available'?'bg-teal/10 text-teal-dim':pc.status==='maintenance'||pc.status==='offline'?'bg-ember/10 text-ember-dim':'bg-gold/10 text-gold-dim'}`}>{statusLabel}</span></div>
            </section>

            <StationActions
              pc={pc}
              variant="drawer"
              commandBusy={commandBusy}
              pauseSaveBusy={pauseSaveBusy === pc.id}
              onSession={openSessionModal}
              onTimeAction={openTimeAction}
              onForfeit={(pc)=>afterPopoverClose(()=>setForfeitTarget(pc))}
              onCommand={quickCommand}
              onPauseSave={(pc)=>afterPopoverClose(()=>pauseAndSaveTime(pc))}
              onMaintenance={(pc,toMaintenance)=>afterPopoverClose(()=>handleSetMaintenance(pc,toMaintenance).catch(()=>{}))}
              onEdit={(pc)=>afterPopoverClose(()=>setEditingPcId(pc.id))}
            />

            {pc.session ? <section className="overview-card p-4"><div className="mb-3 flex items-center justify-between"><div><p className="eyebrow">Current session</p><h3 className="mt-1 text-sm font-semibold text-ink-900">{pc.session.customerName || pc.session.username || 'Guest session'}</h3></div><span className="rounded-full bg-surface-raised px-2 py-1 text-[10px] font-semibold capitalize text-slate-soft">{pc.session.billing || 'prepaid'}</span></div><div className="grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-surface-raised/60 p-3"><p className="text-[10px] text-slate-soft">Rate</p><p className="mt-1 font-semibold text-ink-900">{pc.session.ratePlanName || 'Current rate'}</p></div><div className="rounded-xl bg-surface-raised/60 p-3"><p className="text-[10px] text-slate-soft">Session state</p><p className="mt-1 font-semibold text-ink-900">{pc.session.isLocked ? 'Locked' : 'Active'}</p></div></div></section> : <section className="rounded-[16px] border border-dashed border-surface-line px-4 py-5 text-center"><p className="text-sm font-semibold text-ink-900">No active session</p><p className="mt-1 text-xs text-slate-soft">This station is ready for a member or guest session.</p></section>}
          </div>
        </SidePanel>
      })()}

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
      <Modal
        open={Boolean(forfeitTarget)}
        onClose={() => !forfeitBusy && setForfeitTarget(null)}
        onSubmit={forfeitOfflineSession}
        canSubmit={Boolean(forfeitTarget?.session)}
        busy={forfeitBusy}
        eyebrow="Offline station recovery"
        title="Forfeit saved time?"
        footer={<><Button variant="ghost" disabled={forfeitBusy} onClick={() => setForfeitTarget(null)}>Cancel</Button><Button variant="danger" disabled={forfeitBusy} onClick={forfeitOfflineSession}>{forfeitBusy ? 'Forfeiting…' : 'Forfeit time'}</Button></>}
      >
        <div className="flex gap-3 text-sm text-slate-soft"><AlertTriangle className="mt-0.5 shrink-0 text-ember-dim" size={18}/><p><b className="text-ink-900">{forfeitTarget?.label}</b> is offline with a paused prepaid session. This permanently ends the session and removes any remaining saved time. It cannot be undone.</p></div>
      </Modal>
      <BulkTopUpWalletModal open={bulkWalletOpen} targets={bulkMemberTargets} onClose={() => setBulkWalletOpen(false)} onConfirm={async (ids, amount) => { const key=bulkWalletOperationKey||createOperationKey(); if(!bulkWalletOperationKey)setBulkWalletOperationKey(key); await runBulkMutation(ids,(id,operationKey)=>adminTopUp(id,amount,{operationKey,refresh:false}),key); setBulkWalletOperationKey(null); setBulkWalletOpen(false) }} />
      <BulkTopUpSessionModal open={bulkSessionOpen} targets={bulkSessionTargets} ratePlans={ratePlans.filter((plan) => plan.isActive !== false)} onClose={() => setBulkSessionOpen(false)} onConfirm={async (ids, ratePlanId, amount) => { const key=bulkSessionOperationKey||createOperationKey(); if(!bulkSessionOperationKey)setBulkSessionOperationKey(key); await runBulkMutation(ids,(id,operationKey)=>topUpMemberSession(id,ratePlanId,amount,{operationKey,refresh:false}),key); setBulkSessionOperationKey(null); setBulkSessionOpen(false) }} />
      <BulkPowerModal open={!!bulkPower} command={bulkPower} targets={bulkPower==='remove'?removablePcTargets:bulkPcTargets.filter(target=>{const pc=pcs.find(item=>item.id===target.id);if(bulkPower==='lock')return pc?.session&&!pc.session.isLocked;if(bulkPower==='unlock')return pc?.session?.isLocked;return true})} onClose={() => setBulkPower(null)} onConfirm={async (ids) => { if(bulkPower==='remove'){await Promise.all(ids.map((id) => removePc(id,{silent:true})));showToast({title:'PCs removed',message:`${ids.length} station${ids.length===1?'':'s'} removed from the floor.`})}else{await Promise.all(ids.map((id) => powerCommand(pcs.find((pc) => pc.id === id), bulkPower,{suppressToast:true})));showToast({title:`${bulkPower==='restart'?'Restart':bulkPower==='shutdown'?'Shutdown':bulkPower==='lock'?'Lock':'Unlock'} sent`,message:`Command sent to ${ids.length} station${ids.length===1?'':'s'}.`})} setBulkPower(null) }} />
      <BulkAddPcModal open={bulkAddOpen} onClose={() => setBulkAddOpen(false)} onCreate={addPc} existingPcs={pcs} cloudManaged={isCloudAdmin()} />
      <Modal open={!!timeAction} onClose={()=>!timeActionBusy&&closeTimeAction()} eyebrow="Active prepaid session" title={`${timeAction?.kind==='add'?'Add':timeAction?.kind==='reduce'?'Reduce':'Transfer'} session time`} maxWidth="max-w-md" onSubmit={submitTimeAction} canSubmit={canSubmitTimeAction} busy={timeActionBusy} footer={<><Button variant="ghost" onClick={closeTimeAction} disabled={timeActionBusy}>Cancel</Button><Button variant={timeAction?.kind==='reduce'?'danger':'primary'} disabled={!canSubmitTimeAction||timeActionBusy} onClick={submitTimeAction}>{timeActionBusy?'Saving…':timeAction?.kind==='add'?'Add time':timeAction?.kind==='transfer'?'Transfer time':'Save change'}</Button></>}><div className="space-y-3">{timeAction?.kind==='add'?<><p className="text-xs text-slate-soft">Add Time charges the chosen rate in pesos. The configured default is selected first.</p><label className="block"><span className="eyebrow mb-1.5 block">Rate plan</span><select value={timeRatePlanId} onChange={event=>setTimeRatePlanId(event.target.value)} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900"><option value="">Choose rate</option>{timeActionRatePlans.map(plan=><option key={plan.id} value={plan.id}>{plan.name} · {plan.mode==='package'?`₱${Number(plan.amount||0).toFixed(2)}`:`₱${Number(plan.pesoUnit||0).toFixed(2)} / ${plan.minutesPerUnit} min`}</option>)}</select></label>{selectedTimeRatePlan?.mode!=='package'&&<label className="block"><span className="eyebrow mb-1.5 block">Cash amount (₱)</span><NumericInput value={timePesos} onChange={event=>setTimePesos(event.target.value)} placeholder="0" className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900"/></label>}</>:<><p className="text-xs text-slate-soft">Choose a preset or set hours and minutes. Transfer moves time directly to another active prepaid PC, whether it is a member or guest session.</p><div className="grid grid-cols-5 gap-1">{[15,30,60,120].map(value=><button type="button" key={value} onClick={()=>setTimeMinutes(value)} className={`rounded-md border px-1 py-2 text-[11px] ${Number(timeMinutes)===value?'border-gold/50 bg-gold/10 text-gold-dim':'border-surface-line text-slate-soft'}`}>{value<60?`${value}m`:`${value/60}h`}</button>)}<button type="button" onClick={()=>setTimeMinutes(Math.max(1,Math.floor((Number(timeAction?.session?.expiresAt||Date.now())-Date.now())/60000)))} className="rounded-md border border-surface-line px-1 py-2 text-[11px] text-slate-soft">Full</button></div><DurationInput label="Session time" valueMinutes={timeMinutes} onChange={setTimeMinutes} disabled={timeActionBusy}/>{timeAction?.kind==='transfer'&&<label className="block"><span className="eyebrow mb-1.5 block">Destination PC</span><select value={timeRecipient} onChange={event=>setTimeRecipient(event.target.value)} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900"><option value="">Choose active prepaid PC</option>{pcs.filter(candidate=>candidate.id!==timeAction?.pc?.id&&candidate.session?.billing==='prepaid').map(candidate=><option value={candidate.id} key={candidate.id}>{candidate.label} · {candidate.session?.username||candidate.session?.customerName||'Guest'}</option>)}</select></label>}</>}</div></Modal>
    </AdminPageWorkspace>
  )
}
