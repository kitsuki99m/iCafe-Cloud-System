import { useEffect, useState } from 'react'
import { Minus, Square, Copy, X, Sparkles } from 'lucide-react'
import { useSkin } from '../../context/SkinContext.jsx'
import { useBranding } from '../../hooks/useBranding.js'
import logo from '../../assets/aktura-logo.svg'

export default function AdminTitleBar() {
  const [isMaximized, setIsMaximized] = useState(false)
  const { activeSkin, openGallery } = useSkin()
  const branding = useBranding()

  const isElectron = typeof window !== 'undefined' && Boolean(window.aezakmiAdmin?.minimizeWindow)

  useEffect(() => {
    if (!isElectron || !window.aezakmiAdmin) return

    try {
      if (window.aezakmiAdmin.isWindowMaximized) {
        setIsMaximized(Boolean(window.aezakmiAdmin.isWindowMaximized()))
      }
    } catch {}

    const unlisten = window.aezakmiAdmin.onMaximizedChange?.((max) => {
      setIsMaximized(Boolean(max))
    })

    return () => {
      unlisten?.()
    }
  }, [isElectron])

  if (!isElectron) {
    // In web browsers (e.g. Vercel), the native OS window frame handles window controls.
    return null
  }

  function handleMinimize() {
    window.aezakmiAdmin?.minimizeWindow?.()
  }

  function handleMaximizeToggle() {
    window.aezakmiAdmin?.maximizeWindow?.()
  }

  function handleClose() {
    window.aezakmiAdmin?.closeWindow?.()
  }

  const cafeTitle = branding.cafeName || 'Aezakmi Cafe'
  const branchTitle = branding.branch || 'Admin Console'

  return (
    <header
      className="admin-custom-titlebar app-drag-region sticky top-0 z-[999] flex h-8 w-full select-none items-center justify-between border-b border-[var(--admin-ui-border,#1E2738)] bg-[var(--admin-sidebar-bg,#0D111A)] text-[var(--text,#E6EAF2)] transition-colors"
      onDoubleClick={handleMaximizeToggle}
    >
      {/* Left: Branding & Branch Identity */}
      <div className="flex items-center gap-2 px-3 min-w-0">
        <img
          src={branding.logoUrl || logo}
          alt=""
          className="h-3.5 w-3.5 rounded-xs object-contain pointer-events-none"
          onError={(e) => { e.currentTarget.src = logo }}
        />
        <span className="truncate font-display text-[11px] font-bold tracking-tight text-[var(--text,#E6EAF2)]">
          {cafeTitle}
        </span>
        <span className="text-[10px] text-[var(--muted,#8D9AB5)] opacity-60">·</span>
        <span className="truncate text-[10px] font-medium tracking-wide uppercase text-[var(--muted,#8D9AB5)]">
          {branchTitle}
        </span>
      </div>

      {/* Center: Draggable Spacer & Skin Badge */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-2 pointer-events-none">
        {activeSkin && activeSkin.id !== 'nexus-dark' && (
          <div
            className="app-no-drag pointer-events-auto flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--surface-raised,#161E2E)]/70 border border-[var(--admin-ui-border,#1E2738)] text-[9.5px] font-semibold text-[var(--brand,#7B61FF)] hover:bg-[var(--surface-raised,#161E2E)] transition-colors cursor-pointer"
            onClick={openGallery}
            title={`Active Theme: ${activeSkin.name} (Click to customize)`}
          >
            <span
              className="h-1.5 w-1.5 rounded-full animate-pulse"
              style={{ backgroundColor: activeSkin.accent || activeSkin.brand || 'var(--brand)' }}
            />
            <span className="truncate">{activeSkin.name}</span>
          </div>
        )}
      </div>

      {/* Right: Window Controls */}
      <div className="app-no-drag flex items-center h-full">
        <button
          type="button"
          onClick={handleMinimize}
          className="inline-flex h-full w-10 items-center justify-center text-[var(--muted,#8D9AB5)] hover:bg-[var(--surface-raised,#1E2738)] hover:text-[var(--text,#E6EAF2)] active:bg-white/10 transition-colors cursor-pointer"
          aria-label="Minimize"
          title="Minimize"
        >
          <Minus size={13} strokeWidth={2} />
        </button>

        <button
          type="button"
          onClick={handleMaximizeToggle}
          className="inline-flex h-full w-10 items-center justify-center text-[var(--muted,#8D9AB5)] hover:bg-[var(--surface-raised,#1E2738)] hover:text-[var(--text,#E6EAF2)] active:bg-white/10 transition-colors cursor-pointer"
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
          title={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            <Copy size={11} strokeWidth={2} className="rotate-180" />
          ) : (
            <Square size={11} strokeWidth={2} />
          )}
        </button>

        <button
          type="button"
          onClick={handleClose}
          className="inline-flex h-full w-11 items-center justify-center text-[var(--muted,#8D9AB5)] hover:bg-[#E11D48] hover:text-white active:bg-[#BE123C] transition-colors cursor-pointer"
          aria-label="Close"
          title="Close (minimize to tray)"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>
    </header>
  )
}
