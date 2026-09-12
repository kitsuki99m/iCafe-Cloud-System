import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import BulkTargetPicker from './BulkTargetPicker.jsx'

export default function BulkPowerModal({ open, command, targets = [], onClose, onConfirm }) {
  const [selected, setSelected] = useState(new Set()); const [saving, setSaving] = useState(false); const [error, setError] = useState('')
  useEffect(() => { if (open) { setSelected(new Set()); setError('') } }, [open, command])
  async function submit() { if (!selected.size || saving) return; setError(''); setSaving(true); try { await onConfirm([...selected]) } catch (submitError) { setError(submitError?.message || 'The bulk action could not be completed. Review the station status and try again.') } finally { setSaving(false) } }
  const label = command === 'restart' ? 'Restart' : command === 'shutdown' ? 'Shutdown' : command === 'remove' ? 'Remove' : command === 'lock' ? 'Lock' : 'Unlock'
  return <Modal open={open} onClose={onClose} busy={saving} onSubmit={submit} eyebrow="Bulk action" title={`${label} ${command === 'remove' ? 'PCs' : 'Stations'}`} footer={<><Button variant="ghost" disabled={saving} onClick={onClose}>Cancel</Button><Button variant={command === 'shutdown' || command === 'remove' ? 'danger' : 'primary'} disabled={!selected.size || saving} onClick={submit}>{saving ? 'Processing…' : `${label} ${selected.size || ''}`}</Button></>}><BulkTargetPicker items={targets} selectedIds={selected} onChange={setSelected} searchPlaceholder="Search stations" />{command === 'remove' && <p className="mt-3 rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">Only available, maintenance, or offline PCs can be removed. Active and reserved stations are excluded.</p>}{error && <p className="mt-3 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{error}</p>}</Modal>
}
