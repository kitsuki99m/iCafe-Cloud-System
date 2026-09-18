import { CheckCircle2, X } from 'lucide-react'

export default function RealtimeToast({ toast, onClose }) {
  if (!toast) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[1000] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[300px]">
      <div className="pointer-events-auto flex w-full items-start gap-2.5 rounded-xl border border-teal/30 bg-surface/95 backdrop-blur-sm px-3 py-2 shadow-md">
        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-teal-dim" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-ink-900 tracking-tight leading-tight">{toast.title}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-soft line-clamp-2">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-0.5 text-slate-soft/60 hover:bg-surface-raised hover:text-ink-900 transition-colors"
          aria-label="Dismiss notification"
        >
          <X size={12} />
        </button>
      </div>
    </div>
  )
}

