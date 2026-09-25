import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutDashboard, MonitorCog, Tags, Users, CircleDollarSign, ScrollText, Settings, LogOut, Moon, Sun, Clock3, ChartNoAxesCombined, LockKeyhole, UnlockKeyhole, MessageSquareText, UserRound, ShieldCheck, Menu, X, BookOpenText, UtensilsCrossed, Ticket, Clock, Gamepad2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAppData } from '../../context/AppDataContext.jsx'
import AdminNotificationCenter from '../admin/AdminNotificationCenter.jsx'
import AnnouncementCenter from '../admin/AnnouncementCenter.jsx'
import AdminQuickFind from '../admin/AdminQuickFind.jsx'
import FeedbackInboxModal from '../admin/FeedbackInboxModal.jsx'
import ShiftManagementModal from '../shift/ShiftManagementModal.jsx'
import logo from '../../assets/aktura-logo.svg'
import { apiPost } from '../../lib/api.js'
import { useTheme } from '../../context/ThemeContext.jsx'
import { useAdminMode } from '../../context/AdminModeContext.jsx'
import { useEsportsTheme } from '../../context/EsportsThemeContext.jsx'
import { useBranding } from '../../hooks/useBranding.js'
import Button from '../common/Button.jsx'
import CloudBranchPicker from '../cloud/CloudBranchPicker.jsx'
import { isCloudAdmin, cloudVerifyPassword } from '../../lib/cloudClient.js'
import AdminSectionManual, { hasSectionManual } from '../admin/AdminSectionManual.jsx'
import PwaInstallButton from '../common/PwaInstallButton.jsx'
import AdminProfileMenu from './AdminProfileMenu.jsx'
import { useSkin } from '../../context/SkinContext.jsx'
import SkinGalleryModal from '../admin/SkinGalleryModal.jsx'

import { formatAdminPeso } from '../../lib/numeric.js'

const BASE_NAV = [
  { to: '/', label: 'Overview', shortLabel: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'Floor Matrix', shortLabel: 'Floor', icon: MonitorCog },
  { to: '/menu', label: 'Menu & Orders', shortLabel: 'Shop', icon: UtensilsCrossed },
  { to: '/launcher', label: 'Games & Apps', shortLabel: 'Games', icon: Gamepad2 },
  { to: '/members', label: 'Members', shortLabel: 'Members', icon: Users },
  { to: '/tariffs', label: 'Rates & Promos', shortLabel: 'Rates', icon: Tags, adminOnly: true },
  { to: '/analytics', label: 'Analytics', shortLabel: 'Analytics', icon: ChartNoAxesCombined, adminOnly: true },
  { to: '/earnings', label: 'Earnings', shortLabel: 'Earnings', icon: CircleDollarSign, adminOnly: true },
  { to: '/logs', label: 'Logs', shortLabel: 'Logs', icon: ScrollText, adminOnly: true },
  { to: '/settings', label: 'Settings', shortLabel: 'Settings', icon: Settings, adminOnly: true },
]
const SIMPLE_NAV_PATHS = new Set(['/', '/clients', '/menu', '/launcher', '/members'])
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const PAGE_ALIASES = {
  '/': 'Overview',
  '/clients': 'Floor Matrix',
  '/launcher': 'Games & Launcher',
  '/menu': 'Menu & Kitchen Orders',
  '/tariffs': 'Rates & Promos',
  '/members': 'Member Directory',
  '/vouchers': 'Vouchers & Promo Codes',
  '/earnings': 'Earnings & Reports',
  '/expenses': 'Earnings',
  '/expense': 'Earnings',
  '/analytics': 'Performance Analytics',
  '/logs': 'Shift & Audit Logs',
  '/settings': 'System Settings',
  '/developer': 'Developer Console',
}
const PAGE_PURPOSE = {
  Overview:'Live operations, customer signals, and today’s business health.',
  Clients:'Manage stations, active sessions, and remote actions.',
  'Games & Apps':'Configure station executables, game disk paths, and launcher categories.',
  'Menu & Orders':'Snack & drink catalog, in-session orders, and kitchen queue.',
  Rates:'Set customer pricing, promotions, and session rules.',
  Members:'Manage accounts, balances, tiers, and transfers.',
  Vouchers:'Promo redemption codes for free wallet balance or session time.',
  Earnings:'Review cash activity, expenses, tax estimates, and reports.',
  Analytics:'Understand trends, utilization, and customer activity.',
  Logs:'Audit operational and financial activity.',
  Settings:'Update cafe branding, payment details, and account security.',
  Developer:'Review and approve new Aezakmi Cloud business registrations.',
}

export default function MainLayout({ children }) {
  const { user, logout } = useAuth()
  const { serverError, settings, currentShift, menuOrders = [] } = useAppData()
  const { isDark, toggleTheme } = useTheme()
  const { uiMode, isSimpleMode, isAdvanceMode, canToggleMode, setUiMode, toggleUiMode } = useAdminMode()
  const { themeMode, isEsportsMode, isDashboardMode, setThemeMode } = useEsportsTheme()
  const { activeSkin, openGallery, skins, setSkin, skinId } = useSkin()
  const branding = useBranding()
  const location = useLocation()
  const isCashier = user?.role === 'cashier' || user?.role === 'staff' || user?.cloudRole === 'cashier' || user?.cloudRole === 'staff'
  const isNavItemActive = (to, pathname, end) => {
    if (end) return pathname === to
    if (to === '/') return pathname === '/'
    if (to === '/tariffs' && (pathname === '/vouchers' || pathname.startsWith('/tariffs'))) return true
    if (to === '/earnings' && (pathname === '/expenses' || pathname === '/expense' || pathname.startsWith('/earnings'))) return true
    return pathname === to || pathname.startsWith(to + '/')
  }
  const filteredNav = BASE_NAV.filter((item) => {
    if (isCashier && item.adminOnly) return false
    if (isSimpleMode && !SIMPLE_NAV_PATHS.has(item.to)) return false
    return true
  })
  const navItems = (user?.cloudDeveloper && isAdvanceMode) ? [...filteredNav, { to: '/developer', label: 'Developer', icon: ShieldCheck }] : filteredNav
  const currentNav = BASE_NAV.find((item) => isNavItemActive(item.to, location.pathname, item.end))
  const currentLabel = PAGE_ALIASES[location.pathname] || currentNav?.label || (location.pathname === '/' ? 'Overview' : 'Console')
  const isOverview = location.pathname === '/'
  const pendingOrdersCount = useMemo(() => {
    return (menuOrders || []).filter((o) => (o.order_status || o.orderStatus || 'pending').toLowerCase() === 'pending').length
  }, [menuOrders])
  const [clock, setClock] = useState(() => new Date())
  const [locked, setLocked] = useState(false)
  const [feedbackOpen,setFeedbackOpen]=useState(false)
  const [manualOpen,setManualOpen]=useState(false)
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const [mobileNavOpen,setMobileNavOpen]=useState(false)
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const cloud=isCloudAdmin()
  const fallbackAdminName=String(user?.name||user?.email||'Admin').includes('@') ? String(user?.email||user?.name||'Admin').split('@')[0] : String(user?.name||user?.email||'Admin')
  const adminDisplayName=String(settings?.displayName||fallbackAdminName||'Admin').trim()||'Admin'
  const lockAuthMethod=cloud ? 'password' : (user?.authMethod || 'pin')
  const [unlockError, setUnlockError] = useState('')
  const unlockInputRef=useRef(null)
  const lockDialogRef=useRef(null)
  const previousLockFocusRef=useRef(null)
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(timer) }, [])
  useEffect(()=>{setMobileNavOpen(false);setManualOpen(false)},[location.pathname])
  useEffect(()=>{
    const closeMobileLayer=()=>setMobileNavOpen(false)
    window.addEventListener('aezakmi:overlay-open',closeMobileLayer)
    return()=>window.removeEventListener('aezakmi:overlay-open',closeMobileLayer)
  },[])
  useEffect(()=>{
    if(!mobileNavOpen)return undefined
    const previous=document.body.style.overflow
    document.body.style.overflow='hidden'
    const onKey=(event)=>{if(event.key==='Escape')setMobileNavOpen(false)}
    window.addEventListener('keydown',onKey)
    return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)}
  },[mobileNavOpen])
  const localClock = new Intl.DateTimeFormat('en-PH', { timeZone:'Asia/Manila', month:'short', day:'numeric', hour:'numeric', minute:'2-digit', second:'2-digit' }).format(clock)
  function openLock(){setLocked(true);setPin('');setPassword('');setUnlockError('')}
  useEffect(()=>{window.aezakmiAdmin?.setLocked?.(locked);return()=>window.aezakmiAdmin?.setLocked?.(false)},[locked])
  useEffect(()=>{
    if(!locked)return undefined
    previousLockFocusRef.current=document.activeElement
    const frame=requestAnimationFrame(()=>{(unlockInputRef.current||lockDialogRef.current)?.focus()})
    return()=>{
      cancelAnimationFrame(frame)
      const previous=previousLockFocusRef.current
      if(previous instanceof HTMLElement && document.contains(previous))previous.focus()
      previousLockFocusRef.current=null
    }
  },[locked])
  function containLockFocus(event){
    if(event.key === 'Escape'){event.preventDefault();event.stopPropagation();return}
    if(event.key !== 'Tab')return
    const focusable=[...(lockDialogRef.current?.querySelectorAll(FOCUSABLE)??[])]
    if(!focusable.length){event.preventDefault();lockDialogRef.current?.focus();return}
    const first=focusable[0],last=focusable[focusable.length-1]
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
  }
  useEffect(()=>{
    const onKey=(event)=>{
      const key=String(event?.key || '').toLowerCase()
      const unlockShortcut=event.altKey&&event.shiftKey&&key==='u'
      if(locked){
        if(unlockShortcut){event.preventDefault();unlockInputRef.current?.focus();return}
        if(event.key === 'Escape'){event.preventDefault();event.stopImmediatePropagation();return}
        if(event.ctrlKey||event.altKey||event.metaKey||/^f\d{1,2}$/i.test(event.key)){event.preventDefault();event.stopImmediatePropagation();return}
        return
      }
      if(event.altKey&&event.shiftKey&&key==='l'){event.preventDefault();openLock()}
    }
    window.addEventListener('keydown',onKey,true)
    return()=>window.removeEventListener('keydown',onKey,true)
  },[locked])
  // Keep older native numeric fields consistent with the admin number settings.
  useEffect(()=>{
    const sanitize=(event)=>{
      const input=event.target
      if(!(input instanceof HTMLInputElement) || input.dataset.allowDecimal==='true') return
      if(input.type!=='number' && input.inputMode!=='decimal' && input.inputMode!=='numeric') return
      const raw=String(input.value||'').replace(/,/g,'.')
      const decimalPlaces=Math.max(1,Math.min(3,Number(settings?.decimalPlaces)||3))
      const next=settings?.numberFormat==='whole'
        ? raw.replace(/\D/g,'')
        : (()=>{
            const cleaned=raw.replace(/[^\d.]/g,'')
            const [whole='',...fraction]=cleaned.split('.')
            return fraction.length ? `${whole}.${fraction.join('').slice(0,decimalPlaces)}` : whole
          })()
      if(next!==input.value) input.value=next
    }
    document.addEventListener('input',sanitize,true)
    return()=>document.removeEventListener('input',sanitize,true)
  },[settings?.numberFormat,settings?.decimalPlaces,location.pathname])
  async function unlock(){
    let credentials
    if(lockAuthMethod==='pin_password'){
      if(!pin||!password)return
      credentials={pin,password}
    }else if(lockAuthMethod==='password'){
      if(!password)return
      credentials={password}
    }else{
      if(!pin)return
      credentials={pin}
    }
    try{if(cloud)await cloudVerifyPassword(user?.email,password);else await apiPost('/auth/verify-admin-credentials',credentials);setLocked(false);setPin('');setPassword('');setUnlockError('')}
    catch(error){setUnlockError(error?.message||'Incorrect Admin credentials.')}
  }

  useEffect(() => {
    const handler = () => setShiftModalOpen(true)
    window.addEventListener('aezakmi:open-shift-modal', handler)
    return () => window.removeEventListener('aezakmi:open-shift-modal', handler)
  }, [])

  return (
    <div className="admin-app-canvas h-dvh min-h-0 w-full overflow-hidden relative">
      <div className="backdrop" aria-hidden="true" />
      <div className="chroma" aria-hidden="true" />
      <div className="admin-shell-frame flex h-full min-h-0 w-full overflow-hidden relative z-10">
        {isSimpleMode ? (
          /* ===== SIMPLE MODE: Console Rail Navigation matching nexus-floor.html ===== */
          <aside className="admin-rail-shell hidden lg:flex">
            {/* Brand Logo Mark */}
            <NavLink
              to="/"
              className="admin-rail-mark"
              title={`${branding.cafeName || 'Aezakmi'} · Go to Overview`}
            >
              <img
                key={branding.logoUrl || 'default-logo'}
                src={branding.logoUrl || logo}
                onError={(event) => { event.currentTarget.src = logo }}
                alt="Aezakmi"
                className="h-full w-full object-contain"
              />
            </NavLink>

            {/* Rail Navigation Stack */}
            <nav className="flex flex-col items-center gap-1 w-full px-1 py-1 min-h-0 flex-1 overflow-y-auto overflow-x-hidden" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              {navItems.map(({ to, label, shortLabel, icon: Icon, end }) => {
                const isMenu = to === '/menu'
                const hasPending = isMenu && pendingOrdersCount > 0
                const isActive = isNavItemActive(to, location.pathname, end)
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={`admin-rail-nav-btn ${isActive ? 'active' : ''}`}
                    title={label}
                  >
                    <div className="relative">
                      <Icon size={18} strokeWidth={1.8} />
                      {hasPending && (
                        <span className="absolute -top-1 -right-1.5 flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-ember" />
                        </span>
                      )}
                    </div>
                    <span className="text-[9.5px] font-medium tracking-tight text-center leading-tight max-w-[56px] truncate">{shortLabel || label}</span>
                  </NavLink>
                )
              })}
            </nav>

            {/* Bottom Controls */}
            <div className="flex flex-col items-center gap-2 mt-auto pt-2 pb-1 border-t border-white/5">
              {isEsportsMode && (
                <button
                  type="button"
                  onClick={openGallery}
                  className="w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 text-[var(--muted,#8D9AB5)] hover:text-[var(--text,#E6EAF2)] hover:bg-[var(--surface-2,#1A2233)] transition-colors cursor-pointer"
                  title="Switch Hardware Console Skin"
                >
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-xs bg-[var(--brand,#7B61FF)] text-[8px] font-bold text-white shadow-xs">
                    {activeSkin?.mark || 'HUD'}
                  </span>
                  <span className="text-[8px] font-bold uppercase tracking-wider text-[var(--brand,#7B61FF)]">Skin</span>
                </button>
              )}
              <button
                type="button"
                onClick={openLock}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--muted,#8D9AB5)] hover:text-[var(--text,#E6EAF2)] hover:bg-[var(--surface-2,#1A2233)] transition-colors cursor-pointer"
                title="Lock Console"
                aria-label="Lock Console"
              >
                <LockKeyhole size={15} />
              </button>
            </div>
          </aside>
        ) : (
          /* ===== ADVANCE MODE: Full 232px Enterprise Sidebar ===== */
          <aside className="admin-sidebar sticky top-0 z-[120] hidden h-full w-[220px] shrink-0 flex-col overflow-hidden px-4 py-5 lg:flex lg:w-[232px] lg:px-5 lg:py-6">
            <div className="admin-sidebar-brand mb-6 flex items-center gap-3 px-1 pt-0.5">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] border border-[var(--brand)]/40 bg-[var(--surface)] shadow-[0_0_14px_var(--glow,rgba(123,97,255,0.25))] p-1 overflow-hidden transition-all duration-300">
                <img
                  key={branding.logoUrl || 'default-logo'}
                  src={branding.logoUrl || logo}
                  onError={(event) => { event.currentTarget.src = logo }}
                  alt="Aezakmi"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate font-display text-[15px] font-bold uppercase leading-tight tracking-[0.045em] text-ink-900">
                    {branding.cafeName || settings?.cafeName || 'Aezakmi Cafe'}
                  </p>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <p className="max-w-[120px] truncate text-[10px] font-medium uppercase tracking-[0.13em] text-slate-soft" title={branding.branchLocation || settings?.branchLocation || ''}>{branding.branch || settings?.branch || 'Davao Branch'}</p>
                  {isEsportsMode && (
                    <button
                      type="button"
                      onClick={openGallery}
                      className="rounded px-1.5 py-0.2 text-[8px] font-bold uppercase tracking-wider text-[var(--brand,#7B61FF)] border border-[var(--brand,#7B61FF)]/30 hover:bg-[var(--brand,#7B61FF)]/15 transition-colors cursor-pointer"
                      title="Switch Console Skin"
                    >
                      {activeSkin?.mark || 'HUD'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="admin-sidebar-branch mb-3"><CloudBranchPicker /></div>

            <nav className="admin-sidebar-nav min-h-0 flex flex-1 flex-col gap-1 overflow-y-auto py-1">
              {navItems.map(({ to, label, icon: Icon, end }) => {
                const isMenu = to === '/menu'
                const hasPending = isMenu && pendingOrdersCount > 0
                const isActive = isNavItemActive(to, location.pathname, end)
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon size={17} strokeWidth={1.8} />
                    <span>{label}</span>
                    {hasPending && (
                      <span className="ml-auto flex items-center gap-1.5" title={`${pendingOrdersCount} pending kitchen order${pendingOrdersCount > 1 ? 's' : ''}`}>
                        <span className="relative flex h-2 w-2">
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember opacity-75" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-ember" />
                        </span>
                        <span className="rounded-full bg-ember/15 px-1.5 py-0.5 text-[9px] font-black text-ember-dim leading-none">
                          {pendingOrdersCount}
                        </span>
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </nav>

            <div className="admin-sidebar-footer mt-5 space-y-2.5">
              <div className="admin-sidebar-status flex items-center gap-2.5 rounded-xl px-3 py-2.5">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className={`absolute inline-flex h-full w-full animate-led rounded-full ${serverError ? 'bg-ember' : 'bg-teal'}`} />
                </span>
                <div className="min-w-0 leading-tight">
                  <p className="text-[11px] font-semibold text-ink-900">
                    {isEsportsMode ? (serverError ? 'ARENA // OFFLINE' : 'ARENA // ONLINE') : (serverError ? (cloud ? 'Edge Offline' : 'Server Offline') : (cloud ? 'Edge Online' : 'Server Online'))}
                  </p>
                  <p className="admin-sidebar-status-subtitle mt-0.5 truncate text-[9px] text-slate-soft">
                    {isEsportsMode ? (serverError ? 'Cloud Cache Active' : 'Synced · Latency <1ms') : (serverError ? (cloud ? 'Cloud cache available' : 'Check local network') : (cloud ? 'Supabase ↔ Edge synced' : 'Local network synced'))}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-2">
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-[11px] font-semibold text-ink-900">{adminDisplayName}</p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button type="button" className="admin-icon-button" onClick={toggleTheme} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'} title={isDark ? 'Light mode' : 'Dark mode'}>
                    {isDark ? <Sun size={14} /> : <Moon size={14} />}
                  </button>
                  <button type="button" onClick={openLock} className="admin-icon-button" aria-label="Lock admin console" title="Lock admin console"><LockKeyhole size={14}/></button>
                  <button type="button" onClick={logout} className="admin-icon-button" aria-label="Log out" title="Log out"><LogOut size={14} /></button>
                </div>
              </div>
            </div>
          </aside>
        )}

        <main className="admin-main relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {/* Mobile Header */}
          <header className="admin-mobile-header z-[130] flex min-h-[58px] shrink-0 items-center gap-3 border-b border-[var(--admin-ui-border)] px-3 sm:px-4 lg:hidden">
            <img key={`mobile-${branding.logoUrl || 'default-logo'}`} src={branding.logoUrl || logo} onError={event=>{event.currentTarget.src=logo}} alt="" className="h-8 w-8 shrink-0 rounded-[10px] shadow-sm"/>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-soft">{branding.cafeName || settings?.cafeName || 'Aezakmi Cafe'}</p>
              <p className="truncate font-display text-[15px] font-semibold leading-tight text-ink-900">{currentLabel}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {isEsportsMode && (
                <button
                  type="button"
                  onClick={openGallery}
                  className="flex items-center gap-1 rounded-lg border border-[var(--line,#26314A)] bg-[var(--surface-2,#1A2233)] px-2 py-1 text-xs font-semibold text-[var(--text,#E6EAF2)] shadow-xs cursor-pointer"
                  title="Switch Console Skin"
                >
                  <span className="flex h-3.5 w-3.5 items-center justify-center rounded-xs bg-[var(--brand,#7B61FF)] text-[8px] font-bold text-white">
                    {activeSkin?.mark || 'N'}
                  </span>
                  <span className="text-[10px] font-display">{activeSkin?.name?.split(' ')[0]}</span>
                </button>
              )}
              <AdminNotificationCenter />
              <AnnouncementCenter />
              <AdminProfileMenu
                currentLabel={currentLabel}
                onOpenManual={() => setManualOpen(true)}
                onOpenShiftModal={() => setShiftModalOpen(true)}
                onOpenFeedback={() => setFeedbackOpen(true)}
                onOpenLock={openLock}
              />
            </div>
          </header>

          {/* Desktop Header: Simple Mode Nexus Topbar vs Advance Mode Global Header */}
          {isSimpleMode ? (
            <header className="nexus-topbar z-[150] hidden min-h-[60px] shrink-0 items-center gap-4 px-5 py-2.5 lg:flex">
              {/* Shift info pill */}
              <div
                className="shift cursor-pointer rounded-lg px-2.5 py-1 transition-colors hover:bg-[var(--surface-2,#1A2233)]"
                onClick={() => setShiftModalOpen(true)}
                title="Click to reconcile or manage shift"
              >
                <div className="flex items-center gap-1.5">
                  <b>Shift #{currentShift?.id || 'Active'} · {adminDisplayName}</b>
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--free,#2ED3A0)] animate-pulse" />
                </div>
                <span>
                  {currentShift ? `Drawer: ${formatAdminPeso(currentShift.totalRevenue || currentShift.cashRevenue || 0)}` : 'Shift Active · Tap to reconcile'}
                </span>
              </div>

              {/* Live Monospace Clock */}
              <div className="clock select-none">{localClock} PHT</div>

              <div className="spacer flex-1" />

              {/* QuickFind Search */}
              <AdminQuickFind />

              {/* 6 Hardware Skins Swatches (Esports Mode Only) */}
              {isEsportsMode && (
                <div className="swatches flex items-center gap-1.5 px-2 py-1 rounded-full bg-[var(--surface-2,#1A2233)]/80 border border-[var(--line,#26314A)]">
                  {skins.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        setSkin(s.id)
                        if (!isEsportsMode) setThemeMode('esports')
                      }}
                      className="sw"
                      style={{ backgroundColor: s.chips?.[0] || s.accent || s.brand || '#7B61FF' }}
                      aria-pressed={s.id === skinId}
                      title={`${s.name} Skin`}
                    />
                  ))}
                  <button
                    type="button"
                    onClick={openGallery}
                    className="ml-1 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--brand,#7B61FF)] hover:underline cursor-pointer"
                    title="Open Skins Gallery"
                  >
                    {activeSkin?.mark || 'HUD'}
                  </button>
                </div>
              )}

              {/* Quick Theme Toggle */}
              <button
                type="button"
                className="icon-btn"
                onClick={toggleTheme}
                aria-label={isDark ? 'Light mode' : 'Dark mode'}
                title={isDark ? 'Light mode' : 'Dark mode'}
              >
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              {/* Lock Console */}
              <button
                type="button"
                onClick={openLock}
                className="icon-btn"
                aria-label="Lock console"
                title="Lock console"
              >
                <LockKeyhole size={15} />
              </button>

              <AdminNotificationCenter />
              <AnnouncementCenter />
              <AdminProfileMenu
                triggerClassName="admin-header-pill"
                currentLabel={currentLabel}
                manualTitle={`Open ${currentLabel} manual`}
                onOpenManual={() => setManualOpen(true)}
                onOpenShiftModal={() => setShiftModalOpen(true)}
                onOpenFeedback={() => setFeedbackOpen(true)}
                onOpenLock={openLock}
              />
            </header>
          ) : (
            !isOverview && <header className="admin-global-header relative z-[150] hidden min-h-[96px] shrink-0 items-center gap-4 px-5 py-3.5 sm:px-6 lg:flex lg:px-7">
                <div className="admin-header-identity min-w-[230px] flex-1">
                  <div className="flex items-center gap-2"><p className="eyebrow">{currentLabel}</p><span className="hidden text-[10px] text-slate-soft 2xl:inline">· {localClock} PHT</span></div>
                  <h1 className="mt-1 font-display text-[24px] font-semibold leading-tight tracking-[-0.03em] text-ink-900">{currentLabel}</h1>
                </div>
                <AdminQuickFind />
                <div className="ml-auto flex items-center gap-2 text-slate-soft">
                  {isEsportsMode && (
                    <button
                      type="button"
                      onClick={openGallery}
                      className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--text)] transition-all hover:border-[var(--brand)] hover:bg-[var(--surface)] shadow-xs cursor-pointer"
                      title="Switch Console Skin"
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-sm bg-[var(--brand)] text-[9px] font-bold text-white shadow-xs">
                        {activeSkin?.mark || 'N'}
                      </span>
                      <span className="font-display tracking-tight">{activeSkin?.name || 'Skins'}</span>
                    </button>
                  )}
                  <AdminNotificationCenter />
                  <AnnouncementCenter />
                  <AdminProfileMenu
                    triggerClassName="admin-header-pill"
                    currentLabel={currentLabel}
                    manualTitle={`Open ${currentLabel} owner manual`}
                    onOpenManual={() => setManualOpen(true)}
                    onOpenShiftModal={() => setShiftModalOpen(true)}
                    onOpenFeedback={() => setFeedbackOpen(true)}
                    onOpenLock={openLock}
                  />
                </div>
              </header>
          )}
          <div className="admin-route-viewport min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain relative pb-20 lg:pb-0">{children}</div>
          <ShiftManagementModal isOpen={shiftModalOpen} onClose={() => setShiftModalOpen(false)} />
          <SkinGalleryModal />
          {!isOverview && <FeedbackInboxModal open={feedbackOpen} onClose={()=>setFeedbackOpen(false)} />}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="admin-mobile-bottom-bar fixed bottom-0 inset-x-0 z-[140] flex h-16 items-center justify-around border-t border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur-xl px-2 shadow-lg lg:hidden" aria-label="Mobile Navigation">
        {(() => {
          const isMoreActive = !['/', '/clients', '/menu', '/members'].some((p) => isNavItemActive(p, location.pathname, p === '/'))
          return (
            <>
              <NavLink
                to="/"
                end
                className={() => {
                  const active = isNavItemActive('/', location.pathname, true)
                  return `flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[10.5px] font-semibold transition-colors ${
                    active ? 'text-[var(--brand,#7B61FF)] font-bold' : 'text-[var(--muted,#8D9AB5)] hover:text-[var(--text,#E6EAF2)]'
                  }`
                }}
              >
                <LayoutDashboard size={20} strokeWidth={1.8} />
                <span>Overview</span>
              </NavLink>

              <NavLink
                to="/clients"
                className={() => {
                  const active = isNavItemActive('/clients', location.pathname, false)
                  return `flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[10.5px] font-semibold transition-colors ${
                    active ? 'text-[var(--brand,#7B61FF)] font-bold' : 'text-[var(--muted,#8D9AB5)] hover:text-[var(--text,#E6EAF2)]'
                  }`
                }}
              >
                <MonitorCog size={20} strokeWidth={1.8} />
                <span>Floor</span>
              </NavLink>

              <NavLink
                to="/menu"
                className={() => {
                  const active = isNavItemActive('/menu', location.pathname, false)
                  return `flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[10.5px] font-semibold transition-colors relative ${
                    active ? 'text-[var(--brand,#7B61FF)] font-bold' : 'text-[var(--muted,#8D9AB5)] hover:text-[var(--text,#E6EAF2)]'
                  }`
                }}
              >
                <div className="relative">
                  <UtensilsCrossed size={20} strokeWidth={1.8} />
                  {pendingOrdersCount > 0 && (
                    <span className="absolute -top-1 -right-1.5 flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-ember" />
                    </span>
                  )}
                </div>
                <span>Shop</span>
              </NavLink>

              <NavLink
                to="/members"
                className={() => {
                  const active = isNavItemActive('/members', location.pathname, false)
                  return `flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[10.5px] font-semibold transition-colors ${
                    active ? 'text-[var(--brand,#7B61FF)] font-bold' : 'text-[var(--muted,#8D9AB5)] hover:text-[var(--text,#E6EAF2)]'
                  }`
                }}
              >
                <Users size={20} strokeWidth={1.8} />
                <span>Members</span>
              </NavLink>

              <button
                type="button"
                onClick={() => setMobileNavOpen((prev) => !prev)}
                className={`flex flex-col items-center justify-center gap-1 min-w-[56px] py-1 text-[10.5px] font-semibold transition-colors cursor-pointer ${
                  mobileNavOpen || isMoreActive ? 'text-[var(--brand,#7B61FF)] font-bold' : 'text-[var(--muted,#8D9AB5)] hover:text-[var(--text,#E6EAF2)]'
                }`}
                aria-label="More navigation items"
              >
                <Menu size={20} strokeWidth={1.8} />
                <span>More</span>
              </button>
            </>
          )
        })()}
      </nav>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-[800] flex flex-col justify-end lg:hidden" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-midnight/70 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close navigation"
          />
          <aside
            className="admin-mobile-drawer relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-[28px] border-t border-[var(--admin-ui-border)] bg-[var(--admin-sidebar-bg)] p-4 shadow-2xl animate-in slide-in-from-bottom duration-300"
            role="dialog"
            aria-modal="true"
            aria-label="Admin navigation"
          >
            {/* Grab Handle Line Strip */}
            <div className="mx-auto mb-2.5 h-1 w-12 rounded-full bg-white/20" />

            <div className="flex min-h-[48px] shrink-0 items-center justify-between border-b border-[var(--admin-ui-border)] pb-3">
              <div className="flex items-center gap-2.5">
                <img src={branding.logoUrl || logo} onError={(event) => { event.currentTarget.src = logo }} alt="" className="h-8 w-8 rounded-lg shadow-sm" />
                <div className="min-w-0">
                  <p className="truncate font-display text-sm font-bold uppercase tracking-[0.04em] text-ink-900">{branding.cafeName || settings?.cafeName || 'Aezakmi Cafe'}</p>
                  <p className="truncate text-[9.5px] font-medium uppercase tracking-[0.12em] text-slate-soft">{branding.branch || settings?.branch || 'Main Branch'}</p>
                </div>
              </div>
              <button type="button" className="admin-icon-button shrink-0" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
                <X size={18} />
              </button>
            </div>

            <div className="shrink-0 pt-3 pb-1"><CloudBranchPicker /></div>

            {/* Menu Items Grid */}
            <nav className="min-h-0 flex-1 overflow-y-auto py-2">
              <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-soft mb-2">Cafe Modules</p>
              <div className="grid grid-cols-2 gap-2">
                {BASE_NAV.filter(item => !['/'].includes(item.to)).filter(item => !isCashier || !item.adminOnly).map(({ to, label, icon: Icon, end }) => {
                  const isMenu = to === '/menu'
                  const hasPending = isMenu && pendingOrdersCount > 0
                  const isActive = isNavItemActive(to, location.pathname, end)
                  return (
                    <NavLink
                      key={to}
                      to={to}
                      end={end}
                      onClick={() => setMobileNavOpen(false)}
                      className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-xs font-semibold transition cursor-pointer ${
                        isActive
                          ? 'border-[var(--brand,#7B61FF)] bg-[var(--brand,#7B61FF)]/15 text-[var(--brand,#7B61FF)] font-bold shadow-xs'
                          : 'border-[var(--admin-ui-border)] bg-[var(--admin-card-subtle)] text-ink-900 hover:bg-surface-raised'
                      }`}
                    >
                      <Icon size={17} strokeWidth={1.8} className={isActive ? 'text-[var(--brand,#7B61FF)]' : 'text-slate-soft'} />
                      <span className="truncate">{label}</span>
                      {hasPending && (
                        <span className="ml-auto flex items-center gap-1">
                          <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-ember opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-ember" />
                          </span>
                        </span>
                      )}
                    </NavLink>
                  )
                })}
                {user?.cloudDeveloper && isAdvanceMode && (
                  <NavLink
                    to="/developer"
                    onClick={() => setMobileNavOpen(false)}
                    className={`flex items-center gap-2.5 rounded-xl border p-2.5 text-xs font-semibold transition cursor-pointer ${
                      location.pathname === '/developer'
                        ? 'border-[var(--brand,#7B61FF)] bg-[var(--brand,#7B61FF)]/15 text-[var(--brand,#7B61FF)] font-bold shadow-xs'
                        : 'border-[var(--admin-ui-border)] bg-[var(--admin-card-subtle)] text-ink-900 hover:bg-surface-raised'
                    }`}
                  >
                    <ShieldCheck size={17} strokeWidth={1.8} className={location.pathname === '/developer' ? 'text-[var(--brand,#7B61FF)]' : 'text-slate-soft'} />
                    <span className="truncate">Developer</span>
                  </NavLink>
                )}
              </div>

              <PwaInstallButton />

              {/* Quick Tools Line Strip */}
              <div className="mt-3 pt-3 border-t border-[var(--admin-ui-border)] space-y-2">
                <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-soft">Tools & Controls</p>
                <div className={`grid ${isEsportsMode ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                  {isEsportsMode && (
                    <button
                      type="button"
                      onClick={() => {
                        setMobileNavOpen(false)
                        openGallery()
                      }}
                      className="flex flex-col items-center justify-center gap-1 rounded-xl border border-[var(--admin-ui-border)] bg-[var(--admin-card-subtle)] py-2 px-1 text-center transition hover:bg-surface-raised cursor-pointer"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded bg-[var(--brand,#7B61FF)] text-[9px] font-bold text-white shadow-xs">
                        {activeSkin?.mark || 'N'}
                      </span>
                      <span className="text-[10px] font-semibold text-ink-900">Skins</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false)
                      setShiftModalOpen(true)
                    }}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-[var(--admin-ui-border)] bg-[var(--admin-card-subtle)] py-2 px-1 text-center transition hover:bg-surface-raised cursor-pointer"
                  >
                    <Clock size={16} className={currentShift ? 'text-teal-dim' : 'text-slate-soft'} />
                    <span className="text-[10px] font-semibold text-ink-900">Shift</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileNavOpen(false)
                      setManualOpen(true)
                    }}
                    className="flex flex-col items-center justify-center gap-1 rounded-xl border border-[var(--admin-ui-border)] bg-[var(--admin-card-subtle)] py-2 px-1 text-center transition hover:bg-surface-raised cursor-pointer"
                  >
                    <BookOpenText size={16} className="text-slate-soft" />
                    <span className="text-[10px] font-semibold text-ink-900">Manual</span>
                  </button>
                </div>
              </div>
            </nav>

            {/* Footer Status & User Controls */}
            <div className="shrink-0 border-t border-[var(--admin-ui-border)] pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] space-y-2">
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[var(--admin-card-subtle)] p-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-midnight text-soft-white text-xs font-bold shadow-xs">
                    {adminDisplayName[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-semibold text-ink-900">{adminDisplayName}</p>
                    <p className="text-[9px] text-slate-soft">{isCashier ? 'Cashier / Staff' : 'Administrator'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button type="button" onClick={toggleTheme} className="admin-icon-button" aria-label="Toggle theme">{isDark ? <Sun size={15} /> : <Moon size={15} />}</button>
                  <button type="button" onClick={openLock} className="admin-icon-button" aria-label="Lock admin console"><LockKeyhole size={15} /></button>
                  <button type="button" onClick={logout} className="admin-icon-button text-ember-dim hover:bg-ember/10" aria-label="Log out"><LogOut size={15} /></button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
      <AdminSectionManual open={manualOpen} onClose={()=>setManualOpen(false)} section={currentLabel}/>
      {locked && <div className="fixed inset-0 z-[900] flex items-center justify-center bg-midnight/95 p-3 sm:p-6">
        <div ref={lockDialogRef} tabIndex={-1} onKeyDown={containLockFocus} className="admin-modal-shell w-full max-w-sm overflow-hidden" role="dialog" aria-modal="true" aria-labelledby="admin-lock-title">
          <div className="admin-modal-header text-center">
            <span className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-gold/10 text-gold-dim"><LockKeyhole size={20}/></span>
            <p className="eyebrow mb-1">Admin console locked</p>
            <h2 id="admin-lock-title" className="admin-modal-title font-display font-semibold text-ink-900">Unlock this screen</h2>
            <p className="admin-modal-description">{lockAuthMethod==='pin_password'?'Enter both the configured Admin PIN and password.':lockAuthMethod==='password'?'Enter the configured Admin password.':'Enter the configured Admin PIN.'}</p>
          </div>
          <div className="admin-modal-body space-y-3">
            {lockAuthMethod!=='password'&&<input ref={unlockInputRef} autoFocus type="password" inputMode="numeric" maxLength={8} value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,''))} onKeyDown={e=>{if(e.key==='Enter'&&lockAuthMethod!=='pin_password')unlock()}} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-center text-base tracking-[0.24em] text-ink-900" placeholder="Admin PIN"/>}
            {lockAuthMethod!=='pin'&&<input ref={lockAuthMethod==='password'?unlockInputRef:undefined} autoFocus={lockAuthMethod==='password'} type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')unlock()}} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-center text-base text-ink-900" placeholder="Current Admin password"/>}
            {unlockError&&<p className="rounded-lg bg-ember/10 px-3 py-2 text-xs text-ember-dim">{unlockError}</p>}
          </div>
          <div className="admin-modal-footer flex items-center justify-between gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={logout}>Sign out instead</Button>
            <Button type="button" variant="primary" onClick={unlock} icon={UnlockKeyhole}>Unlock</Button>
          </div>
        </div>
      </div>}
    </div>
  )
}
