import { useEffect, useRef, useState } from 'react'
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { subscribeToast } from '../../lib/toast.js'

const TONE = {
  success: { icon: CheckCircle2, border: 'border-teal/30', bg: 'bg-surface/95 backdrop-blur-sm', iconClass: 'text-teal-dim' },
  error: { icon: XCircle, border: 'border-ember/30', bg: 'bg-surface/95 backdrop-blur-sm', iconClass: 'text-ember-dim' },
  warning: { icon: AlertCircle, border: 'border-gold/30', bg: 'bg-surface/95 backdrop-blur-sm', iconClass: 'text-gold-dim' },
  info: { icon: Info, border: 'border-surface-line', bg: 'bg-surface/95 backdrop-blur-sm', iconClass: 'text-slate-soft' },
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
      }, toast.duration ?? 4500)
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
    <div className="pointer-events-none fixed bottom-4 right-4 z-[1000] flex w-[min(300px,calc(100vw-1.5rem))] flex-col gap-1.5">
      {toasts.map((toast) => {
        const tone = TONE[toast.tone] || TONE.info
        const Icon = tone.icon
        return (
          <div
            key={toast.id}
            className={`animate-rise pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3 py-2 shadow-md transition-opacity duration-150 ${tone.border} ${tone.bg}`}
            role="status"
          >
            <Icon size={14} className={`mt-0.5 shrink-0 ${tone.iconClass}`} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-ink-900 tracking-tight leading-tight">{toast.title}</p>
              {toast.message ? <p className="mt-0.5 text-[11px] leading-snug text-slate-soft line-clamp-2">{toast.message}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="rounded-md p-0.5 text-slate-soft/60 hover:bg-surface-raised hover:text-ink-900 transition-colors"
              aria-label="Dismiss notification"
            >
              <X size={12} />
            </button>
          </div>
        )
      })}
    </div>
  )
}

