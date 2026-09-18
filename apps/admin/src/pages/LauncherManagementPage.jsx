import { useState, useMemo } from 'react'
import {
  Gamepad2,
  Plus,
  Trash2,
  Pencil,
  Search,
  FolderPlus,
  Layers,
  Sparkles,
  ExternalLink,
  HardDrive,
  Check,
  CheckCircle2,
  X,
  SlidersHorizontal,
  FolderOpen
} from 'lucide-react'
import { useAppData } from '../context/AppDataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { showToast } from '../lib/toast.js'
import Button from '../components/common/Button.jsx'
import Modal from '../components/common/Modal.jsx'
import ConfirmModal from '../components/common/ConfirmModal.jsx'
import { AdminEmptyState, AdminMetricCard, AdminPageWorkspace, AdminRailCard } from '../components/layout/AdminPageWorkspace.jsx'

const inputClass = 'w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-sm text-ink-900 focus:outline-none focus:border-gold/50'

function AppIcon({ icon, name, className = 'h-10 w-10', iconClass = 'text-xl' }) {
  const isImage = icon && (icon.startsWith('/') || icon.startsWith('http') || icon.startsWith('data:') || /\.(webp|png|jpg|jpeg|svg)$/i.test(icon))
  const [imgError, setImgError] = useState(false)

  if (isImage && !imgError) {
    return (
      <span className={`inline-flex items-center justify-center rounded-xl bg-surface-raised/80 border border-surface-line/50 overflow-hidden p-1 shrink-0 ${className}`}>
        <img
          src={icon}
          alt={name || 'App Icon'}
          className="h-full w-full object-contain"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center justify-center rounded-xl bg-midnight/8 ${iconClass} shrink-0 ${className}`}>
      {icon || '🎮'}
    </span>
  )
}

const PRESET_CATALOG = [
  { name: 'Steam', category: 'Online Games', icon: '/assets/launcher/steam.webp', protocol: 'steam://', exe: 'steam.exe' },
  { name: 'Riot / Valorant', category: 'Online Games', icon: '/assets/launcher/valorant.webp', protocol: 'riotclient://', exe: 'RiotClientServices.exe' },
  { name: 'Epic Games Launcher', category: 'Online Games', icon: '/assets/launcher/epicgames.webp', protocol: 'com.epicgames.launcher://', exe: 'EpicGamesLauncher.exe' },
  { name: 'Roblox', category: 'Online Games', icon: '/assets/launcher/roblox.webp', protocol: 'roblox://', exe: 'RobloxPlayerLauncher.exe' },
  { name: 'Dota 2', category: 'Online Games', icon: '/assets/launcher/dota2.webp', protocol: 'steam://rungameid/570', exe: 'dota2.exe' },
  { name: 'League of Legends', category: 'Online Games', icon: '/assets/launcher/lol.webp', protocol: 'riotclient://launch/league_of_legends', exe: 'LeagueClient.exe' },
  { name: 'Counter-Strike 2', category: 'Online Games', icon: '/assets/launcher/cs2.webp', protocol: 'steam://rungameid/730', exe: 'cs2.exe' },
  { name: 'Genshin Impact', category: 'Online Games', icon: '/assets/launcher/genshin.webp', protocol: null, exe: 'GenshinImpact.exe' },
  { name: 'Honkai: Star Rail', category: 'Online Games', icon: '/assets/launcher/starrail.webp', protocol: null, exe: 'StarRail.exe' },
  { name: 'Call of Duty: Warzone', category: 'Online Games', icon: '/assets/launcher/warzone.webp', protocol: 'battlenet://', exe: 'Battle.net.exe' },
  { name: 'Apex Legends', category: 'Online Games', icon: '/assets/launcher/apex.webp', protocol: 'origin://', exe: 'r5apex.exe' },
  { name: 'Minecraft', category: 'Offline Games', icon: '/assets/launcher/minecraft.webp', protocol: null, exe: 'Minecraft.exe' },
  { name: 'Grand Theft Auto V', category: 'Offline Games', icon: '/assets/launcher/gta5.webp', protocol: null, exe: 'GTA5.exe' },
  { name: 'Cyberpunk 2077', category: 'Offline Games', icon: '/assets/launcher/cyberpunk2077.webp', protocol: null, exe: 'Cyberpunk2077.exe' },
  { name: 'Left 4 Dead 2', category: 'Offline Games', icon: '/assets/launcher/l4d2.webp', protocol: 'steam://rungameid/550', exe: 'left4dead2.exe' },
  { name: 'Need for Speed', category: 'Offline Games', icon: '/assets/launcher/nfs.webp', protocol: null, exe: 'NFS.exe' },
  { name: 'Street Fighter 6', category: 'Offline Games', icon: '/assets/launcher/sf6.webp', protocol: 'steam://rungameid/1364780', exe: 'StreetFighter6.exe' },
  { name: 'Tekken 8', category: 'Offline Games', icon: '/assets/launcher/tekken8.webp', protocol: 'steam://rungameid/1778820', exe: 'Polaris-Win64-Shipping.exe' },
  { name: 'Google Chrome', category: 'Surfing & Browsers', icon: '/assets/launcher/chrome.webp', protocol: null, exe: 'chrome.exe' },
  { name: 'Microsoft Edge', category: 'Surfing & Browsers', icon: '/assets/launcher/edge.webp', protocol: null, exe: 'msedge.exe' },
  { name: 'Brave Browser', category: 'Surfing & Browsers', icon: '/assets/launcher/brave.webp', protocol: null, exe: 'brave.exe' },
  { name: 'Mozilla Firefox', category: 'Surfing & Browsers', icon: '/assets/launcher/firefox.webp', protocol: null, exe: 'firefox.exe' },
  { name: 'Opera GX', category: 'Surfing & Browsers', icon: '/assets/launcher/operagx.webp', protocol: null, exe: 'opera.exe' },
  { name: 'Microsoft Word', category: 'Office & Productivity', icon: '/assets/launcher/word.webp', protocol: null, exe: 'WINWORD.EXE' },
  { name: 'Microsoft Excel', category: 'Office & Productivity', icon: '/assets/launcher/excel.webp', protocol: null, exe: 'EXCEL.EXE' },
  { name: 'Microsoft PowerPoint', category: 'Office & Productivity', icon: '/assets/launcher/powerpoint.webp', protocol: null, exe: 'POWERPNT.EXE' },
  { name: 'Discord', category: 'Utilities & Chat', icon: '/assets/launcher/discord.webp', protocol: 'discord://', exe: 'Discord.exe' },
  { name: 'Spotify', category: 'Utilities & Chat', icon: '/assets/launcher/spotify.webp', protocol: 'spotify://', exe: 'Spotify.exe' },
  { name: 'OBS Studio', category: 'Utilities & Chat', icon: '/assets/launcher/obs.webp', protocol: null, exe: 'obs64.exe' },
  { name: 'Calculator', category: 'Utilities & Chat', icon: '/assets/launcher/calculator.webp', protocol: null, exe: 'calc.exe' },
  { name: 'Notepad', category: 'Utilities & Chat', icon: '/assets/launcher/notepad.webp', protocol: null, exe: 'notepad.exe' },
  { name: 'VLC Media Player', category: 'Utilities & Chat', icon: '/assets/launcher/vlc.webp', protocol: null, exe: 'vlc.exe' },
  { name: '7-Zip', category: 'Utilities & Chat', icon: '/assets/launcher/7zip.webp', protocol: null, exe: '7zFM.exe' },
  { name: 'LDPlayer 9', category: 'Emulators', icon: '/assets/launcher/ldplayer.webp', protocol: null, exe: 'dnplayer.exe' },
  { name: 'BlueStacks 5', category: 'Emulators', icon: '/assets/launcher/bluestacks.webp', protocol: null, exe: 'HD-Player.exe' },
  { name: 'NoxPlayer', category: 'Emulators', icon: '/assets/launcher/nox.webp', protocol: null, exe: 'Nox.exe' },
  { name: 'PCSX2 PlayStation 2', category: 'Emulators', icon: '/assets/launcher/pcsx2.webp', protocol: null, exe: 'pcsx2-qtx64.exe' },
  { name: 'RPCS3 PlayStation 3', category: 'Emulators', icon: '/assets/launcher/rpcs3.webp', protocol: null, exe: 'rpcs3.exe' },
  { name: 'PPSSPP PSP', category: 'Emulators', icon: '/assets/launcher/ppsspp.webp', protocol: null, exe: 'PPSSPPWindows64.exe' },
]

export default function LauncherManagementPage() {
  const {
    launcherCategories = [],
    launcherApps = [],
    createLauncherCategory,
    updateLauncherCategory,
    deleteLauncherCategory,
    createLauncherApp,
    batchCreateLauncherApps,
    updateLauncherApp,
    deleteLauncherApp,
  } = useAppData()

  const { user } = useAuth()
  const isCashier = user?.role === 'cashier'

  const [activeCategoryFilter, setActiveCategoryFilter] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')

  const [addAppModalOpen, setAddAppModalOpen] = useState(false)
  const [editingApp, setEditingApp] = useState(null)
  const [batchModalOpen, setBatchModalOpen] = useState(false)
  const [categoryModalOpen, setCategoryModalOpen] = useState(false)
  const [remotePathModalOpen, setRemotePathModalOpen] = useState(false)
  const [deleteTargetApp, setDeleteTargetApp] = useState(null)
  const [deleteTargetCategory, setDeleteTargetCategory] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)

  const [appForm, setAppForm] = useState({
    name: '',
    categoryName: 'Online Games',
    icon: '🎮',
    executablePath: '',
    protocolUrl: '',
    launchArguments: '',
    workingDirectory: '',
    isEnabled: true,
  })

  const [newCatName, setNewCatName] = useState('')
  const [editingCatId, setEditingCatId] = useState(null)
  const [editingCatName, setEditingCatName] = useState('')

  const [selectedPresets, setSelectedPresets] = useState(new Set())
  const [presetSearch, setPresetSearch] = useState('')
  const [presetCategory, setPresetCategory] = useState('All')

  const [pathTargetApp, setPathTargetApp] = useState(null)
  const [remotePathInput, setRemotePathInput] = useState('')

  const categoryNames = useMemo(() => {
    const list = launcherCategories.map(c => c.name)
    if (!list.includes('Online Games')) list.unshift('Online Games')
    return list
  }, [launcherCategories])

  const filteredApps = useMemo(() => {
    return launcherApps.filter((app) => {
      const matchCat = activeCategoryFilter === 'All' || (app.categoryName || app.category) === activeCategoryFilter
      const q = searchQuery.toLowerCase().trim()
      const matchSearch = !q || app.name?.toLowerCase().includes(q) || app.categoryName?.toLowerCase().includes(q) || app.executablePath?.toLowerCase().includes(q)
      return matchCat && matchSearch
    })
  }, [launcherApps, activeCategoryFilter, searchQuery])

  const totalAppsCount = launcherApps.length
  const totalCategoriesCount = launcherCategories.length
  const enabledAppsCount = useMemo(() => launcherApps.filter(a => a.isEnabled).length, [launcherApps])

  function openAddAppModal() {
    setEditingApp(null)
    setAppForm({
      name: '',
      categoryName: categoryNames[0] || 'Online Games',
      icon: '🎮',
      executablePath: '',
      protocolUrl: '',
      launchArguments: '',
      workingDirectory: '',
      isEnabled: true,
    })
    setAddAppModalOpen(true)
  }

  function openEditAppModal(app) {
    setEditingApp(app)
    setAppForm({
      name: app.name || '',
      categoryName: app.categoryName || app.category || 'Online Games',
      icon: app.icon || '🎮',
      executablePath: app.executablePath || '',
      protocolUrl: app.protocolUrl || '',
      launchArguments: app.launchArguments || '',
      workingDirectory: app.workingDirectory || '',
      isEnabled: app.isEnabled !== false,
    })
    setAddAppModalOpen(true)
  }

  async function handleSaveApp(e) {
    if (e?.preventDefault) e.preventDefault()
    if (!appForm.name.trim()) {
      showToast({ title: 'Validation Error', message: 'Application name is required.', tone: 'error' })
      return
    }

    setActionBusy(true)
    try {
      if (editingApp) {
        await updateLauncherApp(editingApp.id, appForm)
        showToast({ title: 'Application Updated', message: `Updated "${appForm.name}".`, tone: 'success' })
      } else {
        await createLauncherApp(appForm)
        showToast({ title: 'Application Added', message: `Added "${appForm.name}" to catalog.`, tone: 'success' })
      }
      setAddAppModalOpen(false)
    } catch (err) {
      showToast({ title: 'Operation Failed', message: err.message || 'Unable to save application.', tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDeleteApp() {
    if (!deleteTargetApp) return
    setActionBusy(true)
    try {
      await deleteLauncherApp(deleteTargetApp.id)
      showToast({ title: 'Application Removed', message: `Removed "${deleteTargetApp.name}".`, tone: 'warning' })
      setDeleteTargetApp(null)
    } catch (err) {
      showToast({ title: 'Delete Failed', message: err.message || 'Unable to delete application.', tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  function togglePreset(name) {
    setSelectedPresets((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectAllFilteredPresets(filteredList) {
    setSelectedPresets((prev) => {
      const next = new Set(prev)
      filteredList.forEach(p => next.add(p.name))
      return next
    })
  }

  function deselectAllPresets() {
    setSelectedPresets(new Set())
  }

  async function handleBatchAdd() {
    if (selectedPresets.size === 0) return
    const presetsToAdd = PRESET_CATALOG.filter(p => selectedPresets.has(p.name)).map(p => ({
      name: p.name,
      categoryName: p.category,
      icon: p.icon,
      protocolUrl: p.protocol,
      executablePath: p.exe,
      isPreset: true,
      isEnabled: true,
    }))

    setActionBusy(true)
    try {
      await batchCreateLauncherApps(presetsToAdd)
      showToast({ title: 'Batch Added', message: `Successfully added ${presetsToAdd.length} applications to catalog.`, tone: 'success' })
      setSelectedPresets(new Set())
      setBatchModalOpen(false)
    } catch (err) {
      showToast({ title: 'Batch Add Failed', message: err.message || 'Unable to batch add presets.', tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  const DEFAULT_PRESET_CATEGORIES = [
    'Online Games',
    'Offline Games',
    'Surfing & Browsers',
    'Office & Productivity',
    'Utilities & Chat',
    'Emulators',
  ]

  async function handleMapPresetCategories() {
    setActionBusy(true)
    try {
      let addedCount = 0
      const existingNames = new Set(launcherCategories.map(c => c.name.toLowerCase().trim()))
      for (let i = 0; i < DEFAULT_PRESET_CATEGORIES.length; i++) {
        const catName = DEFAULT_PRESET_CATEGORIES[i]
        if (!existingNames.has(catName.toLowerCase())) {
          await createLauncherCategory({ name: catName, sortOrder: (launcherCategories.length + i + 1) * 10 })
          addedCount++
        }
      }
      if (addedCount > 0) {
        showToast({ title: 'Preset Categories Mapped', message: `Added ${addedCount} standard categories.`, tone: 'success' })
      } else {
        showToast({ title: 'Categories Ready', message: 'All standard preset categories already exist.', tone: 'info' })
      }
    } catch (err) {
      showToast({ title: 'Preset Mapping Failed', message: err.message || 'Unable to map preset categories.', tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  async function handleAddCategory() {
    if (!newCatName.trim()) return
    setActionBusy(true)
    try {
      await createLauncherCategory({ name: newCatName.trim(), sortOrder: (launcherCategories.length + 1) * 10 })
      showToast({ title: 'Category Created', message: `Added "${newCatName.trim()}".`, tone: 'success' })
      setNewCatName('')
    } catch (err) {
      showToast({ title: 'Category Error', message: err.message || 'Unable to create category.', tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  async function handleRenameCategory(id) {
    if (!editingCatName.trim()) return
    setActionBusy(true)
    try {
      await updateLauncherCategory(id, { name: editingCatName.trim() })
      showToast({ title: 'Category Updated', message: 'Category renamed.', tone: 'success' })
      setEditingCatId(null)
      setEditingCatName('')
    } catch (err) {
      showToast({ title: 'Category Error', message: err.message || 'Unable to update category.', tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  async function handleDeleteCategory() {
    if (!deleteTargetCategory) return
    setActionBusy(true)
    try {
      await deleteLauncherCategory(deleteTargetCategory.id)
      showToast({ title: 'Category Removed', message: `Category "${deleteTargetCategory.name}" removed.`, tone: 'warning' })
      setDeleteTargetCategory(null)
    } catch (err) {
      showToast({ title: 'Delete Error', message: err.message || 'Unable to delete category.', tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  function openRemotePathModal(app) {
    setPathTargetApp(app)
    setRemotePathInput(app.executablePath || '')
    setRemotePathModalOpen(true)
  }

  async function handleSaveRemotePath() {
    if (!pathTargetApp) return
    setActionBusy(true)
    try {
      await updateLauncherApp(pathTargetApp.id, { executablePath: remotePathInput.trim() || null })
      showToast({ title: 'Remote Path Saved', message: `Path for "${pathTargetApp.name}" updated remotely.`, tone: 'success' })
      setRemotePathModalOpen(false)
    } catch (err) {
      showToast({ title: 'Path Save Error', message: err.message || 'Unable to save path.', tone: 'error' })
    } finally {
      setActionBusy(false)
    }
  }

  const filteredPresets = useMemo(() => {
    return PRESET_CATALOG.filter((p) => {
      const matchCat = presetCategory === 'All' || p.category === presetCategory
      const q = presetSearch.toLowerCase().trim()
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q) || p.exe?.toLowerCase().includes(q)
      return matchCat && matchSearch
    })
  }, [presetCategory, presetSearch])

  return (
    <AdminPageWorkspace
      eyebrow="Station Kiosk Catalog"
      title="Games & Applications"
      description="Manage game disk executables, protocol links, custom filters, and batch game additions for all customer stations."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            onClick={() => setCategoryModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <FolderPlus size={15} />
            Categories
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              setSelectedPresets(new Set())
              setBatchModalOpen(true)
            }}
            className="flex items-center gap-1.5"
          >
            <Sparkles size={15} />
            Batch Add Presets
          </Button>
          <Button
            variant="primary"
            onClick={openAddAppModal}
            className="flex items-center gap-1.5"
          >
            <Plus size={15} />
            Add Custom App
          </Button>
        </div>
      }
      metrics={
        <>
          <AdminMetricCard
            title="Total Configured Apps"
            value={totalAppsCount}
            subtitle="Available in kiosk catalog"
            icon={Gamepad2}
            tone="gold"
          />
          <AdminMetricCard
            title="Active Categories"
            value={totalCategoriesCount}
            subtitle="Custom filter tabs"
            icon={Layers}
            tone="teal"
          />
          <AdminMetricCard
            title="Enabled for Kiosks"
            value={enabledAppsCount}
            subtitle="Ready to launch on stations"
            icon={CheckCircle2}
            tone="ember"
          />
          <AdminMetricCard
            title="Preset Catalog"
            value={PRESET_CATALOG.length}
            subtitle="Ready-to-add titles"
            icon={Sparkles}
          />
        </>
      }
      rail={
        <div className="space-y-4">
          <AdminRailCard
            eyebrow="Game Disk & Network Paths"
            title="Centralized Executable Paths"
            description="Paths configured here apply to all connected stations automatically. If a PC has a local override configured via Master PIN, the station uses its local path first."
          >
            <div className="mt-3 rounded-xl border border-surface-line customer-neutral-surface p-3 text-xs text-slate-soft space-y-2">
              <div className="flex items-center gap-1.5 font-semibold text-ink-900">
                <HardDrive size={14} className="text-gold-dim" /> Game Disk Best Practices
              </div>
              <p>For shared Game Disks, use standardized drive letters like <code className="text-gold-dim font-mono">D:\Games\Title\game.exe</code> or UNC network shares like <code className="text-gold-dim font-mono">\\GAMEDISK\Games\...</code>.</p>
              <p>Protocol URLs (e.g. <code className="text-gold-dim font-mono">steam://rungameid/570</code>) will launch through the station's installed client without requiring absolute disk paths.</p>
            </div>
          </AdminRailCard>

          <AdminRailCard
            eyebrow="Station Security"
            title="Client Master PIN Protection"
            description="Customers cannot add apps or modify game paths. Technicians can press 'Manage Station Games' on any kiosk station and enter the Master Setup PIN to override paths locally."
          />
        </div>
      }
    >
      <div className="space-y-3 mb-5">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              type="button"
              onClick={() => setActiveCategoryFilter('All')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                activeCategoryFilter === 'All'
                  ? 'bg-midnight/10 text-ink-900 border border-gold/30'
                  : 'text-slate-soft hover:text-ink-900 border border-transparent'
              }`}
            >
              All ({launcherApps.length})
            </button>
            {categoryNames.map((cat) => {
              const count = launcherApps.filter(a => (a.categoryName || a.category) === cat).length
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setActiveCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition ${
                    activeCategoryFilter === cat
                      ? 'bg-midnight/10 text-ink-900 border border-gold/30'
                      : 'text-slate-soft hover:text-ink-900 border border-transparent'
                  }`}
                >
                  {cat} ({count})
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setCategoryModalOpen(true)}
              className="px-2.5 py-1.5 rounded-xl text-xs font-semibold text-gold-dim hover:text-ink-900 border border-dashed border-gold/40 hover:border-gold transition flex items-center gap-1 shrink-0 cursor-pointer ml-1"
              title="Manage Categories (Add, Edit, Delete, Map Presets)"
            >
              <FolderPlus size={13} />
              <span>Categories</span>
            </button>
          </div>

          <div className="relative min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-soft" size={15} />
            <input
              type="text"
              placeholder="Search apps or paths…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-surface-line customer-neutral-surface py-1.5 pl-9 pr-3 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
            />
          </div>
        </div>
      </div>

      {filteredApps.length === 0 ? (
        <AdminEmptyState
          title="No applications found"
          description={
            searchQuery
              ? 'No games or apps match your search query.'
              : 'No applications in this category yet. Add custom apps or choose from our preset catalog.'
          }
          action={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedPresets(new Set())
                  setBatchModalOpen(true)
                }}
              >
                Batch Add Presets
              </Button>
              <Button variant="primary" onClick={openAddAppModal}>
                Add App
              </Button>
            </div>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {filteredApps.map((app) => (
            <div
              key={app.id}
              className="group relative flex flex-col justify-between rounded-2xl border border-surface-line customer-neutral-surface p-4 transition-all hover:border-gold/30 hover:shadow-sm"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <AppIcon icon={app.icon} name={app.name} className="h-11 w-11" />
                    <div>
                      <h4 className="font-display text-sm font-bold text-ink-900 leading-snug line-clamp-1">
                        {app.name}
                      </h4>
                      <span className="inline-block mt-0.5 rounded-md bg-midnight/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-soft">
                        {app.categoryName || app.category || 'General'}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      app.isEnabled !== false ? 'bg-teal-dim' : 'bg-slate-soft'
                    }`}
                    title={app.isEnabled !== false ? 'Enabled' : 'Disabled'}
                  />
                </div>

                <div className="mt-3 space-y-1 rounded-xl bg-surface-raised/50 p-2 text-[11px] font-mono text-slate-soft">
                  {app.executablePath && (
                    <div className="flex items-center gap-1.5 truncate text-ink-900" title={app.executablePath}>
                      <HardDrive size={12} className="text-gold-dim shrink-0" />
                      <span className="truncate">{app.executablePath}</span>
                    </div>
                  )}
                  {app.protocolUrl && (
                    <div className="flex items-center gap-1.5 truncate text-teal-dim" title={app.protocolUrl}>
                      <ExternalLink size={12} className="shrink-0" />
                      <span className="truncate">{app.protocolUrl}</span>
                    </div>
                  )}
                  {!app.executablePath && !app.protocolUrl && (
                    <div className="italic text-slate-soft">Default executable lookup</div>
                  )}
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-surface-line pt-3 text-xs">
                <button
                  type="button"
                  onClick={() => openRemotePathModal(app)}
                  className="inline-flex items-center gap-1 text-slate-soft hover:text-gold-dim font-medium transition"
                  title="Edit Remote Executable Path"
                >
                  <HardDrive size={13} />
                  Remote Path
                </button>

                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => openEditAppModal(app)}
                    className="p-1.5 rounded-lg text-slate-soft hover:text-ink-900 hover:bg-surface-raised transition"
                    title="Edit App"
                  >
                    <Pencil size={14} />
                  </button>
                  {!isCashier && (
                    <button
                      type="button"
                      onClick={() => setDeleteTargetApp(app)}
                      className="p-1.5 rounded-lg text-slate-soft hover:text-ember-dim hover:bg-ember/10 transition"
                      title="Delete App"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL: ADD / EDIT APP */}
      <Modal
        open={addAppModalOpen}
        onClose={() => !actionBusy && setAddAppModalOpen(false)}
        eyebrow="Kiosk Application"
        title={editingApp ? 'Edit Application' : 'Add Custom Application'}
        description="Configure executable paths, launch arguments, and category for customer kiosks."
        maxWidth="max-w-2xl"
        busy={actionBusy}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={actionBusy}
              onClick={() => setAddAppModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={actionBusy || !appForm.name.trim()}
              onClick={handleSaveApp}
            >
              {actionBusy ? 'Saving…' : editingApp ? 'Save Changes' : 'Add Application'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveApp} className="space-y-4.5 py-1">
          {/* Row 1: App Name + Category */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block">
                <span className="eyebrow mb-1.5 block">Application Name *</span>
                <input
                  type="text"
                  required
                  value={appForm.name}
                  onChange={(e) => setAppForm({ ...appForm, name: e.target.value })}
                  placeholder="e.g. Valorant, Chrome, Roblox"
                  className={inputClass}
                />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="eyebrow mb-1.5 block">Category</span>
                <select
                  value={appForm.categoryName}
                  onChange={(e) => setAppForm({ ...appForm, categoryName: e.target.value })}
                  className={inputClass}
                >
                  {categoryNames.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Row 2: Icon & Artwork Preview Card */}
          <div>
            <span className="eyebrow mb-1.5 block">Application Icon / Artwork</span>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5 p-3.5 rounded-2xl border border-surface-line bg-surface-raised/40">
              <AppIcon icon={appForm.icon} name={appForm.name} className="h-16 w-16 rounded-2xl shadow-sm border border-surface-line/70" iconClass="text-3xl" />
              <div className="flex-1 w-full space-y-2.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={appForm.icon}
                    onChange={(e) => setAppForm({ ...appForm, icon: e.target.value })}
                    placeholder="/assets/launcher/valorant.webp or https://..."
                    className="flex-1 rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-xs text-ink-900 focus:outline-none focus:border-gold/50 font-mono"
                  />
                  <label className="cursor-pointer shrink-0 rounded-xl border border-surface-line customer-neutral-surface px-3.5 py-2 text-xs font-semibold text-ink-900 hover:bg-dance/35 transition shadow-xs">
                    Upload
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) {
                          showToast({ title: 'Image Too Large', message: 'Image size must be under 2MB.', tone: 'warning' });
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = (ev) => {
                          setAppForm((prev) => ({ ...prev, icon: ev.target?.result || '' }));
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] font-semibold text-slate-soft uppercase tracking-wider">Presets:</span>
                  {PRESET_CATALOG.slice(0, 10).map((p) => (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setAppForm((prev) => ({ ...prev, icon: p.icon }))}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border border-surface-line text-[10px] text-slate-soft hover:text-ink-900 hover:border-gold/40 transition"
                    >
                      {p.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Remote Path */}
          <div>
            <label className="block">
              <span className="eyebrow mb-1.5 block">Remote Executable Path / Game Disk</span>
              <input
                type="text"
                value={appForm.executablePath}
                onChange={(e) => setAppForm({ ...appForm, executablePath: e.target.value })}
                placeholder="e.g. D:\Games\Valorant\RiotClientServices.exe or \\GAMEDISK\Games\..."
                className={inputClass}
              />
              <span className="mt-1.5 block text-[11px] text-slate-soft">
                Full executable path on client PCs or central Game Disk. Leave blank if launching via Protocol URL.
              </span>
            </label>
          </div>

          {/* Row 4: Protocol URL */}
          <div>
            <label className="block">
              <span className="eyebrow mb-1.5 block">Protocol URL (Optional)</span>
              <input
                type="text"
                value={appForm.protocolUrl}
                onChange={(e) => setAppForm({ ...appForm, protocolUrl: e.target.value })}
                placeholder="e.g. steam://rungameid/570, riotclient://launch/league_of_legends, discord://"
                className={inputClass}
              />
            </label>
          </div>

          {/* Row 5: Launch Arguments + Working Directory */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block">
                <span className="eyebrow mb-1.5 block">Launch Arguments</span>
                <input
                  type="text"
                  value={appForm.launchArguments}
                  onChange={(e) => setAppForm({ ...appForm, launchArguments: e.target.value })}
                  placeholder="e.g. -novid -high -threads 8"
                  className={inputClass}
                />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="eyebrow mb-1.5 block">Working Directory</span>
                <input
                  type="text"
                  value={appForm.workingDirectory}
                  onChange={(e) => setAppForm({ ...appForm, workingDirectory: e.target.value })}
                  placeholder="e.g. D:\Games\Valorant"
                  className={inputClass}
                />
              </label>
            </div>
          </div>

          {/* Row 6: Enabled checkbox card */}
          <div className="pt-2">
            <label className="flex items-center gap-3 p-3 rounded-xl border border-surface-line bg-surface-raised/20 cursor-pointer text-sm font-semibold text-ink-900 hover:bg-surface-raised/50 transition">
              <input
                type="checkbox"
                checked={appForm.isEnabled}
                onChange={(e) => setAppForm({ ...appForm, isEnabled: e.target.checked })}
                className="h-4.5 w-4.5 rounded text-gold focus:ring-gold/30 cursor-pointer"
              />
              <span>Enable and display on Customer Station Launchers</span>
            </label>
          </div>
        </form>
      </Modal>

      {/* MODAL: BATCH ADD FROM PRESET CATALOG */}
      <Modal
        open={batchModalOpen}
        onClose={() => !actionBusy && setBatchModalOpen(false)}
        eyebrow="Catalog Presets"
        title="Batch Add Games & Applications"
        description="Select multiple popular games and office tools to add them instantly to your cafe launcher."
        maxWidth="max-w-3xl"
        busy={actionBusy}
        footer={
          <>
            <div className="flex-1 flex items-center justify-between text-xs text-slate-soft">
              <span className="font-semibold text-ink-900">{selectedPresets.size} selected</span>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => selectAllFilteredPresets(filteredPresets)}
                  className="text-gold-dim hover:underline font-semibold cursor-pointer"
                >
                  Select All Filtered
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={deselectAllPresets}
                  className="hover:underline cursor-pointer"
                >
                  Clear Selection
                </button>
              </div>
            </div>
            <Button
              variant="ghost"
              disabled={actionBusy}
              onClick={() => setBatchModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={actionBusy || selectedPresets.size === 0}
              onClick={handleBatchAdd}
            >
              {actionBusy ? 'Adding…' : `Add Selected (${selectedPresets.size})`}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 py-1">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-soft" size={15} />
              <input
                type="text"
                placeholder="Search presets by name or exe…"
                value={presetSearch}
                onChange={(e) => setPresetSearch(e.target.value)}
                className="w-full rounded-xl border border-surface-line customer-neutral-surface py-2 pl-9 pr-3 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
              />
            </div>
            <select
              value={presetCategory}
              onChange={(e) => setPresetCategory(e.target.value)}
              className="rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-xs text-ink-900 focus:outline-none focus:border-gold/50 font-medium"
            >
              <option value="All">All Categories</option>
              <option value="Online Games">Online Games</option>
              <option value="Offline Games">Offline Games</option>
              <option value="Surfing & Browsers">Surfing & Browsers</option>
              <option value="Office & Productivity">Office & Productivity</option>
              <option value="Utilities & Chat">Utilities & Chat</option>
              <option value="Emulators">Emulators</option>
            </select>
          </div>

          <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1.5">
            {filteredPresets.map((preset) => {
              const isChecked = selectedPresets.has(preset.name)
              const alreadyExists = launcherApps.some(a => a.name.toLowerCase() === preset.name.toLowerCase())

              return (
                <div
                  key={preset.name}
                  onClick={() => !alreadyExists && togglePreset(preset.name)}
                  className={`flex items-center justify-between p-3 rounded-xl border transition cursor-pointer ${
                    alreadyExists
                      ? 'border-surface-line bg-surface-raised/40 opacity-60 cursor-not-allowed'
                      : isChecked
                      ? 'border-gold/60 bg-gold/[0.07] shadow-xs'
                      : 'border-surface-line customer-neutral-surface hover:border-gold/30 hover:bg-surface-raised/30'
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <input
                      type="checkbox"
                      checked={isChecked || alreadyExists}
                      disabled={alreadyExists}
                      onChange={() => {}}
                      className="h-4.5 w-4.5 rounded text-gold focus:ring-gold/30"
                    />
                    <AppIcon icon={preset.icon} name={preset.name} className="h-10 w-10 rounded-xl" />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-ink-900">{preset.name}</span>
                        {alreadyExists && (
                          <span className="text-[10px] text-teal-dim font-semibold bg-teal/10 px-2 py-0.2 rounded-full">
                            Already Added
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-soft flex flex-wrap gap-2 mt-0.5">
                        <span className="font-semibold uppercase tracking-wider text-[10px] text-gold-dim">{preset.category}</span>
                        {preset.exe && <span className="font-mono">• {preset.exe}</span>}
                        {preset.protocol && <span className="font-mono">• {preset.protocol}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Modal>

      {/* MODAL: CATEGORY MANAGER */}
      <Modal
        open={categoryModalOpen}
        onClose={() => setCategoryModalOpen(false)}
        eyebrow="Launcher Categories"
        title="Manage Filter Categories"
        description="Create, rename, delete, or auto-map standard categories (Online Games, Offline Games, Surfing, etc.) for the kiosk launcher."
        maxWidth="max-w-lg"
        footer={
          <Button variant="primary" onClick={() => setCategoryModalOpen(false)}>
            Done
          </Button>
        }
      >
        <div className="space-y-4 py-1">
          <div className="flex items-center justify-between p-3 rounded-xl border border-surface-line customer-neutral-surface">
            <div>
              <p className="text-xs font-bold text-ink-900">Standard Presets</p>
              <p className="text-[11px] text-slate-soft">Map default gaming & utility categories in 1-click.</p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              disabled={actionBusy}
              onClick={handleMapPresetCategories}
              className="flex items-center gap-1.5 text-xs shrink-0"
            >
              <Sparkles size={13} className="text-gold-dim" />
              Map Preset Categories
            </Button>
          </div>

          <div className="flex gap-2.5">
            <input
              type="text"
              placeholder="Add new category (e.g. Esports, Emulators)…"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAddCategory()
                }
              }}
              className={inputClass}
            />
            <Button
              variant="primary"
              disabled={actionBusy || !newCatName.trim()}
              onClick={handleAddCategory}
              className="shrink-0"
            >
              Add Category
            </Button>
          </div>

          {launcherCategories.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-soft border border-dashed border-surface-line rounded-xl p-4">
              <p className="font-semibold text-ink-900">No custom categories yet</p>
              <p className="mt-1">Click "Map Preset Categories" above or type a custom category name to begin.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[320px] overflow-y-auto pr-1">
              {launcherCategories.map((cat) => (
                <div
                  key={cat.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-surface-line customer-neutral-surface shadow-xs"
                >
                  {editingCatId === cat.id ? (
                    <div className="flex-1 flex gap-2 mr-2">
                      <input
                        type="text"
                        autoFocus
                        value={editingCatName}
                        onChange={(e) => setEditingCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            handleRenameCategory(cat.id)
                          }
                        }}
                        className="w-full rounded-lg border border-surface-line customer-neutral-surface px-2.5 py-1.5 text-xs text-ink-900 focus:outline-none"
                      />
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleRenameCategory(cat.id)}
                      >
                        Save
                      </Button>
                    </div>
                  ) : (
                    <div>
                      <span className="text-xs font-bold text-ink-900">{cat.name}</span>
                      <span className="block text-[11px] text-slate-soft mt-0.5">
                        {launcherApps.filter(a => (a.categoryName || a.category) === cat.name).length} applications
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5">
                    {editingCatId !== cat.id && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(cat.id)
                          setEditingCatName(cat.name)
                        }}
                        className="p-1.5 rounded-lg text-slate-soft hover:text-ink-900 hover:bg-surface-raised transition cursor-pointer"
                        title="Rename Category"
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {!isCashier && (
                      <button
                        type="button"
                        onClick={() => setDeleteTargetCategory(cat)}
                        className="p-1.5 rounded-lg text-slate-soft hover:text-ember-dim hover:bg-ember/10 transition cursor-pointer"
                        title="Delete Category"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* MODAL: REMOTE PATH QUICK EDITOR */}
      <Modal
        open={remotePathModalOpen}
        onClose={() => !actionBusy && setRemotePathModalOpen(false)}
        eyebrow="Game Disk Path"
        title={`Remote Path for ${pathTargetApp?.name || 'App'}`}
        description="Update the executable path remotely for all customer stations without going to each PC."
        maxWidth="max-w-lg"
        busy={actionBusy}
        footer={
          <>
            <Button
              variant="ghost"
              disabled={actionBusy}
              onClick={() => setRemotePathModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={actionBusy}
              onClick={handleSaveRemotePath}
            >
              {actionBusy ? 'Saving…' : 'Save Remote Path'}
            </Button>
          </>
        }
      >
        <div className="space-y-3.5 py-1">
          <label className="block">
            <span className="eyebrow mb-1.5 block">Executable Path</span>
            <input
              type="text"
              autoFocus
              value={remotePathInput}
              onChange={(e) => setRemotePathInput(e.target.value)}
              placeholder="e.g. D:\Games\Steam\steam.exe or \\GAMEDISK\Games\..."
              className={inputClass}
            />
          </label>
          <div className="rounded-xl border border-surface-line bg-surface-raised/50 p-3.5 text-xs text-slate-soft space-y-1.5">
            <p className="font-semibold text-ink-900">Station Resolution Priority:</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Station Local Override (Set via Master PIN on that PC).</li>
              <li>This Remote Executable Path (Central Game Disk).</li>
              <li>Protocol URL / Default system PATH.</li>
            </ol>
          </div>
        </div>
      </Modal>

      {/* CONFIRM MODALS */}
      <ConfirmModal
        open={Boolean(deleteTargetApp)}
        onClose={() => setDeleteTargetApp(null)}
        onConfirm={handleDeleteApp}
        title="Remove Application?"
        description={`Are you sure you want to remove "${deleteTargetApp?.name}" from the kiosk launcher? This will remove it from all customer stations.`}
        confirmLabel="Remove Application"
        tone="danger"
        busy={actionBusy}
      />

      <ConfirmModal
        open={Boolean(deleteTargetCategory)}
        onClose={() => setDeleteTargetCategory(null)}
        onConfirm={handleDeleteCategory}
        title="Delete Category?"
        description={`Are you sure you want to delete category "${deleteTargetCategory?.name}"?`}
        confirmLabel="Delete Category"
        tone="danger"
        busy={actionBusy}
      />
    </AdminPageWorkspace>
  )
}
