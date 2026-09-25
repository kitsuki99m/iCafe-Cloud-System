import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Building2, BellRing, Check, Cloud, CreditCard, ImageUp, Link2, LockKeyhole, PhilippinePeso, MonitorSmartphone, RefreshCw, ShieldCheck, Unplug, Volume2, Users, UserPlus, Trash2, Send, ChevronRight } from 'lucide-react'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import ConfirmModal from '../components/common/ConfirmModal.jsx'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useEsportsTheme } from '../context/EsportsThemeContext.jsx'
import { apiGet, apiPost, apiUrl } from '../lib/api.js'
import { showToast } from '../lib/toast.js'
import fallbackLogo from '../assets/aktura-logo.svg'
import { isCloudAdmin, cloudBranchId, cloudCreateBranch, cloudGetBranchStatus, cloudGetSubscriptionOverview, cloudInvoke, cloudOrganizationId, cloudSelectBranch } from '../lib/cloudClient.js'
import { normalizeSubscriptionPackages, packageDefinition, formatPackagePrice } from '../lib/subscriptionPackages.js'
import { getAdminSoundPreferences, saveAdminSoundPreferences, testAdminSound } from '../lib/sound.js'
import { readSnapshot, writeSnapshot } from '../lib/localCache.js'
import { scopedPageCacheKey } from '../lib/pageCache.js'

const inputClass = 'w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-sm text-ink-900 outline-none transition-colors focus:border-gold/50'

function Section({ id, icon: Icon, title, description, dirty, saving, onSave, children }) {
  return (
    <section id={id} className="overview-card overflow-hidden transition-all duration-200">
      <div className="flex items-start justify-between gap-4 border-b border-surface-line px-5 py-4">
        <div className="flex min-w-0 gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold-dim">
            <Icon size={16}/>
          </span>
          <div>
            <h2 className="text-sm font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-[11px] text-slate-soft">{description}</p>}
          </div>
        </div>
        {onSave && (
          <Button variant="primary" disabled={!dirty || saving} onClick={onSave}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="eyebrow mb-1.5 block">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11px] leading-4 text-ember-dim">{hint}</span>}
    </label>
  )
}

export default function SettingsPage() {
  const cloudMode = isCloudAdmin()
  const { user, updateCredentials } = useAuth()
  const { isEsportsMode } = useEsportsTheme()
  const [searchParams, setSearchParams] = useSearchParams()
  const cloudPrivileged = !cloudMode || ['owner', 'admin'].includes(user?.cloudRole)
  const { settings, updateSettings, refresh } = useAppData()
  
  const [profile, setProfile] = useState({ displayName: '', cafeName: '', branch: '', branchLocation: '' })
  const [payment, setPayment] = useState({ gcashName: '', gcashNumber: '' })
  const [station, setStation] = useState({ defaultBilling: 'prepaid', lowTimeWarningMinutes: '5' })
  const [soundPrefs, setSoundPrefs] = useState(() => getAdminSoundPreferences())
  const [savedSoundPrefs, setSavedSoundPrefs] = useState(() => getAdminSoundPreferences())
  const [numberFormat, setNumberFormat] = useState('decimal')
  const [decimalPlaces, setDecimalPlaces] = useState(3)
  const [saving, setSaving] = useState('')
  const [saveError,setSaveError]=useState('')
  const [logoUrl, setLogoUrl] = useState(() => cloudMode ? (settings.logoUrl || fallbackLogo) : (settings.logoUrl ? apiUrl(settings.logoUrl.replace(/^\/api/, '')) : apiUrl('/public/branding/logo')))
  const [pendingLogoDataUrl, setPendingLogoDataUrl] = useState('')
  const [logoWarning, setLogoWarning] = useState('')
  const [security, setSecurity] = useState({ currentPin: '', currentPassword: '', newPin: '', newPassword: '', confirmPassword: '', authMethod: user?.authMethod || 'pin' })
  const [securityError, setSecurityError] = useState('')
  const [securityMessage, setSecurityMessage] = useState('')
  const [cloud, setCloud] = useState(null)
  const [subscription, setSubscription] = useState(null)
  const [cloudPairingCode, setCloudPairingCode] = useState('')
  const [cloudBusy, setCloudBusy] = useState('')
  const [cloudError, setCloudError] = useState('')
  const [cloudMessage, setCloudMessage] = useState('')
  const [cloudUnpairConfirmOpen, setCloudUnpairConfirmOpen] = useState(false)
  const [newBranchName, setNewBranchName] = useState('')
  const [teamMembers, setTeamMembers] = useState(() => {
    try {
      const saved = localStorage.getItem('aezakmi_team_members')
      if (saved) return JSON.parse(saved)
    } catch {}
    return [
      {
        id: 'owner-primary',
        name: user?.name || 'Business Owner',
        email: user?.email || 'owner@icafe.ph',
        role: user?.cloudRole || 'owner',
        branch: settings?.branch || 'Main Branch',
        status: 'active',
        joinedAt: new Date().toISOString(),
      },
    ]
  })
  const [inviteName, setInviteName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('cashier')
  const [inviteBranch, setInviteBranch] = useState('')
  const [inviteBusy, setInviteBusy] = useState(false)
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviteError, setInviteError] = useState('')
  const [deleteMemberTarget, setDeleteMemberTarget] = useState(null)
  const previousServerSettingsRef = useRef(null)
  const cloudCacheKey = useMemo(() => scopedPageCacheKey('settings-cloud', user), [user, cloudMode])

  const activeTab = useMemo(() => {
    const tab = searchParams.get('tab')
    return ['branding', 'payments', 'customer', 'sounds', 'team', 'cloud', 'security'].includes(tab)
      ? tab
      : 'branding'
  }, [searchParams])

  const setActiveTab = (tabId) => {
    setSearchParams({ tab: tabId }, { replace: true })
    setTimeout(() => {
      document.getElementById(`settings-${tabId}`)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    }, 10)
  }

  useEffect(() => {
    setSecurity((current) => ({ ...current, authMethod: user?.authMethod || 'pin' }))
  }, [user?.authMethod])

  useEffect(() => {
    let active = true
    if (cloudCacheKey) {
      void readSnapshot(cloudCacheKey).then((snapshot) => {
        if (!active || !snapshot) return
        setCloud(snapshot.cloud ?? null)
        setSubscription(snapshot.subscription ?? null)
      }).finally(() => {
        if (active) void loadCloudStatus()
      })
    } else {
      void loadCloudStatus()
    }
    const onOnline = () => void loadCloudStatus()
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadCloudStatus()
    }
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      active = false
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [cloudCacheKey])

  useEffect(() => {
    const previous = previousServerSettingsRef.current
    const nextProfile = { displayName: settings.displayName ?? '', cafeName: settings.cafeName ?? '', branch: settings.branch ?? '', branchLocation: settings.branchLocation ?? '' }
    const nextPayment = { gcashName: settings.gcashName ?? '', gcashNumber: settings.gcashNumber ?? '' }
    const nextStation = { defaultBilling: 'prepaid', lowTimeWarningMinutes: String(settings.lowTimeWarningMinutes ?? 5) }
    const nextFormat = settings.numberFormat === 'whole' ? 'whole' : 'decimal'
    const nextDecimals = Math.max(1, Math.min(3, Number(settings.decimalPlaces) || 3))

    // Preserve unsaved local drafts when unrelated realtime refreshes replace
    // the settings object. Clean sections still follow legitimate server edits.
    setProfile((current) => {
      const old = { displayName: previous?.displayName ?? '', cafeName: previous?.cafeName ?? '', branch: previous?.branch ?? '', branchLocation: previous?.branchLocation ?? '' }
      return !previous || (current.displayName === old.displayName && current.cafeName === old.cafeName && current.branch === old.branch && current.branchLocation === old.branchLocation) ? nextProfile : current
    })
    setPayment((current) => {
      const old = { gcashName: previous?.gcashName ?? '', gcashNumber: previous?.gcashNumber ?? '' }
      return !previous || (current.gcashName === old.gcashName && current.gcashNumber === old.gcashNumber) ? nextPayment : current
    })
    setStation((current) => !previous || (current.defaultBilling === 'prepaid' && current.lowTimeWarningMinutes === String(previous.lowTimeWarningMinutes ?? 5)) ? nextStation : current)
    setNumberFormat((current) => !previous || current === (previous.numberFormat === 'whole' ? 'whole' : 'decimal') ? nextFormat : current)
    setDecimalPlaces((current) => !previous || current === Math.max(1, Math.min(3, Number(previous.decimalPlaces) || 3)) ? nextDecimals : current)
    if (!pendingLogoDataUrl && settings.logoUrl) setLogoUrl(cloudMode ? settings.logoUrl : apiUrl(settings.logoUrl.replace(/^\/api/, '')))
    previousServerSettingsRef.current = { ...settings }
  }, [settings, pendingLogoDataUrl])

  const profileDirty = useMemo(() => profile.displayName !== (settings.displayName ?? '') || profile.cafeName !== (settings.cafeName ?? '') || profile.branch !== (settings.branch ?? '') || profile.branchLocation !== (settings.branchLocation ?? '') || numberFormat !== (settings.numberFormat === 'whole' ? 'whole' : 'decimal') || decimalPlaces !== Math.max(1, Math.min(3, Number(settings.decimalPlaces) || 3)), [profile, numberFormat, decimalPlaces, settings])
  const paymentDirty = useMemo(() => payment.gcashName !== (settings.gcashName ?? '') || payment.gcashNumber !== (settings.gcashNumber ?? ''), [payment, settings])
  const stationDirty = (settings.defaultBilling ?? 'prepaid') !== 'prepaid' || station.lowTimeWarningMinutes !== String(settings.lowTimeWarningMinutes ?? 5)
  const soundDirty = JSON.stringify(soundPrefs) !== JSON.stringify(savedSoundPrefs)
  const stationValid = Number(station.lowTimeWarningMinutes) > 0
  const gcashValid = !payment.gcashNumber || /^09\d{9}$/.test(payment.gcashNumber)
  const currentAuthMethod = cloudMode ? 'password' : (user?.authMethod || 'pin')
  const needsCurrentPin = currentAuthMethod !== 'password'
  const needsCurrentPassword = currentAuthMethod !== 'pin'
  const currentCredentialsReady = (!needsCurrentPin || Boolean(security.currentPin)) && (!needsCurrentPassword || Boolean(security.currentPassword))
  const newPinValid = !security.newPin || /^\d{4,8}$/.test(security.newPin)
  const passwordsMatch = security.newPassword === security.confirmPassword
  const switchingFromPinToPassword = currentAuthMethod === 'pin' && security.authMethod !== 'pin'
  const passwordReady = !switchingFromPinToPassword || Boolean(security.newPassword)
  const managementPinReady = cloudMode || Boolean(settings.adminPinReady) || /^\d{4,8}$/.test(security.newPin)
  const securityDirty = cloudMode ? Boolean(security.newPassword) : Boolean(security.newPin || security.newPassword || security.authMethod !== currentAuthMethod)
  const securityValid = cloudMode ? (securityDirty && passwordsMatch) : (securityDirty && currentCredentialsReady && newPinValid && passwordsMatch && passwordReady && managementPinReady)

  const tabDefs = useMemo(() => [
    { id: 'branding', label: 'Branding', icon: Building2, desc: 'Cafe identity & logo', dirty: (profileDirty || Boolean(pendingLogoDataUrl)) && Boolean(profile.cafeName.trim()) && Boolean(profile.branch.trim()) },
    { id: 'payments', label: 'Payments', icon: CreditCard, desc: 'GCash customer top-up', dirty: paymentDirty && gcashValid },
    { id: 'customer', label: 'Customer Station', icon: MonitorSmartphone, desc: 'Billing & warning threshold', dirty: stationDirty && stationValid },
    { id: 'sounds', label: 'Audio & Alerts', icon: BellRing, desc: 'Notification sound controls', dirty: soundDirty },
    { id: 'team', label: 'Team & Staff', icon: Users, desc: 'Employee access & roles', dirty: false },
    { id: 'cloud', label: 'Aezakmi Cloud', icon: Cloud, desc: 'Edge sync & multi-branch', dirty: false },
    { id: 'security', label: 'Security & PIN', icon: ShieldCheck, desc: 'Credentials & Local PIN', dirty: securityValid },
  ], [profileDirty, pendingLogoDataUrl, profile.cafeName, profile.branch, paymentDirty, gcashValid, stationDirty, stationValid, soundDirty, securityValid])

  async function handleInviteStaff(e) {
    if (e?.preventDefault) e.preventDefault()
    if (!inviteName.trim()) {
      setInviteError('Please enter the employee full name.')
      return
    }
    const cleanEmail = inviteEmail.trim().toLowerCase()
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setInviteError('Please enter a valid email address.')
      return
    }
    if (teamMembers.some((m) => m.email.toLowerCase() === cleanEmail)) {
      setInviteError('A team member with this email already exists.')
      return
    }
    setInviteBusy(true)
    setInviteError('')
    setInviteSuccess('')
    try {
      const branchName = inviteBranch || profile.branch || settings.branch || 'Main Branch'
      const response = await apiPost('/team/invite', {
        name: inviteName.trim(),
        email: cleanEmail,
        role: inviteRole,
        branch: branchName,
      })
      const newMember = {
        id: 'staff_' + Date.now(),
        name: inviteName.trim(),
        email: cleanEmail,
        role: inviteRole,
        branch: branchName,
        status: 'invited',
        temporaryPassword: response?.temporaryPassword || null,
        invitedAt: new Date().toISOString(),
      }
      const updated = [...teamMembers, newMember]
      setTeamMembers(updated)
      try {
        localStorage.setItem('aezakmi_team_members', JSON.stringify(updated))
      } catch {}
      setInviteName('')
      setInviteEmail('')
      setInviteRole('cashier')
      const tempPassNote = response?.temporaryPassword ? ` Temporary password: ${response.temporaryPassword}` : ''
      const msg = response?.message ? `${response.message}${tempPassNote}` : (response?.emailSent ? `Invitation delivered to ${cleanEmail}.${tempPassNote}` : `Invitation registered for ${cleanEmail}.${tempPassNote}`)
      setInviteSuccess(msg)
      showToast({
        title: response?.emailSent ? 'Employee Invited' : 'Employee Registered',
        message: msg,
        tone: response?.emailSent ? 'success' : 'warning',
      })
    } catch (err) {
      setInviteError(err?.message || 'Failed to send invitation.')
      showToast({
        title: 'Invitation Error',
        message: err?.message || 'Unable to invite staff member.',
        tone: 'danger',
      })
    } finally {
      setInviteBusy(false)
    }
  }

  async function handleResendInvite(member) {
    try {
      const response = await apiPost('/team/resend-invite', {
        name: member.name,
        email: member.email,
        role: member.role,
        branch: member.branch,
      })
      if (response?.temporaryPassword) {
        const updated = teamMembers.map(m => m.id === member.id ? { ...m, temporaryPassword: response.temporaryPassword } : m)
        setTeamMembers(updated)
        try { localStorage.setItem('aezakmi_team_members', JSON.stringify(updated)) } catch {}
      }
      const tempPassNote = response?.temporaryPassword ? ` Temporary password: ${response.temporaryPassword}` : ''
      showToast({
        title: response?.emailSent ? 'Invitation Resent' : 'Reminder Recorded',
        message: response?.message ? `${response.message}${tempPassNote}` : (response?.emailSent ? `Fresh activation link delivered to ${member.email}.${tempPassNote}` : `Reminder saved.${tempPassNote}`),
        tone: response?.emailSent ? 'success' : 'warning',
      })
    } catch (err) {
      showToast({
        title: 'Resend Failed',
        message: err?.message || `Failed to resend invite to ${member.email}`,
        tone: 'danger',
      })
    }
  }

  function handleRemoveMember(member) {
    if (member.role === 'owner') return
    const updated = teamMembers.filter((m) => m.id !== member.id)
    setTeamMembers(updated)
    try {
      localStorage.setItem('aezakmi_team_members', JSON.stringify(updated))
    } catch {}
    setDeleteMemberTarget(null)
    showToast({
      title: 'Staff Removed',
      message: `${member.name || member.email} was removed from the team.`,
      tone: 'neutral',
    })
  }

  async function saveSection(key, values) {
    setSaving(key)
    setSaveError('')
    try {
      await updateSettings(values)
      showToast({ title: 'Settings Saved', message: `${key.charAt(0).toUpperCase() + key.slice(1)} settings updated.` })
    } catch(error) {
      const msg = error.message || `Unable to save ${key} settings.`
      setSaveError(msg)
      showToast({ title: 'Save Failed', message: msg, tone: 'error' })
    } finally {
      setSaving('')
    }
  }

  function saveSoundSettings() {
    setSaving('sounds')
    const saved = saveAdminSoundPreferences(soundPrefs)
    setSavedSoundPrefs(saved)
    setSoundPrefs(saved)
    setSaving('')
    showToast({ title: 'Sound Settings Saved', message: 'Audio preferences updated.' })
  }

  async function selectLogo(file) {
    if (!file) return
    if (!['image/png', 'image/svg+xml'].includes(file.type)) {
      setLogoWarning('Please choose a PNG or safe SVG logo.')
      showToast({ title: 'Invalid Image', message: 'Please choose a PNG or safe SVG logo.', tone: 'warning' })
      return
    }
    if (file.size > 512 * 1024) {
      setLogoWarning('Logo image is too large. Please choose an image that is 512 KB or smaller.')
      showToast({ title: 'File Too Large', message: 'Logo image must be 512 KB or smaller.', tone: 'warning' })
      return
    }
    setSaving('logo')
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      setPendingLogoDataUrl(dataUrl)
      setLogoUrl(dataUrl)
      showToast({ title: 'Logo Loaded', message: 'Logo preview updated. Save profile to apply.' })
    } catch (error) {
      const msg = error?.message || 'Unable to read that logo file.'
      setLogoWarning(msg)
      showToast({ title: 'Logo Error', message: msg, tone: 'error' })
    } finally {
      setSaving('')
    }
  }

  async function saveProfile() {
    setSaving('profile')
    setSaveError('')
    try {
      await updateSettings({ ...profile, numberFormat, decimalPlaces })
      window.dispatchEvent(new CustomEvent('aezakmi:branding-updated'))
      if (pendingLogoDataUrl) {
        const result = await apiPost('/branding/logo', { dataUrl: pendingLogoDataUrl })
        const next = result.logoUrl || `/api/public/branding/logo?v=${Date.now()}`
        if (!cloudMode) setLogoUrl(apiUrl(next.replace(/^\/api/, '')))
        else setLogoUrl(pendingLogoDataUrl || fallbackLogo)
        setPendingLogoDataUrl('')
        window.dispatchEvent(new CustomEvent('aezakmi:branding-updated', { detail: { logoUrl: next, logoVersion: result.logoVersion || Date.now() } }))
      }
      showToast({ title: 'Profile Saved', message: 'Café branding and profile updated.' })
    } catch(error) {
      const msg = error?.message || 'Unable to save cafe profile.'
      setSaveError(msg)
      showToast({ title: 'Save Failed', message: msg, tone: 'error' })
    } finally {
      setSaving('')
    }
  }

  async function saveSecurity() {
    if (!securityValid) {
      showToast({ title: 'Validation Error', message: 'Please fulfill all required credential fields.', tone: 'error' })
      return
    }
    setSaving('security')
    setSecurityError('')
    setSecurityMessage('')
    try {
      const result = await updateCredentials(cloudMode ? { newPassword: security.newPassword } : {
        currentPin: security.currentPin,
        currentPassword: security.currentPassword,
        newPin: security.newPin,
        newPassword: security.newPassword,
        authMethod: security.authMethod,
      })
      if (!result.ok) throw new Error(result.error || 'Unable to update Admin credentials.')
      setSecurity({ currentPin: '', currentPassword: '', newPin: '', newPassword: '', confirmPassword: '', authMethod: result.user?.authMethod || security.authMethod })
      const msg = cloudMode ? 'Cloud account password updated.' : 'Admin credentials updated. Other Admin sessions were signed out.'
      setSecurityMessage(msg)
      showToast({ title: 'Security Updated', message: msg })
      await refresh()
    } catch (error) {
      const msg = error?.message || 'Unable to update Admin credentials.'
      setSecurityError(msg)
      showToast({ title: 'Security Error', message: msg, tone: 'error' })
    } finally {
      setSaving('')
    }
  }

  async function loadCloudStatus() {
    setCloudError('')
    try {
      if (cloudMode) {
        const [edge, sub] = await Promise.all([cloudGetBranchStatus(), cloudGetSubscriptionOverview()])
        const nextCloud = { enabled: true, paired: Boolean(edge), edgeId: edge?.id || null, lastSeenAt: edge?.last_seen_at || null, lastSyncAt: edge?.last_sync_at || null, softwareVersion: edge?.software_version || null, statusSnapshot: edge?.status_snapshot || {} }
        const nextSubscription = sub || null
        setCloud(nextCloud)
        setSubscription(nextSubscription)
        if (cloudCacheKey) void writeSnapshot(cloudCacheKey, { cloud: nextCloud, subscription: nextSubscription })
        return
      }
      const result = await apiGet('/cloud/status')
      const nextCloud = result.cloud || null
      setCloud(nextCloud)
      if (cloudCacheKey) void writeSnapshot(cloudCacheKey, { cloud: nextCloud, subscription: null })
    } catch (error) {
      setCloudError(error?.message || 'Unable to read cloud status. Showing cached status when available.')
    }
  }

  async function pairCloud() {
    setCloudBusy('pair')
    setCloudError('')
    setCloudMessage('')
    try {
      if (cloudMode) {
        const branchId = cloudBranchId()
        if (!branchId) throw new Error('Select a branch first.')
        const result = await cloudInvoke('create-pairing-code', { branchId })
        setCloudPairingCode(result.pairingCode || '')
        setCloudMessage(`Pairing code generated. It expires ${result.expiresAt ? new Date(result.expiresAt).toLocaleString() : 'in 15 minutes'}. Enter it in the local Emergency Admin → Settings → Aezakmi Cloud.`)
        return
      }
      const code = cloudPairingCode.trim().toUpperCase()
      if (!code) return
      const result = await apiPost('/cloud/pair', { pairingCode: code })
      setCloud(result.cloud || null)
      if (cloudCacheKey) void writeSnapshot(cloudCacheKey, { cloud: result.cloud || null, subscription })
      setCloudPairingCode('')
      setCloudMessage('Edge server paired. Café Edge paired successfully and is now available as the branch fallback and synchronization peer.')
    } catch (error) {
      setCloudError(error?.message || 'Unable to pair this Edge server.')
    } finally {
      setCloudBusy('')
    }
  }

  async function syncCloud() {
    setCloudBusy('sync')
    setCloudError('')
    setCloudMessage('')
    try {
      if (cloudMode) {
        await loadCloudStatus()
        setCloudMessage('Cloud Edge status refreshed.')
        return
      }
      const result = await apiPost('/cloud/sync-now', {})
      setCloud(result.status || result.cloud || cloud)
      if (cloudCacheKey) void writeSnapshot(cloudCacheKey, { cloud: result.status || result.cloud || cloud, subscription })
      setCloudMessage(result.skipped ? 'Cloud sync was skipped.' : 'Cloud heartbeat, outbox, and branch configuration sync completed.')
    } catch (error) {
      setCloudError(error?.message || 'Cloud sync failed.')
    } finally {
      setCloudBusy('')
    }
  }

  async function unpairCloud() {
    if (cloudBusy) return
    setCloudBusy('unpair')
    setCloudError('')
    setCloudMessage('')
    try {
      if (cloudMode) {
        if (!cloud?.edgeId) throw new Error('No Edge server is paired.')
        await cloudInvoke('revoke-edge', { edgeId: cloud.edgeId })
        await loadCloudStatus()
        setCloudMessage('Edge cloud credential revoked. Local café operation was not changed.')
      } else {
        const result = await apiPost('/cloud/unpair', { remote: true })
        setCloud(result.cloud || null)
        if (cloudCacheKey) void writeSnapshot(cloudCacheKey, { cloud: result.cloud || null, subscription })
        setCloudMessage('Cloud pairing removed. Local café operation was not changed.')
      }
      setCloudUnpairConfirmOpen(false)
    } catch (error) {
      setCloudError(error?.message || 'Unable to unpair this Edge server.')
    } finally {
      setCloudBusy('')
    }
  }

  async function createCloudBranch() {
    if (!cloudMode || !cloudPrivileged || !newBranchName.trim() || cloudBusy) return
    setCloudBusy('branch')
    setCloudError('')
    setCloudMessage('')
    try {
      const organizationId = cloudOrganizationId()
      if (!organizationId) throw new Error('No cloud organization is selected.')
      const result = await cloudCreateBranch(organizationId, newBranchName.trim())
      const branch = result?.branch
      if (!branch?.id) throw new Error('Cloud did not return the new branch.')
      cloudSelectBranch(branch)
      setNewBranchName('')
      setCloudMessage(`Branch “${branch.name}” created. Switching to it now…`)
      setTimeout(() => window.location.reload(), 150)
    } catch (error) {
      setCloudError(error?.message || 'Unable to create branch.')
    } finally {
      setCloudBusy('')
    }
  }

  return (
    <>
      <div className="admin-page-content">
        <h1 className="sr-only">Settings</h1>
        {saveError&&<div className="mb-4 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-sm text-ember-dim">
          {saveError}
        </div>}

        {/* Mobile / Tablet Horizontal Section Tabs */}
        <div className="mb-4 flex gap-1.5 overflow-x-auto rounded-xl border border-surface-line bg-surface p-1.5 xl:hidden no-scrollbar">
          {tabDefs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                type="button"
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition-all ${
                  isActive
                    ? isEsportsMode
                      ? 'bg-gold/20 text-gold border border-gold/40 shadow-xs'
                      : 'bg-gold/15 text-gold-dim border border-gold/30 shadow-xs'
                    : 'text-slate-soft hover:bg-surface-raised hover:text-ink-900 border border-transparent'
                }`}
              >
                <Icon size={14} />
                <span>{tab.label}</span>
                {tab.dirty && (
                  <span className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse" />
                )}
              </button>
            )
          })}
        </div>

        {/* Desktop Sidebar + Content Layout */}
        <div className="grid items-start gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
          {/* Section Navigation Sidebar */}
          <nav
            className={`settings-section-nav overview-card sticky top-[112px] hidden p-2 xl:block ${
              isEsportsMode ? 'border-surface-line/90' : ''
            }`}
            aria-label="Settings sections"
          >
            <div className="px-3 pb-2 pt-2 flex items-center justify-between">
              <p className="eyebrow">Settings Navigation</p>
              {isEsportsMode && (
                <span className="rounded bg-gold/10 px-1.5 py-0.5 font-mono text-[9px] font-bold text-gold uppercase tracking-widest">
                  HUD
                </span>
              )}
            </div>
            <div className="space-y-1 mt-1">
              {tabDefs.map((tab) => {
                const Icon = tab.icon
                const isActive = activeTab === tab.id
                return (
                  <button
                    type="button"
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-xs transition-all ${
                      isActive
                        ? isEsportsMode
                          ? 'border-l-2 border-l-gold border-surface-line bg-gold/15 font-bold text-gold shadow-xs'
                          : 'border border-gold/30 bg-gold/10 font-semibold text-gold-dim shadow-xs'
                        : 'text-slate-soft hover:bg-surface-raised hover:text-ink-900 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                          isActive ? 'bg-gold/20 text-gold' : 'bg-surface text-slate-soft'
                        }`}
                      >
                        <Icon size={14} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate">{tab.label}</p>
                        <p className="text-[10px] text-slate-soft font-normal truncate">{tab.desc}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {tab.dirty && (
                        <span
                          className="h-2 w-2 rounded-full bg-gold shadow-xs animate-pulse"
                          title="Unsaved changes in this section"
                        />
                      )}
                      <ChevronRight size={13} className={isActive ? 'text-gold opacity-100' : 'opacity-0'} />
                    </div>
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Active Section Content View */}
          <div className="min-w-0">
            {activeTab === 'branding' && (
              <Section
                id="settings-branding"
                icon={Building2}
                title="Branding"
                description="Cafe identity shown across Admin, Customer Station, and generated reports."
                dirty={(profileDirty || Boolean(pendingLogoDataUrl)) && Boolean(profile.cafeName.trim()) && Boolean(profile.branch.trim())}
                saving={saving === 'profile'}
                onSave={saveProfile}
              >
                <div className="sm:col-span-2 flex items-center gap-3 rounded-xl border border-surface-line bg-surface-raised/45 p-3">
                  <img
                    src={logoUrl}
                    onError={(event) => {
                      event.currentTarget.src = fallbackLogo
                    }}
                    className="h-12 w-12 rounded-xl object-contain"
                    alt="Cafe logo"
                  />
                  <div>
                    <p className="text-xs font-semibold text-ink-900">Brand logo</p>
                    <p className="text-[11px] text-slate-soft">
                      {pendingLogoDataUrl ? 'New logo selected. Save Branding to apply it.' : 'PNG or safe SVG, up to 512 KB.'}
                    </p>
                  </div>
                  <label className="ml-auto inline-flex cursor-pointer items-center gap-2 rounded-xl border border-surface-line bg-surface px-3 py-2 text-xs font-semibold text-ink-900 hover:bg-surface-raised transition-colors">
                    <ImageUp size={14} /> {saving === 'logo' ? 'Reading…' : 'Upload logo'}
                    <input
                      type="file"
                      accept="image/png,image/svg+xml"
                      className="hidden"
                      disabled={saving === 'logo' || saving === 'profile'}
                      onChange={(event) => {
                        selectLogo(event.target.files?.[0])
                        event.target.value = ''
                      }}
                    />
                  </label>
                </div>
                <Field label="Display name">
                  <input
                    value={profile.displayName}
                    onChange={(e) => setProfile({ ...profile, displayName: e.target.value.slice(0, 40) })}
                    placeholder="Kyle"
                    maxLength={40}
                    className={inputClass}
                  />
                </Field>
                <Field label="Cafe name">
                  <input
                    value={profile.cafeName}
                    onChange={(e) => setProfile({ ...profile, cafeName: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Branch">
                  <input
                    value={profile.branch}
                    onChange={(e) => setProfile({ ...profile, branch: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Branch location">
                  <input
                    value={profile.branchLocation}
                    onChange={(e) => setProfile({ ...profile, branchLocation: e.target.value })}
                    placeholder="Davao City, Philippines"
                    className={inputClass}
                  />
                </Field>
                <div className="sm:col-span-2 flex items-center justify-between rounded-xl border border-surface-line bg-surface-raised/45 px-3 py-2.5">
                  <span className="flex items-center gap-2 text-xs text-slate-soft">
                    <PhilippinePeso size={14} /> Currency
                  </span>
                  <span className="text-xs font-semibold text-ink-900">Philippine Peso (PHP)</span>
                </div>
                <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-3">
                  <p className="eyebrow mb-2">Admin number input format</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {[
                      ['decimal', 'Decimals', 'Choose 1–3 places below'],
                      ['whole', 'Whole numbers only', 'Example: 12'],
                    ].map(([value, label, example]) => (
                      <button
                        type="button"
                        key={value}
                        onClick={() => setNumberFormat(value)}
                        className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                          numberFormat === value ? 'border-gold/40 bg-gold/10' : 'border-surface-line bg-surface'
                        }`}
                      >
                        <p className="text-xs font-semibold text-ink-900">{label}</p>
                        <p className="mt-1 text-[11px] text-slate-soft">{example}</p>
                      </button>
                    ))}
                  </div>
                  {numberFormat === 'decimal' && (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-surface-line bg-surface px-3 py-2">
                      <span className="text-xs text-slate-soft">Maximum decimal places</span>
                      <select
                        value={decimalPlaces}
                        onChange={(event) => setDecimalPlaces(Number(event.target.value))}
                        className="rounded-lg border border-surface-line bg-ink px-2 py-1 text-xs text-ink-900"
                      >
                        <option value={1}>1 place</option>
                        <option value={2}>2 places</option>
                        <option value={3}>3 places</option>
                      </select>
                    </div>
                  )}
                </div>
              </Section>
            )}

            {activeTab === 'payments' && (
              <Section
                id="settings-payments"
                icon={CreditCard}
                title="Payments & GCash"
                description="GCash destination customers see before submitting a top-up request."
                dirty={paymentDirty && gcashValid}
                saving={saving === 'payment'}
                onSave={() => saveSection('payment', payment)}
              >
                <Field label="GCash account name">
                  <input
                    value={payment.gcashName}
                    onChange={(e) => setPayment({ ...payment, gcashName: e.target.value })}
                    placeholder="Aezakmi Cafe"
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="GCash number"
                  hint={!gcashValid ? 'Use an 11-digit Philippine mobile number beginning with 09.' : ''}
                >
                  <input
                    value={payment.gcashNumber}
                    onChange={(e) => setPayment({ ...payment, gcashNumber: e.target.value.replace(/\D/g, '').slice(0, 11) })}
                    inputMode="numeric"
                    placeholder="09171234567"
                    className={`${inputClass} ${!gcashValid ? 'border-ember/60' : ''}`}
                  />
                </Field>
                <div className="sm:col-span-2 rounded-xl border border-teal/20 bg-teal/5 px-3 py-3">
                  <p className="eyebrow mb-1">Customer preview</p>
                  <p className="text-xs text-slate-soft">
                    Send payment to <strong className="text-ink-900">{payment.gcashName || 'GCash account name'}</strong> ·{' '}
                    <span className="stat-figure text-ink-900">{payment.gcashNumber || '09•• ••• ••••'}</span>
                  </p>
                </div>
              </Section>
            )}

            {activeTab === 'customer' && (
              <Section
                id="settings-customer"
                icon={MonitorSmartphone}
                title="Customer Station"
                description="Default session behavior and time-warning presentation for customer PCs."
                dirty={stationDirty && stationValid}
                saving={saving === 'station'}
                onSave={() => saveSection('station', { defaultBilling: 'prepaid', lowTimeWarningMinutes: Number(station.lowTimeWarningMinutes) })}
              >
                <Field label="Billing mode">
                  <div className="flex h-[38px] items-center rounded-lg border border-surface-line bg-surface-raised/45 px-3 text-sm font-semibold text-ink-900">
                    Prepaid only
                  </div>
                </Field>
                <Field label="Low-time warning (minutes)" hint={!stationValid ? 'Enter a value greater than zero.' : ''}>
                  <input
                    inputMode="numeric"
                    value={station.lowTimeWarningMinutes}
                    onChange={(e) => setStation({ ...station, lowTimeWarningMinutes: e.target.value.replace(/\D/g, '') })}
                    className={inputClass}
                  />
                </Field>
                <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-3 text-[11px] leading-5 text-slate-soft">
                  This production build accepts prepaid sessions only. Rate pricing remains managed under <strong className="text-ink-900">Rates</strong>.
                </div>
              </Section>
            )}

            {activeTab === 'sounds' && (
              <Section
                id="settings-sounds"
                icon={BellRing}
                title="Notification Sounds"
                description="Browser-local audio alerts for requests, sessions, low time, and station problems."
                dirty={soundDirty}
                saving={saving === 'sounds'}
                onSave={saveSoundSettings}
              >
                <Field label="Sound notifications">
                  <button
                    type="button"
                    onClick={() => setSoundPrefs({ ...soundPrefs, enabled: !soundPrefs.enabled })}
                    className={`flex h-[38px] w-full items-center justify-between rounded-lg border px-3 text-sm font-semibold transition-colors ${
                      soundPrefs.enabled ? 'border-teal/35 bg-teal/10 text-teal-dim' : 'border-surface-line bg-surface-raised/45 text-slate-soft'
                    }`}
                  >
                    <span>{soundPrefs.enabled ? 'Enabled' : 'Muted'}</span>
                    <span className={`h-2.5 w-2.5 rounded-full ${soundPrefs.enabled ? 'bg-teal' : 'bg-slate-soft/40'}`} />
                  </button>
                </Field>
                <Field label={`Volume · ${Math.round(Number(soundPrefs.volume || 0) * 100)}%`}>
                  <div className="flex h-[38px] items-center gap-3 rounded-lg border border-surface-line bg-surface-raised/45 px-3">
                    <Volume2 size={15} className="shrink-0 text-slate-soft" />
                    <input type="range" min="0" max="100" step="5" value={Math.round(Number(soundPrefs.volume||0)*100)} onChange={e=>setSoundPrefs({...soundPrefs,volume:Number(e.target.value)/100})} className="w-full accent-current"/>
                  </div>
                </Field>
                <div className="sm:col-span-2 grid gap-2 sm:grid-cols-4">
                  {[['payments','Payments'],['help','Help requests'],['sessions','Sessions'],['stations','PC / network']].map(([key, label]) => (
                    <button
                      type="button"
                      key={key}
                      onClick={() => setSoundPrefs({ ...soundPrefs, [key]: !soundPrefs[key] })}
                      className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                        soundPrefs[key] ? 'border-gold/35 bg-gold/8' : 'border-surface-line bg-surface'
                      }`}
                    >
                      <p className={`text-xs font-semibold ${soundPrefs[key] ? 'text-gold-dim' : 'text-slate-soft'}`}>{label}</p>
                      <p className="mt-0.5 text-[10px] text-slate-soft">{soundPrefs[key] ? 'Sound on' : 'Muted'}</p>
                    </button>
                  ))}
                </div>
                <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-line bg-surface-raised/45 p-3">
                  <p className="max-w-2xl text-[11px] leading-5 text-slate-soft">Audio preferences are stored locally on this terminal.</p>
                  <Button type="button" variant="secondary" size="sm" onClick={() => testAdminSound('help', soundPrefs)}>
                    Test sound
                  </Button>
                </div>
              </Section>
            )}

            {activeTab === 'team' && (
              <section id="settings-team" className="overview-card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-line px-5 py-4">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold-dim">
                      <Users size={16} />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-ink-900">Team & Staff Access</h2>
                      <p className="mt-0.5 text-[11px] text-slate-soft">Invite and manage employee accounts (Option A) and Local Edge PIN backup (Option B).</p>
                    </div>
                  </div>
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  {/* Invite Form */}
                  <form onSubmit={handleInviteStaff} className="sm:col-span-2 rounded-xl border border-surface-line bg-surface p-4 shadow-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-gold/10 text-gold-dim">
                          <UserPlus size={13} />
                        </span>
                        <h3 className="text-xs font-semibold text-ink-900">Invite New Employee</h3>
                      </div>
                      <span className="text-[10px] text-slate-soft">Cloud invitation via Brevo</span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-soft mb-1">Employee Name</label>
                        <input
                          value={inviteName}
                          onChange={(e) => setInviteName(e.target.value)}
                          placeholder="e.g. Sarah Jenkins"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-soft mb-1">Email Address</label>
                        <input
                          type="email"
                          value={inviteEmail}
                          onChange={(e) => setInviteEmail(e.target.value)}
                          placeholder="e.g. sarah@icafe.ph"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-soft mb-1">Assigned Role</label>
                        <select
                          value={inviteRole}
                          onChange={(e) => setInviteRole(e.target.value)}
                          className={inputClass}
                        >
                          <option value="cashier">Cashier / Staff (Front-Desk)</option>
                          <option value="admin">Branch Admin (Store Manager)</option>
                          <option value="manager">Shift Manager (Supervisor)</option>
                        </select>
                      </div>
                      <div className="flex items-end">
                        <Button
                          type="submit"
                          variant="primary"
                          icon={UserPlus}
                          className="w-full"
                          disabled={inviteBusy || !inviteName.trim() || !inviteEmail.trim()}
                        >
                          {inviteBusy ? 'Sending invite…' : 'Invite Employee'}
                        </Button>
                      </div>
                    </div>
                    {inviteError && (
                      <div className="mt-3 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">
                        {inviteError}
                      </div>
                    )}
                    {inviteSuccess && (
                      <div className="mt-3 rounded-lg border border-teal/30 bg-teal/10 px-3 py-2 text-xs font-medium text-teal-dim">
                        {inviteSuccess}
                      </div>
                    )}
                  </form>

                  {/* Team Members Roster */}
                  <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-semibold text-ink-900">Staff & Team Roster</h3>
                        <span className="rounded-full bg-midnight/10 px-2 py-0.5 text-[10px] font-bold text-slate-soft">
                          {teamMembers.length} {teamMembers.length === 1 ? 'Member' : 'Members'}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-soft">Active and invited employee credentials</span>
                    </div>
                    <div className="space-y-2">
                      {teamMembers.map((member) => {
                        const initials = (member.name || member.email || 'U')
                          .split(' ')
                          .map((n) => n[0])
                          .join('')
                          .toUpperCase()
                          .slice(0, 2)
                        const isOwner = member.role === 'owner'
                        const isAdmin = member.role === 'admin'
                        return (
                          <div
                            key={member.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-line bg-surface p-3 transition-colors hover:border-surface-line/80"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-midnight/10 border border-surface-line font-display text-xs font-bold text-ink-900">
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="truncate text-xs font-semibold text-ink-900">{member.name}</p>
                                  <span
                                    className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${
                                      isOwner
                                        ? 'bg-teal/10 text-teal-dim'
                                        : isAdmin
                                        ? 'bg-gold/12 text-gold-dim'
                                        : 'bg-midnight/10 text-slate-soft'
                                    }`}
                                  >
                                    {isOwner ? 'Owner' : isAdmin ? 'Branch Admin' : member.role === 'manager' ? 'Shift Manager' : 'Cashier'}
                                  </span>
                                  {member.status === 'invited' && (
                                    <span className="rounded bg-gold/10 px-1.5 py-0.5 text-[9px] font-bold text-gold-dim">
                                      Invited · Pending
                                    </span>
                                  )}
                                  {member.status === 'invited' && member.temporaryPassword && (
                                    <span className="rounded bg-midnight/10 border border-surface-line px-1.5 py-0.5 font-mono text-[9px] font-medium text-slate-soft" title="Temporary Password">
                                      Temp: {member.temporaryPassword}
                                    </span>
                                  )}
                                </div>
                                <p className="truncate text-[11px] text-slate-soft mt-0.5">
                                  {member.email} · {member.branch || 'Main Branch'}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 ml-auto">
                              {member.status === 'invited' && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  icon={Send}
                                  onClick={() => handleResendInvite(member)}
                                >
                                  Resend invite
                                </Button>
                              )}
                              {!isOwner && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteMemberTarget(member)}
                                  className="rounded-lg p-2 text-slate-soft transition-colors hover:bg-ember/10 hover:text-ember-dim"
                                  title="Remove staff member"
                                  aria-label={`Remove ${member.name || member.email}`}
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  {/* Option B: Local Edge PIN Failover Card */}
                  <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-md bg-teal/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-teal-dim">
                          Backup · Option B
                        </span>
                        <h3 className="text-xs font-semibold text-ink-900">Local Edge Failover & Shift Clock-In</h3>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[11px] font-medium ${settings?.adminPinReady ? 'text-teal-dim' : 'text-ember-dim'}`}>
                        {settings?.adminPinReady ? '✓ Local PIN Ready' : '⚠ PIN Required'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-soft leading-5 mb-3">
                      If the internet or cloud becomes unreachable, staff sign in on-premise with the <strong>Local Management PIN</strong> to clock in and manage cash drawers with zero client PC downtime. All records queue locally and sync when connection returns.
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                      <p className="text-[11px] text-slate-soft">Configure or rotate local PIN in the Security section.</p>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setActiveTab('security')}
                      >
                        Configure Local Security
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {activeTab === 'cloud' && (
              <section id="settings-cloud" className="overview-card overflow-hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-line px-5 py-4">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-midnight/10 text-midnight">
                      <Cloud size={16} />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-ink-900">Aezakmi Cloud</h2>
                      <p className="mt-0.5 text-[11px] text-slate-soft">Multi-branch orchestration, remote telemetry, and Edge sync bridge.</p>
                    </div>
                  </div>
                  {cloud?.paired && (
                    <Button variant="ghost" size="sm" icon={RefreshCw} disabled={Boolean(cloudBusy)} onClick={syncCloud}>
                      {cloudBusy === 'sync' ? 'Syncing…' : 'Sync now'}
                    </Button>
                  )}
                </div>
                <div className="grid gap-4 p-5 sm:grid-cols-2">
                  {!cloud && <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4 text-xs text-slate-soft">Loading cloud status…</div>}
                  {cloudMode && !cloudPrivileged && (
                    <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4 text-[11px] leading-5 text-slate-soft">
                      Your <strong className="text-ink-900">{user?.cloudRole || 'viewer'}</strong> role can view this branch, but only organization owners/admins can create branches, generate Edge pairing codes, or revoke an Edge.
                    </div>
                  )}
                  {cloudMode && subscription && (
                    <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4">
                      {(() => {
                        const catalog = normalizeSubscriptionPackages(subscription.packageCatalog)
                        const current = packageDefinition(subscription.plan, catalog)
                        const ultraFloor = Math.max(1, Number(packageDefinition('gold', catalog).maxStations || 50) + 1)
                        return (
                          <>
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="eyebrow">Subscription</p>
                                <p className="mt-1 text-base font-semibold text-ink-900">{current.label}</p>
                                <p className="mt-1 text-[11px] leading-5 text-slate-soft">
                                  {subscription.stationCount} of {subscription.maxStations} stations used across {subscription.branchCount} active branch{subscription.branchCount === 1 ? '' : 'es'}.
                                </p>
                              </div>
                              <span className="rounded-full bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gold-dim">
                                {subscription.status}
                              </span>
                            </div>
                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-midnight/8">
                              <div
                                className="h-full rounded-full bg-gold"
                                style={{ width: `${Math.min(100, subscription.maxStations > 0 ? (subscription.stationCount / subscription.maxStations) * 100 : 0)}%` }}
                              />
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                              {catalog.map((pkg) => (
                                <div
                                  key={pkg.id}
                                  className={`rounded-lg border px-2 py-2 ${
                                    subscription.plan === pkg.id ? 'border-gold/45 bg-gold/8' : 'border-surface-line bg-surface'
                                  }`}
                                >
                                  <p className={`text-[10px] font-semibold ${subscription.plan === pkg.id ? 'text-gold-dim' : 'text-ink-900'}`}>{pkg.label}</p>
                                  <p className="mt-0.5 text-[9px] text-slate-soft">
                                    {pkg.maxStations === null ? `${ultraFloor}+ / custom` : `Up to ${pkg.maxStations}`} · {formatPackagePrice(pkg)}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}
                  {cloudMode && cloudPrivileged && (
                    <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-ink-900">Add another branch</p>
                        </div>
                        <span className="rounded-full bg-midnight/10 px-2.5 py-1 font-mono text-[10px] text-midnight">
                          {cloudOrganizationId() || 'No organization'}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                        <input
                          value={newBranchName}
                          onChange={(e) => setNewBranchName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              createCloudBranch()
                            }
                          }}
                          placeholder="New branch name"
                          className={`${inputClass} flex-1`}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={cloudBusy === 'branch' || !newBranchName.trim()}
                          onClick={createCloudBranch}
                        >
                          {cloudBusy === 'branch' ? 'Creating…' : 'Create branch'}
                        </Button>
                      </div>
                    </div>
                  )}
                  {cloud && !cloud.enabled && (
                    <div className="sm:col-span-2 rounded-xl border border-gold/25 bg-gold/5 p-4">
                      <p className="text-xs font-semibold text-ink-900">Cloud integration is disabled on this server.</p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-soft">
                        Set <code className="rounded bg-surface px-1 py-0.5">AEZAKMI_CLOUD_ENABLED=true</code>, <code className="rounded bg-surface px-1 py-0.5">AEZAKMI_SUPABASE_URL</code>, and <code className="rounded bg-surface px-1 py-0.5">AEZAKMI_SUPABASE_PUBLISHABLE_KEY</code> in the Edge backend environment, then restart it.
                      </p>
                    </div>
                  )}
                  {cloud?.enabled && !cloud.paired && (
                    <div className="sm:col-span-2">
                      <label className="block">
                        <span className="eyebrow mb-1.5 block">{cloudMode ? 'One-time Edge pairing code' : 'Branch pairing code'}</span>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <input
                            readOnly={cloudMode}
                            value={cloudPairingCode}
                            onChange={cloudMode ? undefined : (e) => setCloudPairingCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 9))}
                            placeholder={cloudMode ? 'Generate a code' : 'ABCD-2345'}
                            autoComplete="off"
                            className={`${inputClass} font-mono tracking-[0.16em] flex-1`}
                          />
                          <Button
                            type="button"
                            icon={Link2}
                            disabled={cloudMode ? (cloudBusy === 'pair' || !cloudPrivileged) : (cloudBusy === 'pair' || !cloudPairingCode.trim())}
                            onClick={pairCloud}
                            className="shrink-0"
                          >
                            {cloudBusy === 'pair' ? (cloudMode ? 'Generating…' : 'Pairing…') : (cloudMode ? 'Generate pairing code' : 'Pair branch')}
                          </Button>
                        </div>
                        <span className="mt-1.5 block text-[11px] leading-4 text-slate-soft">
                          {cloudMode
                            ? 'Generate a code, then enter it on the local Emergency Admin. It expires automatically.'
                            : 'Create the one-time code from Aezakmi Cloud. Codes use the XXXX-XXXX format and expire automatically.'}
                        </span>
                      </label>
                    </div>
                  )}
                  {cloud?.paired && (
                    <>
                      {(cloudMode
                        ? [
                            ['Branch', cloudBranchId()],
                            ['Edge server', cloud.edgeId],
                            ['Version', cloud.softwareVersion],
                            ['Last sync', cloud.lastSyncAt ? new Date(cloud.lastSyncAt).toLocaleString() : '—'],
                          ]
                        : [
                            ['Organization', cloud.organizationId],
                            ['Branch', cloud.branchId],
                            ['Edge server', cloud.edgeId],
                            ['Installation', cloud.installationId],
                          ]
                      ).map(([label, value]) => (
                        <div key={label} className="rounded-xl border border-surface-line bg-surface-raised/45 p-3">
                          <p className="eyebrow mb-1">{label}</p>
                          <p className="break-all font-mono text-[10px] leading-4 text-ink-900">{value || '—'}</p>
                        </div>
                      ))}
                      <div className="rounded-xl border border-surface-line bg-surface-raised/45 p-3">
                        <p className="eyebrow mb-1">Cloud status</p>
                        <p className="text-xs font-semibold text-teal-dim">Paired</p>
                        <p className="mt-1 text-[11px] text-slate-soft">Last heartbeat: {cloud.lastSeenAt ? new Date(cloud.lastSeenAt).toLocaleString() : 'Not yet synced'}</p>
                      </div>
                      <div className="rounded-xl border border-surface-line bg-surface-raised/45 p-3">
                        <p className="eyebrow mb-1">Synchronization</p>
                        <p className="text-xs font-semibold text-ink-900">{cloudMode ? 'Supabase ↔ Edge' : 'Outbox'}</p>
                        <p className="mt-1 text-[11px] text-slate-soft">
                          {cloudMode ? 'Operational data is mirrored in the background.' : `${cloud.sync?.pending ?? 0} pending · ${cloud.sync?.failed ?? 0} failed`}
                        </p>
                      </div>
                      <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-line bg-surface p-3">
                        <p className="text-[11px] leading-5 text-slate-soft">Cloud unavailable? Edge keeps local sessions running.</p>
                        <Button
                          variant="danger"
                          size="sm"
                          icon={Unplug}
                          disabled={Boolean(cloudBusy) || !cloudPrivileged}
                          onClick={() => setCloudUnpairConfirmOpen(true)}
                        >
                          {cloudBusy === 'unpair' ? (cloudMode ? 'Revoking…' : 'Unpairing…') : (cloudMode ? 'Revoke Edge' : 'Unpair cloud')}
                        </Button>
                      </div>
                    </>
                  )}
                  {cloudError && <div className="sm:col-span-2 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">{cloudError}</div>}
                  {cloudMessage && <div className="sm:col-span-2 rounded-xl border border-teal/30 bg-teal/10 px-3 py-2 text-xs font-medium text-teal-dim">{cloudMessage}</div>}
                </div>
              </section>
            )}

            {activeTab === 'security' && (
              <Section
                id="settings-security"
                icon={ShieldCheck}
                title={cloudMode ? 'Cloud Account Security' : 'Admin Credentials & Access PIN'}
                description={
                  cloudMode
                    ? 'Update the Supabase Auth password for this cloud account. Local Edge Management PINs remain branch-local.'
                    : 'Manage the login method, password, and permanent Management PIN used by protected Customer Station controls.'
                }
                dirty={securityValid}
                saving={saving === 'security'}
                onSave={saveSecurity}
              >
                {cloudMode ? (
                  <>
                    <Field label="New cloud password">
                      <input
                        type="password"
                        value={security.newPassword}
                        onChange={(e) => setSecurity({ ...security, newPassword: e.target.value })}
                        placeholder="New password"
                        autoComplete="new-password"
                        className={inputClass}
                      />
                    </Field>
                    <Field label="Confirm new password" hint={!passwordsMatch ? 'Passwords must match.' : ''}>
                      <input
                        type="password"
                        value={security.confirmPassword}
                        onChange={(e) => setSecurity({ ...security, confirmPassword: e.target.value })}
                        placeholder="Confirm new password"
                        autoComplete="new-password"
                        className={`${inputClass} ${!passwordsMatch ? 'border-ember/60' : ''}`}
                      />
                    </Field>
                    <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface-raised/45 p-3 text-[11px] leading-5 text-slate-soft">
                      Cloud sign-in is managed by Supabase Auth. The local Management PIN used by Customer emergency/server controls is intentionally not synchronized to cloud.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-xl border border-surface-line bg-surface-raised/45 p-3">
                      <div>
                        <p className="text-xs font-semibold text-ink-900">Management PIN</p>
                        <p className="mt-1 text-[11px] leading-5 text-slate-soft">Used for station pairing and emergency controls.</p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${
                          settings.adminPinReady ? 'bg-teal/10 text-teal-dim' : 'bg-ember/10 text-ember-dim'
                        }`}
                      >
                        {settings.adminPinReady ? <Check size={12} /> : <LockKeyhole size={12} />} {settings.adminPinReady ? 'PIN ready' : 'PIN required'}
                      </span>
                    </div>
                    <div className="sm:col-span-2 rounded-xl border border-surface-line bg-surface p-4">
                      <p className="eyebrow mb-1">Current Admin credentials</p>
                      <p className="mb-3 text-[11px] leading-5 text-slate-soft">
                        Confirm current <strong className="text-ink-900">{currentAuthMethod === 'pin_password' ? 'PIN + Password' : currentAuthMethod === 'password' ? 'Password' : 'PIN'}</strong> login mode before applying security changes.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {needsCurrentPin && (
                          <Field label="Current PIN">
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={8}
                              value={security.currentPin}
                              onChange={(e) => setSecurity({ ...security, currentPin: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                              placeholder="Current Admin PIN"
                              autoComplete="off"
                              className={inputClass}
                            />
                          </Field>
                        )}
                        {needsCurrentPassword && (
                          <Field label="Current password">
                            <input
                              type="password"
                              value={security.currentPassword}
                              onChange={(e) => setSecurity({ ...security, currentPassword: e.target.value })}
                              placeholder="Current Admin password"
                              autoComplete="current-password"
                              className={inputClass}
                            />
                          </Field>
                        )}
                      </div>
                    </div>
                    <Field label="New Management PIN" hint={security.newPin && !newPinValid ? 'Use 4 to 8 digits.' : 'Leave blank to keep the current Management PIN.'}>
                      <input
                        type="password"
                        inputMode="numeric"
                        maxLength={8}
                        value={security.newPin}
                        onChange={(e) => setSecurity({ ...security, newPin: e.target.value.replace(/\D/g, '').slice(0, 8) })}
                        placeholder="New PIN"
                        autoComplete="new-password"
                        className={`${inputClass} ${security.newPin && !newPinValid ? 'border-ember/60' : ''}`}
                      />
                    </Field>
                    <div className="grid gap-3">
                      <Field label="New password">
                        <input
                          type="password"
                          value={security.newPassword}
                          onChange={(e) => setSecurity({ ...security, newPassword: e.target.value })}
                          placeholder="Leave blank to keep current password"
                          autoComplete="new-password"
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Confirm new password" hint={!passwordsMatch ? 'Passwords must match.' : ''}>
                        <input
                          type="password"
                          value={security.confirmPassword}
                          onChange={(e) => setSecurity({ ...security, confirmPassword: e.target.value })}
                          placeholder="Confirm new password"
                          autoComplete="new-password"
                          className={`${inputClass} ${!passwordsMatch ? 'border-ember/60' : ''}`}
                        />
                      </Field>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="eyebrow mb-2">Admin login method</p>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {[
                          ['pin', 'PIN'],
                          ['password', 'Password'],
                          ['pin_password', 'PIN + Password'],
                        ].map(([value, label]) => (
                          <button
                            type="button"
                            key={value}
                            onClick={() => setSecurity({ ...security, authMethod: value })}
                            className={`rounded-xl border px-3 py-3 text-left transition-colors ${
                              security.authMethod === value ? 'border-gold/50 bg-gold/10' : 'border-surface-line bg-surface'
                            }`}
                          >
                            <p className={`text-xs font-semibold ${security.authMethod === value ? 'text-gold-dim' : 'text-ink-900'}`}>{label}</p>
                            <p className="mt-1 text-[11px] leading-4 text-slate-soft">
                              {value === 'pin' ? 'Admin signs in with the PIN.' : value === 'password' ? 'Admin signs in with username and password.' : 'Admin must provide both factors.'}
                            </p>
                          </button>
                        ))}
                      </div>
                      {switchingFromPinToPassword && !security.newPassword && (
                        <p className="mt-2 text-[11px] font-medium text-ember-dim">Set a new password before enabling password login.</p>
                      )}
                      {!managementPinReady && (
                        <p className="mt-2 text-[11px] font-medium text-ember-dim">Set a Management PIN before saving. It protects Customer Station server and emergency controls.</p>
                      )}
                    </div>
                  </>
                )}
                {securityError && <div className="sm:col-span-2 rounded-xl border border-ember/30 bg-ember/10 px-3 py-2 text-xs font-medium text-ember-dim">{securityError}</div>}
                {securityMessage && <div className="sm:col-span-2 rounded-xl border border-teal/30 bg-teal/10 px-3 py-2 text-xs font-medium text-teal-dim">{securityMessage}</div>}
              </Section>
            )}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={cloudUnpairConfirmOpen}
        onClose={() => !cloudBusy && setCloudUnpairConfirmOpen(false)}
        onConfirm={unpairCloud}
        busy={cloudBusy === 'unpair'}
        eyebrow="Aezakmi Cloud"
        title={cloudMode ? 'Revoke this Edge server?' : 'Unpair this Edge server?'}
        message={
          cloudMode
            ? 'Revoke this branch Edge server from Aezakmi Cloud? Local LAN operation and SQLite data remain available.'
            : 'Unpair this local Edge server from Aezakmi Cloud? Local LAN operation and SQLite data will remain available.'
        }
        confirmLabel={cloudMode ? 'Revoke Edge' : 'Unpair cloud'}
        variant="danger"
      />
      <ConfirmModal
        open={Boolean(deleteMemberTarget)}
        onClose={() => setDeleteMemberTarget(null)}
        onConfirm={() => handleRemoveMember(deleteMemberTarget)}
        eyebrow="Staff Access"
        title={`Remove ${deleteMemberTarget?.name || 'Staff Member'}?`}
        message={`Are you sure you want to remove ${deleteMemberTarget?.name || deleteMemberTarget?.email} from your team? They will no longer have access to the Admin Console.`}
        confirmLabel="Remove Staff"
        variant="danger"
      />
      <Modal
        open={Boolean(logoWarning)}
        onClose={() => setLogoWarning('')}
        title="Logo upload warning"
        footer={<Button variant="primary" onClick={() => setLogoWarning('')}>OK</Button>}
      >
        <p className="text-sm leading-6 text-slate-soft">{logoWarning}</p>
      </Modal>
    </>
  )
}

