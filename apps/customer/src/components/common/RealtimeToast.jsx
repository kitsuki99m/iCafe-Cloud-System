import { CheckCircle2, X } from 'lucide-react'

export default function RealtimeToast({ toast, onClose }) {
  if (!toast) return null

  return (
    <div className="pointer-events-none fixed inset-x-4 top-4 z-[1000] flex justify-center sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[360px]">
      <div className="pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-teal/30 bg-surface px-4 py-3 shadow-glow-teal">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-teal-dim" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-soft">{toast.message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1 text-slate-soft hover:bg-surface-raised hover:text-ink-900"
          aria-label="Dismiss notification"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  )
}
