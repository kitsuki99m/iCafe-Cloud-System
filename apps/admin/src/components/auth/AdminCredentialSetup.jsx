import { useEffect, useRef, useState } from 'react'
import { AlertCircle, LockKeyhole } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import Button from '../common/Button.jsx'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export default function AdminCredentialSetup() {
  const { setupCredentials } = useAuth()
  const [method, setMethod] = useState('pin')
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const dialogRef = useRef(null)

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      dialog?.querySelector(FOCUSABLE)?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  const canSubmit = method === 'pin'
    ? /^\d{4,8}$/.test(pin)
    : Boolean(username.trim() && password && (method === 'password' || /^\d{4,8}$/.test(pin)))

  function containFocus(event) {
    if (event.key !== 'Tab') return
    const focusable = [...(dialogRef.current?.querySelectorAll(FOCUSABLE) ?? [])]
    if (!focusable.length) { event.preventDefault(); dialogRef.current?.focus(); return }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  async function submit(event) {
    event.preventDefault()
    if (busy || !canSubmit) return
    setBusy(true)
    setError('')
    try {
      const result = await setupCredentials({ method, username, password, pin })
      if (!result.ok) setError(result.error)
    } finally {
      setBusy(false)
    }
  }

  return <div className="fixed inset-0 z-[500] flex items-center justify-center bg-midnight/70 p-3 backdrop-blur-[2px] sm:p-6">
    <div ref={dialogRef} tabIndex={-1} onKeyDown={containFocus} className="admin-modal-shell w-full max-w-md overflow-hidden" role="dialog" aria-modal="true" aria-busy={busy ? 'true' : undefined} aria-labelledby="admin-credential-setup-title">
      <div className="admin-modal-header">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/10 text-gold-dim"><LockKeyhole size={18}/></span>
          <div>
            <p className="eyebrow mb-1">First-time security</p>
            <h2 id="admin-credential-setup-title" className="admin-modal-title font-display font-semibold text-ink-900">Set up your admin login</h2>
            <p className="admin-modal-description">Choose the sign-in method staff will use for this admin console.</p>
          </div>
        </div>
      </div>

      <form onSubmit={submit}>
        <div className="admin-modal-body space-y-4">
          <div className="admin-segmented-control grid grid-cols-3">
            {[
              ['pin','PIN only'],
              ['password','Password'],
              ['pin_password','PIN + Password'],
            ].map(([value,label]) => <button
              type="button"
              key={value}
              disabled={busy}
              onClick={() => setMethod(value)}
              className={`rounded-md px-2 py-2 text-[11px] font-semibold transition-colors ${method===value ? 'bg-midnight text-soft-white' : 'text-slate-soft hover:text-ink-900'}`}
            >{label}</button>)}
          </div>

          {error && <p className="flex gap-1.5 rounded-lg bg-ember/10 px-3 py-2 text-xs text-ember-dim"><AlertCircle size={13}/>{error}</p>}

          <label className="block">
            <span className="eyebrow mb-1.5 block">Username</span>
            <input value={username} onChange={event=>setUsername(event.target.value)} disabled={method==='pin' || busy} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 disabled:opacity-50"/>
          </label>

          {method !== 'pin' && <label className="block">
            <span className="eyebrow mb-1.5 block">New password</span>
            <input type="password" value={password} onChange={event=>setPassword(event.target.value)} disabled={busy} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900"/>
          </label>}

          {method !== 'password' && <label className="block">
            <span className="eyebrow mb-1.5 block">New PIN</span>
            <input type="password" inputMode="numeric" maxLength={8} value={pin} onChange={event=>setPin(event.target.value.replace(/\D/g,''))} disabled={busy} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-lg tracking-[0.3em] text-ink-900"/>
          </label>}
        </div>

        <div className="admin-modal-footer flex items-center justify-end gap-2">
          <Button type="submit" variant="primary" disabled={busy || !canSubmit}>{busy ? 'Saving…' : 'Save login method'}</Button>
        </div>
      </form>
    </div>
  </div>
}
