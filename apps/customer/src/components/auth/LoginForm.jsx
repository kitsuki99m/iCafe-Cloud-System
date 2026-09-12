import { useState } from 'react'
import { ShieldCheck, User, KeyRound, IdCard, Wifi, AlertCircle, UserRound } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import Button from '../common/Button.jsx'
import logo from '../../assets/aktura-logo.svg'

const inputClass =
  'w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50'

function RoleTabs({ role, setRole }) {
  return (
    <div className="mb-5 grid grid-cols-2 gap-2">
      <button
        onClick={() => setRole('admin')}
        className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
          role === 'admin' ? 'border-gold/50 bg-gold/10 text-gold-dim' : 'border-surface-line text-slate-soft hover:text-ink-900'
        }`}
      >
        <ShieldCheck size={15} /> Admin
      </button>
      <button
        onClick={() => setRole('customer')}
        className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors ${
          role === 'customer' ? 'border-gold/50 bg-gold/10 text-gold-dim' : 'border-surface-line text-slate-soft hover:text-ink-900'
        }`}
      >
        <User size={15} /> Customer
      </button>
    </div>
  )
}

function ModeSwitch({ options, value, onChange }) {
  return (
    <div className="mb-4 flex items-center gap-1 rounded-lg bg-surface-raised p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.value ? 'bg-surface text-ink-900 shadow-card' : 'text-slate-soft hover:text-ink-900'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function ErrorNote({ error }) {
  if (!error) return null
  return (
    <p className="mb-4 flex items-center gap-1.5 rounded-lg bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">
      <AlertCircle size={13} /> {error}
    </p>
  )
}

function AdminPinForm({ onSubmit, busy }) {
  const [pin, setPin] = useState('')
  return (
    <form onSubmit={async (e) => { e.preventDefault(); await onSubmit(pin) }} className="space-y-4">
      <div>
        <label className="eyebrow mb-1.5 block">Staff PIN</label>
        <div className="flex items-center gap-2 rounded-lg border border-surface-line bg-ink px-3 py-2">
          <KeyRound size={15} className="text-slate-soft" />
          <input autoFocus type="password" inputMode="numeric" maxLength={8} value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
            placeholder="••••" className="w-full bg-transparent text-lg tracking-[0.3em] text-ink-900 placeholder:tracking-normal placeholder:text-slate-soft focus:outline-none" />
        </div>
      </div>
      <Button type="submit" variant="primary" className="w-full" disabled={!pin || busy}>
        {busy ? 'Signing in…' : 'Unlock'}
      </Button>
    </form>
  )
}

function AdminPasswordForm({ onSubmit, busy }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  return (
    <form onSubmit={async (e) => { e.preventDefault(); await onSubmit(username, password) }} className="space-y-4">
      <div>
        <label className="eyebrow mb-1.5 block">Username</label>
        <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)} placeholder="admin" className={inputClass} />
      </div>
      <div>
        <label className="eyebrow mb-1.5 block">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
      </div>
      <Button type="submit" variant="primary" className="w-full" disabled={!username || !password || busy}>
        {busy ? 'Signing in…' : 'Sign In'}
      </Button>
    </form>
  )
}

function CustomerMemberForm({ onSubmit, busy }) {
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  return (
    <form onSubmit={async (e) => { e.preventDefault(); await onSubmit(name, password) }} className="space-y-4">
      <div>
        <label className="eyebrow mb-1.5 block">Member Name</label>
        <div className="flex items-center gap-2 rounded-lg border border-surface-line bg-ink px-3 py-2">
          <IdCard size={15} className="text-slate-soft" />
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Maricel Santos"
            className="w-full bg-transparent text-sm text-ink-900 placeholder:text-slate-soft focus:outline-none" />
        </div>
      </div>
      <div>
        <label className="eyebrow mb-1.5 block">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" className={inputClass} />
      </div>
      <Button type="submit" variant="teal" className="w-full" disabled={!name || !password || busy}>
        {busy ? 'Signing in…' : 'Sign In'}
      </Button>
    </form>
  )
}

export default function LoginForm() {
  const { loginAdminPin, loginAdminPassword, loginCustomerCredentials, enterGuestMode } = useAuth()
  const [role, setRole] = useState('customer')
  const [adminMode, setAdminMode] = useState('pin')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function runLogin(fn) {
    setBusy(true)
    setError('')
    const result = await fn()
    setBusy(false)
    if (!result.ok) setError(result.error)
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <img src={logo} alt="" className="mb-3 h-10 w-10" />
          <h1 className="font-display text-xl font-semibold text-ink-900">Aezakmi Cafe</h1>
          <p className="text-xs text-slate-soft">Sign in to continue</p>
        </div>

        <div className="panel p-5">
          <RoleTabs role={role} setRole={(r) => { setRole(r); setError('') }} />
          <ErrorNote error={error} />

          {role === 'admin' ? (
            <>
              <ModeSwitch
                options={[
                  { value:'pin', label:'PIN' },
                  { value:'password', label:'Username & Password' },
                ]}
                value={adminMode}
                onChange={(m) => { setAdminMode(m); setError('') }}
              />
              {adminMode === 'pin' ? (
                <AdminPinForm busy={busy} onSubmit={(pin) => runLogin(() => loginAdminPin(pin))} />
              ) : (
                <AdminPasswordForm busy={busy} onSubmit={(username,password) => runLogin(() => loginAdminPassword(username,password))} />
              )}
            </>
          ) : (
            <>
              <div className="mb-4 flex items-start gap-3 rounded-lg border border-surface-line bg-surface-raised px-3 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal/10 text-teal-dim">
                  <Wifi size={16} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink-900">Login from any PC</p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-soft">
                    Your account can be used on any cafe computer. Only one active login is allowed at a time.
                  </p>
                </div>
              </div>
              <CustomerMemberForm busy={busy} onSubmit={(name,password) => runLogin(() => loginCustomerCredentials(name,password))} />
              <div className="my-4 flex items-center gap-3 text-[10px] uppercase tracking-wider text-slate-soft">
                <span className="h-px flex-1 bg-surface-line" />
                <span>or</span>
                <span className="h-px flex-1 bg-surface-line" />
              </div>
              <button
                type="button"
                onClick={() => runLogin(() => enterGuestMode())}
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-surface-line bg-surface-raised px-3 py-2.5 text-sm font-semibold text-ink-900 transition-colors hover:border-gold/40 hover:bg-surface disabled:opacity-50"
              >
                <UserRound size={15} /> Continue as Guest
              </button>
              <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-soft">
                Guest mode is available only after staff starts a guest session for this PC.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
