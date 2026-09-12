import { useEffect, useMemo, useState } from 'react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import BulkTargetPicker from './BulkTargetPicker.jsx'
import NumericInput from '../common/NumericInput.jsx'
import { positiveNumber } from '../../lib/numeric.js'
const TIER_RANK = { Regular: 0, Gold: 1, VIP: 2 }
const planTierRank = (plan) => TIER_RANK[String(plan?.customerTier ?? 'Regular')] ?? 0
export default function BulkTopUpSessionModal({ open, targets = [], ratePlans = [], onClose, onConfirm }) {
  const [selected, setSelected] = useState(new Set()); const [planId, setPlanId] = useState(''); const [amount, setAmount] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  const selectedTierRank = useMemo(() => [...selected].reduce((lowest, id) => {
    const target = targets.find((item) => String(item.id) === String(id))
    return Math.min(lowest, TIER_RANK[String(target?.tier ?? 'Regular')] ?? 0)
  }, TIER_RANK.VIP), [selected, targets])
  const eligibleRatePlans = useMemo(() => ratePlans.filter((item) => item.isActive !== false && planTierRank(item) <= selectedTierRank), [ratePlans, selectedTierRank])
  useEffect(() => { if (open) { setSelected(new Set()); setPlanId(ratePlans.find((item) => item.isActive !== false)?.id || ''); setAmount(''); setError('') } }, [open, ratePlans])
  useEffect(() => { if (open && !eligibleRatePlans.some((item) => String(item.id) === String(planId))) setPlanId(eligibleRatePlans[0]?.id || '') }, [open, eligibleRatePlans, planId])
  const plan = eligibleRatePlans.find((item) => String(item.id) === String(planId)); const isPackage = plan?.mode === 'package'; const parsedAmount = positiveNumber(amount); const valid = selected.size > 0 && plan && (isPackage ? Number(plan.amount) > 0 : parsedAmount !== null && parsedAmount >= Number(plan.minAmount || 0))
  async function submit() { if (!valid || saving) return; setError(''); setSaving(true); try { await onConfirm([...selected], planId, isPackage ? null : parsedAmount) } catch (submitError) { setError(submitError?.message || 'The bulk session top-up could not be completed. Try again.') } finally { setSaving(false) } }
  return <Modal open={open} onClose={onClose} busy={saving} onSubmit={submit} eyebrow="Bulk action" title="Top Up Session Time" footer={<><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || saving} onClick={submit}>{saving ? 'Processing…' : 'Add Time'}</Button></>}><div className="space-y-4"><BulkTargetPicker items={targets} selectedIds={selected} onChange={setSelected} searchPlaceholder="Search active sessions"/><div><label className="eyebrow mb-1.5 block">Rate plan</label><select value={planId} onChange={(event) => setPlanId(event.target.value)} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900">{eligibleRatePlans.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>{!isPackage && <div><label className="eyebrow mb-1.5 block">Amount per session</label><NumericInput min={plan?.minAmount || 1} step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900"/></div>}{error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{error}</p>}</div></Modal>
}
