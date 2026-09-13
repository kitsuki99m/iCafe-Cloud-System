import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import { makePcId } from '../../lib/rates.js'

const inputClass =
  'w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50'

const BLANK = { label: '', ipAddress: '', spec: '' }

function validIpv4(value) {
  const ip = String(value || '').trim()
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every((part) => {
    if (part.length > 1 && part.startsWith('0')) return false
    const number = Number(part)
    return Number.isInteger(number) && number >= 0 && number <= 255
  })
}

// Cloud stations learn their LAN address from the paired Customer Station.
// Local-only Café Edge still needs a complete IP because its station identity
// is resolved on the LAN without Cloud pairing metadata.
export default function PcFormModal({ open, pc, onClose, onCreate, onSave, onRemove, existingPcs = [], cloudManaged = false }) {
  const [draft, setDraft] = useState(BLANK)
  const [removeArmed, setRemoveArmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!pc
  const canRemove = isEdit && pc.status !== 'occupied' && pc.status !== 'reserved' && !pc.session

  useEffect(() => {
    if (open) {
      setDraft(pc ? { label: pc.label, ipAddress: pc.ipAddress || '', spec: pc.spec ?? '' } : { ...BLANK })
      setRemoveArmed(false)
      setSaving(false)
      setError('')
    }
  }, [open, pc])

  const effectiveIp = draft.ipAddress.trim()
  const validIp = cloudManaged || validIpv4(effectiveIp)
  const duplicateIp = Boolean(effectiveIp) && existingPcs.some((item) => String(item.id) !== String(pc?.id ?? '') && String(item.ipAddress ?? '').trim() === effectiveIp)
  const generatedId = makePcId(draft.label)
  const duplicateId = !isEdit && existingPcs.some((item) => String(item.id) === String(generatedId))
  const valid = draft.label.trim() && validIp && !duplicateIp && !duplicateId

  async function handleSave() {
    if (!valid || saving) return
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        const patch = cloudManaged
          ? { label: draft.label, spec: draft.spec }
          : draft
        await onSave(pc.id, patch)
      } else {
        const id = generatedId
        if (!id) throw new Error('Enter a valid PC label.')
        await onCreate({ ...draft, id, ipAddress: cloudManaged ? '' : effectiveIp })
      }
      onClose()
    } catch (err) {
      setError(err?.message || 'Unable to save PC.')
    } finally {
      setSaving(false)
    }
  }

  async function handleRemoveClick() {
    if (!canRemove || saving) return
    if (!removeArmed) {
      setRemoveArmed(true)
      return
    }
    setSaving(true)
    setError('')
    try {
      await onRemove(pc.id)
      onClose()
    } catch (err) {
      setError(err?.message || 'Unable to remove PC.')
      setRemoveArmed(false)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      onSubmit={handleSave}
      canSubmit={Boolean(valid)}
      busy={saving}
      eyebrow="Floor Matrix"
      title={isEdit ? `Edit ${pc?.label ?? ''}` : 'Add PC'}
      footer={
        <>
          {isEdit && (
            <Button
              variant="danger"
              disabled={!canRemove || saving}
              onClick={handleRemoveClick}
              className="mr-auto"
              title={canRemove ? undefined : 'End the session before removing this unit'}
            >
              {saving ? 'Removing…' : removeArmed ? 'Confirm Remove' : 'Remove PC'}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" disabled={!valid || saving} onClick={handleSave}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add PC'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="eyebrow mb-1.5 block">Label</label>
          <input
            autoFocus
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="PC 17"
            className={inputClass}
          />
        </div>
        {!isEdit && draft.label.trim() && (
          <p className="text-xs text-slate-soft">PC ID will be generated automatically: <span className="font-mono text-ink-900">{makePcId(draft.label)}</span></p>
        )}

        {cloudManaged ? (
          <div className="rounded-xl border border-surface-line bg-surface-raised/45 px-3 py-3 text-xs leading-5 text-slate-soft">
            <p className="font-semibold text-ink-900">IP address is automatic</p>
            <p className="mt-1">{isEdit && effectiveIp ? <>Mapped address: <span className="font-mono text-ink-900">{effectiveIp}</span>. </> : null}The LAN address is reported by the paired Customer Station and should not be entered manually.</p>
          </div>
        ) : (
          <div>
            <label className="eyebrow mb-1.5 block">IP Address</label>
            <input
              value={draft.ipAddress}
              onChange={(e) => setDraft({ ...draft, ipAddress: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder="192.168.100.35"
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-slate-soft">Local-only Café Edge uses this full LAN address to identify the station.</p>
          </div>
        )}

        <div>
          <label className="eyebrow mb-1.5 block">Spec</label>
          <input
            value={draft.spec}
            onChange={(e) => setDraft({ ...draft, spec: e.target.value })}
            placeholder="i5 · RTX 3060"
            className={inputClass}
          />
        </div>
        {duplicateIp && <p className="text-xs font-medium text-ember-dim">That IP address is already assigned to another PC.</p>}
        {!cloudManaged && effectiveIp && !validIpv4(effectiveIp) && <p className="text-xs font-medium text-ember-dim">Enter a valid IPv4 address.</p>}
        {duplicateId && <p className="text-xs font-medium text-ember-dim">That PC label would create an ID already used by another PC.</p>}
        {error && <p className="rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">{error}</p>}
      </div>
    </Modal>
  )
}
