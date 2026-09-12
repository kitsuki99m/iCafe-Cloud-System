import { useEffect, useMemo, useState } from 'react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'

export default function BulkAddPcModal({ open, onClose, onCreate, existingPcs = [] }) {
  const [prefix, setPrefix] = useState('192.168.100.')
  const [count, setCount] = useState('5')
  const [start, setStart] = useState('1')
  const [stationStart, setStationStart] = useState('1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!open) return
    setPrefix('192.168.100.')
    setCount('5')
    setStart('1')
    setStationStart('1')
    setError('')
  }, [open])
  const parsedPrefix = prefix.trim().replace(/\.$/, '')
  const octets = parsedPrefix.split('.').map(Number)
  const total = Math.min(50, Math.max(1, Number(count) || 1)); const first = Math.max(1, Math.min(254, Number(start) || 1)); const firstStation=Math.max(1,Math.floor(Number(stationStart)||1))
  const rows = useMemo(() => Array.from({ length:total },(_,index)=>({ label:`PC ${firstStation+index}`, ip:`${parsedPrefix}.${first+index}` })), [total,first,firstStation,parsedPrefix])
  const duplicateIp=rows.some((row) => existingPcs.some((pc) => pc.ipAddress === row.ip))
  const duplicateLabel=rows.some((row) => existingPcs.some((pc) => String(pc.label||'').trim().toLowerCase() === row.label.toLowerCase()))
  const valid = octets.length === 3 && octets.every((value) => Number.isInteger(value) && value >= 0 && value <= 255) && first + total - 1 <= 254 && !duplicateIp && !duplicateLabel
  async function create() { if (!valid) { setError(first + total - 1 > 254 ? 'The selected range cannot exceed 254 in the last octet.' : duplicateLabel ? 'One or more PC station numbers already exist.' : 'Use a valid three-octet prefix and avoid duplicate registered IPs.'); return } setSaving(true); setError(''); try { for (const row of rows) await onCreate({ label:row.label, ipAddress:row.ip, spec:'', status:'offline' }); onClose() } catch (err) { setError(err?.message || 'Unable to add all PCs.') } finally { setSaving(false) } }
  return <Modal open={open} onClose={() => !saving && onClose()} busy={saving} onSubmit={create} eyebrow="Floor Console" title="Bulk Add PCs" maxWidth="max-w-xl" footer={<><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving || !valid} onClick={create}>{saving ? 'Adding…' : `Add ${rows.length} PCs`}</Button></>}><div className="space-y-4"><p className="text-xs leading-5 text-slate-soft">Register a consecutive range of customer stations. Station numbers and IP last octets can start independently.</p>{error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{error}</p>}<div className="grid gap-3 sm:grid-cols-2"><div><label className="eyebrow mb-1.5 block">IP Prefix</label><input value={prefix} onChange={(e)=>setPrefix(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="192.168.100." className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"/></div><div><label className="eyebrow mb-1.5 block">Station # starting</label><input type="number" min="1" value={stationStart} onChange={(e)=>setStationStart(e.target.value)} placeholder="1" className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"/><p className="mt-1 text-[11px] text-slate-soft">Creates PC {firstStation}, PC {firstStation+1}, and so on.</p></div><div><label className="eyebrow mb-1.5 block">Number of PCs</label><input type="number" min="1" max="50" value={count} onChange={(e)=>setCount(e.target.value)} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"/></div><div><label className="eyebrow mb-1.5 block">Starting last octet</label><input type="number" min="1" max="254" value={start} onChange={(e)=>setStart(e.target.value)} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"/></div></div><div className="max-h-44 overflow-y-auto rounded-lg border border-surface-line bg-surface-raised/40"><div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 text-xs">{rows.map((row)=><div key={row.ip} className="flex justify-between gap-2"><span className="font-medium text-ink-900">{row.label}</span><span className="stat-figure text-slate-soft">{row.ip}</span></div>)}</div></div></div></Modal>
}
