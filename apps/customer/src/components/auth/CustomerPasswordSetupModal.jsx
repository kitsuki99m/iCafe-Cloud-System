import { useEffect, useState } from 'react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import PasswordInput from '../common/PasswordInput.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

const inputClass = 'w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:border-gold/50 focus:outline-none'

export default function CustomerPasswordSetupModal() {
  const {
    showCustomerPasswordSetup,
    completeCustomerPasswordSetup,
    deferCustomerPasswordSetup,
  } = useAuth()
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!showCustomerPasswordSetup) return
    setNewPassword('')
    setConfirmPassword('')
    setBusy(false)
    setError('')
  }, [showCustomerPasswordSetup])

  const valid = newPassword.length > 0 && newPassword === confirmPassword

  async function submit() {
    if (busy) return
    if (!newPassword.length) {
      setError('Enter a new password.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    setBusy(true)
    setError('')
    const result = await completeCustomerPasswordSetup(newPassword)
    if (!result.ok) setError(result.error || 'Unable to change your password.')
    setBusy(false)
  }

  function setLater() {
    if (busy) return
    deferCustomerPasswordSetup()
  }

  return (
    <Modal
      open={showCustomerPasswordSetup}
      onClose={() => {}}
      onSubmit={submit}
      canSubmit={valid}
      busy={busy}
      eyebrow="Account security"
      title="Create your password"
      description="Replace the temporary password."
      maxWidth="max-w-md"
      zIndexClass="z-[575]"
      showCloseButton={false}
      closeOnBackdrop={false}
      closeOnEscape={false}
      footer={
        <>
          <Button variant="ghost" disabled={busy} onClick={setLater}>Set Later</Button>
          <Button variant="primary" disabled={!valid || busy} onClick={submit}>{busy ? 'Submitting…' : 'Submit'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="eyebrow mb-1.5 block">New Password</label>
          <PasswordInput
            autoFocus
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            placeholder="Enter new password"
            autoComplete="new-password"
            inputClassName={inputClass}
          />
        </div>
        <div>
          <label className="eyebrow mb-1.5 block">Confirm New Password</label>
          <PasswordInput
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Re-enter new password"
            autoComplete="new-password"
            inputClassName={inputClass}
          />
        </div>
        {error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">{error}</p>}
      </div>
    </Modal>
  )
}
