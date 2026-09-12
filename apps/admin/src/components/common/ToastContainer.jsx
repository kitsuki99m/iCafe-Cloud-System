import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { subscribeToast } from '../../lib/toast.js'

const TONE = {
  success: { icon: CheckCircle2, border: 'border-teal/30', bg: 'bg-surface', iconClass: 'text-teal-dim' },
  error: { icon: XCircle, border: 'border-ember/30', bg: 'bg-surface', iconClass: 'text-ember-dim' },
  warning: { icon: AlertCircle, border: 'border-gold/30', bg: 'bg-surface', iconClass: 'text-gold-dim' },
  info: { icon: Info, border: 'border-surface-line', bg: 'bg-surface', iconClass: 'text-slate-soft' },
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
      }, toast.duration ?? 5000)
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
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => {
        const tone = TONE[toast.tone] || TONE.info
        const Icon = tone.icon
        return (
          <div
            key={toast.id}
            className={`animate-rise pointer-events-auto flex items-start gap-3 rounded-xl border px-4 py-3 shadow-lg transition-opacity duration-150 ${tone.border} ${tone.bg}`}
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
