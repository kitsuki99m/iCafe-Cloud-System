import { ChevronDown, Wallet, Banknote, Lock, Unlock, RotateCcw, Power, Trash2, Play } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import AnchoredPopover from '../common/AnchoredPopover.jsx'

const ICONS = { wallet: Wallet, session: Banknote, start: Play, lock: Lock, unlock: Unlock, restart: RotateCcw, shutdown: Power, remove: Trash2 }

export default function BulkActionsDropdown({ items = [], onAction, className = '' }) {
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const location = useLocation()

  useEffect(() => { setOpen(false) }, [location.pathname, location.search])

  return (
    <div className={`relative ${className}`}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-surface-line bg-surface-raised px-3 py-1.5 text-xs font-semibold text-ink-900 transition-colors hover:bg-surface-line shadow-xs cursor-pointer min-h-[34px]"
      >
        <span>Bulk actions</span>
        <ChevronDown size={14} className="text-slate-soft shrink-0" />
      </button>
      <AnchoredPopover open={open} anchorRef={trigger} onClose={() => setOpen(false)} className="w-64" ariaLabel="Bulk actions">
        <div className="px-2 pb-1 pt-1.5"><p className="eyebrow">Bulk actions</p></div>
        {items.map((item) => {
          const Icon = ICONS[item.icon] || Banknote
          return (
            <button
              role="menuitem"
              type="button"
              key={item.id}
              disabled={item.disabled}
              onClick={() => { setOpen(false); window.requestAnimationFrame(() => onAction(item.id)) }}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-raised disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-gold-dim"><Icon size={15}/></span>
              <span className="min-w-0"><span className="block text-sm font-medium text-ink-900">{item.label}</span>{item.hint && <span className="mt-0.5 block text-[11px] leading-4 text-slate-soft">{item.hint}</span>}</span>
            </button>
          )
        })}
      </AnchoredPopover>
    </div>
  )
}
