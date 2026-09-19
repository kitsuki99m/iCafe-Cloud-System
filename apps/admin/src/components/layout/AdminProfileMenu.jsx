import { useEffect, useRef, useState } from 'react'
import {
  UserRound,
  BookOpenText,
  Sun,
  Moon,
  LockKeyhole,
  LogOut,
  Clock,
  MessageSquareText,
  ChevronDown,
  Sparkles,
  Gamepad2,
  LayoutDashboard,
  ShieldCheck,
  Check,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useAppData } from '../../context/AppDataContext.jsx'
import { useTheme } from '../../context/ThemeContext.jsx'
import { useAdminMode } from '../../context/AdminModeContext.jsx'
import { useEsportsTheme } from '../../context/EsportsThemeContext.jsx'
import { useSkin } from '../../context/SkinContext.jsx'
import { hasSectionManual } from '../admin/AdminSectionManual.jsx'

function getInitials(name = 'Admin') {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'AD'
  )
}

export default function AdminProfileMenu({
  currentLabel = 'Overview',
  manualTitle,
  triggerClassName = '',
  onOpenManual,
  onOpenShiftModal,
  onOpenFeedback,
  onOpenLock,
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef(null)
  const { user, logout } = useAuth()
  const { settings, currentShift } = useAppData()
  const { isDark, toggleTheme, theme } = useTheme()
  const { isSimpleMode, isAdvanceMode, canToggleMode, setUiMode } = useAdminMode()
  const { themeMode, isEsportsMode, isDashboardMode, setThemeMode } = useEsportsTheme()
  const { activeSkin, openGallery, skins, setSkin, skinId } = useSkin()

  const isOwner = user?.cloudRole === 'owner' || user?.role === 'owner'
  const isAdmin = user?.cloudRole === 'admin' || user?.role === 'admin'
  const isCashier = user?.role === 'cashier' || user?.role === 'staff' || user?.cloudRole === 'cashier' || user?.cloudRole === 'staff'

  const fallbackAdminName = String(user?.name || user?.email || 'Admin').includes('@')
    ? String(user?.email || user?.name || 'Admin').split('@')[0]
    : String(user?.name || user?.email || 'Admin')
  const displayName = String(settings?.displayName || fallbackAdminName || 'Admin').trim() || 'Admin'

  const hasManual = hasSectionManual(currentLabel)

  // Close dropdown on click outside or Escape
  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative shrink-0 z-[200]" ref={menuRef}>
      {/* Profile Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        className={`admin-header-pill ${triggerClassName} flex items-center gap-2 rounded-full border border-surface-line bg-surface py-1 pl-1 pr-2.5 transition-all cursor-pointer hover:border-surface-line/80 hover:bg-surface-raised/60 ${
          open ? 'ring-2 ring-gold/40 border-gold/40' : ''
        }`}
        title={`Profile & Quick Controls (${displayName})`}
      >
        <span className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-midnight font-bold text-xs text-soft-white shadow-xs">
          {getInitials(displayName)}
        </span>
        <span className="hidden max-w-[110px] truncate text-xs font-semibold text-ink-900 sm:inline">
          {displayName}
        </span>
        <ChevronDown
          size={13}
          className={`text-slate-soft transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Popover Menu */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-[999] w-72 origin-top-right rounded-2xl border border-surface-line bg-surface p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-150"
          role="menu"
        >
          {/* User Info Header */}
          <div className="flex items-center gap-3 border-b border-surface-line/80 pb-3 px-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-midnight font-display text-sm font-bold text-soft-white shadow-xs">
              {getInitials(displayName)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-xs font-bold text-ink-900">{displayName}</p>
                <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-soft">
                  {isOwner ? 'Owner' : isAdmin ? 'Admin' : isCashier ? 'Cashier' : 'Staff'}
                </span>
              </div>
              <p className="truncate text-[10px] text-slate-soft" title={user?.email || ''}>
                {user?.email || 'admin@aezakmi.cafe'}
              </p>
            </div>
          </div>

          {/* Mode Tool: Standard Dashboard vs Esports Console Skins */}
          <div className="py-2.5 border-b border-surface-line/80">
            <div className="flex items-center justify-between px-1 mb-1.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-soft">
                Console Mode
              </p>
              {isEsportsMode && (
                <span className="rounded-full bg-[var(--brand,#7B61FF)]/15 px-1.5 py-0.2 text-[8px] font-bold uppercase tracking-wider text-[var(--brand,#7B61FF)]">
                  {activeSkin?.name?.split(' ')[0] || 'Nexus'}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1 border border-surface-line/60">
              <button
                type="button"
                onClick={() => setThemeMode('dashboard')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                  isDashboardMode
                    ? 'bg-surface text-ink-900 shadow-xs border border-surface-line'
                    : 'text-slate-soft hover:text-ink-900'
                }`}
                title="Standard Business Dashboard Interface"
              >
                <LayoutDashboard size={13} />
                <span>Dashboard</span>
              </button>
              <button
                type="button"
                onClick={() => setThemeMode('esports')}
                className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                  isEsportsMode
                    ? 'bg-[var(--brand,#7B61FF)]/20 text-[var(--brand,#7B61FF)] shadow-xs border border-[var(--brand,#7B61FF)]/40 font-black'
                    : 'text-slate-soft hover:text-ink-900'
                }`}
                title="Esports Gaming Console Mode with Hardware Skins"
              >
                <Gamepad2 size={13} />
                <span>Esports Mode</span>
              </button>
            </div>

            {/* Esports Console Skins Picker Tool */}
            {isEsportsMode && (
              <div className="mt-2.5 rounded-xl bg-surface/80 p-2 border border-surface-line/60 space-y-1.5">
                <div className="flex items-center justify-between px-0.5">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-soft">
                    Active Skin
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                      openGallery()
                    }}
                    className="text-[9.5px] font-semibold text-[var(--brand,#7B61FF)] hover:underline flex items-center gap-0.5 cursor-pointer"
                  >
                    <span>Gallery</span>
                    <Sparkles size={10} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {(skins || []).map((s) => {
                    const isSelected = s.id === skinId
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSkin(s.id)
                          if (!isEsportsMode) setThemeMode('esports')
                        }}
                        className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10.5px] font-semibold transition cursor-pointer border ${
                          isSelected
                            ? 'bg-[var(--surface-2,#1A2233)] text-ink-900 border-[var(--brand,#7B61FF)] shadow-xs'
                            : 'bg-surface-raised/50 text-slate-soft border-transparent hover:text-ink-900 hover:bg-surface-raised'
                        }`}
                        title={`${s.name} Skin (${s.note})`}
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: s.chips?.[0] || s.brand || '#7B61FF' }}
                        />
                        <span className="truncate">{s.name.split(' ')[0]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* UI Complexity & Appearance Toggles */}
          <div className="py-2.5 border-b border-surface-line/80 space-y-2">
            {canToggleMode && (
              <div>
                <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-soft mb-1.5">
                  UI Complexity
                </p>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1 border border-surface-line/60">
                  <button
                    type="button"
                    onClick={() => setUiMode('simple')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                      isSimpleMode
                        ? 'bg-surface text-ink-900 shadow-xs border border-surface-line'
                        : 'text-slate-soft hover:text-ink-900'
                    }`}
                  >
                    <Sparkles size={13} />
                    <span>Simple</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setUiMode('advance')}
                    className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                      isAdvanceMode
                        ? 'bg-surface text-ink-900 shadow-xs border border-surface-line'
                        : 'text-slate-soft hover:text-ink-900'
                    }`}
                  >
                    <ShieldCheck size={13} />
                    <span>Advance</span>
                  </button>
                </div>
              </div>
            )}

            <div>
              <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-slate-soft mb-1.5">
                Appearance
              </p>
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-raised p-1 border border-surface-line/60">
                <button
                  type="button"
                  onClick={() => !isDark || toggleTheme()}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                    !isDark
                      ? 'bg-surface text-ink-900 shadow-xs border border-surface-line'
                      : 'text-slate-soft hover:text-ink-900'
                  }`}
                >
                  <Sun size={13} />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => isDark || toggleTheme()}
                  className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-bold transition cursor-pointer ${
                    isDark
                      ? 'bg-surface text-ink-900 shadow-xs border border-surface-line'
                      : 'text-slate-soft hover:text-ink-900'
                  }`}
                >
                  <Moon size={13} />
                  <span>Dark</span>
                </button>
              </div>
            </div>
          </div>

          {/* Quick Menu Actions */}
          <div className="py-2 border-b border-surface-line/80 space-y-0.5">
            {hasManual && onOpenManual && (
              <button
                type="button"
                title={manualTitle || `Open ${currentLabel} owner manual`}
                onClick={() => {
                  setOpen(false)
                  onOpenManual()
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-900 transition hover:bg-surface-raised cursor-pointer"
              >
                <BookOpenText size={15} className="text-slate-soft" />
                <span>{currentLabel} Owner Manual</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                openGallery()
              }}
              className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-900 transition hover:bg-surface-raised cursor-pointer"
            >
              <div className="flex items-center gap-2.5">
                <Sparkles size={15} className="text-[var(--brand,#7B61FF)]" />
                <span>Console Skins & Themes</span>
              </div>
              <span className="rounded-full bg-[var(--brand,#7B61FF)]/15 px-2 py-0.5 text-[9px] font-bold text-[var(--brand,#7B61FF)]">
                {activeSkin?.name?.split(' ')[0] || 'Nexus'}
              </span>
            </button>

            {onOpenShiftModal && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenShiftModal()
                }}
                className="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-900 transition hover:bg-surface-raised cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Clock size={15} className={currentShift ? 'text-teal-dim' : 'text-slate-soft'} />
                  <span>Staff Shift & Drawer</span>
                </div>
                {currentShift && (
                  <span className="rounded-full bg-teal/10 px-2 py-0.5 text-[9px] font-bold text-teal-dim">
                    Active
                  </span>
                )}
              </button>
            )}

            {onOpenFeedback && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenFeedback()
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-900 transition hover:bg-surface-raised cursor-pointer"
              >
                <MessageSquareText size={15} className="text-slate-soft" />
                <span>Customer Feedback</span>
              </button>
            )}
          </div>

          {/* Security & Logout Footer */}
          <div className="pt-2 space-y-0.5">
            {onOpenLock && (
              <button
                type="button"
                onClick={() => {
                  setOpen(false)
                  onOpenLock()
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ink-900 transition hover:bg-surface-raised cursor-pointer"
              >
                <LockKeyhole size={15} className="text-slate-soft" />
                <span>Lock Console</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setOpen(false)
                logout()
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-xs font-medium text-ember-dim transition hover:bg-ember/10 cursor-pointer"
            >
              <LogOut size={15} />
              <span>Log Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
