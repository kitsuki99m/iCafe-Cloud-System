import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import { makePcId } from '../../lib/rates.js'

const inputClass =
  'w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50'

const BLANK = { label: '', ipAddress: '', spec: '' }
const DEFAULT_CREATE_PREFIX = '192.168.100.'

function normalizeCreatePrefix(value) {
  return String(value || '').trim().replace(/\.+$/, '')
}

function validCreatePrefix(value) {
  const parts = normalizeCreatePrefix(value).split('.')
  return parts.length === 3 && parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false
    if (part.length > 1 && part.startsWith('0')) return false
    const number = Number(part)
    return Number.isInteger(number) && number >= 0 && number <= 255
  })
}

function composeCreateIp(prefix, lastOctet) {
  const base = normalizeCreatePrefix(prefix)
  const last = String(lastOctet ?? '').trim()
  return base && last ? `${base}.${last}` : ''
}

function validIpv4(value) {
  const ip = String(value || '').trim()
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every((part) => {
    if (part.length > 1 && part.startsWith('0')) return false
    const number = Number(part)
    return Number.isInteger(number) && number >= 0 && number <= 255
  })
}

// Add/edit/remove floor units. Creation owns its prefix locally; editing an
// existing station keeps the clearer full-IP workflow.
export default function PcFormModal({ open, pc, onClose, onCreate, onSave, onRemove, existingPcs = [] }) {
  const [draft, setDraft] = useState(BLANK)
  const [createPrefix, setCreatePrefix] = useState(DEFAULT_CREATE_PREFIX)
  const [createLastOctet, setCreateLastOctet] = useState('')
  const [removeArmed, setRemoveArmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = !!pc
  const canRemove = isEdit && pc.status !== 'occupied' && pc.status !== 'reserved' && !pc.session

  useEffect(() => {
    if (open) {
      setDraft(pc ? { label: pc.label, ipAddress: pc.ipAddress, spec: pc.spec ?? '' } : { ...BLANK })
      if (!pc) {
        setCreatePrefix(DEFAULT_CREATE_PREFIX)
        setCreateLastOctet('')
      }
      setRemoveArmed(false)
      setSaving(false)
      setError('')
    }
  }, [open, pc])

  const lastOctetNumber = Number(createLastOctet)
  const createIp = composeCreateIp(createPrefix, createLastOctet)
  const effectiveIp = isEdit ? draft.ipAddress.trim() : createIp
  const validCreateAddress = validCreatePrefix(createPrefix)
    && /^\d{1,3}$/.test(String(createLastOctet).trim())
    && Number.isInteger(lastOctetNumber)
    && lastOctetNumber >= 1
    && lastOctetNumber <= 254
  const validIp = isEdit ? validIpv4(effectiveIp) : validCreateAddress && validIpv4(effectiveIp)
  const duplicateIp = existingPcs.some((item) => String(item.id) !== String(pc?.id ?? '') && String(item.ipAddress ?? '').trim() === effectiveIp)
  const generatedId = makePcId(draft.label)
  const duplicateId = !isEdit && existingPcs.some((item) => String(item.id) === String(generatedId))
  const valid = draft.label.trim() && validIp && !duplicateIp && !duplicateId

  async function handleSave() {
    if (!valid || saving) return
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        await onSave(pc.id, draft)
      } else {
        const id = generatedId
        if (!id) throw new Error('Enter a valid PC label.')
        await onCreate({ ...draft, id, ipAddress: composeCreateIp(createPrefix, createLastOctet) })
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
        {isEdit ? (
          <div>
            <label className="eyebrow mb-1.5 block">IP Address</label>
            <input
              value={draft.ipAddress}
              onChange={(e) => setDraft({ ...draft, ipAddress: e.target.value.replace(/[^0-9.]/g, '') })}
              placeholder="192.168.100.35"
              className={inputClass}
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
            <div>
              <label className="eyebrow mb-1.5 block">IP Prefix</label>
              <input
                value={createPrefix}
                onChange={(e) => setCreatePrefix(e.target.value.replace(/[^0-9.]/g, ''))}
                placeholder="192.168.100."
                className={inputClass}
              />
            </div>
            <div>
              <label className="eyebrow mb-1.5 block">Last Octet</label>
              <input
                type="number"
                min="1"
                max="254"
                value={createLastOctet}
                onChange={(e) => setCreateLastOctet(e.target.value)}
                placeholder="35"
                className={inputClass}
              />
            </div>
          </div>
        )}
        {!isEdit && createPrefix && createLastOctet && (
          <p className="text-xs text-slate-soft">Station address: <span className="font-mono text-ink-900">{createIp}</span></p>
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
        {duplicateId && <p className="text-xs font-medium text-ember-dim">That PC label would create an ID already used by another PC.</p>}
        {!isEdit && createLastOctet && !validCreateAddress && <p className="text-xs font-medium text-ember-dim">Enter a valid three-octet prefix and a last octet from 1 to 254.</p>}
        {error && <p className="rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">{error}</p>}
        {isEdit && !canRemove && (
          <p className="text-xs text-slate-soft">This unit still has an active/reserved session or is currently {pc.status} — end or clear that session before it can be removed.</p>
        )}
      </div>
    </Modal>
  )
}
