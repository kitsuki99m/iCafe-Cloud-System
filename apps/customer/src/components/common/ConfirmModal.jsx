import { AlertTriangle } from 'lucide-react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  eyebrow,
}) {
  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      eyebrow={eyebrow}
      title={title}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{cancelLabel}</Button>
          <Button variant={variant} onClick={onConfirm} disabled={busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3 rounded-lg border border-gold/30 bg-gold/10 p-3">
        <div className="mt-0.5 shrink-0 rounded-full bg-gold/15 p-1.5 text-gold-dim">
          <AlertTriangle size={16} />
        </div>
        <div className="min-w-0 text-sm leading-relaxed text-slate-soft">{message}</div>
      </div>
    </Modal>
  )
}
