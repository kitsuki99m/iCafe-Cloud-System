import React, { useState, useEffect, useRef, useMemo, useCallback, forwardRef, useImperativeHandle, memo } from 'react'
import { effectivePcStatus, isPcStationOnline } from '../../lib/pcStatus.js'
import { showToast } from '../../lib/toast.js'

const STORAGE_KEY_POSITIONS = 'aezakmi:floor_plan_positions'
const CELL_SIZE = 68 // Grid snapping cell size
const PC_SIZE = 60 // Visual size of the square PC block

// Memoized Station Node for 120 FPS rendering
const FloorStationNode = memo(function FloorStationNode({
  pc,
  pos,
  zoom,
  matchesFilter,
  onMouseDown,
  onClick,
}) {
  const effectiveStatus = effectivePcStatus(pc)
  const isOnline = isPcStationOnline(pc)
  const session = pc.session
  const isOccupied = effectiveStatus === 'occupied'
  const isLocked = session?.isLocked
  const isOffline = effectiveStatus === 'offline' || !isOnline
  const isMaintenance = effectiveStatus === 'maintenance'

  const pcNum = String(pc.pcNumber ?? pc.label ?? pc.id ?? '').replace(/\D+/g, '') || pc.id

  let blockBg = 'bg-[#10b981] text-white shadow-[#10b981]/25'
  if (isOccupied) {
    blockBg = isLocked
      ? 'bg-[#d97706] text-white shadow-amber-500/25'
      : 'bg-[#ef4444] text-white shadow-rose-500/30 ring-1 ring-rose-400/40'
  } else if (isMaintenance) {
    blockBg = 'bg-[#f59e0b] text-white shadow-amber-500/25'
  } else if (isOffline) {
    blockBg = 'bg-[#334155] text-slate-300 shadow-slate-900/30'
  }

  let initialBadge = null
  if (isOccupied && session?.customerName) {
    initialBadge = session.customerName.charAt(0).toUpperCase()
  } else if (isOccupied) {
    initialBadge = 'G'
  }

  return (
    <div
      data-pc-node={pc.id}
      onMouseDown={(e) => onMouseDown(e, pc.id)}
      onClick={(e) => onClick(e, pc)}
      style={{
        position: 'absolute',
        left: `${pos.x * zoom}px`,
        top: `${pos.y * zoom}px`,
        width: `${PC_SIZE * zoom}px`,
        height: `${PC_SIZE * zoom}px`,
        willChange: 'transform',
        zIndex: 20,
      }}
      className={`group rounded-xl flex flex-col items-center justify-center relative cursor-grab select-none shadow-md transition-shadow duration-100 hover:scale-105 active:scale-95 ${blockBg} ${
        !matchesFilter ? 'opacity-20' : 'opacity-100'
      }`}
      title={`${pc.label || `PC ${pcNum}`} · ${effectiveStatus} · Click for controls`}
    >
      <span className="text-[9px] font-black uppercase tracking-wider leading-none opacity-90">
        PC
      </span>
      <span className="text-sm font-black tracking-tight leading-none mt-1">
        {pcNum}
      </span>
      {initialBadge && (
        <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-white text-black font-black text-[9px] flex items-center justify-center shadow-md border border-black/10">
          {initialBadge}
        </span>
      )}
    </div>
  )
})

const FloorMap2D = forwardRef(function FloorMap2D({
  pcs = [],
  now = Date.now(),
  lowTimeWarningMinutes = 5,
  onSelect,
  onControls,
  activeFilter = 'all',
  onHasChangesChange,
  onZoomChange,
}, ref) {
  const [positions, setPositions] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_POSITIONS)
      return saved ? JSON.parse(saved) : {}
    } catch {
      return {}
    }
  })

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
    const cols = 12
    const startX = 36
    const startY = 36
    const gap = 76

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
      showToast({ title: 'Layout Saved', message: 'Station floor positions saved successfully.', tone: 'success' })
    } catch (e) {
      console.warn('Failed to save layout:', e)
    }
  }, [])

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

  const handleStationClick = useCallback((e, pc) => {
    if (activeDragRef.current?.moved) return
    if (onControls) onControls(e, pc)
    else if (onSelect) onSelect(pc)
  }, [onControls, onSelect])

  return (
    <div className="relative w-full h-[clamp(400px,calc(100dvh-295px),720px)] rounded-2xl border border-surface-line bg-surface/60 overflow-auto select-none shadow-card">
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
        {/* Subtle Blueprint Grid Pattern matching theme */}
        <svg className="absolute inset-0 w-full h-full opacity-15 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="floorGridSmall" width={CELL_SIZE * zoom} height={CELL_SIZE * zoom} patternUnits="userSpaceOnUse">
              <path d={`M ${CELL_SIZE * zoom} 0 L 0 0 0 ${CELL_SIZE * zoom}`} fill="none" stroke="currentColor" strokeWidth="0.75" className="text-slate-500" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#floorGridSmall)" />
        </svg>

        {/* Station Building Block Nodes */}
        {pcs.map((pc) => {
          const pos = computedPositions[pc.id] || { x: 36, y: 36 }
          const effectiveStatus = effectivePcStatus(pc)
          const isOccupied = effectiveStatus === 'occupied'
          const isLocked = pc.session?.isLocked
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
              matchesFilter={matchesFilter}
              onMouseDown={handleMouseDown}
              onClick={handleStationClick}
            />
          )
        })}
      </div>
    </div>
  )
})

export default FloorMap2D


