import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import BulkTargetPicker from './BulkTargetPicker.jsx'
import NumericInput from '../common/NumericInput.jsx'
import { positiveNumber } from '../../lib/numeric.js'
export default function BulkTopUpWalletModal({ open, targets = [], onClose, onConfirm }) {
  const [selected, setSelected] = useState(new Set()); const [amount, setAmount] = useState(''); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (open) { setSelected(new Set()); setAmount(''); setError('') } }, [open])
  const parsedAmount = positiveNumber(amount); const valid = selected.size > 0 && parsedAmount !== null
  async function submit() { if (!valid || saving) return; setError(''); setSaving(true); try { await onConfirm([...selected], parsedAmount) } catch (submitError) { setError(submitError?.message || 'The bulk wallet top-up could not be completed. Try again.') } finally { setSaving(false) } }
  return <Modal open={open} onClose={onClose} busy={saving} onSubmit={submit} eyebrow="Bulk action" title="Top Up Wallets" footer={<><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || saving} onClick={submit}>{saving ? 'Processing…' : `Top Up ${selected.size || ''}`}</Button></>}><div className="space-y-4"><BulkTargetPicker items={targets} selectedIds={selected} onChange={setSelected} searchPlaceholder="Search members"/><div><label className="eyebrow mb-1.5 block">Amount per member</label><div className="mb-2 grid grid-cols-4 gap-1.5">{[5, 10, 15, 20].map((p) => (<button type="button" key={p} onClick={() => setAmount(String(p))} className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${Number(amount) === p ? 'border-gold/50 bg-gold/10 text-gold-dim' : 'border-surface-line text-slate-soft hover:text-ink-900'}`}>₱{p}</button>))}</div><NumericInput min="1" step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0" className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50"/></div>{error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{error}</p>}</div></Modal>
}
