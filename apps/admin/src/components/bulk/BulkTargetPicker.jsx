import { useMemo, useState } from 'react'
import { CheckSquare, Square } from 'lucide-react'

export default function BulkTargetPicker({ items = [], selectedIds, onChange, searchPlaceholder = 'Search targets' }) {
  const [query, setQuery] = useState('')
  const selected = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || [])
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    return value ? items.filter((item) => [item.label, item.sublabel, item.hint].filter(Boolean).join(' ').toLowerCase().includes(value)) : items
  }, [items, query])
  const selectable = filtered.filter((item) => !item.disabled)
  const allSelected = selectable.length > 0 && selectable.every((item) => selected.has(item.id))
  const toggle = (id, disabled) => {
    if (disabled) return
    const next = new Set(selected)
    next.has(id) ? next.delete(id) : next.add(id)
    onChange(next)
  }
  return <div className="space-y-2"><div className="flex gap-2"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} className="w-full rounded-lg border-2 border-surface-line bg-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50"/><button type="button" onClick={() => onChange(allSelected ? new Set() : new Set(selectable.map((item) => item.id)))} className="shrink-0 rounded-lg border border-surface-line px-3 py-2 text-xs font-semibold text-slate-soft hover:bg-surface-raised">{allSelected ? 'Clear' : 'Select all'}</button></div><div className="max-h-56 overflow-y-auto rounded-lg border-2 border-surface-line bg-surface">{filtered.length ? filtered.map((item) => <button type="button" key={item.id} disabled={item.disabled} onClick={() => toggle(item.id, item.disabled)} className={`flex w-full items-center gap-3 border-b border-surface-line/70 px-3 py-2.5 text-left last:border-0 ${item.disabled ? 'cursor-not-allowed opacity-45' : 'hover:bg-surface-raised'}`}><span className="text-gold-dim">{selected.has(item.id) ? <CheckSquare size={17}/> : <Square size={17}/>}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-ink-900">{item.label}</span>{item.sublabel && <span className="block truncate text-xs text-slate-soft">{item.sublabel}</span>}{item.hint && <span className="block text-[11px] text-ember-dim">{item.hint}</span>}</span></button>) : <p className="px-3 py-5 text-center text-sm text-slate-soft">No eligible targets.</p>}</div><p className="text-xs text-slate-soft">{selected.size} selected</p></div>
}
