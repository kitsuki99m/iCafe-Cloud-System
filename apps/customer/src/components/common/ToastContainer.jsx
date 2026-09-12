import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Clock3, Info, X, XCircle } from 'lucide-react'
import { subscribeToast } from '../../lib/toast.js'

const TONE = {
  success: { icon: CheckCircle2, border: 'border-teal/40', bg: 'bg-surface', iconClass: 'text-teal-dim', accent: 'shadow-[0_8px_30px_rgba(0,0,0,0.25)]' },
  error: { icon: XCircle, border: 'border-ember/40', bg: 'bg-surface', iconClass: 'text-ember-dim', accent: 'shadow-[0_8px_30px_rgba(0,0,0,0.25)]' },
  warning: { icon: AlertCircle, border: 'border-amber-400/50', bg: 'bg-surface', iconClass: 'text-amber-700', accent: 'shadow-[0_8px_30px_rgba(0,0,0,0.25)]' },
  info: { icon: Info, border: 'border-surface-line', bg: 'bg-surface', iconClass: 'text-teal-dim', accent: 'shadow-[0_8px_30px_rgba(0,0,0,0.25)]' },
  session: { icon: Clock3, border: 'border-teal/40', bg: 'bg-surface', iconClass: 'text-teal-dim', accent: 'shadow-[0_8px_30px_rgba(0,0,0,0.25)]' },
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])
  const timersRef = useRef(new Map())

  useEffect(() => {
    const unsubscribe = subscribeToast((toast) => {
      setToasts((current) => [...current, toast])
      const previous = timersRef.current.get(toast.id)
      if (previous) window.clearTimeout(previous)
      const timer = window.setTimeout(() => {
        timersRef.current.delete(toast.id)
        setToasts((current) => current.filter((item) => item.id !== toast.id))
      }, toast.duration ?? 6000)
      timersRef.current.set(toast.id, timer)
    })
    return () => {
      unsubscribe?.()
      timersRef.current.forEach((timer) => window.clearTimeout(timer))
      timersRef.current.clear()
    }
  }, [])

  function dismiss(id) {
    const timer = timersRef.current.get(id)
    if (timer) window.clearTimeout(timer)
    timersRef.current.delete(id)
    setToasts((current) => current.filter((item) => item.id !== id))
  }

  if (!toasts.length) return null

  return (
    <div
      className="pointer-events-none fixed z-[1000] flex w-[min(380px,calc(100vw-1.5rem))] flex-col gap-2.5"
      style={{ right: '1rem', bottom: 'calc(3rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {toasts.map((toast) => {
        const tone = TONE[toast.tone] || TONE.info
        const Icon = tone.icon
        return (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 ${tone.border} ${tone.bg} ${tone.accent}`}
            role="status"
          >
            <Icon size={18} className={`mt-0.5 shrink-0 ${tone.iconClass}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
              {toast.message ? <p className="mt-0.5 text-xs leading-relaxed text-slate-soft">{toast.message}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-md p-1 text-slate-soft hover:bg-surface-raised hover:text-ink-900"
              aria-label="Dismiss notification"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
