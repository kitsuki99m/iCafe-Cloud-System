import { useMemo, useRef, useState } from 'react'
import { Monitor, Search, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAppData } from '../../context/AppDataContext.jsx'
import AnchoredPopover from '../common/AnchoredPopover.jsx'

export default function AdminQuickFind() {
  const { pcs = [], members = [] } = useAppData()
  const navigate = useNavigate()
  const anchorRef = useRef(null)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const term = query.trim().toLowerCase()

  const results = useMemo(() => {
    if (!term) return { pcs:[], members:[] }
    const pcResults = pcs.filter((pc) => [pc.label, pc.ipAddress, pc.session?.customerName, pc.session?.username].some((value) => String(value || '').toLowerCase().includes(term))).slice(0, 4)
    const memberResults = members.filter((member) => [member.name, member.username, member.memberCode, member.phone, member.email].some((value) => String(value || '').toLowerCase().includes(term))).slice(0, 4)
    return { pcs:pcResults, members:memberResults }
  }, [members, pcs, term])

  const open = focused && Boolean(term)
  const empty = open && results.pcs.length === 0 && results.members.length === 0
  const close = () => setFocused(false)
  const goPc = (pc) => { setQuery(''); close(); navigate(`/clients?pc=${encodeURIComponent(pc.id)}`) }
  const goMember = (member) => { setQuery(''); close(); navigate(`/members?member=${encodeURIComponent(member.id)}`) }

  return <div ref={anchorRef} className="admin-quick-find relative hidden w-full max-w-[360px] xl:block">
    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-soft" />
    <input
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      onFocus={() => setFocused(true)}
      onKeyDown={(event) => {
        if (event.key === 'Escape') { setQuery(''); close() }
        if (event.key === 'Enter') {
          const first = results.pcs[0] || results.members[0]
          if (!first) return
          if (results.pcs[0]) goPc(results.pcs[0]); else goMember(results.members[0])
        }
      }}
      placeholder="Search PCs and members"
      aria-label="Search PCs and members"
      className="h-10 w-full rounded-full border border-surface-line bg-surface pl-9 pr-4 text-xs text-ink-900 outline-none transition-colors placeholder:text-slate-soft focus:border-midnight/45"
    />
    <AnchoredPopover open={open} anchorRef={anchorRef} onClose={close} placement="bottom-start" className="w-[360px] p-2" ariaLabel="Quick Find results">
      <div className="px-2 pb-1 pt-1"><p className="eyebrow">Quick Find</p></div>
      {results.pcs.length > 0 && <div className="mb-1"><p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">PCs</p>{results.pcs.map((pc) => <button key={pc.id} type="button" onClick={() => goPc(pc)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-raised"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-raised text-gold-dim"><Monitor size={15}/></span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-ink-900">{pc.label}</span><span className="block truncate text-[10px] text-slate-soft">{pc.ipAddress} · {pc.status === 'occupied' ? 'In use' : pc.status}</span></span></button>)}</div>}
      {results.members.length > 0 && <div><p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-soft">Members</p>{results.members.map((member) => <button key={member.id} type="button" onClick={() => goMember(member)} className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left hover:bg-surface-raised"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-raised text-grape"><UserRound size={15}/></span><span className="min-w-0"><span className="block truncate text-xs font-semibold text-ink-900">{member.name}</span><span className="block truncate text-[10px] text-slate-soft">{member.username || member.memberCode || 'Member'} · {member.tier || 'Regular'}</span></span></button>)}</div>}
      {empty && <div className="px-3 py-6 text-center text-xs text-slate-soft">No PC or member matches “{query.trim()}”.</div>}
    </AnchoredPopover>
  </div>
}
