import { useEffect, useRef, useState } from 'react'
import Modal from '../common/Modal.jsx'
import ConfirmModal from '../common/ConfirmModal.jsx'
import Button from '../common/Button.jsx'
import { createOperationKey } from '../../lib/api.js'

const inputClass =
  'w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50'

const BLANK = { pcNumber: '', label: '', ipAddress: '', spec: '' }

function validIpv4(value) {
  const ip = String(value || '').trim()
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip) && ip.split('.').every((part) => {
    if (part.length > 1 && part.startsWith('0')) return false
    const number = Number(part)
    return Number.isInteger(number) && number >= 0 && number <= 255
  })
}

function stationNumber(value) {
  const text = String(value ?? '').trim()
  if (!/^\d+$/.test(text)) return null
  const number = Number(text)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function pcNumberFor(pc) {
  const explicit = stationNumber(pc?.pcNumber ?? pc?.pc_number)
  if (explicit) return explicit
  const match = String(pc?.label ?? pc?.id ?? '').match(/\d+/)
  return match ? stationNumber(match[0]) : null
}

function isTransientCreateGhost(pc) {
  return Boolean(pc?.pending) && !pc?.createdAt && !pc?.created_at
}

function nextStationNumber(existingPcs = []) {
  const used = new Set(existingPcs.filter((pc) => !isTransientCreateGhost(pc)).map(pcNumberFor).filter(Boolean))
  let number = 1
  while (used.has(number)) number += 1
  return number
}

const pcLabel = (number) => `PC - ${number}`
const pcId = (number) => `pc-${number}`

// Cloud stations learn their LAN address from the paired Customer Station.
// Local-only Café Edge still needs a complete IP because its station identity
// is resolved on the LAN without Cloud pairing metadata.
export default function PcFormModal({ open, pc, onClose, onCreate, onSave, onRemove, existingPcs = [], cloudManaged = false }) {
  const [draft, setDraft] = useState(BLANK)
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const saveInFlightRef = useRef(false)
  const createOperationKeyRef = useRef(null)
  const isEdit = !!pc
  const canRemove = isEdit && pc.status !== 'occupied' && pc.status !== 'reserved' && !pc.session

  useEffect(() => {
    if (open) {
      setDraft(pc
        ? { pcNumber: String(pcNumberFor(pc) ?? ''), label: pc.label, ipAddress: pc.ipAddress || '', spec: pc.spec ?? '' }
        : { ...BLANK, pcNumber: String(nextStationNumber(existingPcs)) })
      setRemoveConfirmOpen(false)
      setSaving(false)
      saveInFlightRef.current = false
      createOperationKeyRef.current = pc ? null : createOperationKey()
      setError('')
    }
  }, [open, pc])

  const effectiveIp = draft.ipAddress.trim()
  const validIp = cloudManaged || validIpv4(effectiveIp)
  const confirmedPcs = existingPcs.filter((item) => !isTransientCreateGhost(item))
  const duplicateIp = Boolean(effectiveIp) && confirmedPcs.some((item) => String(item.id) !== String(pc?.id ?? '') && String(item.ipAddress ?? '').trim() === effectiveIp)
  const createNumber = stationNumber(draft.pcNumber)
  const generatedId = createNumber ? pcId(createNumber) : null
  const duplicateNumber = !isEdit && Boolean(createNumber) && confirmedPcs.some((item) => pcNumberFor(item) === createNumber)
  const duplicateId = !isEdit && Boolean(generatedId) && confirmedPcs.some((item) => String(item.id) === String(generatedId))
  const valid = (isEdit ? Boolean(draft.label.trim()) : Boolean(createNumber)) && validIp && !duplicateIp && !duplicateNumber && !duplicateId

  async function handleSave() {
    if (!valid || saving || saveInFlightRef.current) return
    saveInFlightRef.current = true
    setSaving(true)
    setError('')
    try {
      if (isEdit) {
        const patch = cloudManaged
          ? { label: draft.label, spec: draft.spec }
          : draft
        await onSave(pc.id, patch)
      } else {
        if (!createNumber || !generatedId) throw new Error('Enter a valid PC number.')
        const operationKey = createOperationKeyRef.current || createOperationKey()
        createOperationKeyRef.current = operationKey
        await onCreate({
          id: generatedId,
          pcNumber: String(createNumber),
          label: pcLabel(createNumber),
          ipAddress: cloudManaged ? '' : effectiveIp,
          spec: draft.spec,
          status: 'offline',
        }, { operationKey })
      }
      onClose()
    } catch (err) {
      setError(err?.message || 'Unable to save PC.')
    } finally {
      saveInFlightRef.current = false
      setSaving(false)
    }
  }

  async function handleRemoveConfirmed() {
    if (!canRemove || saving) return
    setSaving(true)
    setError('')
    try {
      await onRemove(pc.id)
      setRemoveConfirmOpen(false)
      onClose()
    } catch (err) {
      setError(err?.message || 'Unable to remove PC.')
      setRemoveConfirmOpen(false)
    } finally {
      setSaving(false)
    }
  }


  return (
    <>
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
              onClick={() => setRemoveConfirmOpen(true)}
              className="mr-auto"
              title={canRemove ? undefined : 'End the session before removing this unit'}
            >
              {saving ? 'Removing…' : 'Remove PC'}
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
        {isEdit ? (
          <div>
            <label className="eyebrow mb-1.5 block">Label</label>
            <input
              autoFocus
              value={draft.label}
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              placeholder="PC - 1"
              className={inputClass}
            />
          </div>
        ) : (
          <div>
            <label className="eyebrow mb-1.5 block">PC number</label>
            <div className="flex overflow-hidden rounded-lg border border-surface-line bg-ink focus-within:border-gold/50">
              <span className="flex items-center border-r border-surface-line bg-surface-raised px-3 text-sm font-semibold text-slate-soft">PC -</span>
              <input
                autoFocus
                type="number"
                min="1"
                step="1"
                value={draft.pcNumber}
                onChange={(e) => { createOperationKeyRef.current = createOperationKey(); setDraft({ ...draft, pcNumber: e.target.value.replace(/[^0-9]/g, '') }) }}
                placeholder="1"
                className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-ink-900 outline-none"
              />
            </div>
            {createNumber ? <p className="mt-1 text-[11px] text-slate-soft">Station: <span className="font-semibold text-ink-900">{pcLabel(createNumber)}</span> · ID <span className="font-mono text-ink-900">{generatedId}</span></p> : null}
          </div>
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
              onChange={(e) => { if (!isEdit) createOperationKeyRef.current = createOperationKey(); setDraft({ ...draft, ipAddress: e.target.value.replace(/[^0-9.]/g, '') }) }}
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
            onChange={(e) => { if (!isEdit) createOperationKeyRef.current = createOperationKey(); setDraft({ ...draft, spec: e.target.value }) }}
            placeholder="i5 · RTX 3060"
            className={inputClass}
          />
        </div>
        {duplicateIp && <p className="text-xs font-medium text-ember-dim">That IP address is already assigned to another PC.</p>}
        {!cloudManaged && effectiveIp && !validIpv4(effectiveIp) && <p className="text-xs font-medium text-ember-dim">Enter a valid IPv4 address.</p>}
        {duplicateNumber && <p className="text-xs font-medium text-ember-dim">PC - {createNumber} already exists.</p>}
        {!duplicateNumber && duplicateId && <p className="text-xs font-medium text-ember-dim">That PC number is already in use.</p>}
        {error && <p className="rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">{error}</p>}
      </div>
    </Modal>
    <ConfirmModal
      open={removeConfirmOpen}
      onClose={() => !saving && setRemoveConfirmOpen(false)}
      onConfirm={handleRemoveConfirmed}
      busy={saving}
      eyebrow="Floor Matrix"
      title={`Remove ${pc?.label || 'this PC'}?`}
      message="This removes the station from the branch floor and invalidates its current pairing. Active or reserved PCs must be ended first."
      confirmLabel="Remove PC"
      variant="danger"
    />
    </>
  )
}
