import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUpRight,
  CalendarDays,
  BookOpenText,
  ChartNoAxesCombined,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  LifeBuoy,
  MessageSquareText,
  MonitorCheck,
  MonitorCog,
  MonitorPlay,
  Moon,
  Tags,
  Users,
  WalletCards,
  Wrench,
  Sun,
  Mail,
  Send,
  UtensilsCrossed,
  Sparkles,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { apiGet } from '../lib/api.js'
import { connectSocket } from '../lib/socket.js'
import { readSnapshot, writeSnapshot } from '../lib/localCache.js'
import { scopedPageCacheKey } from '../lib/pageCache.js'
import { isCloudAdmin } from '../lib/cloudClient.js'
import FeedbackInboxModal from '../components/admin/FeedbackInboxModal.jsx'
import AdminNotificationCenter from '../components/admin/AdminNotificationCenter.jsx'
import AnnouncementCenter from '../components/admin/AnnouncementCenter.jsx'
import AdminQuickFind from '../components/admin/AdminQuickFind.jsx'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import { showToast } from '../lib/toast.js'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { useAdminMode } from '../context/AdminModeContext.jsx'
import { useEsportsTheme } from '../context/EsportsThemeContext.jsx'
import { formatAdminPeso } from '../lib/numeric.js'
import { effectivePcStatus } from '../lib/pcStatus.js'
import { buildRevenueScale, formatRevenueDay, normalizeSevenDayRevenue } from '../lib/revenueChart.js'
import AdminSectionManual from '../components/admin/AdminSectionManual.jsx'
import AdminProfileMenu from '../components/layout/AdminProfileMenu.jsx'

const STATUS_META = {
  available: { label:'Available', icon:MonitorCheck, tone:'text-teal-dim bg-teal/10', dot:'bg-teal' },
  occupied: { label:'In use', icon:MonitorPlay, tone:'text-gold bg-gold/10', dot:'bg-gold' },
  maintenance: { label:'Maintenance', icon:Wrench, tone:'text-ember-dim bg-ember/10', dot:'bg-ember' },
  offline: { label:'Offline', icon:MonitorCog, tone:'text-slate-soft bg-surface-raised', dot:'bg-slate-soft' },
  reserved: { label:'Reserved', icon:Clock3, tone:'text-grape bg-trillium/20', dot:'bg-grape' },
}

function OverviewCard({ title, subtitle, action, children, className='' }) {
  return <section className={`overview-card min-w-0 p-4 lg:p-5 ${className}`}>
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-soft">{subtitle}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>
}

function Empty({ children }) {
  return <p className="rounded-xl border border-dashed border-surface-line px-3 py-7 text-center text-xs text-slate-soft">{children}</p>
}

function initials(value='Admin') {
  return String(value).trim().split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]?.toUpperCase()).join('') || 'AD'
}

function toTimestamp(value) {
  if (value === null || value === undefined || value === '') return null
  const timestamp = typeof value === 'number' ? value : new Date(value).getTime()
  return Number.isFinite(timestamp) ? timestamp : null
}

function formatRelativeTime(value, nowMs=Date.now()) {
  if (!value) return 'Just now'
  const timestamp = toTimestamp(value)
  if (timestamp == null) return 'Just now'
  const diff = Math.max(0, nowMs - timestamp)
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

function formatEndingSoon(value, nowMs=Date.now()) {
  if (!value) return 'Session'
  const timestamp=toTimestamp(value)
  const diff = timestamp == null ? NaN : timestamp - nowMs
  if (!Number.isFinite(diff)) return 'Time unavailable'
  const minutes = Math.max(0, Math.ceil(diff / 60000))
  if (minutes < 60) return `${minutes} min left`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest ? `${hours} hr ${rest} min left` : `${hours} hr left`
}


function formatWeekRange(week) {
  const first=week[0].date,last=week[6].date
  const year=last.getUTCFullYear()
  const firstMonth=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(first)
  const lastMonth=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'}).format(last)
  if(first.getUTCMonth()===last.getUTCMonth()) return `${firstMonth} ${first.getUTCDate()} – ${last.getUTCDate()}, ${year}`
  return `${firstMonth} ${first.getUTCDate()} – ${lastMonth} ${last.getUTCDate()}, ${year}`
}

function manilaWeek(now=new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone:'Asia/Manila', year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(now).filter(part=>part.type!=='literal').map(part=>[part.type,Number(part.value)]))
  const current = new Date(Date.UTC(parts.year, parts.month-1, parts.day))
  const weekday = current.getUTCDay() || 7
  const monday = new Date(current)
  monday.setUTCDate(current.getUTCDate() - weekday + 1)
  return Array.from({length:7},(_,index)=>{
    const date = new Date(monday)
    date.setUTCDate(monday.getUTCDate() + index)
    return {
      date,
      number: date.getUTCDate(),
      day: new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(date),
      isToday: date.toISOString().slice(0,10) === current.toISOString().slice(0,10),
    }
  })
}

export default function OverviewPage(){
  const { user }=useAuth()
  const { isDark, toggleTheme }=useTheme()
  const { uiMode, isSimpleMode, isAdvanceMode, canToggleMode, setUiMode }=useAdminMode()
  const { themeMode, isEsportsMode, isDashboardMode, setThemeMode }=useEsportsTheme()
  const { settings, pcs, topUpRequests, supportRequests, serverError, sendEmailSummary }=useAppData()
  const [data,setData]=useState(null)
  const [error,setError]=useState('')
  const [feedbackOpen,setFeedbackOpen]=useState(false)
  const [manualOpen,setManualOpen]=useState(false)
  const [nowMs,setNowMs]=useState(()=>Date.now())
  const loadSequenceRef=useRef(0)
  const navigate=useNavigate()

  // Email Summary Modal State
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [emailRecipient, setEmailRecipient] = useState('')
  const [emailPeriod, setEmailPeriod] = useState('daily')
  const [sendingEmail, setSendingEmail] = useState(false)

  const overviewCacheKey=useCallback(()=>scopedPageCacheKey('overview',user),[user])

  const load=useCallback(async()=>{
    const requestId=++loadSequenceRef.current
    const requestCacheKey=overviewCacheKey()
    setError('')
    try{
      const next=await apiGet('/dashboard/overview')
      if(requestId !== loadSequenceRef.current || requestCacheKey !== overviewCacheKey())return
      setData(next)
      if(requestCacheKey)void writeSnapshot(requestCacheKey,next)
    }catch{
      if(requestId !== loadSequenceRef.current)return
      setError('Live dashboard data is temporarily unavailable. Showing the latest cached data when available.')
    }
  },[overviewCacheKey])

  useEffect(()=>{
    let active=true
    const hydrate=async()=>{
      const key=overviewCacheKey()
      if(key){const cached=await readSnapshot(key);if(active&&cached)setData(cached)}
      if(active)void load()
    }
    void hydrate()
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},60000)
    const clock=setInterval(()=>setNowMs(Date.now()),1000)
    const onOnline=()=>void load()
    const onVisible=()=>{if(document.visibilityState==='visible'){setNowMs(Date.now());void load()}}
    const onBranch=()=>{loadSequenceRef.current += 1;setData(null);void hydrate()}
    window.addEventListener('online',onOnline)
    window.addEventListener('aezakmi:cloud-branch-changed',onBranch)
    document.addEventListener('visibilitychange',onVisible)
    let socket=null
    const onChanged=()=>void load()
    if(!isCloudAdmin()){socket=connectSocket();socket.on('data:changed',onChanged)}
    return()=>{active=false;clearInterval(timer);clearInterval(clock);window.removeEventListener('online',onOnline);window.removeEventListener('aezakmi:cloud-branch-changed',onBranch);document.removeEventListener('visibilitychange',onVisible);if(socket)socket.off('data:changed',onChanged);loadSequenceRef.current += 1}
  },[load,overviewCacheKey])

  async function handleSendEmailSummary(e) {
    if (e) e.preventDefault()
    setSendingEmail(true)
    try {
      const res = await sendEmailSummary(emailPeriod, emailRecipient)
      showToast({
        title: res?.emailSent ? 'Summary Email Sent' : 'Summary Report Generated',
        message: res?.message || `Summary report for ${emailPeriod} generated.`,
        tone: res?.emailSent ? 'success' : 'default',
      })
      setEmailModalOpen(false)
    } catch (err) {
      showToast({ title: 'Email Delivery Failed', message: err.message, tone: 'error' })
    } finally {
      setSendingEmail(false)
    }
  }

  const summary=data?.summary||{}
  const statusCounts=useMemo(()=>{
    const counts={available:0,occupied:0,maintenance:0,offline:0,reserved:0}
    for(const pc of pcs||[]){const status=effectivePcStatus(pc);if(status in counts)counts[status] += 1;else counts.offline += 1}
    return counts
  },[pcs])
  const cards=[['Available',statusCounts.available,MonitorCheck,'text-teal-dim bg-teal/10','available'],['In use',statusCounts.occupied,MonitorPlay,'text-gold bg-gold/10','occupied'],['Maintenance',statusCounts.maintenance,Wrench,'text-ember-dim bg-ember/10','maintenance'],['Offline',statusCounts.offline,MonitorCog,'text-slate-soft bg-surface-raised','offline'],['Revenue today',formatAdminPeso(summary.incomeToday,settings),CircleDollarSign,'text-gold bg-gold/10',null]]

  const floorPreview=useMemo(()=>{
    const rank={occupied:0,reserved:1,maintenance:2,offline:3,available:4}
    return [...(pcs||[])].sort((a,b)=>(rank[effectivePcStatus(a)]??9)-(rank[effectivePcStatus(b)]??9)||String(a.label||'').localeCompare(String(b.label||''))).slice(0,12)
  },[pcs])

  const liveSessions=useMemo(()=>{
    return (pcs||[]).filter(pc=>pc?.session).map(pc=>({
      id:pc.session.id,
      pc_id:pc.id,
      pc_label:pc.label||pc.id,
      customer_name:pc.session.customerName||'Guest',
      username:pc.session.username||null,
      billing_type:pc.session.billing||pc.session.billingType||'prepaid',
      started_at:pc.session.startedAt||pc.session.started_at||null,
      expires_at:pc.session.expiresAt||pc.session.expires_at||null,
      is_locked:Boolean(pc.session.isLocked||pc.session.isPaused),
    }))
  },[pcs])
  const currentSessions=useMemo(()=>liveSessions.filter(item=>{
    if(item.billing_type!=='prepaid'||item.is_locked||!item.expires_at)return true
    const expires=toTimestamp(item.expires_at)
    return expires==null||expires>nowMs
  }),[liveSessions,nowMs])
  const endingSoon=useMemo(()=>currentSessions
    .filter(item=>item.billing_type==='prepaid'&&item.expires_at&&!item.is_locked)
    .sort((a,b)=>(toTimestamp(a.expires_at)||Number.MAX_SAFE_INTEGER)-(toTimestamp(b.expires_at)||Number.MAX_SAFE_INTEGER))
    .slice(0,5),[currentSessions])

  const pendingTopUps=useMemo(()=>topUpRequests.filter(item=>item.status==='pending'),[topUpRequests])
  const openSupport=useMemo(()=>supportRequests.filter(item=>item.status==='open'),[supportRequests])

  const activity=useMemo(()=>{
    const sessions=currentSessions.map(item=>({
      id:`session-${item.id}`,
      type:'session',
      title:`${item.pc_label||'PC'} session started`,
      detail:item.username||item.customer_name||'Guest',
      at:item.started_at,
      pcId:item.pc_id,
    }))
    const topups=pendingTopUps.map(item=>({
      id:`topup-${item.id}`,
      type:'topup',
      title:`${item.customerName||'Member'} requested ${formatAdminPeso(item.amount,settings)}`,
      detail:`${item.pcLabel||'Counter'} · ${String(item.method||'cash').toUpperCase()}`,
      at:item.createdAt,
      route:'/members',
    }))
    const help=openSupport.map(item=>({
      id:`support-${item.id}`,
      type:'support',
      title:`${item.pcLabel||'PC'} requested assistance`,
      detail:item.customerName||item.message||'Customer needs help',
      at:item.createdAt,
      pcId:item.pcId,
    }))
    return [...sessions,...topups,...help]
      .sort((a,b)=>new Date(b.at||0).getTime()-new Date(a.at||0).getTime())
      .slice(0,8)
  },[currentSessions,pendingTopUps,openSupport,settings])

  const week=useMemo(()=>manilaWeek(new Date(nowMs)),[nowMs])
  const todayLabel=new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'long',day:'numeric',year:'numeric'}).format(new Date(nowMs))
  const weekLabel=formatWeekRange(week)
  const totalPcs=pcs.length
  const feedbackCount=data?.feedback?.length||0
  const fallbackAdminName=String(user?.name||user?.email||'Admin').includes('@') ? String(user?.email||user?.name||'Admin').split('@')[0] : String(user?.name||user?.email||'Admin')
  const displayName=String(settings?.displayName||fallbackAdminName||'Admin').trim()||'Admin'

  if(!data&&!error)return <div className="overview-workspace flex min-h-full items-center justify-center p-8 text-sm text-slate-soft">Loading business overview…</div>

  return <div className="overview-workspace">
    <div className={`overview-workspace-grid grid min-h-full ${isSimpleMode ? 'grid-cols-1' : 'xl:grid-cols-[minmax(0,1fr)_340px]'}`}>
      <div className={`overview-main-column min-w-0 ${isSimpleMode ? '' : 'border-b border-[var(--admin-ui-border)] xl:border-b-0 xl:border-r'}`}>
        <header className="overview-header flex min-h-[96px] items-center justify-between gap-4 px-5 py-3.5 sm:px-6 lg:px-7">
          <div className="min-w-0">
            <p className="max-w-[min(46vw,520px)] truncate text-[24px] font-semibold tracking-[-0.03em] text-ink-900" title={displayName}>Hi, {displayName}!</p>
          </div>
          <div className="overview-header-actions flex min-w-0 flex-1 items-center justify-end gap-2">
            {/* Dashboard vs Esports Persona Switcher */}
            <div className="flex items-center rounded-xl bg-surface-raised border border-surface-line p-0.5 shadow-xs shrink-0" title="Toggle Dashboard vs Esports Persona (F9)">
              <button
                type="button"
                onClick={() => setThemeMode('dashboard')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  isDashboardMode
                    ? 'bg-surface text-ink-900 shadow-sm border border-surface-line'
                    : 'text-slate-soft hover:text-ink-900'
                }`}
              >
                Dashboard
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('esports')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  isEsportsMode
                    ? 'bg-gradient-to-r from-teal-500/20 to-teal-400/30 text-teal-dim shadow-sm border border-teal/40'
                    : 'text-slate-soft hover:text-ink-900'
                }`}
              >
                Esports
              </button>
            </div>

            {canToggleMode && (
              <div className="flex items-center rounded-xl bg-surface-raised border border-surface-line p-0.5 shadow-xs shrink-0" title="Toggle Simple vs Advance UI Mode (F8)">
                <button
                  type="button"
                  onClick={() => setUiMode('simple')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    isSimpleMode
                      ? 'bg-surface text-ink-900 shadow-sm border border-surface-line'
                      : 'text-slate-soft hover:text-ink-900'
                  }`}
                >
                  Simple
                </button>
                <button
                  type="button"
                  onClick={() => setUiMode('advance')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    isAdvanceMode
                      ? 'bg-surface text-ink-900 shadow-sm border border-surface-line'
                      : 'text-slate-soft hover:text-ink-900'
                  }`}
                >
                  Advance
                </button>
              </div>
            )}
            <AdminQuickFind />
            {isAdvanceMode && <button type="button" onClick={()=>setManualOpen(true)} className="overview-header-control hidden lg:flex" title="Open Overview owner manual"><BookOpenText size={15}/><span className="hidden xl:inline">Manual</span></button>}
            <button type="button" onClick={()=>setFeedbackOpen(true)} className="overview-header-control relative" title="Open customer feedback">
              <MessageSquareText size={15}/><span className="hidden xl:inline">Feedback</span>
              {feedbackCount>0&&<span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-midnight px-1 text-[9px] font-bold text-soft-white">{feedbackCount>=3?'3+':feedbackCount}</span>}
            </button>
            <button type="button" onClick={toggleTheme} className="admin-icon-button" title={isDark?'Switch to light mode':'Switch to dark mode'} aria-label={isDark?'Switch to light mode':'Switch to dark mode'}>{isDark?<Sun size={16}/>:<Moon size={16}/>}</button>
            <AdminNotificationCenter />
            <AnnouncementCenter />
            <AdminProfileMenu
              currentLabel="Overview"
              onOpenManual={() => setManualOpen(true)}
              onOpenShiftModal={() => window.dispatchEvent(new CustomEvent('aezakmi:open-shift-modal'))}
              onOpenFeedback={() => setFeedbackOpen(true)}
              onOpenLock={() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l', altKey: true, shiftKey: true }))}
            />
          </div>
        </header>

        <div className="px-4 pb-5 sm:px-6 lg:px-7 lg:pb-6 space-y-4">
          {(error||serverError)&&<div className="flex items-center justify-between rounded-xl border border-ember/20 bg-ember/10 px-3 py-2 text-xs text-ember-dim"><span>{error||serverError}</span><button onClick={load} className="font-semibold underline">Retry</button></div>}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-5">
            {cards.map(([label,value,Icon,tone,status])=><button key={label} type="button" onClick={()=>status&&navigate(`/clients?status=${status}`)} disabled={!status} className="overview-card group flex min-h-[96px] sm:min-h-[104px] items-center justify-between p-3.5 sm:p-4 text-left transition-all enabled:hover:-translate-y-0.5 enabled:hover:border-midnight/30">
              <div>
                <p className="text-[10px] font-medium text-slate-soft">{label}</p>
                <p className="stat-figure mt-1.5 text-[20px] sm:text-[24px] font-semibold tracking-[-0.04em] text-ink-900">{value??0}</p>
              </div>
              <span className={`flex h-9 w-9 sm:h-10 sm:w-10 items-center justify-center rounded-full ${tone}`}><Icon size={16} strokeWidth={1.8}/></span>
            </button>)}
          </div>

          {/* SIMPLE MODE LAYOUT */}
          {isSimpleMode ? (
            <div className="space-y-4">
              <OverviewCard
                title="Live Station Floor"
                subtitle="Live status of all gaming rigs and consoles in the cafe."
                action={
                  <button onClick={()=>navigate('/clients')} className="flex items-center gap-1 text-[11px] font-bold text-gold hover:underline">
                    Floor Map & Controls <ArrowUpRight size={13}/>
                  </button>
                }
              >
                {pcs.length ? (
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
                    {pcs.map(pc => {
                      const meta = STATUS_META[effectivePcStatus(pc)] || STATUS_META.offline
                      const Icon = meta.icon
                      const isVip = pc.is_vip || pc.isVip || pc.tier === 'VIP' || (pc.specs && /vip/i.test(pc.specs))
                      return (
                        <button
                          key={pc.id}
                          onClick={() => navigate(`/clients?pc=${encodeURIComponent(pc.id)}`)}
                          className="overview-soft-card group p-3 text-left transition-all hover:-translate-y-0.5 flex flex-col justify-between min-h-[90px]"
                        >
                          <div className="flex items-center justify-between gap-1.5">
                            <span className={`flex h-6 w-6 items-center justify-center rounded-full ${meta.tone}`}>
                              <Icon size={12}/>
                            </span>
                            {isVip && (
                              <span className="flex items-center gap-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 px-1 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                👑 VIP
                              </span>
                            )}
                          </div>
                          <div className="mt-2 min-w-0">
                            <p className="truncate text-[12px] font-bold text-ink-900">{pc.label || pc.name || `PC-${pc.id}`}</p>
                            <p className="mt-0.5 truncate text-[9px] text-slate-soft">
                              {meta.label}{pc.session?.customerName ? ` · ${pc.session.customerName}` : ''}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <Empty>No PCs are registered yet.</Empty>
                )}
              </OverviewCard>

              <OverviewCard title="Cashier Quick Operations" subtitle="One-tap operational controls for front-desk staff.">
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                  <button
                    type="button"
                    onClick={() => navigate('/clients')}
                    className="overview-soft-card flex min-h-[76px] flex-col justify-between p-3 text-left transition-all hover:-translate-y-0.5"
                  >
                    <MonitorCog size={17} className="text-gold"/>
                    <div>
                      <span className="block text-[11px] font-bold text-ink-900">Station Matrix</span>
                      <span className="block text-[9px] text-slate-soft">Start / Lock PCs</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/members')}
                    className="overview-soft-card flex min-h-[76px] flex-col justify-between p-3 text-left transition-all hover:-translate-y-0.5"
                  >
                    <Users size={17} className="text-gold"/>
                    <div>
                      <span className="block text-[11px] font-bold text-ink-900">Members & Top-up</span>
                      <span className="block text-[9px] text-slate-soft">Add wallet credit</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/menu')}
                    className="overview-soft-card flex min-h-[76px] flex-col justify-between p-3 text-left transition-all hover:-translate-y-0.5"
                  >
                    <UtensilsCrossed size={17} className="text-gold"/>
                    <div>
                      <span className="block text-[11px] font-bold text-ink-900">Menu & Kitchen</span>
                      <span className="block text-[9px] text-slate-soft">Snacks & orders</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => navigate('/vouchers')}
                    className="overview-soft-card flex min-h-[76px] flex-col justify-between p-3 text-left transition-all hover:-translate-y-0.5"
                  >
                    <WalletCards size={17} className="text-gold"/>
                    <div>
                      <span className="block text-[11px] font-bold text-ink-900">Promo Vouchers</span>
                      <span className="block text-[9px] text-slate-soft">Issue & redeem</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => window.dispatchEvent(new CustomEvent('aezakmi:open-shift-modal'))}
                    className="overview-soft-card flex min-h-[76px] flex-col justify-between p-3 text-left transition-all hover:-translate-y-0.5"
                  >
                    <Clock3 size={17} className="text-teal-dim"/>
                    <div>
                      <span className="block text-[11px] font-bold text-ink-900">Cashier Shift</span>
                      <span className="block text-[9px] text-slate-soft">Reconcile drawer</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEmailModalOpen(true)}
                    className="overview-soft-card flex min-h-[76px] flex-col justify-between p-3 text-left transition-all hover:-translate-y-0.5 border-teal/30 bg-teal/5"
                  >
                    <Mail size={17} className="text-teal-dim"/>
                    <div>
                      <span className="block text-[11px] font-bold text-ink-900">Email Summary</span>
                      <span className="block text-[9px] text-slate-soft">Send owner report</span>
                    </div>
                  </button>
                </div>
              </OverviewCard>

              <OverviewCard title="Sessions ending soon" subtitle="Prepaid customer sessions with the nearest expiry times.">
                {endingSoon.length ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {endingSoon.map(item => (
                      <button key={item.id} onClick={() => navigate(`/clients?pc=${encodeURIComponent(item.pc_id)}`)} className="flex items-center justify-between gap-3 rounded-xl border border-surface-line customer-neutral-surface px-3 py-2.5 text-left transition-colors hover:bg-[var(--admin-card-subtle)]">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold">
                            <Clock3 size={13}/>
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-[11px] font-semibold text-ink-900">{item.pc_label} · {item.username||item.customer_name||'Guest'}</p>
                            <p className="mt-0.5 text-[9px] text-slate-soft">Prepaid Session</p>
                          </div>
                        </div>
                        <span className="shrink-0 rounded-full bg-ember/10 px-2 py-0.5 text-[9px] font-semibold text-ember-dim">
                          {formatEndingSoon(item.expires_at, nowMs)}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty>No prepaid sessions are ending soon.</Empty>
                )}
              </OverviewCard>
            </div>
          ) : (
            /* ADVANCE MODE LAYOUT */
            <div className="space-y-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
                <OverviewCard title="Floor status" subtitle="A quick look at the stations that need attention." action={<button onClick={()=>navigate('/clients')} className="flex items-center gap-1 text-[10px] font-semibold text-gold">Open floor <ArrowUpRight size={12}/></button>}>
                  {floorPreview.length?<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 2xl:grid-cols-4">{floorPreview.map(pc=>{
                    const meta=STATUS_META[effectivePcStatus(pc)]||STATUS_META.offline
                    const Icon=meta.icon
                    return <button key={pc.id} onClick={()=>navigate(`/clients?pc=${encodeURIComponent(pc.id)}`)} className="overview-soft-card group min-h-[82px] p-3 text-left transition-all hover:-translate-y-0.5">
                      <div className="flex items-center justify-between gap-2"><span className={`flex h-7 w-7 items-center justify-center rounded-full ${meta.tone}`}><Icon size={13}/></span><span className="h-1.5 w-1.5 rounded-full bg-current opacity-60"/></div>
                      <p className="mt-3 truncate text-[11px] font-semibold text-ink-900">{pc.label}</p>
                      <p className="mt-0.5 truncate text-[9px] text-slate-soft">{meta.label}{pc.session?.customerName?` · ${pc.session.customerName}`:''}</p>
                    </button>
                  })}</div>:<Empty>No PCs are registered yet.</Empty>}
                </OverviewCard>

                <OverviewCard title="Seven-day revenue" subtitle="Daily revenue across the current seven-day window." action={<button onClick={()=>navigate('/analytics')} className="flex items-center gap-1 text-[10px] font-semibold text-gold">Full analytics <ArrowUpRight size={12}/></button>}>
                  <RevenueBar data={data?.analytics||[]} settings={settings}/>
                </OverviewCard>
              </div>

              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(340px,.85fr)]">
                <OverviewCard title="Sessions ending soon" subtitle="Prepaid sessions with the nearest expiry times.">
                  {endingSoon.length?<div className="space-y-2">{endingSoon.map(item=><button key={item.id} onClick={()=>navigate(`/clients?pc=${encodeURIComponent(item.pc_id)}`)} className="flex w-full items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[var(--admin-card-subtle)]">
                    <div className="flex min-w-0 items-center gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/10 text-gold"><Clock3 size={14}/></span><div className="min-w-0"><p className="truncate text-[11px] font-semibold text-ink-900">{item.pc_label} · {item.username||item.customer_name||'Guest'}</p><p className="mt-0.5 text-[9px] text-slate-soft">{item.billing_type==='prepaid'?'Prepaid session':'Session'}</p></div></div>
                    <span className="shrink-0 rounded-full bg-ember/10 px-2.5 py-1 text-[9px] font-semibold text-ember-dim">{formatEndingSoon(item.expires_at,nowMs)}</span>
                  </button>)}</div>:<Empty>No prepaid sessions are ending soon.</Empty>}
                </OverviewCard>

                <OverviewCard title="Quick actions" subtitle="Jump directly to the most common staff tasks.">
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {[
                      { to: '/clients', label: 'Floor matrix', Icon: MonitorCog },
                      { to: '/members', label: 'Members', Icon: Users },
                      { to: '/tariffs', label: 'Rates', Icon: Tags },
                      { to: '/earnings', label: 'Earnings', Icon: CircleDollarSign },
                      { to: '/vouchers', label: 'Vouchers', Icon: WalletCards },
                    ].map(({ to, label, Icon }) => (
                      <button key={to} onClick={() => navigate(to)} className="overview-soft-card flex min-h-[74px] items-center justify-between p-3 text-left transition-all hover:-translate-y-0.5">
                        <span>
                          <Icon size={15} className="mb-2 text-gold"/>
                          <span className="block text-[10px] font-semibold text-ink-900">{label}</span>
                        </span>
                        <ChevronRight size={13} className="text-slate-soft"/>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setEmailModalOpen(true)}
                      className="overview-soft-card flex min-h-[74px] items-center justify-between p-3 text-left transition-all hover:-translate-y-0.5 border-teal/20 bg-teal/5"
                    >
                      <span>
                        <Mail size={15} className="mb-2 text-teal-dim"/>
                        <span className="block text-[10px] font-semibold text-ink-900">Email Summary</span>
                      </span>
                      <ChevronRight size={13} className="text-slate-soft"/>
                    </button>
                  </div>
                </OverviewCard>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ADVANCE MODE UTILITY RAIL */}
      {isAdvanceMode && (
        <aside className="overview-utility-rail min-w-0 p-4 sm:p-5 xl:p-4 2xl:p-5">
          <div className="space-y-4 xl:sticky xl:top-4">
            <section className="overview-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[12px] font-semibold text-ink-900">{weekLabel}</p><p className="mt-1 text-[9px] text-slate-soft">Today · {todayLabel}</p></div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/10 text-gold"><CalendarDays size={14}/></span>
              </div>
              <div className="mt-4 grid grid-cols-7 gap-1">{week.map(item=><div key={item.date.toISOString()} className="text-center"><p className="text-[8px] font-medium text-slate-soft">{item.day.slice(0,2)}</p><div className={`mx-auto mt-2 flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-semibold ${item.isToday?'bg-midnight text-soft-white':'text-ink-900'}`}>{item.number}</div></div>)}</div>
            </section>

            <section className="overview-card p-4">
              <div className="mb-4 flex items-center justify-between"><div><h2 className="text-[15px] font-semibold text-ink-900">Cafe status</h2></div><span className="stat-figure text-[11px] font-semibold text-gold">{totalPcs} PCs</span></div>
              <div className="space-y-2">{[
                ['Available',statusCounts.available,MonitorCheck,'bg-teal','text-teal-dim','available'],
                ['In use',statusCounts.occupied,MonitorPlay,'bg-gold','text-gold','occupied'],
                ['Maintenance',statusCounts.maintenance,Wrench,'bg-ember','text-ember-dim','maintenance'],
                ['Offline',statusCounts.offline,MonitorCog,'bg-slate-soft','text-slate-soft','offline'],
                ['Reserved',statusCounts.reserved,Clock3,'bg-grape','text-grape','reserved'],
              ].map(([label,value,Icon,dot,tone,status])=><button key={label} onClick={()=>navigate(`/clients?status=${status}`)} className="flex w-full items-center justify-between rounded-xl px-2 py-2.5 text-left hover:bg-[var(--admin-card-subtle)]"><div className="flex items-center gap-3"><span className={`h-2 w-2 rounded-full ${dot}`}/><Icon size={13} className={tone}/><span className="text-[10px] font-medium text-ink-900">{label}</span></div><span className="stat-figure text-[11px] font-semibold text-ink-900">{value||0}</span></button>)}</div>
              <div className="mt-3 border-t border-[var(--admin-ui-border)] pt-3"><div className="flex items-center justify-between"><span className="text-[10px] text-slate-soft">Open requests</span><div className="flex items-center gap-3 text-[9px] font-semibold"><span className="flex items-center gap-1 text-gold"><WalletCards size={11}/>{pendingTopUps.length}</span><span className="flex items-center gap-1 text-ember-dim"><LifeBuoy size={11}/>{openSupport.length}</span></div></div></div>
            </section>

            <section className="overview-card p-4">
              <div className="mb-4 flex items-center justify-between"><div><h2 className="text-[15px] font-semibold text-ink-900">Live cafe activity</h2></div><span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-led rounded-full bg-teal"/></span></div>
              {activity.length?<div className="space-y-1">{activity.map(item=>{
                const Icon=item.type==='support'?LifeBuoy:item.type==='topup'?WalletCards:MonitorPlay
                const tone=item.type==='support'?'text-ember-dim bg-ember/10':item.type==='topup'?'text-gold bg-gold/10':'text-teal-dim bg-teal/10'
                const route=item.route||(item.pcId?`/clients?pc=${encodeURIComponent(item.pcId)}`:null)
                return <button key={item.id} disabled={!route} onClick={()=>route&&navigate(route)} className="flex w-full items-start gap-3 rounded-xl px-2 py-2.5 text-left transition-colors enabled:hover:bg-[var(--admin-card-subtle)]"><span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone}`}><Icon size={12}/></span><div className="min-w-0 flex-1"><p className="line-clamp-1 text-[10px] font-semibold text-ink-900">{item.title}</p><p className="mt-0.5 line-clamp-1 text-[9px] text-slate-soft">{item.detail}</p></div><span className="shrink-0 pt-0.5 text-[8px] text-slate-soft">{formatRelativeTime(item.at,nowMs)}</span></button>
              })}</div>:<Empty>No recent cafe activity.</Empty>}
            </section>
          </div>
        </aside>
      )}
    </div>

    {/* EMAIL SUMMARY MODAL */}
    <Modal
      open={emailModalOpen}
      onClose={() => !sendingEmail && setEmailModalOpen(false)}
      busy={sendingEmail}
      onSubmit={handleSendEmailSummary}
      eyebrow="Automated & On-Demand Delivery"
      title="Send Summary to Email (Brevo)"
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="ghost" onClick={() => setEmailModalOpen(false)} disabled={sendingEmail}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSendEmailSummary}
            disabled={sendingEmail}
            icon={Send}
          >
            {sendingEmail ? 'Delivering…' : 'Send Summary Email'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="text-xs leading-5 text-slate-soft">
          Instantly compiles revenues from sessions, wallet top-ups, snack orders, and shift records into a branded performance report sent directly to your inbox via Brevo.
        </p>
        <div>
          <label className="block">
            <span className="eyebrow mb-1.5 block">Summary Window</span>
            <div className="grid grid-cols-3 gap-2">
              {[['daily','Daily'],['weekly','Weekly'],['monthly','Monthly']].map(([v,l]) => (
                <button
                  type="button"
                  key={v}
                  onClick={() => setEmailPeriod(v)}
                  className={`rounded-lg py-1.5 text-xs font-semibold border transition ${
                    emailPeriod === v
                      ? 'bg-surface text-ink-900 border-gold/50 shadow-xs'
                      : 'border-surface-line customer-neutral-surface text-slate-soft hover:text-ink-900'
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </label>
        </div>
        <label className="block">
          <span className="eyebrow mb-1.5 block">Recipient Email (Optional)</span>
          <input
            type="email"
            value={emailRecipient}
            onChange={(e) => setEmailRecipient(e.target.value)}
            placeholder="Leave blank to use default admin email"
            className="w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50"
          />
        </label>
      </div>
    </Modal>

    <FeedbackInboxModal open={feedbackOpen} onClose={()=>setFeedbackOpen(false)} onChanged={load}/>
    <AdminSectionManual open={manualOpen} onClose={()=>setManualOpen(false)} section="Overview"/>
  </div>
}

function RevenueBar({ data, settings }) {
  const series=normalizeSevenDayRevenue(data)
  const width=640,height=190,padLeft=62,padRight=14,padTop=12,padBottom=32
  const values=series.map(item=>Math.max(0,Number(item.revenue||0)))
  const scale=buildRevenueScale(values)
  const chartWidth=width-padLeft-padRight,chartHeight=height-padTop-padBottom,slot=chartWidth/series.length,barWidth=Math.min(34,slot*0.44)
  const baselineY=height-padBottom
  const points=series.map((item,index)=>{const value=Math.max(0,Number(item.revenue||0));const rawHeight=(value/scale.max)*chartHeight;const barHeight=Math.max(2,rawHeight);const x=padLeft+(index*slot)+((slot-barWidth)/2);const y=baselineY-barHeight;return {x,y,barHeight,value,item}})
  return <div className="min-h-[190px]" role="img" aria-label="Bar chart showing revenue for the last seven days"><svg viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full"><title>Seven-day revenue bar chart</title>{scale.ticks.map(tick=>{const y=baselineY-((tick/scale.max)*chartHeight);return <g key={tick}><line x1={padLeft} y1={y} x2={width-padRight} y2={y} className="stroke-surface-line" strokeWidth="1"/><text x={padLeft-8} y={y+3} textAnchor="end" className="fill-slate-soft text-[9px]">{formatAdminPeso(tick,settings)}</text></g>})}{points.map(point=><g key={point.item.day}><title>{`${point.item.day}: ${formatAdminPeso(point.value,settings)}`}</title><rect x={point.x} y={point.y} width={barWidth} height={point.barHeight} rx="6" className="fill-gold transition-opacity hover:opacity-80"/><text x={point.x+(barWidth/2)} y={height-9} textAnchor="middle" className="fill-slate-soft text-[9px]">{formatRevenueDay(point.item.day)}</text></g>)}</svg></div>
}
