import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function Modal({
  open,
  onClose,
  title,
  eyebrow,
  description,
  children,
  footer,
  maxWidth = 'max-w-lg',
  onSubmit,
  canSubmit = true,
  busy = false,
  zIndexClass = 'z-[500]',
  showCloseButton = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
}) {
  const onCloseRef = useRef(onClose)
  const onSubmitRef = useRef(onSubmit)
  const canSubmitRef = useRef(canSubmit)
  const busyRef = useRef(busy)
  const closeOnEscapeRef = useRef(closeOnEscape)
  const dialogRef = useRef(null)
  const previousFocusedRef = useRef(null)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
    onSubmitRef.current = onSubmit
    canSubmitRef.current = canSubmit
    busyRef.current = busy
    closeOnEscapeRef.current = closeOnEscape
  }, [onClose, onSubmit, canSubmit, busy, closeOnEscape])

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
    const onKey = (event) => {
      if (event.key === 'Escape') {
        if (!closeOnEscapeRef.current || busyRef.current) return
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key === 'Tab') {
        const dialog = dialogRef.current
        if (!dialog) return
        const focusable = [...dialog.querySelectorAll(FOCUSABLE)].filter((node) => node instanceof HTMLElement && node.offsetParent !== null)
        if (!focusable.length) {
          event.preventDefault(); dialog.focus(); return
        }
        const first = focusable[0]
        const last = focusable.at(-1)
        if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus()
        }
        return
      }
      if (
        event.key === 'Enter' &&
        onSubmitRef.current &&
        canSubmitRef.current &&
        !busyRef.current &&
        event.target?.tagName !== 'TEXTAREA' &&
        event.target?.tagName !== 'BUTTON' &&
        event.target?.closest?.('input,select') &&
        !event.defaultPrevented
      ) {
        event.preventDefault()
        onSubmitRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.cancelAnimationFrame(focusDialog)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      const previous = previousFocusedRef.current
      if (previous?.isConnected) previous.focus?.()
      previousFocusedRef.current = null
    }
  }, [open])

  if (!open) return null

  function requestClose() {
    if (busy) return
    onClose?.()
  }

  return (
    <div className={`fixed inset-0 ${zIndexClass} flex items-center justify-center p-4 sm:p-6`}>
      <div
        data-overlay-backdrop="true"
        className="absolute inset-0 bg-midnight/70"
        onClick={closeOnBackdrop ? requestClose : undefined}
      />
      <section
        ref={dialogRef}
        tabIndex={-1}
        className={`relative flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded-[20px] border border-surface-line bg-surface shadow-2xl ${maxWidth}`}
        role="dialog"
        aria-modal="true"
        aria-busy={busy || undefined}
        aria-labelledby={titleId}
      >
        <header className="flex items-start justify-between gap-4 border-b border-surface-line px-5 py-4 sm:px-6">
          <div className="min-w-0">
            {eyebrow && <p className="eyebrow mb-1.5 text-gold-dim">{eyebrow}</p>}
            <h2 id={titleId} className="font-display text-[20px] font-semibold leading-tight tracking-tight text-ink-900">
              {title}
            </h2>
            {description && (
              <p className="mt-1.5 max-w-xl text-[13px] leading-5 text-slate-soft">
                {description}
              </p>
            )}
          </div>
          {showCloseButton && <button
            type="button"
            onClick={requestClose}
            disabled={busy}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border border-surface-line bg-surface-raised text-slate-soft transition-colors hover:border-gold/40 hover:bg-surface-raised hover:text-gold-dim disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Close"
          >
            <X size={18} />
          </button>}
        </header>

        <div className="min-h-0 overflow-y-auto px-5 py-4 text-[13px] text-ink-900 sm:px-6 [&_input]:min-h-11 [&_select]:min-h-11 [&_textarea]:min-h-20">
          {children}
        </div>

        {footer && (
          <footer className="flex min-h-14 flex-wrap items-center justify-end gap-2 border-t border-surface-line bg-surface-raised/60 px-5 py-3 sm:px-6">
            {footer}
          </footer>
        )}
      </section>
    </div>
  )
}
