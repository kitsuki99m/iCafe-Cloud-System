import { ShieldAlert, LogOut, Ban } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import Button from '../common/Button.jsx'

export default function CloudAccessPending({suspended=false}){
  const{user,logout}=useAuth()
  const terminated=user?.cloudBusinessStatus==='terminated'
  if(suspended)return <main className="admin-login-shell"><div className="mx-auto flex min-h-screen max-w-xl items-center p-5"><section className="admin-login-card w-full text-center">
    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-ember/10 text-ember-dim"><Ban size={22}/></span>
    <p className="eyebrow">Cloud access unavailable</p>
    <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">{terminated?'Business access terminated':'Business access suspended'}</h1>
    <p className="mt-3 text-sm leading-6 text-slate-soft">The Cloud workspace for <strong className="text-ink-900">{user?.email}</strong> is currently {terminated?'terminated':'suspended'} by Aezakmi.</p>
    {user?.cloudBusinessReason&&<p className="mt-3 rounded-xl border border-ember/20 bg-ember/5 p-3 text-xs leading-5 text-slate-soft"><strong className="text-ink-900">Reason:</strong> {user.cloudBusinessReason}</p>}
    <p className="mt-3 rounded-xl border border-surface-line bg-surface-raised/45 p-3 text-xs leading-5 text-slate-soft">Your local café Edge and Customer Stations are not remotely shut down by this status. Contact Aezakmi to restore Cloud access.</p>
    <Button className="mt-5 w-full" variant="secondary" icon={LogOut} onClick={logout}>Sign out</Button>
  </section></div></main>

  return <main className="admin-login-shell"><div className="mx-auto flex min-h-screen max-w-xl items-center p-5"><section className="admin-login-card w-full text-center">
    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-gold/10 text-gold-dim"><ShieldAlert size={22}/></span>
    <p className="eyebrow">Approval required</p>
    <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">No approved business workspace</h1>
    <p className="mt-3 text-sm leading-6 text-slate-soft">The account <strong className="text-ink-900">{user?.email}</strong> is authenticated, but it is not attached to an approved Aezakmi organization. Public accounts cannot create tenants.</p>
    <p className="mt-3 rounded-xl border border-surface-line bg-surface-raised/45 p-3 text-xs leading-5 text-slate-soft">If your business application was approved, open the invitation email sent by Aezakmi. Otherwise sign out and use <strong className="text-ink-900">Request access</strong> from the login page.</p>
    <Button className="mt-5 w-full" variant="secondary" icon={LogOut} onClick={logout}>Sign out</Button>
  </section></div></main>
}
