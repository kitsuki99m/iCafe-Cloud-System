import { AlertTriangle } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  tone,
  busy = false,
  eyebrow,
}) {
  const content = message || description || children
  const btnVariant = variant || (tone === 'danger' ? 'danger' : 'primary')

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      busy={busy}
      eyebrow={eyebrow}
      title={title}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={btnVariant} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 rounded-xl border border-surface-line bg-surface-raised/55 p-3">
        <div className="mt-0.5 shrink-0 rounded-lg bg-gold/10 p-1.5 text-gold-dim">
          <AlertTriangle size={16} />
        </div>
        <div className="min-w-0 text-xs leading-5 text-slate-soft">{content}</div>
      </div>
    </Modal>
  )
}
