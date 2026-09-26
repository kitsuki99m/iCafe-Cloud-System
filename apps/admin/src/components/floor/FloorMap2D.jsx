import React, { useState, useEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle, memo } from 'react'
import { effectivePcStatus, isPcStationOnline } from '../../lib/pcStatus.js'
import { showToast } from '../../lib/toast.js'
import { remainingSessionSeconds } from '../../lib/sessionTime.js'
import { Lock, Wrench, WifiOff, MoreHorizontal, Sparkles } from 'lucide-react'

const STORAGE_KEY_POSITIONS = 'aezakmi:floor_plan_positions'
const CELL_SIZE = 80 // Grid snapping cell size
const PC_SIZE = 72 // Visual size of station block

function formatNodeTime(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return '--:--'
  if (seconds <= 0) return '00:00'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// Memoized Esports Rig Station Node for high-framerate rendering
const FloorStationNode = memo(function FloorStationNode({
  pc,
  pos,
  zoom,
  now,
  matchesFilter,
  onMouseDown,
  onTouchStart,
  onClick,
  onControls,
}) {
  const effectiveStatus = effectivePcStatus(pc)
  const isOnline = isPcStationOnline(pc)
  const session = pc.session
  const isOccupied = effectiveStatus === 'occupied'
  const isLocked = session?.isLocked || session?.isPaused
  const isOffline = effectiveStatus === 'offline' || !isOnline
  const isMaintenance = effectiveStatus === 'maintenance'

  const pcNum = String(pc.pcNumber ?? pc.label ?? pc.id ?? '').replace(/\D+/g, '') || pc.id

  const isVip = Boolean(
    pc.isVip ||
    pc.vip ||
    pc.tier === 'VIP' ||
    pc.tier === 'vip' ||
    String(pc.spec || '').toLowerCase().includes('vip') ||
    String(pc.label || '').toLowerCase().includes('vip') ||
    String(pc.zone || '').toLowerCase().includes('vip') ||
    String(pc.category || '').toLowerCase().includes('vip')
  )

  const remainingSec = isOccupied && session?.billing === 'prepaid'
    ? remainingSessionSeconds(session, now)
    : null

  // Status-driven high-contrast styling variables
  let borderStyle = 'border-2 border-[var(--line,#26314A)]'
  let bgStyle = 'bg-[var(--surface,#121824)] text-ink-900'
  let glowShadow = 'shadow-md'
  let statusDotColor = 'bg-teal'

  if (isOccupied) {
    borderStyle = isLocked
      ? 'border-2 border-amber-500 ring-2 ring-amber-500/40'
      : 'border-2 border-amber-500 ring-2 ring-amber-500/50'
    bgStyle = 'bg-gradient-to-b from-amber-500/20 to-[var(--surface-2,#1A2232)] text-ink-900'
    glowShadow = 'shadow-[0_0_20px_-2px_rgba(245,158,11,0.4)]'
    statusDotColor = 'bg-amber-400'
  } else if (isMaintenance) {
    borderStyle = 'border-2 border-ember/70'
    bgStyle = 'bg-ember/15 text-ember-dim'
    statusDotColor = 'bg-ember'
  } else if (isOffline) {
    borderStyle = 'border-2 border-surface-line'
    bgStyle = 'bg-surface/90 text-slate-soft'
    statusDotColor = 'bg-slate-500'
  } else {
    // Available
    borderStyle = 'border-2 border-teal/60 hover:border-teal ring-1 ring-teal/30'
    bgStyle = 'bg-[var(--surface,#121824)] text-ink-900'
    glowShadow = 'shadow-[0_0_14px_-2px_rgba(20,184,166,0.35)] hover:shadow-[0_0_20px_-2px_rgba(20,184,166,0.55)]'
  }

  return (
    <div
      data-pc-node={pc.id}
      onMouseDown={(e) => onMouseDown(e, pc.id)}
      onTouchStart={(e) => onTouchStart(e, pc.id)}
      onClick={(e) => onClick(e, pc)}
      onContextMenu={(e) => {
        e.preventDefault()
        onControls?.(e, pc)
      }}
      style={{
        position: 'absolute',
        left: `${pos.x * zoom}px`,
        top: `${pos.y * zoom}px`,
        width: `${PC_SIZE * zoom}px`,
        height: `${PC_SIZE * zoom}px`,
        willChange: 'transform',
        zIndex: 20,
        touchAction: 'none',
      }}
      className={`floor-2d-node group flex flex-col justify-between p-1.5 rounded-xl cursor-grab select-none transition-all duration-100 hover:scale-105 active:scale-95 ${borderStyle} ${bgStyle} ${glowShadow} ${
        isOccupied ? 'occupied' : ''
      } ${!matchesFilter ? 'opacity-20 pointer-events-none' : 'opacity-100'}`}
      title={`${pc.label || `PC ${pcNum}`}${isVip ? ' (VIP)' : ''} · ${effectiveStatus} · Click to inspect session drawer`}
    >
      {/* Top Header: Rig Label + VIP + Status Pill */}
      <div className="flex items-center justify-between gap-1 pointer-events-none">
        <div className="flex items-center gap-1">
          <span className="font-display text-[12px] font-bold tracking-tight text-ink-900 leading-none">
            {pc.label ? pc.label.replace(/^pc[-\s]*/i, '') : `PC${pcNum}`}
          </span>
          {isVip && (
            <span className="text-[9px] font-black text-amber-400 leading-none" title="VIP Station">
              ★
            </span>
          )}
        </div>
        <span className={`h-2 w-2 rounded-full ${statusDotColor} ${isOccupied ? 'animate-pulse ring-2 ring-amber-500/50' : ''}`} />
      </div>

      {/* Middle Readout: Timer / Status */}
      <div className="flex flex-col items-center justify-center my-auto pointer-events-none">
        {isOccupied ? (
          <>
            <span className="font-mono text-[12px] font-bold tracking-tight text-amber-400 leading-none">
              {remainingSec != null ? formatNodeTime(remainingSec) : 'OPEN'}
            </span>
            <span className="mt-0.5 max-w-[58px] truncate text-[9.5px] font-semibold text-ink-900 leading-none">
              {session?.customerName || session?.username || 'Guest'}
            </span>
          </>
        ) : isMaintenance ? (
          <div className="flex items-center gap-0.5 text-[9.5px] font-bold text-ember-dim">
            <Wrench size={10} />
            <span>REPAIR</span>
          </div>
        ) : isOffline ? (
          <div className="flex items-center gap-0.5 text-[9.5px] font-medium text-slate-soft">
            <WifiOff size={9} />
            <span>OFFLINE</span>
          </div>
        ) : (
          <span className="rounded px-1.5 py-0.5 text-[9.5px] font-bold text-teal-dim bg-teal/15 border border-teal/30">
            OPEN
          </span>
        )}
      </div>

      {/* Bottom Footer: Quick Controls Trigger button */}
      <div className="flex items-center justify-between pt-0.5 border-t border-surface-line/40">
        <span className="text-[8.5px] font-mono font-bold uppercase text-slate-soft">
          {pc.rate || pc.hourlyRate ? `₱${pc.rate || pc.hourlyRate}` : 'RIG'}
        </span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onControls?.(e, pc)
          }}
          className="rounded p-0.5 text-slate-soft hover:text-ink-900 hover:bg-surface-raised transition-colors cursor-pointer"
          title="Station Controls Menu"
        >
          <MoreHorizontal size={12} />
        </button>
      </div>
    </div>
  )
})

const FloorMap2D = forwardRef(function FloorMap2D({
  pcs = [],
  now = Date.now(),
  settings = {},
  onSaveLayoutSettings,
  lowTimeWarningMinutes = 5,
  onSelect,
  onControls,
  activeFilter = 'all',
  onHasChangesChange,
  onZoomChange,
}, ref) {
  const [positions, setPositions] = useState(() => {
    try {
      if (settings?.floorPlanLayout && typeof settings.floorPlanLayout === 'object') {
        return settings.floorPlanLayout
      }
      const saved = localStorage.getItem(STORAGE_KEY_POSITIONS)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

  // Sync with remote settings if updated on another device and no local draft in progress
  useEffect(() => {
    if (settings?.floorPlanLayout && typeof settings.floorPlanLayout === 'object') {
      setPositions((prev) => {
        // If has unsaved changes, don't clobber active draft
        if (hasUnsavedChanges) return prev
        return settings.floorPlanLayout
      })
    }
  }, [settings?.floorPlanLayout])

  const [zoom, setZoom] = useState(1)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const activeDragRef = useRef(null)
  const rafRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    onHasChangesChange?.(hasUnsavedChanges)
  }, [hasUnsavedChanges, onHasChangesChange])

  useEffect(() => {
    onZoomChange?.(zoom)
  }, [zoom, onZoomChange])

  // Default auto-arranged positions (arranged in clean rows like cybercafe setups)
  const computedPositions = useMemo(() => {
    const next = { ...positions }
    const isSmall = typeof window !== 'undefined' && window.innerWidth < 768
    const cols = isSmall ? 4 : 8
    const startX = 24
    const startY = 24
    const gap = CELL_SIZE

    pcs.forEach((pc, idx) => {
      if (!next[pc.id] || typeof next[pc.id].x !== 'number' || typeof next[pc.id].y !== 'number') {
        const col = idx % cols
        const row = Math.floor(idx / cols)
        next[pc.id] = {
          x: startX + col * gap,
          y: startY + row * gap,
        }
      }
    })
    return next
  }, [pcs, positions])

  // Dynamic canvas bounds to avoid unwanted scrollbars while allowing room to expand
  const canvasBounds = useMemo(() => {
    let maxX = 1100
    let maxY = 600
    pcs.forEach((pc) => {
      const pos = computedPositions[pc.id]
      if (pos) {
        if (pos.x + PC_SIZE + 100 > maxX) maxX = pos.x + PC_SIZE + 100
        if (pos.y + PC_SIZE + 100 > maxY) maxY = pos.y + PC_SIZE + 100
      }
    })
    return { width: maxX, height: maxY }
  }, [pcs, computedPositions])

  const savePositionsToStorage = useCallback((nextPositions) => {
    try {
      localStorage.setItem(STORAGE_KEY_POSITIONS, JSON.stringify(nextPositions))
      setHasUnsavedChanges(false)
      // Save to backend settings so all devices and mobile sessions share the same layout
      if (onSaveLayoutSettings) {
        onSaveLayoutSettings({ floorPlanLayout: nextPositions }).catch(() => {})
      }
      showToast({ title: 'Layout Saved', message: 'Station floor positions saved across all devices.', tone: 'success' })
    } catch (e) {
      console.warn('Failed to save layout:', e)
    }
  }, [onSaveLayoutSettings])

  const handleSaveLayout = useCallback(() => {
    savePositionsToStorage({ ...computedPositions, ...positions })
  }, [computedPositions, positions, savePositionsToStorage])

  const handleResetLayout = useCallback(() => {
    const next = {}
    const cols = 12
    const startX = 36
    const startY = 36
    const gap = 76

    pcs.forEach((pc, idx) => {
      const col = idx % cols
      const row = Math.floor(idx / cols)
      next[pc.id] = {
        x: startX + col * gap,
        y: startY + row * gap,
      }
    })

    setPositions(next)
    savePositionsToStorage(next)
  }, [pcs, savePositionsToStorage])

  const zoomIn = useCallback(() => {
    setZoom((z) => Math.min(1.4, Math.round((z + 0.1) * 10) / 10))
  }, [])

  const zoomOut = useCallback(() => {
    setZoom((z) => Math.max(0.6, Math.round((z - 0.1) * 10) / 10))
  }, [])

  const zoomReset = useCallback(() => {
    setZoom(1)
  }, [])

  useImperativeHandle(ref, () => ({
    saveLayout: handleSaveLayout,
    resetLayout: handleResetLayout,
    zoomIn,
    zoomOut,
    zoomReset,
    hasUnsavedChanges,
    zoom,
  }), [handleSaveLayout, handleResetLayout, zoomIn, zoomOut, zoomReset, hasUnsavedChanges, zoom])

  // Zero-overhead direct DOM hardware-accelerated drag
  const handleMouseDown = useCallback((e, pcId) => {
    if (e.button !== 0) return // Left click only
    e.stopPropagation()
    const node = e.currentTarget
    const currentPos = computedPositions[pcId] || { x: 36, y: 36 }

    activeDragRef.current = {
      pcId,
      node,
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentPos.x,
      initialY: currentPos.y,
      currentSnapX: currentPos.x,
      currentSnapY: currentPos.y,
      moved: false,
    }

    node.style.zIndex = '100'
    node.style.cursor = 'grabbing'
    node.classList.add('shadow-2xl', 'ring-4', 'ring-white/50', 'scale-105')

    function onMouseMove(moveEvent) {
      if (!activeDragRef.current) return
      const drag = activeDragRef.current
      const dx = (moveEvent.clientX - drag.startX) / zoom
      const dy = (moveEvent.clientY - drag.startY) / zoom

      if (!drag.moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
        drag.moved = true
      }

      if (!drag.moved) return

      const rawX = drag.initialX + dx
      const rawY = drag.initialY + dy
      const snappedX = Math.max(16, Math.round(rawX / CELL_SIZE) * CELL_SIZE)
      const snappedY = Math.max(16, Math.round(rawY / CELL_SIZE) * CELL_SIZE)

      drag.currentSnapX = snappedX
      drag.currentSnapY = snappedY

      // GPU hardware transform via requestAnimationFrame
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        if (drag.node) {
          drag.node.style.transform = `translate3d(${(snappedX - drag.initialX) * zoom}px, ${(snappedY - drag.initialY) * zoom}px, 0)`
        }
      })
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      if (!activeDragRef.current) return
      const drag = activeDragRef.current
      const finalX = drag.currentSnapX
      const finalY = drag.currentSnapY
      const didMove = drag.moved && (finalX !== drag.initialX || finalY !== drag.initialY)

      if (drag.node) {
        drag.node.style.zIndex = '20'
        drag.node.style.cursor = 'grab'
        drag.node.style.transform = ''
        drag.node.classList.remove('shadow-2xl', 'ring-4', 'ring-white/50', 'scale-105')
      }

      if (didMove) {
        setPositions((prev) => ({
          ...prev,
          [drag.pcId]: { x: finalX, y: finalY },
        }))
        setHasUnsavedChanges(true)
      }

      setTimeout(() => {
        if (activeDragRef.current?.pcId === drag.pcId) {
          activeDragRef.current = null
        }
      }, 50)
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true })
    window.addEventListener('mouseup', onMouseUp)
  }, [computedPositions, zoom])

  // Mobile Touch direct hardware-accelerated drag
  const handleTouchStart = useCallback((e, pcId) => {
    if (!e.touches || e.touches.length !== 1) return
    const touch = e.touches[0]
    const node = e.currentTarget
    const currentPos = computedPositions[pcId] || { x: 36, y: 36 }

    activeDragRef.current = {
      pcId,
      node,
      startX: touch.clientX,
      startY: touch.clientY,
      initialX: currentPos.x,
      initialY: currentPos.y,
      currentSnapX: currentPos.x,
      currentSnapY: currentPos.y,
      moved: false,
    }

    node.style.zIndex = '100'
    node.classList.add('shadow-2xl', 'ring-4', 'ring-white/50', 'scale-105')

    function onTouchMove(moveEvent) {
      if (!activeDragRef.current || !moveEvent.touches || moveEvent.touches.length !== 1) return
      const curTouch = moveEvent.touches[0]
      const drag = activeDragRef.current
      const dx = (curTouch.clientX - drag.startX) / zoom
      const dy = (curTouch.clientY - drag.startY) / zoom

      if (!drag.moved && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
        drag.moved = true
      }

      if (!drag.moved) return

      // Prevent page scrolling while dragging station on touch screen
      if (moveEvent.cancelable) {
        moveEvent.preventDefault()
      }

      const rawX = drag.initialX + dx
      const rawY = drag.initialY + dy
      const snappedX = Math.max(16, Math.round(rawX / CELL_SIZE) * CELL_SIZE)
      const snappedY = Math.max(16, Math.round(rawY / CELL_SIZE) * CELL_SIZE)

      drag.currentSnapX = snappedX
      drag.currentSnapY = snappedY

      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        if (drag.node) {
          drag.node.style.transform = `translate3d(${(snappedX - drag.initialX) * zoom}px, ${(snappedY - drag.initialY) * zoom}px, 0)`
        }
      })
    }

    function onTouchEnd() {
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)

      if (!activeDragRef.current) return
      const drag = activeDragRef.current
      const finalX = drag.currentSnapX
      const finalY = drag.currentSnapY
      const didMove = drag.moved && (finalX !== drag.initialX || finalY !== drag.initialY)

      if (drag.node) {
        drag.node.style.zIndex = '20'
        drag.node.style.transform = ''
        drag.node.classList.remove('shadow-2xl', 'ring-4', 'ring-white/50', 'scale-105')
      }

      if (didMove) {
        setPositions((prev) => ({
          ...prev,
          [drag.pcId]: { x: finalX, y: finalY },
        }))
        setHasUnsavedChanges(true)
      }

      setTimeout(() => {
        if (activeDragRef.current?.pcId === drag.pcId) {
          activeDragRef.current = null
        }
      }, 50)
    }

    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)
  }, [computedPositions, zoom])

  const handleStationClick = useCallback((e, pc) => {
    if (activeDragRef.current?.moved) return
    // Primary click opens the StationDetailDrawer right beside the 2D layout
    if (onSelect) onSelect(pc)
  }, [onSelect])

  return (
    <div className="relative w-full h-[clamp(360px,calc(100dvh-310px),740px)] rounded-2xl border border-[var(--line)] bg-[var(--surface)]/75 backdrop-blur-md overflow-auto select-none shadow-card touch-pan-x touch-pan-y overscroll-contain">
      <div
        ref={canvasRef}
        style={{
          minWidth: '100%',
          minHeight: '100%',
          width: zoom !== 1 ? `${canvasBounds.width * zoom}px` : '100%',
          height: zoom !== 1 ? `${canvasBounds.height * zoom}px` : '100%',
          transformOrigin: '0 0',
        }}
        className="relative transition-all duration-75"
      >
        {/* Esports Blueprint Grid matching skin */}
        <svg className="absolute inset-0 w-full h-full opacity-40 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="floorGridSmall" width={CELL_SIZE * zoom} height={CELL_SIZE * zoom} patternUnits="userSpaceOnUse">
              <path
                d={`M ${CELL_SIZE * zoom} 0 L 0 0 0 ${CELL_SIZE * zoom}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1"
                className="text-[var(--brand)]"
              />
              <circle cx={CELL_SIZE * zoom} cy={CELL_SIZE * zoom} r="1.5" fill="currentColor" className="text-[var(--brand)]" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#floorGridSmall)" />
        </svg>

        {/* Station Rig Nodes */}
        {pcs.map((pc) => {
          const pos = computedPositions[pc.id] || { x: 40, y: 40 }
          const effectiveStatus = effectivePcStatus(pc)
          const isOccupied = effectiveStatus === 'occupied'
          const isLocked = pc.session?.isLocked || pc.session?.isPaused
          const isOffline = effectiveStatus === 'offline' || !isPcStationOnline(pc)
          const isMaintenance = effectiveStatus === 'maintenance'

          const matchesFilter =
            activeFilter === 'all' ||
            (activeFilter === 'occupied' && isOccupied) ||
            (activeFilter === 'available' && effectiveStatus === 'available') ||
            (activeFilter === 'locked' && isLocked) ||
            (activeFilter === 'maintenance' && isMaintenance) ||
            (activeFilter === 'offline' && isOffline)

          return (
            <FloorStationNode
              key={pc.id}
              pc={pc}
              pos={pos}
              zoom={zoom}
              now={now}
              matchesFilter={matchesFilter}
              onMouseDown={handleMouseDown}
              onTouchStart={handleTouchStart}
              onClick={handleStationClick}
              onControls={onControls}
            />
          )
        })}
      </div>
    </div>
  )
})

export default FloorMap2D


