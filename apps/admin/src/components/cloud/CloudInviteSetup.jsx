import { useState } from 'react'
import { KeyRound, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import PasswordInput from '../common/PasswordInput.jsx'
import Button from '../common/Button.jsx'

const inputClass='w-full min-h-11 rounded-xl border border-surface-line bg-soft-white px-3.5 text-sm text-midnight placeholder:text-slate-soft focus:border-midnight/45 focus:outline-none focus:ring-2 focus:ring-midnight/10'

export default function CloudInviteSetup(){
  const{user,completeCloudInvitation,logout}=useAuth()
  const[password,setPassword]=useState(''),[confirm,setConfirm]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const valid=password.length>=8&&password===confirm
  async function submit(e){e.preventDefault();if(!valid||busy)return;setBusy(true);setError('');const result=await completeCloudInvitation(password);setBusy(false);if(!result.ok)setError(result.error||'Unable to activate the account.')}
  return <main className="admin-login-shell"><div className="mx-auto flex min-h-screen max-w-xl items-center p-5"><section className="admin-login-card w-full">
    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-midnight/8 text-gold-dim"><ShieldCheck size={20}/></span>
    <p className="eyebrow">Approved invitation</p>
    <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">Secure your Aezakmi Cloud account</h1>
    <p className="mt-2 text-sm leading-6 text-slate-soft">Your business has been approved. Set a password for <strong className="text-ink-900">{user?.email}</strong> to activate the owner account and enter the assigned organization.</p>
    {error&&<p className="mt-4 flex gap-2 rounded-xl border border-ember/25 bg-ember/10 px-3 py-2.5 text-xs text-ember-dim"><AlertCircle size={14}/>{error}</p>}
    <form className="mt-5 space-y-4" onSubmit={submit}>
      <label className="block"><span className="eyebrow mb-2 block">New password</span><PasswordInput autoFocus value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" placeholder="At least 8 characters" inputClassName={inputClass}/></label>
      <label className="block"><span className="eyebrow mb-2 block">Confirm password</span><PasswordInput value={confirm} onChange={e=>setConfirm(e.target.value)} autoComplete="new-password" placeholder="Repeat password" inputClassName={`${inputClass} ${confirm&&password!==confirm?'border-ember/60':''}`}/></label>
      <div className="rounded-xl border border-surface-line bg-surface-raised/45 p-3 text-[11px] leading-5 text-slate-soft"><KeyRound className="mr-1.5 inline" size={13}/>This invitation is tied to the business approved by the Aezakmi developer. It cannot create a different organization.</div>
      <Button type="submit" variant="primary" className="w-full" disabled={!valid||busy}>{busy?'Activating…':<>Activate account <ArrowRight size={16}/></>}</Button>
    </form>
    <button className="mt-4 w-full text-center text-xs text-slate-soft underline" type="button" onClick={logout}>Sign out</button>
  </section></div></main>
}
