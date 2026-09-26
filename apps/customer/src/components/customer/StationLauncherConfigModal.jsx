import { useState, useEffect, useMemo } from 'react'
import {
  Gamepad2,
  HardDrive,
  FolderOpen,
  Plus,
  Trash2,
  Play,
  RotateCcw,
  Check,
  Search,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Layers
} from 'lucide-react'
import Modal from '../common/Modal.jsx'
import Button from '../common/Button.jsx'
import { showToast } from '../../lib/toast.js'
import { resolveAppIconUrl } from '../../lib/images.js'

const inputClass = 'w-full rounded-xl border border-surface-line customer-neutral-surface px-3 py-2 text-xs text-ink-900 focus:outline-none focus:border-gold/50'

function AppIcon({ icon, name, className = 'h-9 w-9', iconClass = 'text-xl' }) {
  const resolved = resolveAppIconUrl(icon) || icon
  const isImage = resolved && typeof resolved === 'string' && (
    resolved.startsWith('/') ||
    resolved.startsWith('./') ||
    resolved.startsWith('http') ||
    resolved.startsWith('data:') ||
    resolved.startsWith('blob:') ||
    /\.(webp|png|jpg|jpeg|svg|avif|gif)$/i.test(resolved)
  )
  const isEmoji = icon && typeof icon === 'string' && !icon.includes('/') && !icon.includes('.') && icon.length <= 4
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    setImgError(false)
  }, [icon])

  if (isImage && !imgError) {
    return (
      <span className={`inline-flex items-center justify-center rounded-xl bg-surface-raised/80 border border-surface-line/50 p-1 overflow-hidden shrink-0 select-none ${className}`}>
        <img
          src={resolved}
          alt={name || 'App Icon'}
          className="h-full w-full object-contain"
          onError={() => setImgError(true)}
          loading="lazy"
        />
      </span>
    )
  }

  if (isEmoji && !imgError) {
    return (
      <span className={`inline-flex items-center justify-center rounded-xl bg-midnight/8 ${iconClass} shrink-0 select-none ${className}`}>
        {icon}
      </span>
    )
  }

  return (
    <span
      className={`inline-flex flex-col items-center justify-center rounded-xl border border-dashed border-surface-line bg-surface-raised/60 text-slate-soft p-0.5 shrink-0 select-none overflow-hidden ${className}`}
      title="No icon found"
    >
      <Gamepad2 size={14} className="opacity-40 shrink-0" />
      <span className="text-[7px] font-black tracking-tight uppercase leading-none text-slate-soft/70 mt-0.5 whitespace-nowrap">
        NO ICON
      </span>
    </span>
  )
}

export default function StationLauncherConfigModal({
  open,
  onClose,
  serverApps = [],
  serverCategories = [],
  onConfigChanged,
}) {
  const [stationConfig, setStationConfig] = useState({ pathOverrides: {}, localApps: [] })
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')

  // Add Local App Form
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [newApp, setNewApp] = useState({
    name: '',
    category: 'Online Games',
    icon: '🎮',
    executablePath: '',
    protocolUrl: '',
    launchArguments: '',
  })

  useEffect(() => {
    if (!open) return
    loadStationConfig()
  }, [open])

  async function loadStationConfig() {
    setLoading(true)
    try {
      if (window.aezakmiClient?.getStationLauncherConfig) {
        const cfg = await window.aezakmiClient.getStationLauncherConfig()
        setStationConfig({
          pathOverrides: cfg?.pathOverrides || {},
          localApps: Array.isArray(cfg?.localApps) ? cfg.localApps : [],
        })
      }
    } catch (err) {
      showToast({ title: 'Config Error', message: 'Unable to read station launcher configuration.', tone: 'error' })
    } finally {
      setLoading(false)
    }
  }

  async function saveStationConfig(nextConfig) {
    setBusy(true)
    try {
      if (window.aezakmiClient?.setStationLauncherConfig) {
        await window.aezakmiClient.setStationLauncherConfig(nextConfig)
        setStationConfig(nextConfig)
        onConfigChanged?.(nextConfig)
        showToast({ title: 'Station Config Saved', message: 'Local paths updated for this PC.', tone: 'success' })
      }
    } catch (err) {
      showToast({ title: 'Save Failed', message: err.message || 'Unable to save station configuration.', tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function handleBrowseExe(appId) {
    if (!window.aezakmiClient?.browseExecutable) {
      showToast({ title: 'Browser Unavailable', message: 'File browsing is available in the desktop station client.', tone: 'info' })
      return
    }
    try {
      const selectedPath = await window.aezakmiClient.browseExecutable()
      if (!selectedPath) return

      const nextOverrides = {
        ...stationConfig.pathOverrides,
        [appId]: selectedPath,
      }
      await saveStationConfig({
        ...stationConfig,
        pathOverrides: nextOverrides,
      })
    } catch (err) {
      showToast({ title: 'Browse Error', message: err.message || 'Unable to select executable.', tone: 'error' })
    }
  }

  async function handleClearOverride(appId) {
    const nextOverrides = { ...stationConfig.pathOverrides }
    delete nextOverrides[appId]
    await saveStationConfig({
      ...stationConfig,
      pathOverrides: nextOverrides,
    })
  }

  async function handleBrowseNewAppExe() {
    if (!window.aezakmiClient?.browseExecutable) return
    try {
      const selectedPath = await window.aezakmiClient.browseExecutable()
      if (!selectedPath) return

      const baseName = selectedPath.split('\\').pop()?.replace(/\.exe$/i, '') || ''
      setNewApp(prev => ({
        ...prev,
        executablePath: selectedPath,
        name: prev.name || baseName,
      }))

      // Try extract icon
      if (window.aezakmiClient?.extractExeIcon) {
        const iconData = await window.aezakmiClient.extractExeIcon(selectedPath)
        if (iconData) {
          setNewApp(prev => ({ ...prev, icon: '🎮' }))
        }
      }
    } catch {}
  }

  async function handleAddLocalApp(e) {
    if (e?.preventDefault) e.preventDefault()
    if (!newApp.name.trim()) return

    const item = {
      id: `local-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newApp.name.trim(),
      category: newApp.category || 'Online Games',
      icon: newApp.icon || '🎮',
      executablePath: newApp.executablePath.trim() || null,
      protocolUrl: newApp.protocolUrl.trim() || null,
      launchArguments: newApp.launchArguments.trim() || null,
      isLocalStation: true,
    }

    const nextLocalApps = [...stationConfig.localApps, item]
    await saveStationConfig({
      ...stationConfig,
      localApps: nextLocalApps,
    })
    setAddModalOpen(false)
    setNewApp({
      name: '',
      category: 'Online Games',
      icon: '🎮',
      executablePath: '',
      protocolUrl: '',
      launchArguments: '',
    })
  }

  async function handleDeleteLocalApp(localId) {
    const nextLocalApps = stationConfig.localApps.filter(a => a.id !== localId)
    await saveStationConfig({
      ...stationConfig,
      localApps: nextLocalApps,
    })
  }

  async function handleTestLaunch(app) {
    try {
      if (window.aezakmiClient?.launchApp) {
        const success = await window.aezakmiClient.launchApp(app)
        if (success) {
          showToast({ title: 'Launch Test', message: `Triggered process for ${app.name}.`, tone: 'success' })
        } else {
          showToast({ title: 'Launch Warning', message: `Could not launch ${app.name}. Check the executable path.`, tone: 'warning' })
        }
      }
    } catch (err) {
      showToast({ title: 'Launch Error', message: err.message || 'Failed to test launch.', tone: 'error' })
    }
  }

  // Combined app list: Server apps + Local station additions
  const combinedApps = useMemo(() => {
    const list = [...serverApps.map(a => ({ ...a, isLocalOnly: false }))]
    stationConfig.localApps.forEach(local => {
      list.push({ ...local, isLocalOnly: true })
    })
    return list
  }, [serverApps, stationConfig.localApps])

  const filteredApps = useMemo(() => {
    return combinedApps.filter(app => {
      const matchCat = selectedCategory === 'All' || (app.categoryName || app.category) === selectedCategory
      const q = searchQuery.toLowerCase().trim()
      const matchSearch = !q || app.name?.toLowerCase().includes(q) || app.executablePath?.toLowerCase().includes(q)
      return matchCat && matchSearch
    })
  }, [combinedApps, selectedCategory, searchQuery])

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        eyebrow="Technician Station Setup"
        title="Station Game Paths & Applications"
        description="Unlocked via Master PIN. Configure local drive executable overrides and station-specific applications on this PC."
        maxWidth="max-w-3xl"
        zIndexClass="z-[900]"
        busy={busy || loading}
        footer={
          <>
            <div className="flex-1 flex items-center gap-2 text-xs text-slate-soft">
              <ShieldCheck size={14} className="text-teal-dim" />
              <span>Overrides set here apply only to this station PC.</span>
            </div>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setNewApp({
                  name: '',
                  category: serverCategories[0]?.name || 'Online Games',
                  icon: '🎮',
                  executablePath: '',
                  protocolUrl: '',
                  launchArguments: '',
                })
                setAddModalOpen(true)
              }}
              className="flex items-center gap-1.5"
            >
              <Plus size={14} />
              Add Station App
            </Button>
          </>
        }
      >
        <div className="space-y-3.5">
          {/* Search & Filter */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-soft" size={14} />
              <input
                type="text"
                placeholder="Search games or paths…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-surface-line customer-neutral-surface py-1.5 pl-8 pr-3 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-xl border border-surface-line customer-neutral-surface px-3 py-1.5 text-xs text-ink-900 focus:outline-none focus:border-gold/50"
            >
              <option value="All">All Categories</option>
              {serverCategories.map(c => (
                <option key={c.id || c.name} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Games List */}
          <div className="max-h-[420px] overflow-y-auto space-y-2 pr-1">
            {filteredApps.length === 0 ? (
              <div className="rounded-xl border border-dashed border-surface-line p-8 text-center text-xs text-slate-soft">
                No applications match your filter.
              </div>
            ) : (
              filteredApps.map((app) => {
                const localOverride = stationConfig.pathOverrides?.[app.id] || stationConfig.pathOverrides?.[app.command]
                const effectivePath = localOverride || app.executablePath

                return (
                  <div
                    key={app.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-surface-line customer-neutral-surface hover:border-gold/30 transition"
                  >
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <AppIcon icon={app.icon} name={app.name} className="h-9 w-9" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-ink-900">{app.name}</span>
                          <span className="text-[9px] uppercase font-semibold text-slate-soft bg-surface-raised px-1.5 py-0.5 rounded">
                            {app.categoryName || app.category || 'Game'}
                          </span>
                          {localOverride && (
                            <span className="text-[9px] font-bold text-teal-dim bg-teal/10 px-1.5 py-0.5 rounded">
                              Station Override Active
                            </span>
                          )}
                          {app.isLocalOnly && (
                            <span className="text-[9px] font-bold text-gold-dim bg-gold/10 px-1.5 py-0.5 rounded">
                              Local PC Only
                            </span>
                          )}
                        </div>

                        {/* Executable Path Display */}
                        <div className="mt-1 flex items-center gap-1.5 text-[11px] font-mono text-slate-soft truncate">
                          <HardDrive size={12} className={localOverride ? 'text-teal-dim shrink-0' : 'text-slate-soft shrink-0'} />
                          <span className="truncate" title={effectivePath || 'Protocol / System default'}>
                            {effectivePath || app.protocolUrl || 'Default executable lookup'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleTestLaunch({ ...app, executablePath: effectivePath })}
                        className="flex items-center gap-1 text-[11px] py-1 px-2"
                        title="Test launch executable"
                      >
                        <Play size={12} />
                        Test
                      </Button>

                      {!app.isLocalOnly && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBrowseExe(app.id)}
                          className="flex items-center gap-1 text-[11px] py-1 px-2 text-gold-dim"
                          title="Browse for .exe on this PC"
                        >
                          <FolderOpen size={12} />
                          Browse
                        </Button>
                      )}

                      {localOverride && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleClearOverride(app.id)}
                          className="flex items-center gap-1 text-[11px] py-1 px-2 text-slate-soft"
                          title="Reset to server default path"
                        >
                          <RotateCcw size={12} />
                          Reset
                        </Button>
                      )}

                      {app.isLocalOnly && (
                        <button
                          type="button"
                          onClick={() => handleDeleteLocalApp(app.id)}
                          className="p-1.5 rounded-lg text-slate-soft hover:text-ember-dim hover:bg-ember/10 transition"
                          title="Delete local app"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </Modal>

      {/* MODAL: ADD LOCAL APP */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        eyebrow="Local Station Application"
        title="Add App to this PC"
        description="Add a station-specific executable or application that only appears on this station kiosk."
        maxWidth="max-w-md"
        zIndexClass="z-[950]"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!newApp.name.trim()}
              onClick={handleAddLocalApp}
            >
              Add Application
            </Button>
          </>
        }
      >
        <form onSubmit={handleAddLocalApp} className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <div className="col-span-2">
              <label className="block">
                <span className="eyebrow mb-1 block">App Name *</span>
                <input
                  type="text"
                  required
                  value={newApp.name}
                  onChange={(e) => setNewApp({ ...newApp, name: e.target.value })}
                  placeholder="e.g. Local Game"
                  className={inputClass}
                />
              </label>
            </div>
            <div>
              <label className="block">
                <span className="eyebrow mb-1 block">Icon</span>
                <input
                  type="text"
                  value={newApp.icon}
                  onChange={(e) => setNewApp({ ...newApp, icon: e.target.value })}
                  placeholder="🎮"
                  className={`${inputClass} text-center text-base`}
                />
              </label>
            </div>
          </div>

          <div>
            <label className="block">
              <span className="eyebrow mb-1 block">Category</span>
              <select
                value={newApp.category}
                onChange={(e) => setNewApp({ ...newApp, category: e.target.value })}
                className={inputClass}
              >
                {serverCategories.length > 0 ? (
                  serverCategories.map(c => (
                    <option key={c.id || c.name} value={c.name}>{c.name}</option>
                  ))
                ) : (
                  <>
                    <option value="Online Games">Online Games</option>
                    <option value="Offline Games">Offline Games</option>
                    <option value="Surfing & Browsers">Surfing & Browsers</option>
                    <option value="Office & Productivity">Office & Productivity</option>
                    <option value="Utilities & Chat">Utilities & Chat</option>
                    <option value="Emulators">Emulators</option>
                  </>
                )}
              </select>
            </label>
          </div>

          <div>
            <label className="block">
              <span className="eyebrow mb-1 block">Executable Path</span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newApp.executablePath}
                  onChange={(e) => setNewApp({ ...newApp, executablePath: e.target.value })}
                  placeholder="C:\Games\game.exe"
                  className={inputClass}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleBrowseNewAppExe}
                  className="shrink-0"
                >
                  <FolderOpen size={14} />
                </Button>
              </div>
            </label>
          </div>

          <div>
            <label className="block">
              <span className="eyebrow mb-1 block">Protocol URL (Optional)</span>
              <input
                type="text"
                value={newApp.protocolUrl}
                onChange={(e) => setNewApp({ ...newApp, protocolUrl: e.target.value })}
                placeholder="e.g. steam:// or discord://"
                className={inputClass}
              />
            </label>
          </div>
        </form>
      </Modal>
    </>
  )
}
