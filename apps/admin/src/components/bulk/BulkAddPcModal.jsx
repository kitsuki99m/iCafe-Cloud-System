import { useEffect, useMemo, useState } from 'react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'

function parseIpv4(value) {
  const text = String(value || '').trim()
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(text)) return null
  const octets = text.split('.').map(Number)
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null
  return octets
}

export default function BulkAddPcModal({ open, onClose, onCreate, existingPcs = [], cloudManaged = false }) {
  const [stationStart, setStationStart] = useState('1')
  const [count, setCount] = useState('5')
  const [startingIp, setStartingIp] = useState('192.168.100.1')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStationStart('1')
    setCount('5')
    setStartingIp('192.168.100.1')
    setSaving(false)
    setError('')
  }, [open])

  const total = Math.max(1, Math.min(50, Math.trunc(Number(count) || 1)))
  const firstStation = Math.max(1, Math.trunc(Number(stationStart) || 1))
  const baseIp = parseIpv4(startingIp)
  const rows = useMemo(() => Array.from({ length: total }, (_, index) => {
    const number = firstStation + index
    const label = `PC - ${number}`
    if (cloudManaged || !baseIp) return { number, label, ip: '' }
    return { number, label, ip: `${baseIp[0]}.${baseIp[1]}.${baseIp[2]}.${baseIp[3] + index}` }
  }), [total, firstStation, startingIp, cloudManaged])

  const ipRangeValid = cloudManaged || Boolean(baseIp && baseIp[3] >= 1 && baseIp[3] + total - 1 <= 254)
  const duplicateLabel = rows.some((row) => existingPcs.some((pc) => {
    const explicit = Number.parseInt(String(pc.pcNumber ?? pc.pc_number ?? ''), 10)
    const fallback = String(pc.label ?? pc.id ?? '').match(/\d+/)
    const existingNumber = Number.isInteger(explicit) && explicit > 0 ? explicit : fallback ? Number.parseInt(fallback[0], 10) : null
    return existingNumber === row.number
  }))
  const duplicateIp = !cloudManaged && rows.some((row) => row.ip && existingPcs.some((pc) => String(pc.ipAddress || '').trim() === row.ip))
  const valid = ipRangeValid && !duplicateLabel && !duplicateIp

  async function create() {
    if (!valid) {
      setError(!ipRangeValid
        ? 'Use a valid starting IPv4 address whose generated range stays between .1 and .254.'
        : duplicateLabel
          ? 'One or more PC station numbers already exist.'
          : 'One or more generated IP addresses are already registered.')
      return
    }
    setSaving(true)
    setError('')
    try {
      for (const row of rows) await onCreate({ id:`pc-${row.number}`, pcNumber:String(row.number), label:row.label, ipAddress:cloudManaged ? '' : row.ip, spec:'', status:'offline' })
      onClose()
    } catch (err) {
      setError(err?.message || 'Unable to add all PCs.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !saving && onClose()}
      busy={saving}
      onSubmit={create}
      eyebrow="Floor Console"
      title="Bulk Add PCs"
      maxWidth="max-w-xl"
      footer={<><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={saving || !valid} onClick={create}>{saving ? 'Adding…' : `Add ${rows.length} PCs`}</Button></>}
    >
      <div className="space-y-4">
        <p className="text-xs leading-5 text-slate-soft">{cloudManaged ? 'Register consecutive logical PCs. Their LAN addresses are mapped automatically after each Customer Station is paired.' : 'Register consecutive local Café Edge stations from one full starting IPv4 address.'}</p>
        {error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="eyebrow mb-1.5 block">Station # starting</label>
            <input type="number" min="1" value={stationStart} onChange={(e) => setStationStart(e.target.value)} placeholder="1" className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"/>
            <p className="mt-1 text-[11px] text-slate-soft">Creates PC - {firstStation}, PC - {firstStation + 1}, and so on.</p>
          </div>
          <div>
            <label className="eyebrow mb-1.5 block">Number of PCs</label>
            <input type="number" min="1" max="50" value={count} onChange={(e) => setCount(e.target.value)} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"/>
          </div>
          {!cloudManaged && (
            <div className="sm:col-span-2">
              <label className="eyebrow mb-1.5 block">Starting IP Address</label>
              <input value={startingIp} onChange={(e) => setStartingIp(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="192.168.100.1" className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"/>
              <p className="mt-1 text-[11px] text-slate-soft">Only the last octet increments for each station. There is no shared IP-prefix setting.</p>
            </div>
          )}
        </div>
        <div className="max-h-44 overflow-y-auto rounded-lg border border-surface-line bg-surface-raised/40">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 px-3 py-2 text-xs">
            {rows.map((row) => <div key={row.label} className="flex justify-between gap-2"><span className="font-medium text-ink-900">{row.label}</span><span className="stat-figure text-slate-soft">{cloudManaged ? 'IP after pairing' : row.ip || 'Invalid IP'}</span></div>)}
          </div>
        </div>
      </div>
    </Modal>
  )
}
