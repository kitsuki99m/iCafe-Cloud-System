import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, UserPlus, Pencil, Trash2, Wallet, Banknote, Clock3, Save, ArrowRightLeft, UsersRound, Crown } from 'lucide-react'
import Button from '../components/common/Button.jsx'
import SidePanel from '../components/common/SidePanel.jsx'
import Modal from '../components/common/Modal.jsx'
import NumericInput from '../components/common/NumericInput.jsx'
import DurationInput from '../components/common/DurationInput.jsx'
import ConfirmModal from '../components/common/ConfirmModal.jsx'
import PasswordInput from '../components/common/PasswordInput.jsx'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { makeMemberId } from '../lib/member.js'
import { isPcStationOnline } from '../lib/pcStatus.js'
import BulkActionsDropdown from '../components/bulk/BulkActionsDropdown.jsx'
import BulkTopUpWalletModal from '../components/bulk/BulkTopUpWalletModal.jsx'
import BulkTopUpSessionModal from '../components/bulk/BulkTopUpSessionModal.jsx'
import { nonNegativeNumber } from '../lib/numeric.js'
import { showToast } from '../lib/toast.js'
import { useSearchParams } from 'react-router-dom'
import { AdminMetricCard, AdminPageWorkspace, AdminRailCard } from '../components/layout/AdminPageWorkspace.jsx'
import { formatRemainingSession, remainingSessionSeconds } from '../lib/sessionTime.js'
import { runBulkMutation } from '../lib/bulkMutation.js'
import { createOperationKey } from '../lib/api.js'

const TIER_RANK = { Regular: 0, Gold: 1, VIP: 2 }
const TIER_STYLE = {
  Regular: 'text-slate-soft bg-surface-raised',
  Gold: 'text-gold-dim bg-gold/10',
  VIP: 'text-teal-dim bg-teal/10',
}
const inputClass = 'w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50'
const BLANK_MEMBER = { name: '', username: '', birthdate: '', phone: '', email: '', tier: 'Regular', wallet: '', pcId: '', pcIp: '' }

function formatSavedTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds || 0) / 60))
  if (!total) return 'No saved time'
  const hours = Math.floor(total / 60)
  return hours ? `${hours}h ${total % 60}m saved` : `${total}m saved`
}

function transferableSessionSeconds(member) {
  return member?.activeSession?.billing === 'prepaid'
    ? remainingSessionSeconds(member.activeSession)
    : Math.max(0, Number(member?.sessionSecondsRemaining || 0))
}

function MemberFields({ draft, setDraft, pcs, isCreate }) {
  const update = (key, value) => setDraft({ ...draft, [key]: value })

  return <div className="space-y-5">
    <div className="rounded-lg border border-surface-line bg-surface-raised/50 px-3 py-2">
      <p className="text-xs text-slate-soft">
        Customer login uses the <strong className="text-ink-900">username</strong>. Birthdate is stored for birthday/promo-rate eligibility.
      </p>
    </div>

    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label className="eyebrow mb-1.5 block">Full Name <span className="text-ember-dim">*</span></label>
        <input autoFocus value={draft.name ?? ''} onChange={e=>update('name',e.target.value)} placeholder="Customer full name" className={inputClass}/>
      </div>

      <div>
        <label className="eyebrow mb-1.5 block">Username <span className="text-ember-dim">*</span></label>
        <input value={draft.username ?? ''} onChange={e=>update('username',e.target.value.replace(/\s/g,''))} placeholder="customer username" autoComplete="off" className={inputClass}/>
      </div>

      <div>
        <label className="eyebrow mb-1.5 block">Birthdate <span className="text-ember-dim">*</span></label>
        <input type="date" value={draft.birthdate ?? ''} onChange={e=>update('birthdate',e.target.value)} className={inputClass}/>
      </div>

      {isCreate ? <div className="rounded-lg border border-gold/25 bg-gold/5 px-3 py-2.5">
        <p className="eyebrow mb-1">Temporary password</p>
        <p className="stat-figure text-lg font-semibold text-ink-900">1234</p>
        <p className="mt-1 text-xs leading-5 text-slate-soft">Customer will be prompted to set a new password on first login. They may choose Set Later and will be prompted again on their next login.</p>
      </div> : <div>
        <label className="eyebrow mb-1.5 block">Password</label>
        <PasswordInput value={draft.password ?? ''} onChange={e=>update('password',e.target.value)} placeholder="Leave blank to keep current" autoComplete="off" inputClassName={inputClass}/>
        <p className="mt-1.5 text-xs text-slate-soft">Leave blank to keep the current password.</p>
      </div>}

      <div>
        <label className="eyebrow mb-1.5 block">Tier</label>
        <select value={draft.tier ?? 'Regular'} onChange={e=>update('tier',e.target.value)} className={inputClass}>
          <option value="Regular">Regular</option><option value="Gold">Gold</option><option value="VIP">VIP</option>
        </select>
      </div>

      <div>
        <label className="eyebrow mb-1.5 block">Phone</label>
        <input value={draft.phone ?? ''} onChange={e=>update('phone',e.target.value)} placeholder="09XXXXXXXXX" className={inputClass}/>
      </div>

      <div>
        <label className="eyebrow mb-1.5 block">Email</label>
        <input type="email" value={draft.email ?? ''} onChange={e=>update('email',e.target.value)} placeholder="customer@email.com" className={inputClass}/>
      </div>

      {isCreate && <div>
        <label className="eyebrow mb-1.5 block">Starting Wallet</label>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-soft">₱</span>
          <NumericInput min="0" step="0.001" value={draft.wallet ?? ''} onChange={e=>update('wallet',e.target.value)} placeholder="0" className={`${inputClass} pl-7`}/>
        </div>
      </div>}

      <div className="sm:col-span-2">
        <label className="eyebrow mb-1.5 block">Assigned PC</label>
        <select value={draft.pcId ?? ''} onChange={e=>{const pc=pcs.find(p=>String(p.id)===String(e.target.value));setDraft({...draft,pcId:e.target.value||null,pcIp:pc?.ipAddress??null})}} className={inputClass}>
          <option value="">None</option>
          {pcs.map(p=><option key={p.id} value={p.id}>{p.label} · {p.ipAddress}</option>)}
        </select>
        {draft.pcIp && <p className="mt-1.5 text-xs text-slate-soft">Client IP: {draft.pcIp}</p>}
      </div>
    </div>
  </div>
}
function useModalMutation(resetKey) {
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  useEffect(()=>{ setBusy(false); setError('') },[resetKey])
  async function run(action,fallback) {
    if (busy) return
    setBusy(true)
    setError('')
    try { await action() }
    catch (cause) { setError(cause?.message || fallback) }
    finally { setBusy(false) }
  }
  return { busy, error, run }
}

function WalletEditModal({ member, onClose, onSave }) {
  const [value,setValue]=useState(String(member?.wallet ?? member?.walletBalance ?? 0))
  const operationKeyRef=useRef(null)
  const {busy,error,run}=useModalMutation(member?.id)
  useEffect(()=>{ operationKeyRef.current=member ? createOperationKey() : null },[member?.id,value])
  useEffect(() => {
    if (member) setValue(String(member.wallet ?? member.walletBalance ?? 0))
  }, [member?.id, member?.wallet, member?.walletBalance])
  const numeric=Number(value)
  const valid=Number.isFinite(numeric) && numeric >= 0
  return <Modal open={!!member} onClose={onClose} busy={busy} eyebrow={member?.name} title="Edit Wallet Balance" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button icon={Save} variant="primary" disabled={!valid || busy} onClick={()=>run(()=>onSave(numeric,{ operationKey:operationKeyRef.current || createOperationKey() }),'Unable to update wallet balance.')}>{busy?'Saving…':'Save Balance'}</Button></>}>
    <div className="space-y-3"><div className="rounded-lg bg-surface-raised px-3 py-2 text-sm flex justify-between"><span className="text-slate-soft">Current</span><span className="stat-figure font-semibold text-ink-900">₱{Number(member?.wallet ?? member?.walletBalance ?? 0).toFixed(2)}</span></div><div><label className="eyebrow mb-1.5 block">New wallet balance</label><NumericInput autoFocus min="0" step="0.001" value={value} onChange={e=>setValue(e.target.value)} className={inputClass}/></div><p className="text-xs text-slate-soft">The difference is recorded in the wallet ledger as an admin balance edit.</p>{error && <p className="rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">{error}</p>}</div>
  </Modal>
}

function WalletTopUpModal({ member, onClose, onConfirm }) {
  const [amount,setAmount]=useState('')
  const operationKeyRef=useRef(null)
  const {busy,error,run}=useModalMutation(member?.id)
  useEffect(()=>{ if (member) setAmount('') }, [member?.id])
  useEffect(()=>{ operationKeyRef.current=member ? createOperationKey() : null },[member?.id,amount])
  const numeric=Number(amount)
  const valid=Number.isFinite(numeric) && numeric>0
  return <Modal open={!!member} onClose={onClose} busy={busy} eyebrow={member?.name} title="Top Up Wallet" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button icon={Wallet} variant="primary" disabled={!valid || busy} onClick={()=>run(()=>onConfirm(numeric,{ operationKey:operationKeyRef.current || createOperationKey() }),'Unable to top up wallet.')}>{busy?'Processing…':`Top Up ₱${valid?numeric.toFixed(2):'0.00'}`}</Button></>}>
    <div className="space-y-4">
      <div className="rounded-lg bg-surface-raised px-3 py-2 text-sm flex justify-between"><span className="text-slate-soft">Current balance</span><span className="stat-figure font-semibold text-ink-900">₱{Number(member?.wallet ?? member?.walletBalance ?? 0).toFixed(2)}</span></div>
      <div>
        <label className="eyebrow mb-1.5 block">Top-up amount (₱)</label>
        <div className="mb-2 grid grid-cols-4 gap-1.5">
          {[5, 10, 15, 20].map((p) => (
            <button
              type="button"
              key={p}
              onClick={() => setAmount(String(p))}
              className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                Number(amount) === p
                  ? 'border-gold/50 bg-gold/10 text-gold-dim'
                  : 'border-surface-line text-slate-soft hover:text-ink-900'
              }`}
            >
              ₱{p}
            </button>
          ))}
        </div>
        <NumericInput autoFocus min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" className={inputClass}/>
      </div>
      <p className="text-xs text-slate-soft">Adds new wallet funds and records a top-up transaction in the member wallet ledger.</p>
      {error && <p className="rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">{error}</p>}
    </div>
  </Modal>
}

function SessionTopUpModal({ member, ratePlans, onClose, onConfirm }) {
  const memberTierRank=TIER_RANK[String(member?.tier ?? 'Regular')] ?? 0
  const activePlans = (ratePlans ?? []).filter((p) => p.isActive !== false && (TIER_RANK[String(p.customerTier ?? 'Regular')] ?? 0) <= memberTierRank)
  const [planId,setPlanId]=useState(activePlans[0]?.id??'')
  const [amount,setAmount]=useState('')
  const operationKeyRef=useRef(null)
  const {busy,error,run}=useModalMutation(member?.id)
  useEffect(()=>{ if (!activePlans.some((p)=>String(p.id)===String(planId))) setPlanId(activePlans[0]?.id??'') },[activePlans,planId])
  useEffect(()=>{ operationKeyRef.current=member ? createOperationKey() : null },[member?.id,planId,amount])
  const plan=activePlans.find(p=>String(p.id)===String(planId))
  const isPackage=plan?.mode==='package'
  const computedMinutes = plan ? (isPackage ? Number(plan.minutes || 0) : Math.floor(Number(amount || 0) * (Number(plan.minutesPerUnit || 0) / Math.max(1, Number(plan.pesoUnit || 0)))) ) : 0
  const valid=!!plan && computedMinutes > 0 && (isPackage ? Number(plan.amount || 0) > 0 : Number(amount) >= Number(plan.minAmount || 0))
  return <Modal open={!!member} onClose={onClose} busy={busy} eyebrow={member?.name} title="Top Up Session Time" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || busy} onClick={()=>run(()=>onConfirm(planId,isPackage?null:Number(amount),{ operationKey:operationKeyRef.current || createOperationKey() }),'Unable to add session time.')}>{busy?'Adding…':'Add Time'}</Button></>}>
    <div className="space-y-4">
      <div className="rounded-lg border border-surface-line bg-surface-raised px-3 py-2 text-sm"><div className="text-slate-soft">Remaining session</div><div className="stat-figure mt-1 text-lg font-semibold">{formatRemainingSession(member?.activeSession)}</div>{member?.activeSession?.pcLabel&&<div className="text-xs text-slate-soft">{member.activeSession.pcLabel}</div>}</div>
      <div><label className="eyebrow mb-1.5 block">Rate plan</label><div className="grid gap-2 sm:grid-cols-2">{activePlans.map(p=><button key={p.id} disabled={busy} onClick={()=>{setPlanId(p.id);if(p.mode==='linear')setAmount(String(p.minAmount||''))}} className={`rounded-lg border px-3 py-2 text-left text-xs ${planId===p.id?'border-gold/50 bg-gold/10 text-gold-dim':'border-surface-line text-slate-soft'}`}><div className="font-semibold">{p.name}</div><div>{p.mode==='package'?`₱${Number(p.amount||0).toFixed(2)} · ${p.minutes} min`:`₱${Number(p.pesoUnit||0).toFixed(2)} / ${p.minutesPerUnit} min · min ₱${Number(p.minAmount||0).toFixed(2)}`}</div></button>)}</div></div>
      {plan?.mode==='linear' && (
        <div>
          <label className="eyebrow mb-1.5 block">Cash amount</label>
          <div className="mb-2 grid grid-cols-4 gap-1.5">
            {[5, 10, 15, 20].map((p) => (
              <button
                type="button"
                key={p}
                onClick={() => setAmount(String(p))}
                className={`rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${
                  Number(amount) === p
                    ? 'border-gold/50 bg-gold/10 text-gold-dim'
                    : 'border-surface-line text-slate-soft hover:text-ink-900'
                }`}
              >
                ₱{p}
              </button>
            ))}
          </div>
          <NumericInput min={plan.minAmount} step="0.001" value={amount} onChange={e=>setAmount(e.target.value)} className={inputClass}/>
        </div>
      )}
      <p className="text-xs text-slate-soft">Uses an active rate plan allowed by this member's tier. Payment is recorded as cash at the counter.</p>
      {error && <p className="rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">{error}</p>}
    </div>
  </Modal>
}

function WalletTransferModal({ member, members, onClose, onConfirm }) {
  const [destinationMemberId,setDestinationMemberId]=useState('')
  const [amount,setAmount]=useState('')
  const operationKeyRef=useRef(null)
  const {busy,error,run}=useModalMutation(member?.id)
  useEffect(()=>{setDestinationMemberId('');setAmount('')},[member?.id])
  useEffect(()=>{ operationKeyRef.current=member ? createOperationKey() : null },[member?.id,destinationMemberId,amount])
  const valid=destinationMemberId&&Number(amount)>0
  return <Modal open={!!member} onClose={onClose} busy={busy} eyebrow={member?.name} title="Transfer wallet funds" maxWidth="max-w-md" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || busy} onClick={()=>run(()=>onConfirm(destinationMemberId,Number(amount),{ operationKey:operationKeyRef.current || createOperationKey() }),'Unable to transfer wallet funds.')}>{busy?'Transferring…':'Transfer funds'}</Button></>}><div className="space-y-3"><p className="text-xs leading-5 text-slate-soft">This moves existing wallet value only. It is not new revenue and creates matching ledger entries for both members.</p><label className="block"><span className="eyebrow mb-1.5 block">Recipient</span><select value={destinationMemberId} onChange={e=>setDestinationMemberId(e.target.value)} className={inputClass}><option value="">Choose member</option>{members.filter(item=>String(item.id)!==String(member?.id)).map(item=><option key={item.id} value={item.id}>{item.name} · ₱{Number(item.wallet||0).toFixed(2)}</option>)}</select></label><label className="block"><span className="eyebrow mb-1.5 block">Amount (₱)</span><NumericInput autoFocus min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" className={inputClass}/></label>{error && <p className="rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">{error}</p>}</div></Modal>
}

function SessionTransferModal({ member, members, onClose, onConfirm }) {
  const [destinationMemberId,setDestinationMemberId]=useState('')
  const [minutes,setMinutes]=useState(15)
  const operationKeyRef=useRef(null)
  const {busy,error,run}=useModalMutation(member?.id)
  useEffect(()=>{setDestinationMemberId('');setMinutes(15)},[member?.id])
  useEffect(()=>{ operationKeyRef.current=member ? createOperationKey() : null },[member?.id,destinationMemberId,minutes])
  const availableSeconds=transferableSessionSeconds(member)
  const valid=destinationMemberId&&Number(minutes)>0&&Number(minutes)*60<=availableSeconds
  return <Modal open={!!member} onClose={onClose} busy={busy} eyebrow={member?.name} title="Transfer session time" maxWidth="max-w-md" footer={<><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={!valid || busy} onClick={()=>run(()=>onConfirm(destinationMemberId,Number(minutes)*60,{ operationKey:operationKeyRef.current || createOperationKey() }),'Unable to transfer session time.')}>{busy?'Transferring…':'Transfer time'}</Button></>}><div className="space-y-3"><p className="text-xs leading-5 text-slate-soft">Available: {formatSavedTime(availableSeconds)}. Transfer some or all available time to another member.</p><label className="block"><span className="eyebrow mb-1.5 block">Recipient</span><select value={destinationMemberId} onChange={e=>setDestinationMemberId(e.target.value)} className={inputClass}><option value="">Choose member</option>{members.filter(item=>String(item.id)!==String(member?.id)).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><DurationInput label="Transfer time" valueMinutes={minutes} onChange={setMinutes} disabled={busy} autoFocus/><button type="button" onClick={()=>setMinutes(Math.floor(availableSeconds/60))} disabled={availableSeconds<60 || busy} className="text-xs font-semibold text-gold-dim disabled:opacity-40">Transfer all available whole minutes</button>{error && <p className="rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-xs text-ember-dim">{error}</p>}</div></Modal>
}

export default function MembersPage(){
  const {members:liveMembers,pcs,ratePlans,addMember,updateMember,deleteMember,setMemberWallet,topUpMemberSession,transferMemberWallet,transferMemberSessionTime,adminTopUp}=useAppData()
  const { user } = useAuth()
  const canManageMembers = String(user?.role ?? '').trim().toLowerCase() === 'admin'
  const [query,setQuery]=useState(''); const [editing,setEditing]=useState(null); const [walletTopUp,setWalletTopUp]=useState(null); const [creating,setCreating]=useState(null); const [deleteTarget,setDeleteTarget]=useState(null); const [walletEdit,setWalletEdit]=useState(null); const [walletTransfer,setWalletTransfer]=useState(null); const [sessionTransfer,setSessionTransfer]=useState(null); const [sessionTopUp,setSessionTopUp]=useState(null); const [bulkWalletOpen,setBulkWalletOpen]=useState(false); const [bulkSessionOpen,setBulkSessionOpen]=useState(false); const [detailMemberId,setDetailMemberId]=useState(null); const [,tick]=useState(0); const [actionError,setActionError]=useState(''); const [savingMember,setSavingMember]=useState(false); const [bulkWalletOperationKey,setBulkWalletOperationKey]=useState(null); const [bulkSessionOperationKey,setBulkSessionOperationKey]=useState(null)
  const [searchParams,setSearchParams]=useSearchParams()
  useEffect(()=>{const t=setInterval(()=>tick(v=>v+1),30000);return()=>clearInterval(t)},[])
  const members=useMemo(()=>liveMembers.map(m=>{const pc=pcs.find(p=>p.status==='occupied'&&String(p.session?.customerId)===String(m.id));const active=pc && isPcStationOnline(pc) ? pc.session : null;return {...m,activeSession:active?{...active,pcLabel:pc?.label}:null, savedTimeLabel:!active ? formatSavedTime(m.sessionSecondsRemaining) : null}}),[liveMembers,pcs])
  const filtered=members.filter(m=>[m.name,m.username,m.memberCode,m.email,m.phone].filter(Boolean).join(' ').toLowerCase().includes(query.toLowerCase()))
  const busyIds=new Set(members.filter(m=>m.activeSession).map(m=>m.id))
  const bulkMemberTargets=members.map((m)=>({id:m.id,label:m.name,sublabel:`${m.username || m.memberCode || 'Member'} · ₱${Number(m.wallet || 0).toFixed(2)}`}))
  const bulkSessionTargets=members.filter((m)=>m.activeSession).map((m)=>({id:m.id,label:m.name,sublabel:`${m.activeSession.pcLabel || 'Active PC'} · ${formatRemainingSession(m.activeSession)}`,tier:m.tier}))
  const detailMember=detailMemberId ? members.find((m)=>String(m.id)===String(detailMemberId)) || null : null
  const memberStats=useMemo(()=>({total:members.length,active:members.filter((m)=>m.activeSession).length,wallet:members.reduce((sum,m)=>sum+Number(m.wallet||0),0),premium:members.filter((m)=>['Gold','VIP'].includes(m.tier)).length}),[members])
  const tierCounts=useMemo(()=>({Regular:members.filter((m)=>m.tier==='Regular').length,Gold:members.filter((m)=>m.tier==='Gold').length,VIP:members.filter((m)=>m.tier==='VIP').length}),[members])
  const requestedMemberId=searchParams.get('member')
  useEffect(()=>{ if(requestedMemberId && members.some((m)=>String(m.id)===String(requestedMemberId))) setDetailMemberId(requestedMemberId) },[requestedMemberId,members])
  function openMemberDetail(member){setDetailMemberId(member.id);const next=new URLSearchParams(searchParams);next.set('member',String(member.id));setSearchParams(next,{replace:true})}
  function closeMemberDetail(){setDetailMemberId(null);if(searchParams.has('member')){const next=new URLSearchParams(searchParams);next.delete('member');setSearchParams(next,{replace:true})}}
  const saveCreate=async()=>{
    if(savingMember || !canManageMembers) return
    setActionError('')
    const wallet=creating?.wallet === '' ? 0 : nonNegativeNumber(creating?.wallet)
    const username=String(creating?.username ?? '').trim()
    const name=String(creating?.name ?? '').trim()
    const birthdate=String(creating?.birthdate ?? '').trim()
    const phone=String(creating?.phone ?? '').replace(/\D/g,'')
    const email=String(creating?.email ?? '').trim()
    if(!name) return setActionError('Full name is required.')
    if(username.length<3) return setActionError('Username must be at least 3 characters.')
    if(!birthdate) return setActionError('Birthdate is required.')
    if(wallet===null) return setActionError('Starting wallet must be zero or greater.')
    if(phone && !/^09\d{9}$/.test(phone)) return setActionError('Phone must be an 11-digit Philippine mobile number starting with 09.')
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setActionError('Enter a valid email address.')
    setSavingMember(true)
    try {
      await addMember({...creating,id:makeMemberId(),name,username,birthdate,phone:phone||null,email:email||null,wallet})
      setCreating(null)
    } catch(e) {
      setActionError(e?.message||'Unable to add member.')
    } finally { setSavingMember(false) }
  }
  const saveEdit=async()=>{
    if(savingMember || !canManageMembers) return
    setActionError('')
    const username=String(editing?.username ?? '').trim()
    if(!editing?.name?.trim()) return setActionError('Full name is required.')
    if(username.length<3) return setActionError('Username must be at least 3 characters.')
    if(!editing?.birthdate) return setActionError('Birthdate is required.')
    const phone=String(editing?.phone ?? '').replace(/\D/g,'')
    const email=String(editing?.email ?? '').trim()
    if(phone && !/^09\d{9}$/.test(phone)) return setActionError('Phone must be an 11-digit Philippine mobile number starting with 09.')
    if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return setActionError('Enter a valid email address.')
    const patch={name:editing.name.trim(),username,birthdate:editing.birthdate,phone:phone||null,email:email||null,tier:editing.tier,pcId:editing.pcId || null,pcIp:editing.pcIp || null}
    if(editing.password)patch.password=editing.password
    setSavingMember(true)
    try { await updateMember(editing.id,patch); setEditing(null) } catch(e) { setActionError(e?.message||'Unable to update member.') } finally { setSavingMember(false) }
  }
  const handleDelete=m=>{setActionError('');if(busyIds.has(m.id))return;setDeleteTarget(m)}
  const confirmDelete=()=>{if(!deleteTarget)return;setSavingMember(true);deleteMember(deleteTarget.id).then(()=>setDeleteTarget(null)).catch((e)=>setActionError(e?.message||'Unable to delete member.')).finally(()=>setSavingMember(false))}
  const memberRail = <>
    <AdminRailCard title="Member snapshot" subtitle="Account and session activity at a glance.">
      <div className="space-y-2">
        <div className="admin-rail-stat"><span className="text-slate-soft">Registered members</span><b className="stat-figure text-ink-900">{memberStats.total}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Active now</span><b className="stat-figure text-teal-dim">{memberStats.active}</b></div>
        <div className="admin-rail-stat"><span className="text-slate-soft">Wallet value</span><b className="stat-figure text-ink-900">₱{memberStats.wallet.toFixed(2)}</b></div>
      </div>
    </AdminRailCard>
    <AdminRailCard title="Tier distribution" subtitle="Current membership mix.">
      <div className="space-y-2">
        {[['Regular',tierCounts.Regular],['Gold',tierCounts.Gold],['VIP',tierCounts.VIP]].map(([tier,count])=><div key={tier} className="admin-rail-stat"><span className="text-slate-soft">{tier}</span><b className="stat-figure text-ink-900">{count}</b></div>)}
      </div>
    </AdminRailCard>
    <AdminRailCard title="Member actions" subtitle="Common account operations.">
      <button type="button" disabled={!canManageMembers} className="admin-rail-action" onClick={()=>{setActionError('');setCreating({...BLANK_MEMBER})}}><span>Add Member<small>Create a new customer login and wallet</small></span><UserPlus size={15}/></button>
    </AdminRailCard>
  </>

  return <AdminPageWorkspace aside={memberRail}>
    {actionError && <div className="mb-4 rounded-xl border border-ember/30 bg-ember/5 px-4 py-3 text-sm text-ember-dim">{actionError}</div>}
    <div className="member-kpi-grid admin-metric-grid mb-5">
      <AdminMetricCard label="Members" value={memberStats.total} hint="Registered customer accounts" icon={UsersRound}/>
      <AdminMetricCard label="Active now" value={memberStats.active} hint="Members currently in a live session" icon={Clock3} tone="success"/>
      <AdminMetricCard label="Wallet value" value={`₱${memberStats.wallet.toFixed(2)}`} hint="Current member wallet balances" icon={Wallet}/>
      <AdminMetricCard label="Gold + VIP" value={memberStats.premium} hint="Members with upgraded tiers" icon={Crown} tone="warning"/>
    </div>
    <div className="admin-page-toolbar mb-4 flex flex-wrap items-center justify-between gap-3"><h1 className="sr-only">Members</h1><div className="admin-search-field w-full max-w-sm"><Search size={15} className="text-slate-soft"/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search members" className="w-full bg-transparent text-sm text-ink-900 placeholder:text-slate-soft focus:outline-none"/></div><div className="ml-auto flex items-center gap-2"><BulkActionsDropdown items={[{id:'wallet',icon:'wallet',label:'Top up wallets',hint:'Select multiple members'},{id:'session',icon:'session',label:'Add session time',hint:`${bulkSessionTargets.length} active session${bulkSessionTargets.length===1?'':'s'}`}]} onAction={(id)=>{if(id==='wallet'){setBulkWalletOperationKey(createOperationKey());setBulkWalletOpen(true)}else{setBulkSessionOperationKey(createOperationKey());setBulkSessionOpen(true)}}} /><Button icon={UserPlus} variant="primary" size="sm" disabled={!canManageMembers} title={canManageMembers ? 'Add a new customer member' : 'Only an Admin can add members'} onClick={()=>{setActionError('');setCreating({...BLANK_MEMBER})}}>Add Member</Button></div></div>
    <div className="admin-table-shell table-viewport overflow-auto"><table className="w-full min-w-[760px] text-sm"><thead><tr className="text-left text-[10px] uppercase tracking-[0.12em] text-slate-soft"><th className="px-4 py-3">Name</th><th className="px-4 py-3">Tier</th><th className="px-4 py-3">Wallet</th><th className="px-4 py-3">Remaining Session</th><th className="px-4 py-3">PC</th><th className="px-4 py-3 text-right">Actions</th></tr></thead><tbody>{filtered.map(m=>{const busy=busyIds.has(m.id);const canTransferTime=transferableSessionSeconds(m)>=60;const stop=(event,action)=>{event.stopPropagation();action()};return <tr key={m.id} onClick={()=>openMemberDetail(m)} className="cursor-pointer border-b border-surface-line/50 last:border-0 hover:bg-surface-raised/45"><td className="px-4 py-3 font-medium text-ink-900">{m.name}<div className="text-[11px] text-slate-soft">{m.username || m.memberCode || 'Member'}</div></td><td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TIER_STYLE[m.tier]}`}>{m.tier}</span></td><td className="stat-figure px-4 py-3 text-ink-900">₱{Number(m.wallet||0).toFixed(2)}</td><td className="px-4 py-3">{m.activeSession?<span className="inline-flex items-center gap-1.5 text-teal-dim"><Clock3 size={13}/>{formatRemainingSession(m.activeSession)}</span>:<span className="text-slate-soft">{m.savedTimeLabel}</span>}</td><td className="px-4 py-3 text-slate-soft">{m.activeSession?.pcLabel??'—'}</td><td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button title="Top up wallet" onClick={event=>stop(event,()=>setWalletTopUp(m))} className="rounded-lg p-2 text-slate-soft hover:bg-surface-raised hover:text-teal-dim"><Wallet size={14}/></button><button title="Transfer wallet funds" onClick={event=>stop(event,()=>setWalletTransfer(m))} className="rounded-lg p-2 text-slate-soft hover:bg-surface-raised hover:text-gold-dim"><ArrowRightLeft size={14}/></button><button title="Top up session time" disabled={!busy} onClick={event=>stop(event,()=>setSessionTopUp(m))} className="rounded-lg p-2 text-slate-soft hover:bg-surface-raised hover:text-gold-dim disabled:opacity-30"><Banknote size={14}/></button><button title="Edit member" onClick={event=>stop(event,()=>setEditing({...m,password:''}))} className="rounded-lg p-2 text-slate-soft hover:bg-surface-raised"><Pencil size={14}/></button><button title={busy?'End active session before deleting':'Delete account'} disabled={busy} onClick={event=>stop(event,()=>handleDelete(m))} className="rounded-lg p-2 text-slate-soft hover:bg-ember/10 hover:text-ember-dim disabled:opacity-30"><Trash2 size={14}/></button></div></td></tr>})}{!filtered.length&&<tr><td colSpan={6} className="px-4 py-10 text-center text-slate-soft">No members match “{query}”.</td></tr>}</tbody></table></div>
    <SidePanel open={!!detailMember} onClose={closeMemberDetail} eyebrow="Member details" title={detailMember?.name || 'Member'}>
      {detailMember && <div className="space-y-5"><section className="overview-soft-card p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-ink-900">{detailMember.username || detailMember.memberCode || 'Member account'}</p><p className="mt-1 text-xs text-slate-soft">{detailMember.email || detailMember.phone || 'No contact details saved'}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${TIER_STYLE[detailMember.tier]}`}>{detailMember.tier}</span></div></section><section className="grid grid-cols-2 gap-2"><div className="overview-card p-3"><p className="text-[10px] text-slate-soft">Wallet</p><p className="stat-figure mt-1 text-lg font-bold text-ink-900">₱{Number(detailMember.wallet||0).toFixed(2)}</p></div><div className="overview-card p-3"><p className="text-[10px] text-slate-soft">Session time</p><p className="mt-1 text-sm font-semibold text-ink-900">{detailMember.activeSession?formatRemainingSession(detailMember.activeSession):detailMember.savedTimeLabel}</p></div></section>{detailMember.activeSession&&<section className="overview-card p-4"><p className="eyebrow">Active session</p><p className="mt-2 text-sm font-semibold text-ink-900">{detailMember.activeSession.pcLabel || 'Active PC'}</p><p className="mt-1 text-xs text-slate-soft">{detailMember.activeSession.billing || 'prepaid'} billing · {formatRemainingSession(detailMember.activeSession)} remaining</p></section>}<section><p className="eyebrow mb-2">Member actions</p><div className="grid grid-cols-2 gap-2"><button className="admin-control-tile" onClick={()=>setWalletTopUp(detailMember)}><Wallet size={16}/><span>Top up wallet</span></button><button className="admin-control-tile" onClick={()=>setWalletEdit(detailMember)}><Pencil size={16}/><span>Edit balance</span></button><button className="admin-control-tile" onClick={()=>setWalletTransfer(detailMember)}><ArrowRightLeft size={16}/><span>Transfer funds</span></button><button className="admin-control-tile" disabled={!detailMember.activeSession} onClick={()=>setSessionTopUp(detailMember)}><Banknote size={16}/><span>Add session time</span></button><button className="admin-control-tile" disabled={transferableSessionSeconds(detailMember)<60} onClick={()=>setSessionTransfer(detailMember)}><Clock3 size={16}/><span>Transfer time</span></button><button className="admin-control-tile" onClick={()=>setEditing({...detailMember,password:''})}><Pencil size={16}/><span>Edit member</span></button></div></section></div>}
    </SidePanel>
    <Modal open={!!creating} onClose={()=>{setCreating(null);setActionError('')}} busy={savingMember} maxWidth="max-w-2xl" eyebrow="Member" title="Add Member" footer={<><Button variant="ghost" disabled={savingMember} onClick={()=>setCreating(null)}>Cancel</Button><Button variant="primary" disabled={savingMember} onClick={saveCreate}>{savingMember?'Adding…':'Add Member'}</Button></>}>{creating&&<>{actionError && <div className="mb-4 rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-sm text-ember-dim">{actionError}</div>}<MemberFields draft={creating} setDraft={setCreating} pcs={pcs} isCreate/></>}</Modal>
    <Modal open={!!editing} onClose={()=>setEditing(null)} busy={savingMember} maxWidth="max-w-2xl" eyebrow="Member" title={`Edit ${editing?.name??''}`} footer={<><Button variant="ghost" disabled={savingMember} onClick={()=>setEditing(null)}>Cancel</Button><Button variant="primary" disabled={savingMember||!canManageMembers||!editing?.name?.trim()||String(editing?.username ?? '').trim().length<3||!editing?.birthdate} onClick={saveEdit}>{savingMember?'Saving…':'Save Changes'}</Button></>}>{editing&&<>{actionError && <div className="mb-4 rounded-lg border border-ember/30 bg-ember/5 px-3 py-2 text-sm text-ember-dim">{actionError}</div>}<MemberFields draft={editing} setDraft={setEditing} pcs={pcs}/></>}</Modal>
    <WalletEditModal member={walletEdit} onClose={()=>setWalletEdit(null)} onSave={async (value,options)=>{setActionError('');await setMemberWallet(walletEdit.id,value,options);setWalletEdit(null)}} />
    <WalletTopUpModal member={walletTopUp} onClose={()=>setWalletTopUp(null)} onConfirm={async (amount,options)=>{setActionError('');await adminTopUp(walletTopUp.id,amount,options);setWalletTopUp(null)}} />
    <SessionTopUpModal member={sessionTopUp} ratePlans={ratePlans} onClose={()=>setSessionTopUp(null)} onConfirm={async (ratePlanId,amount,options)=>{setActionError('');await topUpMemberSession(sessionTopUp.id,ratePlanId,amount,options);setSessionTopUp(null)}}/>
    <WalletTransferModal member={walletTransfer} members={members} onClose={()=>setWalletTransfer(null)} onConfirm={async (destinationMemberId,amount,options)=>{setActionError('');await transferMemberWallet(walletTransfer.id,destinationMemberId,amount,options);setWalletTransfer(null)}}/>
    <SessionTransferModal member={sessionTransfer} members={members} onClose={()=>setSessionTransfer(null)} onConfirm={async (destinationMemberId,seconds,options)=>{setActionError('');await transferMemberSessionTime(sessionTransfer.id,destinationMemberId,seconds,options);setSessionTransfer(null)}}/>
    <BulkTopUpWalletModal open={bulkWalletOpen} targets={bulkMemberTargets} onClose={()=>setBulkWalletOpen(false)} onConfirm={async (ids,amount)=>{ const key=bulkWalletOperationKey||createOperationKey(); if(!bulkWalletOperationKey)setBulkWalletOperationKey(key); await runBulkMutation(ids,(id,operationKey)=>adminTopUp(id,amount,{operationKey,refresh:false}),key); showToast({title:'Wallets topped up',message:`${ids.length} member${ids.length===1?'':'s'} updated.`}); setBulkWalletOperationKey(null); setBulkWalletOpen(false) }} />
    <BulkTopUpSessionModal open={bulkSessionOpen} targets={bulkSessionTargets} ratePlans={ratePlans.filter((p)=>p.isActive!==false)} onClose={()=>setBulkSessionOpen(false)} onConfirm={async (ids,ratePlanId,amount)=>{ const key=bulkSessionOperationKey||createOperationKey(); if(!bulkSessionOperationKey)setBulkSessionOperationKey(key); await runBulkMutation(ids,(id,operationKey)=>topUpMemberSession(id,ratePlanId,amount,{operationKey,refresh:false}),key); showToast({title:'Session time added',message:`${ids.length} member${ids.length===1?'':'s'} updated.`}); setBulkSessionOperationKey(null); setBulkSessionOpen(false) }} />
    <ConfirmModal open={!!deleteTarget} onClose={()=>setDeleteTarget(null)} onConfirm={confirmDelete} busy={savingMember} eyebrow="Delete member" title="Delete this account?" confirmLabel="Delete member" message={`This permanently removes ${deleteTarget?.name || 'this member'} and their login account. Existing completed logs remain.`} />
  </AdminPageWorkspace>
}
