import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const EDGE = 12
const GAP = 8

export default function AnchoredPopover({
  open,
  anchorRef,
  onClose,
  children,
  placement = 'bottom-end',
  className = '',
  ariaLabel = 'Context menu',
}) {
  const panelRef = useRef(null)
  const [position, setPosition] = useState({ left: EDGE, top: EDGE, maxHeight: 480, ready:false })

  const reposition = useCallback(() => {
    if (!open || !anchorRef?.current || !panelRef.current) return
    const anchor = anchorRef.current.getBoundingClientRect()
    const panel = panelRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let left = placement.endsWith('start') ? anchor.left : anchor.right - panel.width
    let top = anchor.bottom + GAP

    if (top + panel.height > viewportHeight - EDGE && anchor.top - panel.height - GAP >= EDGE) {
      top = anchor.top - panel.height - GAP
    }

    left = Math.max(EDGE, Math.min(left, viewportWidth - panel.width - EDGE))
    top = Math.max(EDGE, Math.min(top, viewportHeight - Math.min(panel.height, viewportHeight - EDGE * 2) - EDGE))

    setPosition({
      left,
      top,
      maxHeight: Math.max(160, viewportHeight - top - EDGE),
      ready:true,
    })
  }, [anchorRef, open, placement])

  useLayoutEffect(() => {
    if (!open) return
    const frame = window.requestAnimationFrame(reposition)
    return () => window.cancelAnimationFrame(frame)
  }, [open, reposition, children])

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event) => {
      if (panelRef.current?.contains(event.target) || anchorRef?.current?.contains(event.target)) return
      onClose?.()
    }
    const closeOnKey = (event) => { if (event.key === 'Escape') onClose?.() }
    const closeForModal = () => onClose?.()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('keydown', closeOnKey)
    window.addEventListener('pointerdown', closeOnOutside, true)
    window.addEventListener('aezakmi:overlay-open', closeForModal)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('keydown', closeOnKey)
      window.removeEventListener('pointerdown', closeOnOutside, true)
      window.removeEventListener('aezakmi:overlay-open', closeForModal)
    }
  }, [anchorRef, onClose, open, reposition])

  if (!open) return null

  return createPortal(
    <div
      ref={panelRef}
      role="menu"
      aria-label={ariaLabel}
      className={`admin-popover fixed z-[720] overflow-y-auto rounded-[16px] border border-surface-line bg-surface p-1.5 shadow-2xl ${className}`}
      style={{ left:position.left, top:position.top, maxHeight:position.maxHeight, visibility:position.ready ? 'visible' : 'hidden' }}
    >
      {children}
    </div>,
    document.body,
  )
}
