import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { LayoutDashboard, MonitorCog, Tags, Users, CircleDollarSign, ScrollText, Settings, LogOut, Moon, Sun, Clock3, ChartNoAxesCombined, LockKeyhole, UnlockKeyhole, MessageSquareText, UserRound, ShieldCheck, Menu, X, BookOpenText } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAppData } from '../../context/AppDataContext.jsx'
import AdminNotificationCenter from '../admin/AdminNotificationCenter.jsx'
import AnnouncementCenter from '../admin/AnnouncementCenter.jsx'
import AdminQuickFind from '../admin/AdminQuickFind.jsx'
import FeedbackInboxModal from '../admin/FeedbackInboxModal.jsx'
import logo from '../../assets/aktura-logo.svg'
import { apiPost } from '../../lib/api.js'
import { useTheme } from '../../context/ThemeContext.jsx'
import { useBranding } from '../../hooks/useBranding.js'
import Button from '../common/Button.jsx'
import CloudBranchPicker from '../cloud/CloudBranchPicker.jsx'
import { isCloudAdmin, cloudVerifyPassword } from '../../lib/cloudClient.js'
import AdminSectionManual, { hasSectionManual } from '../admin/AdminSectionManual.jsx'

const BASE_NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'Clients', icon: MonitorCog },
  { to: '/tariffs', label: 'Rates', icon: Tags },
  { to: '/members', label: 'Members', icon: Users },
  { to: '/earnings', label: 'Earnings', icon: CircleDollarSign },
  { to: '/analytics', label: 'Analytics', icon: ChartNoAxesCombined },
  { to: '/logs', label: 'Logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
]
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const PAGE_ALIASES = { '/expenses':'Earnings', '/expense':'Earnings' }
const PAGE_PURPOSE = {
  Overview:'Live operations, customer signals, and today’s business health.',
  Clients:'Manage stations, active sessions, and remote actions.',
  Rates:'Set customer pricing, promotions, and session rules.',
  Members:'Manage accounts, balances, tiers, and transfers.',
  Earnings:'Review cash activity, expenses, tax estimates, and reports.',
  Analytics:'Understand trends, utilization, and customer activity.',
  Logs:'Audit operational and financial activity.',
  Settings:'Update cafe branding, payment details, and account security.',
  Developer:'Review and approve new Aezakmi Cloud business registrations.',
}
export default function MainLayout({ children }) {
  const { user, logout } = useAuth()
  const { serverError, settings } = useAppData()
  const { isDark, toggleTheme } = useTheme()
  const branding = useBranding()
  const location = useLocation()
  const navItems = user?.cloudDeveloper ? [...BASE_NAV,{to:'/developer',label:'Developer',icon:ShieldCheck}] : BASE_NAV
  const currentLabel = PAGE_ALIASES[location.pathname] || navItems.find((item) => item.to !== '/' && location.pathname.startsWith(item.to))?.label || 'Overview'
  const isOverview = location.pathname === '/'
  const [clock, setClock] = useState(() => new Date())
  const [locked, setLocked] = useState(false)
  const [feedbackOpen,setFeedbackOpen]=useState(false)
  const [manualOpen,setManualOpen]=useState(false)
  const [mobileNavOpen,setMobileNavOpen]=useState(false)
  const [pin, setPin] = useState('')
  const [password, setPassword] = useState('')
  const cloud=isCloudAdmin()
  const lockAuthMethod=cloud ? 'password' : (user?.authMethod || 'pin')
  const [unlockError, setUnlockError] = useState('')
  const unlockInputRef=useRef(null)
  const lockDialogRef=useRef(null)
  const previousLockFocusRef=useRef(null)
  useEffect(() => { const timer = setInterval(() => setClock(new Date()), 1000); return () => clearInterval(timer) }, [])
  useEffect(()=>{setMobileNavOpen(false);setManualOpen(false)},[location.pathname])
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
      const key=event.key.toLowerCase()
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

  return (
    <div className="admin-app-canvas h-dvh min-h-0 overflow-hidden p-0 lg:p-5">
      <div className="admin-shell-frame flex h-full min-h-0 overflow-hidden">
        <aside className="admin-sidebar sticky top-0 z-[120] hidden h-full w-[220px] shrink-0 flex-col overflow-visible px-4 py-5 lg:flex lg:w-[232px] lg:px-5 lg:py-6">
          <div className="mb-7 flex items-center gap-2.5 px-1 pt-0.5">
            <img key={branding.logoUrl || 'default-logo'} src={branding.logoUrl || logo} onError={event=>{event.currentTarget.src=logo}} alt="" className="h-9 w-9 rounded-[11px] shadow-sm" />
            <div className="min-w-0">
              <p className="truncate font-display text-[15px] font-bold uppercase leading-tight tracking-[0.045em] text-ink-900">
                {branding.cafeName || settings?.cafeName || 'Aezakmi Cafe'}
              </p>
              <p className="mt-0.5 max-w-[148px] truncate text-[10px] font-medium uppercase tracking-[0.13em] text-slate-soft" title={branding.branchLocation || settings?.branchLocation || ''}>{branding.branch || settings?.branch || 'Davao Branch'}</p>
            </div>
          </div>
          <div className="mb-3"><CloudBranchPicker /></div>

          <nav className="min-h-0 flex flex-1 flex-col gap-1 overflow-y-auto py-1">
            {navItems.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={17} strokeWidth={1.8} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className="mt-5 space-y-2.5">
            <div className="admin-sidebar-status flex items-center gap-2.5 rounded-xl px-3 py-2.5">
              <span className="relative flex h-2 w-2 shrink-0">
                <span className={`absolute inline-flex h-full w-full animate-led rounded-full ${serverError ? 'bg-ember' : 'bg-teal'}`} />
              </span>
              <div className="min-w-0 leading-tight">
                <p className="text-[11px] font-semibold text-ink-900">{serverError ? (cloud ? 'Edge Offline' : 'Server Offline') : (cloud ? 'Edge Online' : 'Server Online')}</p>
                <p className="mt-0.5 truncate text-[9px] text-slate-soft">{serverError ? (cloud ? 'Cloud cache available' : 'Check local network') : (cloud ? 'Supabase ↔ Edge synced' : 'Local network synced')}</p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 rounded-xl px-2 py-2">
              <div className="min-w-0 leading-tight">
                <p className="truncate text-[11px] font-semibold text-ink-900">{user?.name}</p>
                <p className="mt-0.5 text-[9px] text-slate-soft">{'Administrator'}</p>
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

        <main className="admin-main relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <header className="admin-mobile-header z-[130] flex min-h-[58px] shrink-0 items-center gap-3 border-b border-[var(--admin-ui-border)] px-3 sm:px-4 lg:hidden">
            <button type="button" onClick={()=>setMobileNavOpen(true)} className="admin-mobile-menu-button" aria-label="Open navigation" aria-expanded={mobileNavOpen}>
              <Menu size={19}/>
            </button>
            <img key={`mobile-${branding.logoUrl || 'default-logo'}`} src={branding.logoUrl || logo} onError={event=>{event.currentTarget.src=logo}} alt="" className="h-8 w-8 shrink-0 rounded-[10px] shadow-sm"/>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.13em] text-slate-soft">{branding.cafeName || settings?.cafeName || 'Aezakmi Cafe'}</p>
              <p className="truncate font-display text-[15px] font-semibold leading-tight text-ink-900">{currentLabel}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              {hasSectionManual(currentLabel)&&<button type="button" onClick={()=>setManualOpen(true)} className="admin-icon-button" title={`${currentLabel} owner manual`} aria-label={`Open ${currentLabel} owner manual`}><BookOpenText size={16}/></button>}
              <AdminNotificationCenter />
              <AnnouncementCenter />
              <button type="button" onClick={toggleTheme} className="admin-icon-button" title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>{isDark ? <Sun size={16}/> : <Moon size={16}/>}</button>
            </div>
          </header>
          {!isOverview && <header className="admin-global-header z-[110] hidden min-h-[96px] shrink-0 items-center gap-4 px-5 py-3.5 sm:px-6 lg:flex lg:px-7">
            <div className="admin-header-identity min-w-[230px] flex-1">
              <div className="flex items-center gap-2"><p className="eyebrow">{currentLabel}</p><span className="hidden text-[10px] text-slate-soft 2xl:inline">· {localClock} PHT</span></div>
              <h1 className="mt-1 font-display text-[24px] font-semibold leading-tight tracking-[-0.03em] text-ink-900">{currentLabel}</h1>
              <p className="mt-1 max-w-[620px] text-[11px] leading-4 text-slate-soft">{PAGE_PURPOSE[currentLabel]}</p>
            </div>
            <AdminQuickFind />
            <div className="ml-auto flex items-center gap-1.5 text-slate-soft">
              <button type="button" onClick={()=>setFeedbackOpen(true)} className="admin-header-pill hidden lg:flex" title="Open customer feedback"><MessageSquareText size={15}/> Feedback</button>
              {hasSectionManual(currentLabel)&&<button type="button" onClick={()=>setManualOpen(true)} className="admin-header-pill" title={`Open ${currentLabel} owner manual`}><BookOpenText size={15}/><span className="hidden xl:inline">Manual</span></button>}
              <AdminNotificationCenter />
              <AnnouncementCenter />
              <button type="button" onClick={toggleTheme} className="admin-icon-button" title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}>{isDark ? <Sun size={16}/> : <Moon size={16}/>}</button>
              <button type="button" onClick={openLock} className="admin-icon-button" aria-label="Lock admin console" title="Lock admin console"><LockKeyhole size={16}/></button>
              <div className="ml-1 hidden items-center gap-2 rounded-full border border-surface-line bg-surface py-1 pl-1 pr-3 sm:flex">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-midnight text-soft-white"><UserRound size={15}/></span>
                <span className="max-w-[110px] truncate text-[11px] font-semibold text-ink-900">{user?.name || 'Admin'}</span>
              </div>
            </div>
          </header>}
          <div className="admin-route-viewport min-h-0 flex-1 overflow-y-auto overflow-x-hidden">{children}</div>
          {!isOverview && <FeedbackInboxModal open={feedbackOpen} onClose={()=>setFeedbackOpen(false)} />}
        </main>
      </div>
      {mobileNavOpen && <div className="fixed inset-0 z-[800] lg:hidden" role="presentation">
        <button type="button" className="absolute inset-0 bg-midnight/45 backdrop-blur-[2px]" onClick={()=>setMobileNavOpen(false)} aria-label="Close navigation"/>
        <aside className="admin-mobile-drawer absolute inset-y-0 left-0 flex w-[min(88vw,340px)] flex-col overflow-hidden border-r border-[var(--admin-ui-border)] bg-[var(--admin-sidebar-bg)] shadow-2xl" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <div className="flex min-h-[64px] shrink-0 items-center gap-3 border-b border-[var(--admin-ui-border)] px-4">
            <img src={branding.logoUrl || logo} onError={event=>{event.currentTarget.src=logo}} alt="" className="h-9 w-9 rounded-[11px] shadow-sm"/>
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-[14px] font-bold uppercase tracking-[0.04em] text-ink-900">{branding.cafeName || settings?.cafeName || 'Aezakmi Cafe'}</p>
              <p className="mt-0.5 truncate text-[9px] font-medium uppercase tracking-[0.12em] text-slate-soft">{branding.branch || settings?.branch || 'Main Branch'}</p>
            </div>
            <button type="button" className="admin-icon-button shrink-0" onClick={()=>setMobileNavOpen(false)} aria-label="Close navigation"><X size={18}/></button>
          </div>
          <div className="shrink-0 px-4 pb-2 pt-4"><CloudBranchPicker /></div>
          <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
            <div className="space-y-1">
              {navItems.map(({to,label,icon:Icon,end})=><NavLink key={to} to={to} end={end} onClick={()=>setMobileNavOpen(false)} className={({isActive})=>`nav-item mobile-nav-item ${isActive?'active':''}`}><Icon size={18} strokeWidth={1.8}/><span>{label}</span></NavLink>)}
            </div>
          </nav>
          <div className="shrink-0 border-t border-[var(--admin-ui-border)] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="admin-sidebar-status mb-3 flex items-center gap-2.5 rounded-xl px-3 py-2.5">
              <span className={`h-2 w-2 shrink-0 rounded-full ${serverError?'bg-ember':'bg-teal'}`}/>
              <div className="min-w-0"><p className="text-[11px] font-semibold text-ink-900">{serverError?(cloud?'Edge Offline':'Server Offline'):(cloud?'Edge Online':'Server Online')}</p><p className="mt-0.5 truncate text-[9px] text-slate-soft">{cloud?'Supabase ↔ Edge':'Local network'}</p></div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-[var(--admin-card-subtle)] p-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-midnight text-soft-white"><UserRound size={16}/></span>
              <div className="min-w-0 flex-1"><p className="truncate text-[11px] font-semibold text-ink-900">{user?.name || 'Admin'}</p><p className="text-[9px] text-slate-soft">Administrator</p></div>
              <button type="button" onClick={openLock} className="admin-icon-button" aria-label="Lock admin console"><LockKeyhole size={15}/></button>
              <button type="button" onClick={logout} className="admin-icon-button" aria-label="Log out"><LogOut size={15}/></button>
            </div>
          </div>
        </aside>
      </div>}
      <AdminSectionManual open={manualOpen} onClose={()=>setManualOpen(false)} section={currentLabel}/>
      {locked && <div className="fixed inset-0 z-[900] flex items-center justify-center bg-midnight/95 p-3 backdrop-blur-[2px] sm:p-6">
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
