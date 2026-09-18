import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function SidePanel({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
  busy = false,
  width = 'max-w-[430px]',
  ariaLabel,
}) {
  const closeRef = useRef(onClose)
  const busyRef = useRef(busy)
  const panelRef = useRef(null)
  const previousFocusedRef = useRef(null)
  useEffect(() => { closeRef.current = onClose; busyRef.current = busy }, [onClose, busy])

  useEffect(() => {
    if (!open) return undefined
    window.dispatchEvent(new CustomEvent('aezakmi:overlay-open'))
    previousFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusPanel = window.requestAnimationFrame(() => {
      const panel = panelRef.current
      if (!panel || panel.contains(document.activeElement)) return
      const first = panel.querySelector(FOCUSABLE)
      ;(first || panel).focus?.()
    })
    const onKey = (event) => {
      // A common Modal/ConfirmModal can open from a side-panel action. It sits
      // above this panel and owns keyboard focus while open; do not let one
      // Escape/Tab keystroke mutate both layers.
      if (document.querySelector('[data-admin-modal-root="true"]')) return
      if (event.key === 'Escape') {
        if (busyRef.current) return
        event.preventDefault()
        closeRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const panel = panelRef.current
      if (!panel) return
      const focusable = [...panel.querySelectorAll(FOCUSABLE)].filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
      if (!focusable.length) {
        event.preventDefault(); panel.focus(); return
      }
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault(); last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus()
      }
    }
    const closeForNewOverlay = () => {
      if (!busyRef.current) closeRef.current?.()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('aezakmi:overlay-open', closeForNewOverlay)
    return () => {
      window.cancelAnimationFrame(focusPanel)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('aezakmi:overlay-open', closeForNewOverlay)
      document.body.style.overflow = previousOverflow
      const previous = previousFocusedRef.current
      if (previous?.isConnected) previous.focus?.()
      previousFocusedRef.current = null
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[490]">
      <div className="absolute inset-0 bg-midnight/35" onMouseDown={() => !busy && onClose?.()} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel || title || 'Details'}
        className={`admin-side-panel absolute bottom-3 right-3 top-3 flex w-[calc(100%-1.5rem)] ${width} flex-col overflow-hidden rounded-[22px] border border-surface-line bg-surface shadow-2xl sm:w-full`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between border-b border-surface-line px-5 py-4">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            <h2 className="truncate font-display text-lg font-semibold text-ink-900">{title}</h2>
          </div>
          <button type="button" disabled={busy} onClick={() => !busy && onClose?.()} className="admin-icon-button shrink-0 disabled:opacity-40" aria-label="Close details">
            <X size={18}/>
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="shrink-0 border-t border-surface-line bg-surface-raised/35 px-5 py-3">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  )
}
