import { useState } from 'react'
import { Building2, ArrowRight, AlertCircle } from 'lucide-react'
import { cloudCreateOrganization } from '../../lib/cloudClient.js'
import { useAuth } from '../../context/AuthContext.jsx'
import Button from '../common/Button.jsx'

export default function CloudSetup(){
  const {refreshCloudAccess,logout}=useAuth()
  const [organization,setOrganization]=useState('')
  const [branch,setBranch]=useState('Main Branch')
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  async function submit(e){e.preventDefault();if(!organization.trim()||!branch.trim()||busy)return;setBusy(true);setError('');try{await cloudCreateOrganization(organization.trim(),branch.trim());await refreshCloudAccess();window.location.reload()}catch(err){setError(err.message||'Unable to create organization.')}finally{setBusy(false)}}
  return <main className="admin-login-shell"><div className="mx-auto flex min-h-screen max-w-xl items-center p-5"><section className="admin-login-card w-full">
    <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-midnight/8 text-gold-dim"><Building2 size={20}/></span>
    <p className="eyebrow">Aezakmi Cloud</p><h1 className="mt-1 font-display text-2xl font-semibold text-ink-900">Create your first café organization</h1>
    <p className="mt-2 text-sm leading-6 text-slate-soft">This creates the cloud tenant and its first branch. You can pair the local Edge server from Settings afterward.</p>
    {error&&<p className="mt-4 flex gap-2 rounded-xl border border-ember/25 bg-ember/10 px-3 py-2.5 text-xs text-ember-dim"><AlertCircle size={14}/>{error}</p>}
    <form className="mt-5 space-y-4" onSubmit={submit}>
      <label className="block"><span className="eyebrow mb-2 block">Business / organization</span><input autoFocus value={organization} onChange={e=>setOrganization(e.target.value)} className="w-full min-h-11 rounded-xl border border-surface-line bg-soft-white px-3.5 text-sm text-midnight" placeholder="Kai Gaming Lounge"/></label>
      <label className="block"><span className="eyebrow mb-2 block">First branch</span><input value={branch} onChange={e=>setBranch(e.target.value)} className="w-full min-h-11 rounded-xl border border-surface-line bg-soft-white px-3.5 text-sm text-midnight" placeholder="Main Branch"/></label>
      <Button type="submit" variant="primary" className="w-full" disabled={busy||!organization.trim()||!branch.trim()}>{busy?'Creating…':<>Create workspace <ArrowRight size={16}/></>}</Button>
    </form>
    <button className="mt-4 w-full text-center text-xs text-slate-soft underline" type="button" onClick={logout}>Sign out</button>
  </section></div></main>
}
