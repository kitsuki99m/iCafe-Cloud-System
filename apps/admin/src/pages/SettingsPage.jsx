import { useEffect, useMemo, useRef, useState } from 'react'
import { Building2, BellRing, Check, Cloud, CreditCard, ImageUp, Link2, LockKeyhole, PhilippinePeso, MonitorSmartphone, RefreshCw, ShieldCheck, Unplug, Volume2 } from 'lucide-react'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { apiGet, apiPost, apiUrl } from '../lib/api.js'
import fallbackLogo from '../assets/aktura-logo.svg'
import { isCloudAdmin, cloudBranchId, cloudCreateBranch, cloudGetBranchStatus, cloudGetSubscriptionOverview, cloudInvoke, cloudOrganizationId, cloudSelectBranch } from '../lib/cloudClient.js'
import { SUBSCRIPTION_PACKAGES, normalizeSubscriptionPackages, packageDefinition, formatPackagePrice } from '../lib/subscriptionPackages.js'
import { getAdminSoundPreferences, saveAdminSoundPreferences, testAdminSound } from '../lib/sound.js'
import { readSnapshot, writeSnapshot } from '../lib/localCache.js'
import { scopedPageCacheKey } from '../lib/pageCache.js'

const inputClass = 'w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 outline-none transition-colors focus:border-gold/50'

function Section({ id, icon: Icon, title, description, dirty, saving, onSave, children }) {
  return <section id={id} className="overview-card scroll-mt-28 overflow-hidden">
    <div className="flex items-start justify-between gap-4 border-b border-surface-line px-5 py-4">
      <div className="flex min-w-0 gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold-dim"><Icon size={16}/></span><div><h2 className="text-sm font-semibold text-ink-900">{title}</h2><p className="mt-0.5 text-xs leading-5 text-slate-soft">{description}</p></div></div>
      <Button variant="primary" disabled={!dirty || saving} onClick={onSave}>{saving ? 'Saving…' : 'Save'}</Button>
    </div>
    <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
  </section>
}

function Field({ label, hint, children }) { return <label className="block"><span className="eyebrow mb-1.5 block">{label}</span>{children}{hint && <span className="mt-1.5 block text-[11px] leading-4 text-ember-dim">{hint}</span>}</label> }

export default function SettingsPage() {
  const cloudMode=isCloudAdmin()
  const { user, updateCredentials } = useAuth()
  const cloudPrivileged=!cloudMode||['owner','admin'].includes(user?.cloudRole)
  const { settings, updateSettings, refresh } = useAppData()
  const [profile, setProfile] = useState({ cafeName:'', branch:'',branchLocation:'' })
  const [payment, setPayment] = useState({ gcashName:'', gcashNumber:'' })
  const [station,setStation]=useState({defaultBilling:'prepaid',lowTimeWarningMinutes:'5'})
  const [soundPrefs,setSoundPrefs]=useState(()=>getAdminSoundPreferences())
  const [savedSoundPrefs,setSavedSoundPrefs]=useState(()=>getAdminSoundPreferences())
  const [numberFormat, setNumberFormat] = useState('decimal')
  const [decimalPlaces, setDecimalPlaces] = useState(3)
  const [saving, setSaving] = useState('')
  const [saveError,setSaveError]=useState('')
  const [logoUrl,setLogoUrl]=useState(()=>cloudMode ? (settings.logoUrl || fallbackLogo) : (settings.logoUrl ? apiUrl(settings.logoUrl.replace(/^\/api/,'')) : apiUrl('/public/branding/logo')))
  const [pendingLogoDataUrl,setPendingLogoDataUrl]=useState('')
  const [logoWarning,setLogoWarning]=useState('')
  const [security,setSecurity]=useState({currentPin:'',currentPassword:'',newPin:'',newPassword:'',confirmPassword:'',authMethod:user?.authMethod || 'pin'})
  const [securityError,setSecurityError]=useState('')
  const [securityMessage,setSecurityMessage]=useState('')
  const [cloud,setCloud]=useState(null)
  const [subscription,setSubscription]=useState(null)
  const [cloudPairingCode,setCloudPairingCode]=useState('')
  const [cloudBusy,setCloudBusy]=useState('')
  const [cloudError,setCloudError]=useState('')
  const [cloudMessage,setCloudMessage]=useState('')
  const [newBranchName,setNewBranchName]=useState('')
  const previousServerSettingsRef=useRef(null)
  const cloudCacheKey=useMemo(()=>scopedPageCacheKey('settings-cloud',user),[user,cloudMode])
  useEffect(()=>{
    setSecurity((current)=>({...current,authMethod:user?.authMethod || 'pin'}))
  },[user?.authMethod])
  useEffect(()=>{let active=true;if(cloudCacheKey)void readSnapshot(cloudCacheKey).then(snapshot=>{if(!active||!snapshot)return;setCloud(snapshot.cloud??null);setSubscription(snapshot.subscription??null)}).finally(()=>{if(active)void loadCloudStatus()});else void loadCloudStatus();const onOnline=()=>void loadCloudStatus();const onVisible=()=>{if(document.visibilityState==='visible')void loadCloudStatus()};window.addEventListener('online',onOnline);document.addEventListener('visibilitychange',onVisible);return()=>{active=false;window.removeEventListener('online',onOnline);document.removeEventListener('visibilitychange',onVisible)}},[cloudCacheKey])
  useEffect(() => {
    const previous=previousServerSettingsRef.current
    const nextProfile={ cafeName:settings.cafeName ?? '', branch:settings.branch ?? '', branchLocation:settings.branchLocation ?? '' }
    const nextPayment={ gcashName:settings.gcashName ?? '', gcashNumber:settings.gcashNumber ?? '' }
    const nextStation={ defaultBilling:'prepaid', lowTimeWarningMinutes:String(settings.lowTimeWarningMinutes ?? 5) }
    const nextFormat=settings.numberFormat === 'whole' ? 'whole' : 'decimal'
    const nextDecimals=Math.max(1,Math.min(3,Number(settings.decimalPlaces)||3))

    // Preserve unsaved local drafts when unrelated realtime refreshes replace
    // the settings object. Clean sections still follow legitimate server edits.
    setProfile((current)=>{
      const old={cafeName:previous?.cafeName ?? '',branch:previous?.branch ?? '',branchLocation:previous?.branchLocation ?? ''}
      return !previous || (current.cafeName===old.cafeName&&current.branch===old.branch&&current.branchLocation===old.branchLocation) ? nextProfile : current
    })
    setPayment((current)=>{
      const old={gcashName:previous?.gcashName ?? '',gcashNumber:previous?.gcashNumber ?? ''}
      return !previous || (current.gcashName===old.gcashName&&current.gcashNumber===old.gcashNumber) ? nextPayment : current
    })
    setStation((current)=>!previous || (current.defaultBilling==='prepaid'&&current.lowTimeWarningMinutes===String(previous.lowTimeWarningMinutes ?? 5)) ? nextStation : current)
    setNumberFormat((current)=>!previous || current===(previous.numberFormat === 'whole' ? 'whole' : 'decimal') ? nextFormat : current)
    setDecimalPlaces((current)=>!previous || current===Math.max(1,Math.min(3,Number(previous.decimalPlaces)||3)) ? nextDecimals : current)
    if(!pendingLogoDataUrl && settings.logoUrl)setLogoUrl(cloudMode ? settings.logoUrl : apiUrl(settings.logoUrl.replace(/^\/api/,'')))
    previousServerSettingsRef.current={...settings}
  }, [settings,pendingLogoDataUrl])
  const profileDirty = useMemo(() => profile.cafeName !== (settings.cafeName ?? '') || profile.branch !== (settings.branch ?? '')||profile.branchLocation!==(settings.branchLocation??'') || numberFormat !== (settings.numberFormat === 'whole' ? 'whole' : 'decimal') || decimalPlaces !== Math.max(1,Math.min(3,Number(settings.decimalPlaces)||3)), [profile, numberFormat, decimalPlaces, settings])
  const paymentDirty = useMemo(() => payment.gcashName !== (settings.gcashName ?? '') || payment.gcashNumber !== (settings.gcashNumber ?? ''), [payment, settings])
  const stationDirty=(settings.defaultBilling ?? 'prepaid')!=='prepaid'||station.lowTimeWarningMinutes!==String(settings.lowTimeWarningMinutes ?? 5)
  const soundDirty=JSON.stringify(soundPrefs)!==JSON.stringify(savedSoundPrefs)
  const stationValid=Number(station.lowTimeWarningMinutes)>0
  const gcashValid = !payment.gcashNumber || /^09\d{9}$/.test(payment.gcashNumber)
  const currentAuthMethod=cloudMode ? 'password' : (user?.authMethod || 'pin')
  const needsCurrentPin=currentAuthMethod !== 'password'
  const needsCurrentPassword=currentAuthMethod !== 'pin'
  const currentCredentialsReady=(!needsCurrentPin || Boolean(security.currentPin)) && (!needsCurrentPassword || Boolean(security.currentPassword))
  const newPinValid=!security.newPin || /^\d{4,8}$/.test(security.newPin)
  const passwordsMatch=security.newPassword === security.confirmPassword
  const switchingFromPinToPassword=currentAuthMethod === 'pin' && security.authMethod !== 'pin'
  const passwordReady=!switchingFromPinToPassword || Boolean(security.newPassword)
  const managementPinReady=cloudMode || Boolean(settings.adminPinReady) || /^\d{4,8}$/.test(security.newPin)
  const securityDirty=cloudMode ? Boolean(security.newPassword) : Boolean(security.newPin || security.newPassword || security.authMethod !== currentAuthMethod)
  const securityValid=cloudMode ? (securityDirty && passwordsMatch) : (securityDirty && currentCredentialsReady && newPinValid && passwordsMatch && passwordReady && managementPinReady)
  async function saveSection(name, patch) { setSaving(name); setSaveError(''); try { await updateSettings(patch) } catch(error) { setSaveError(error?.message || 'Unable to save settings.') } finally { setSaving('') } }
  function saveSoundSettings(){setSaving('sounds');const saved=saveAdminSoundPreferences(soundPrefs);setSavedSoundPrefs(saved);setSoundPrefs(saved);setSaving('')}
  async function selectLogo(file){
    if(!file)return;
    if(!['image/png','image/svg+xml'].includes(file.type)){setLogoWarning('Please choose a PNG or safe SVG logo.');return}
    if(file.size>512*1024){setLogoWarning('Logo image is too large. Please choose an image that is 512 KB or smaller.');return}
    setSaving('logo');try{const dataUrl=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file)});setPendingLogoDataUrl(dataUrl);setLogoUrl(dataUrl)}catch(error){setLogoWarning(error?.message||'Unable to read that logo file.')}finally{setSaving('')}}
  async function saveProfile(){setSaving('profile');setSaveError('');try{await updateSettings({ ...profile, numberFormat, decimalPlaces });window.dispatchEvent(new CustomEvent('aezakmi:branding-updated'));if(pendingLogoDataUrl){const result=await apiPost('/branding/logo',{dataUrl:pendingLogoDataUrl});const next=result.logoUrl||`/api/public/branding/logo?v=${Date.now()}`;if(!cloudMode)setLogoUrl(apiUrl(next.replace(/^\/api/,'')));else setLogoUrl(pendingLogoDataUrl||fallbackLogo);setPendingLogoDataUrl('');window.dispatchEvent(new CustomEvent('aezakmi:branding-updated',{detail:{logoUrl:next,logoVersion:result.logoVersion||Date.now()}}))}}catch(error){setSaveError(error?.message||'Unable to save cafe profile.')}finally{setSaving('')}}
  async function saveSecurity(){
    if(!securityValid)return
    setSaving('security');setSecurityError('');setSecurityMessage('')
    try{
      const result=await updateCredentials(cloudMode ? {newPassword:security.newPassword} : {
        currentPin:security.currentPin,
        currentPassword:security.currentPassword,
        newPin:security.newPin,
        newPassword:security.newPassword,
        authMethod:security.authMethod,
      })
      if(!result.ok)throw new Error(result.error || 'Unable to update Admin credentials.')
      setSecurity({currentPin:'',currentPassword:'',newPin:'',newPassword:'',confirmPassword:'',authMethod:result.user?.authMethod || security.authMethod})
      setSecurityMessage(cloudMode?'Cloud account password updated.':'Admin credentials updated. Other Admin sessions were signed out.')
      await refresh()
    }catch(error){setSecurityError(error?.message || 'Unable to update Admin credentials.')}
    finally{setSaving('')}
  }

  async function loadCloudStatus(){
    setCloudError('')
    try{
      if(cloudMode){
        const [edge,sub]=await Promise.all([cloudGetBranchStatus(),cloudGetSubscriptionOverview()])
        const nextCloud={enabled:true,paired:Boolean(edge),edgeId:edge?.id||null,lastSeenAt:edge?.last_seen_at||null,lastSyncAt:edge?.last_sync_at||null,softwareVersion:edge?.software_version||null,statusSnapshot:edge?.status_snapshot||{}}
        const nextSubscription=sub||null
        setCloud(nextCloud);setSubscription(nextSubscription)
        if(cloudCacheKey)void writeSnapshot(cloudCacheKey,{cloud:nextCloud,subscription:nextSubscription})
        return
      }
      const result=await apiGet('/cloud/status');const nextCloud=result.cloud||null;setCloud(nextCloud);if(cloudCacheKey)void writeSnapshot(cloudCacheKey,{cloud:nextCloud,subscription:null})
    }catch(error){setCloudError(error?.message||'Unable to read cloud status. Showing cached status when available.')}
  }
  async function pairCloud(){
    setCloudBusy('pair');setCloudError('');setCloudMessage('')
    try{
      if(cloudMode){const branchId=cloudBranchId();if(!branchId)throw new Error('Select a branch first.');const result=await cloudInvoke('create-pairing-code',{branchId});setCloudPairingCode(result.pairingCode||'');setCloudMessage(`Pairing code generated. It expires ${result.expiresAt?new Date(result.expiresAt).toLocaleString():'in 15 minutes'}. Enter it in the local Emergency Admin → Settings → Aezakmi Cloud.`);return}
      const code=cloudPairingCode.trim().toUpperCase();if(!code)return;const result=await apiPost('/cloud/pair',{pairingCode:code});setCloud(result.cloud||null);if(cloudCacheKey)void writeSnapshot(cloudCacheKey,{cloud:result.cloud||null,subscription});setCloudPairingCode('');setCloudMessage('Edge server paired. Café Edge paired successfully and is now available as the branch fallback and synchronization peer.')
    }catch(error){setCloudError(error?.message||'Unable to pair this Edge server.')}finally{setCloudBusy('')}
  }
  async function syncCloud(){setCloudBusy('sync');setCloudError('');setCloudMessage('');try{if(cloudMode){await loadCloudStatus();setCloudMessage('Cloud Edge status refreshed.');return}const result=await apiPost('/cloud/sync-now',{});setCloud(result.status||result.cloud||cloud);if(cloudCacheKey)void writeSnapshot(cloudCacheKey,{cloud:result.status||result.cloud||cloud,subscription});setCloudMessage(result.skipped?'Cloud sync was skipped.':'Cloud heartbeat, outbox, and branch configuration sync completed.')}catch(error){setCloudError(error?.message||'Cloud sync failed.')}finally{setCloudBusy('')}}
  async function unpairCloud(){
    if(!window.confirm(cloudMode?'Revoke this branch Edge server from Aezakmi Cloud? Local LAN operation and SQLite data remain available.':'Unpair this local Edge server from Aezakmi Cloud? Local LAN operation and SQLite data will remain available.'))return
    setCloudBusy('unpair');setCloudError('');setCloudMessage('')
    try{if(cloudMode){if(!cloud?.edgeId)throw new Error('No Edge server is paired.');await cloudInvoke('revoke-edge',{edgeId:cloud.edgeId});await loadCloudStatus();setCloudMessage('Edge cloud credential revoked. Local café operation was not changed.');return}const result=await apiPost('/cloud/unpair',{remote:true});setCloud(result.cloud||null);if(cloudCacheKey)void writeSnapshot(cloudCacheKey,{cloud:result.cloud||null,subscription});setCloudMessage('Cloud pairing removed. Local café operation was not changed.')}catch(error){setCloudError(error?.message||'Unable to unpair this Edge server.')}finally{setCloudBusy('')}
  }
  async function createCloudBranch(){
    if(!cloudMode||!cloudPrivileged||!newBranchName.trim()||cloudBusy)return
    setCloudBusy('branch');setCloudError('');setCloudMessage('')
    try{
      const organizationId=cloudOrganizationId()
      if(!organizationId)throw new Error('No cloud organization is selected.')
      const result=await cloudCreateBranch(organizationId,newBranchName.trim())
      const branch=result?.branch
      if(!branch?.id)throw new Error('Cloud did not return the new branch.')
      cloudSelectBranch(branch)
      setNewBranchName('')
      setCloudMessage(`Branch “${branch.name}” created. Switching to it now…`)
      setTimeout(()=>window.location.reload(),150)
    }catch(error){setCloudError(error?.message||'Unable to create branch.')}finally{setCloudBusy('')}
  }

  return <><div className="admin-page-content"><h1 className="sr-only">Settings</h1>
    {saveError&&<div className="mb-4 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-dim">{saveError}</div>}
    <div className="grid items-start gap-5 xl:grid-cols-[190px_minmax(0,1fr)]">
      <nav className="settings-section-nav overview-card sticky top-[112px] hidden p-2 xl:block" aria-label="Settings sections">
        <p className="eyebrow px-3 pb-2 pt-2">Settings</p>
        {[['settings-branding','Branding',Building2],['settings-payments','Payments',CreditCard],['settings-customer','Customer Station',MonitorSmartphone],['settings-sounds','Notification Sounds',BellRing],['settings-cloud','Cloud',Cloud],['settings-security','Security',ShieldCheck]].map(([id,label,Icon])=><button type="button" key={id} onClick={()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth',block:'start'})} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-xs font-medium text-slate-soft transition-colors hover:bg-surface-raised hover:text-ink-900"><Icon size={14}/>{label}</button>)}
      </nav>
      <div className="space-y-5">
        <Section id="settings-branding" icon={Building2} title="Branding" description="Cafe identity shown across Admin, Customer Station, and generated reports." dirty={(profileDirty || Boolean(pendingLogoDataUrl)) && profile.cafeName.trim() && profile.branch.trim()} saving={saving==='profile'} onSave={saveProfile}>
          <div className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-surface-line bg-surface-raised/45 p-3"><img src={logoUrl} onError={event=>{event.currentTarget.src=fallbackLogo}} className="h-12 w-12 rounded-xl object-contain"/><div><p className="text-xs font-semibold text-ink-900">Brand logo</p><p className="text-[11px] text-slate-soft">{pendingLogoDataUrl?'New logo selected. Save Branding to apply it.':'PNG or safe SVG, up to 512 KB.'}</p></div><label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-xl border border-surface-line bg-surface px-3 py-2 text-xs font-semibold text-ink-900"><ImageUp size={14}/> {saving==='logo'?'Reading…':'Upload'}<input type="file" accept="image/png,image/svg+xml" className="hidden" disabled={saving==='logo'||saving==='profile'} onChange={event=>{selectLogo(event.target.files?.[0]);event.target.value=''}}/></label></div>
          <Field label="Cafe name"><input value={profile.cafeName} onChange={e=>setProfile({...profile,cafeName:e.target.value})} className={inputClass}/></Field><Field label="Branch"><input value={profile.branch} onChange={e=>setProfile({...profile,branch:e.target.value})} className={inputClass}/></Field><Field label="Branch location"><input value={profile.branchLocation} onChange={e=>setProfile({...profile,branchLocation:e.target.value})} placeholder="Davao City, Philippines" className={inputClass}/></Field>
          <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-surface-line bg-surface-raised/45 px-3 py-2.5"><span className="flex items-center gap-2 text-xs text-slate-soft"><PhilippinePeso size={14}/> Currency</span><span className="text-xs font-semibold text-ink-900">Philippine Peso (PHP)</span></div>
          <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-3"><p className="eyebrow mb-2">Admin number input format</p><div className="grid gap-2 sm:grid-cols-2">{[['decimal','Decimals','Choose 1–3 places below'],['whole','Whole numbers only','Example: 12']].map(([value,label,example])=><button type="button" key={value} onClick={()=>setNumberFormat(value)} className={`rounded-xl border px-3 py-3 text-left transition-colors ${numberFormat===value?'border-midnight/40 bg-midnight/10':'border-surface-line bg-surface'}`}><p className="text-xs font-semibold text-ink-900">{label}</p><p className="mt-1 text-[11px] text-slate-soft">{example}</p></button>)}</div>{numberFormat==='decimal'&&<div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-surface-line bg-surface px-3 py-2"><span className="text-xs text-slate-soft">Maximum decimal places</span><select value={decimalPlaces} onChange={event=>setDecimalPlaces(Number(event.target.value))} className="rounded-lg border border-surface-line bg-ink px-2 py-1 text-xs text-ink-900"><option value={1}>1 place</option><option value={2}>2 places</option><option value={3}>3 places</option></select></div>}</div>
        </Section>

        <Section id="settings-payments" icon={CreditCard} title="Payments" description="GCash destination customers see before submitting a top-up request." dirty={paymentDirty && gcashValid} saving={saving==='payment'} onSave={()=>saveSection('payment',payment)}>
          <Field label="GCash account name"><input value={payment.gcashName} onChange={e=>setPayment({...payment,gcashName:e.target.value})} placeholder="Aezakmi Cafe" className={inputClass}/></Field><Field label="GCash number" hint={!gcashValid?'Use an 11-digit Philippine mobile number beginning with 09.':''}><input value={payment.gcashNumber} onChange={e=>setPayment({...payment,gcashNumber:e.target.value.replace(/\D/g,'').slice(0,11)})} inputMode="numeric" placeholder="09171234567" className={`${inputClass} ${!gcashValid?'border-ember/60':''}`}/></Field><div className="sm:col-span-2 rounded-xl border border-teal/20 bg-teal/5 px-3 py-3"><p className="eyebrow mb-1">Customer preview</p><p className="text-xs text-slate-soft">Send payment to <strong className="text-ink-900">{payment.gcashName||'GCash account name'}</strong> · <span className="stat-figure text-ink-900">{payment.gcashNumber||'09•• ••• ••••'}</span></p></div>
        </Section>


        <Section id="settings-customer" icon={MonitorSmartphone} title="Customer Station" description="Default session behavior and time-warning presentation for customer PCs." dirty={stationDirty && stationValid} saving={saving==='station'} onSave={()=>saveSection('station',{defaultBilling:'prepaid',lowTimeWarningMinutes:Number(station.lowTimeWarningMinutes)})}>
          <Field label="Billing mode"><div className="flex h-[38px] items-center rounded-lg border border-surface-line bg-surface-raised/45 px-3 text-sm font-semibold text-ink-900">Prepaid only</div></Field><Field label="Low-time warning (minutes)" hint={!stationValid?'Enter a value greater than zero.':''}><input inputMode="numeric" value={station.lowTimeWarningMinutes} onChange={e=>setStation({...station,lowTimeWarningMinutes:e.target.value.replace(/\D/g,'')})} className={inputClass}/></Field><div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-3 text-[11px] leading-5 text-slate-soft">This production build accepts prepaid sessions only. Rate pricing remains managed under <strong className="text-ink-900">Rates</strong>.</div>
        </Section>

        <Section id="settings-sounds" icon={BellRing} title="Notification Sounds" description="Browser-local audio alerts for requests, sessions, low time, and station problems." dirty={soundDirty} saving={saving==='sounds'} onSave={saveSoundSettings}>
          <Field label="Sound notifications">
            <button type="button" onClick={()=>setSoundPrefs({...soundPrefs,enabled:!soundPrefs.enabled})} className={`flex h-[38px] w-full items-center justify-between rounded-lg border px-3 text-sm font-semibold transition-colors ${soundPrefs.enabled?'border-teal/35 bg-teal/10 text-teal-dim':'border-surface-line bg-surface-raised/45 text-slate-soft'}`}><span>{soundPrefs.enabled?'Enabled':'Muted'}</span><span className={`h-2.5 w-2.5 rounded-full ${soundPrefs.enabled?'bg-teal':'bg-slate-soft/40'}`}/></button>
          </Field>
          <Field label={`Volume · ${Math.round(Number(soundPrefs.volume||0)*100)}%`}>
            <div className="flex h-[38px] items-center gap-3 rounded-lg border border-surface-line bg-surface-raised/45 px-3"><Volume2 size={15} className="shrink-0 text-slate-soft"/><input type="range" min="0" max="100" step="5" value={Math.round(Number(soundPrefs.volume||0)*100)} onChange={e=>setSoundPrefs({...soundPrefs,volume:Number(e.target.value)/100})} className="w-full accent-current"/></div>
          </Field>
          <div className="sm:col-span-2 grid gap-2 sm:grid-cols-4">{[['payments','Payments'],['help','Help requests'],['sessions','Sessions'],['stations','PC / network']].map(([key,label])=><button type="button" key={key} onClick={()=>setSoundPrefs({...soundPrefs,[key]:!soundPrefs[key]})} className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${soundPrefs[key]?'border-gold/35 bg-gold/8':'border-surface-line bg-surface'}`}><p className={`text-xs font-semibold ${soundPrefs[key]?'text-gold-dim':'text-slate-soft'}`}>{label}</p><p className="mt-0.5 text-[10px] text-slate-soft">{soundPrefs[key]?'Sound on':'Muted'}</p></button>)}</div>
          <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-line bg-surface-raised/45 p-3"><p className="max-w-2xl text-[11px] leading-5 text-slate-soft">Browser audio unlocks after the first click or key press in the Admin tab. Settings are saved only on this browser/device so each counter can choose its own volume.</p><Button type="button" variant="secondary" size="sm" onClick={()=>testAdminSound('help',soundPrefs)}>Test sound</Button></div>
        </Section>

        <section id="settings-cloud" className="overview-card scroll-mt-28 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-line px-5 py-4">
            <div className="flex min-w-0 gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-midnight/10 text-midnight"><Cloud size={16}/></span><div><h2 className="text-sm font-semibold text-ink-900">Aezakmi Cloud</h2><p className="mt-0.5 text-xs leading-5 text-slate-soft">{cloudMode?'Manage this branch Edge connection. Generate a one-time code here, then enter it on the local Emergency Admin to pair the café.':'Pair this local Edge server to Aezakmi Cloud. LAN sessions keep using SQLite even when cloud access is unavailable.'}</p></div></div>
            {cloud?.paired&&<Button variant="ghost" size="sm" icon={RefreshCw} disabled={Boolean(cloudBusy)} onClick={syncCloud}>{cloudBusy==='sync'?'Syncing…':'Sync now'}</Button>}
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            {!cloud&&<div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4 text-xs text-slate-soft">Loading cloud status…</div>}
            {cloudMode&&!cloudPrivileged&&<div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4 text-[11px] leading-5 text-slate-soft">Your <strong className="text-ink-900">{user?.cloudRole||'viewer'}</strong> role can view this branch, but only organization owners/admins can create branches, generate Edge pairing codes, or revoke an Edge.</div>}
            {cloudMode&&subscription&&<div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4">
              {(()=>{const catalog=normalizeSubscriptionPackages(subscription.packageCatalog);const current=packageDefinition(subscription.plan,catalog);const ultraFloor=Math.max(1,Number(packageDefinition('gold',catalog).maxStations||50)+1);return <><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Subscription</p><p className="mt-1 text-base font-semibold text-ink-900">{current.label}</p><p className="mt-1 text-[11px] leading-5 text-slate-soft">{subscription.stationCount} of {subscription.maxStations} stations used across {subscription.branchCount} active branch{subscription.branchCount===1?'':'es'}.</p></div><span className="rounded-full bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold-dim">{subscription.status}</span></div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-midnight/8"><div className="h-full rounded-full bg-gold" style={{width:`${Math.min(100,subscription.maxStations>0?(subscription.stationCount/subscription.maxStations)*100:0)}%`}}/></div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{catalog.map(pkg=><div key={pkg.id} className={`rounded-lg border px-2 py-2 ${subscription.plan===pkg.id?'border-gold/45 bg-gold/8':'border-surface-line bg-soft-white'}`}><p className={`text-[10px] font-semibold ${subscription.plan===pkg.id?'text-gold-dim':'text-ink-900'}`}>{pkg.label}</p><p className="mt-0.5 text-[9px] text-slate-soft">{pkg.maxStations===null?`${ultraFloor}+ / custom`:`Up to ${pkg.maxStations}`} · {formatPackagePrice(pkg)}</p></div>)}</div>
              <p className="mt-3 text-[10px] leading-4 text-slate-soft">Package pricing and station allowances are maintained by the Aezakmi platform developer. Ultra supports a custom organization-wide station cap above Gold, or multi-branch deployments.</p></>})()}
            </div>}
            {cloudMode&&cloudPrivileged&&<div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-semibold text-ink-900">Add another branch</p><p className="mt-1 text-[11px] leading-5 text-slate-soft">Creates a branch inside the current organization. Your subscription branch limit is enforced in Supabase.</p></div><span className="rounded-full bg-midnight/10 px-2.5 py-1 font-mono text-[10px] text-midnight">{cloudOrganizationId()||'No organization'}</span></div><div className="mt-3 flex flex-col gap-2 sm:flex-row"><input value={newBranchName} onChange={e=>setNewBranchName(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();createCloudBranch()}}} placeholder="New branch name" className={`${inputClass} flex-1`}/><Button type="button" variant="secondary" disabled={cloudBusy==='branch'||!newBranchName.trim()} onClick={createCloudBranch}>{cloudBusy==='branch'?'Creating…':'Create branch'}</Button></div></div>}
            {cloud&&!cloud.enabled&&<div className="sm:col-span-2 rounded-xl border border-gold/25 bg-gold/5 p-4"><p className="text-xs font-semibold text-ink-900">Cloud integration is disabled on this server.</p><p className="mt-1 text-[11px] leading-5 text-slate-soft">Set <code className="rounded bg-surface px-1 py-0.5">AEZAKMI_CLOUD_ENABLED=true</code>, <code className="rounded bg-surface px-1 py-0.5">AEZAKMI_SUPABASE_URL</code>, and <code className="rounded bg-surface px-1 py-0.5">AEZAKMI_SUPABASE_PUBLISHABLE_KEY</code> in the Edge backend environment, then restart it.</p></div>}
            {cloud?.enabled&&!cloud.paired&&<>
              {cloudMode ? <>
                <Field label="One-time Edge pairing code" hint="Generate a code, then enter it on the local Emergency Admin. It expires automatically."><input readOnly value={cloudPairingCode} placeholder="Generate a code" className={`${inputClass} font-mono tracking-[0.16em]`}/></Field>
                <div className="flex items-end"><Button className="w-full" icon={Link2} disabled={cloudBusy==='pair'||!cloudPrivileged} onClick={pairCloud}>{cloudBusy==='pair'?'Generating…':'Generate pairing code'}</Button></div>
              </> : <>
                <Field label="Branch pairing code" hint="Create the one-time code from Aezakmi Cloud. Codes use the XXXX-XXXX format and expire automatically."><input value={cloudPairingCode} onChange={e=>setCloudPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,9))} placeholder="ABCD-2345" autoComplete="off" className={inputClass}/></Field>
                <div className="flex items-end"><Button className="w-full" icon={Link2} disabled={cloudBusy==='pair'||!cloudPairingCode.trim()} onClick={pairCloud}>{cloudBusy==='pair'?'Pairing…':'Pair branch'}</Button></div>
              </>}
              <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-3 text-[11px] leading-5 text-slate-soft">Customer Stations are cloud-primary and connect to Supabase during normal operation. Café Edge remains the LAN fallback and local recovery authority when Cloud is unavailable.</div>
            </>}
            {cloud?.paired&&<>
              {(cloudMode?[['Branch',cloudBranchId()],['Edge server',cloud.edgeId],['Version',cloud.softwareVersion],['Last sync',cloud.lastSyncAt?new Date(cloud.lastSyncAt).toLocaleString():'—']]:[['Organization',cloud.organizationId],['Branch',cloud.branchId],['Edge server',cloud.edgeId],['Installation',cloud.installationId]]).map(([label,value])=><div key={label} className="rounded-xl border border-surface-line bg-surface-raised/45 p-3"><p className="eyebrow mb-1">{label}</p><p className="break-all font-mono text-[10px] leading-4 text-ink-900">{value||'—'}</p></div>)}
              <div className="rounded-xl border border-surface-line bg-surface-raised/45 p-3"><p className="eyebrow mb-1">Cloud status</p><p className="text-xs font-semibold text-teal-dim">Paired</p><p className="mt-1 text-[11px] text-slate-soft">Last heartbeat: {cloud.lastSeenAt?new Date(cloud.lastSeenAt).toLocaleString():'Not yet synced'}</p></div>
              <div className="rounded-xl border border-surface-line bg-surface-raised/45 p-3"><p className="eyebrow mb-1">Synchronization</p><p className="text-xs font-semibold text-ink-900">{cloudMode?'Supabase ↔ Edge':'Outbox'}</p><p className="mt-1 text-[11px] text-slate-soft">{cloudMode?'Operational data is mirrored in the background.':`${cloud.sync?.pending??0} pending · ${cloud.sync?.failed??0} failed`}</p></div>
              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-line bg-surface p-3"><p className="text-[11px] leading-5 text-slate-soft">Cloud is the primary control and data plane. If Cloud is unavailable, Café Edge keeps local sessions and station control available until synchronization is restored.</p><Button variant="danger" size="sm" icon={Unplug} disabled={Boolean(cloudBusy)||!cloudPrivileged} onClick={unpairCloud}>{cloudBusy==='unpair'?(cloudMode?'Revoking…':'Unpairing…'):(cloudMode?'Revoke Edge':'Unpair cloud')}</Button></div>
            </>}
            {cloudError&&<div className="sm:col-span-2 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">{cloudError}</div>}
            {cloudMessage&&<div className="sm:col-span-2 rounded-xl border border-teal/30 bg-teal/10 px-3 py-2 text-xs font-medium text-teal-dim">{cloudMessage}</div>}
          </div>
        </section>

        <Section id="settings-security" icon={ShieldCheck} title={cloudMode?'Cloud account security':'Admin credentials'} description={cloudMode?'Update the Supabase Auth password for this cloud account. Local Edge Management PINs remain branch-local.':'Manage the login method, password, and permanent Management PIN used by protected Customer Station controls.'} dirty={securityValid} saving={saving==='security'} onSave={saveSecurity}>
          {cloudMode ? <>
            <Field label="New cloud password"><input type="password" value={security.newPassword} onChange={e=>setSecurity({...security,newPassword:e.target.value})} placeholder="New password" autoComplete="new-password" className={inputClass}/></Field>
            <Field label="Confirm new password" hint={!passwordsMatch?'Passwords must match.':''}><input type="password" value={security.confirmPassword} onChange={e=>setSecurity({...security,confirmPassword:e.target.value})} placeholder="Confirm new password" autoComplete="new-password" className={`${inputClass} ${!passwordsMatch?'border-ember/60':''}`}/></Field>
            <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-3 text-[11px] leading-5 text-slate-soft">Cloud sign-in is managed by Supabase Auth. The local Management PIN used by Customer emergency/server controls is intentionally not synchronized to cloud.</div>
          </> : <>
          <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-xl border border-surface-line bg-surface-raised/45 p-3">
            <div><p className="text-xs font-semibold text-ink-900">Management PIN</p><p className="mt-1 text-[11px] leading-5 text-slate-soft">This PIN stays active for Customer Server Connection and emergency controls even when Admin login uses a password.</p></div>
            <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${settings.adminPinReady?'bg-teal/10 text-teal-dim':'bg-ember/10 text-ember-dim'}`}>{settings.adminPinReady?<Check size={12}/>:<LockKeyhole size={12}/>} {settings.adminPinReady?'PIN ready':'PIN required'}</span>
          </div>
          <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface p-4">
            <p className="eyebrow mb-1">Current Admin credentials</p>
            <p className="mb-3 text-[11px] leading-5 text-slate-soft">Confirm the credentials required by the current <strong className="text-ink-900">{currentAuthMethod === 'pin_password' ? 'PIN + Password' : currentAuthMethod === 'password' ? 'Password' : 'PIN'}</strong> login mode before applying security changes.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {needsCurrentPin&&<Field label="Current PIN"><input type="password" inputMode="numeric" maxLength={8} value={security.currentPin} onChange={e=>setSecurity({...security,currentPin:e.target.value.replace(/\D/g,'').slice(0,8)})} placeholder="Current Admin PIN" autoComplete="off" className={inputClass}/></Field>}
              {needsCurrentPassword&&<Field label="Current password"><input type="password" value={security.currentPassword} onChange={e=>setSecurity({...security,currentPassword:e.target.value})} placeholder="Current Admin password" autoComplete="current-password" className={inputClass}/></Field>}
            </div>
          </div>
          <Field label="New Management PIN" hint={security.newPin&&!newPinValid?'Use 4 to 8 digits.':'Leave blank to keep the current Management PIN.'}><input type="password" inputMode="numeric" maxLength={8} value={security.newPin} onChange={e=>setSecurity({...security,newPin:e.target.value.replace(/\D/g,'').slice(0,8)})} placeholder="New PIN" autoComplete="new-password" className={`${inputClass} ${security.newPin&&!newPinValid?'border-ember/60':''}`}/></Field>
          <div className="grid gap-3">
            <Field label="New password"><input type="password" value={security.newPassword} onChange={e=>setSecurity({...security,newPassword:e.target.value})} placeholder="Leave blank to keep current password" autoComplete="new-password" className={inputClass}/></Field>
            <Field label="Confirm new password" hint={!passwordsMatch?'Passwords must match.':''}><input type="password" value={security.confirmPassword} onChange={e=>setSecurity({...security,confirmPassword:e.target.value})} placeholder="Confirm new password" autoComplete="new-password" className={`${inputClass} ${!passwordsMatch?'border-ember/60':''}`}/></Field>
          </div>
          <div className="sm:col-span-2">
            <p className="eyebrow mb-2">Admin login method</p>
            <div className="grid gap-2 sm:grid-cols-3">{[['pin','PIN'],['password','Password'],['pin_password','PIN + Password']].map(([value,label])=><button type="button" key={value} onClick={()=>setSecurity({...security,authMethod:value})} className={`rounded-xl border px-3 py-3 text-left transition-colors ${security.authMethod===value?'border-gold/50 bg-gold/10':'border-surface-line bg-surface'}`}><p className={`text-xs font-semibold ${security.authMethod===value?'text-gold-dim':'text-ink-900'}`}>{label}</p><p className="mt-1 text-[11px] leading-4 text-slate-soft">{value==='pin'?'Admin signs in with the PIN.':value==='password'?'Admin signs in with username and password.':'Admin must provide both factors.'}</p></button>)}</div>
            {switchingFromPinToPassword&&!security.newPassword&&<p className="mt-2 text-[11px] font-medium text-ember-dim">Set a new password before enabling password login.</p>}
            {!managementPinReady&&<p className="mt-2 text-[11px] font-medium text-ember-dim">Set a Management PIN before saving. It protects Customer Station server and emergency controls.</p>}
          </div>
          </>}
          {securityError&&<div className="sm:col-span-2 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">{securityError}</div>}
          {securityMessage&&<div className="sm:col-span-2 rounded-xl border border-teal/30 bg-teal/10 px-3 py-2 text-xs font-medium text-teal-dim">{securityMessage}</div>}
        </Section>
      </div>
    </div>
  </div><Modal open={Boolean(logoWarning)} onClose={()=>setLogoWarning('')} title="Logo upload warning" footer={<Button variant="primary" onClick={()=>setLogoWarning('')}>OK</Button>}><p className="text-sm leading-6 text-slate-soft">{logoWarning}</p></Modal></>
}
