import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({ open, onClose, title, eyebrow, description, children, footer, maxWidth = 'max-w-md', onSubmit, canSubmit = true, busy = false }) {
  const onCloseRef = useRef(onClose)
  const onSubmitRef = useRef(onSubmit)
  const canSubmitRef = useRef(canSubmit)
  const busyRef = useRef(busy)
  const dialogRef = useRef(null)
  const previousFocusedRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
    onSubmitRef.current = onSubmit
    canSubmitRef.current = canSubmit
    busyRef.current = busy
  }, [onClose, onSubmit, canSubmit, busy])

  useEffect(() => {
    if (!open) return undefined
    window.dispatchEvent(new CustomEvent('aezakmi:overlay-open'))
    previousFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

    const focusDialog = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current
      if (!dialog || dialog.contains(document.activeElement)) return
      const first = dialog.querySelector(FOCUSABLE)
      ;(first || dialog).focus?.()
    })

    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (busyRef.current) return
        e.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (e.key === 'Tab') {
        const dialog = dialogRef.current
        if (!dialog) return
        const focusable = [...dialog.querySelectorAll(FOCUSABLE)].filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
        if (!focusable.length) {
          e.preventDefault()
          dialog.focus()
          return
        }
        const first = focusable[0]
        const last = focusable.at(-1)
        if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }
    const onEnter = (e) => {
      if (e.key !== 'Enter' || !onSubmitRef.current || !canSubmitRef.current || busyRef.current || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'BUTTON') return
      if (e.target?.closest?.('input,select') && !e.defaultPrevented) { e.preventDefault(); onSubmitRef.current() }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('keydown', onEnter)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.cancelAnimationFrame(focusDialog)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keydown', onEnter)
      document.body.style.overflow = previousOverflow
      const previous = previousFocusedRef.current
      if (previous?.isConnected) previous.focus?.()
      previousFocusedRef.current = null
    }
  }, [open])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-3 sm:p-6">
      <div
        data-overlay-backdrop="true"
        className="admin-modal-backdrop absolute inset-0 bg-midnight/70"
        onMouseDown={() => !busy && onClose?.()}
      />
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`admin-modal-shell relative flex max-h-[calc(100vh-2rem)] w-full flex-col ${maxWidth} overflow-hidden`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy ? 'true' : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-header flex items-start justify-between gap-5">
          <div>
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            <h2 id={titleId} className="admin-modal-title font-display font-semibold text-ink-900">{title}</h2>
            {description ? <p className="admin-modal-description">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose?.()}
            className="admin-modal-close rounded-full p-2 text-slate-soft transition-colors hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close"
            disabled={busy}
          >
            <X size={17} />
          </button>
        </div>

        <div className="admin-modal-body min-h-0 max-h-[calc(100vh-9rem)] overflow-y-auto">{children}</div>

        {footer && (
          <div className="admin-modal-footer flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
