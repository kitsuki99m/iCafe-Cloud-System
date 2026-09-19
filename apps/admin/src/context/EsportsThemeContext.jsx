import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { apiPatch } from '../lib/api.js'

const EsportsThemeContext = createContext(null)

const THEME_STORAGE_KEY = 'aezakmi.esports_theme_mode'
const SKIN_STORAGE_KEY = 'aezakmi.skin'

export function EsportsThemeProvider({ children }) {
  const [themeMode, setThemeModeState] = useState(() => {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY) || sessionStorage.getItem(THEME_STORAGE_KEY)
      if (saved === 'esports' || saved === 'dashboard') return saved
      return 'dashboard'
    } catch {
      return 'dashboard'
    }
  })

  const syncSkinDataset = (mode) => {
    try {
      const activeSkinId = localStorage.getItem(SKIN_STORAGE_KEY) || 'nexus'
      document.documentElement.setAttribute('data-theme-persona', mode)
      document.documentElement.dataset.skin = activeSkinId
    } catch {}
  }

  const setThemeMode = (mode) => {
    const target = mode === 'esports' ? 'esports' : 'dashboard'
    setThemeModeState(target)
    try {
      sessionStorage.setItem(THEME_STORAGE_KEY, target)
      localStorage.setItem(THEME_STORAGE_KEY, target)
    } catch {}
    syncSkinDataset(target)
    window.dispatchEvent(new CustomEvent('aezakmi:persona-changed', { detail: { mode: target } }))
    try {
      const activeSkinId = localStorage.getItem(SKIN_STORAGE_KEY) || 'nexus'
      apiPatch('/settings', { themePersona: target, skinId: activeSkinId }).catch(() => {})
    } catch {}
  }

  const toggleThemeMode = () => {
    setThemeMode(themeMode === 'esports' ? 'dashboard' : 'esports')
  }

  // Keep data-theme-persona and data-skin synchronized on document root
  useEffect(() => {
    syncSkinDataset(themeMode)
  }, [themeMode])

  // Synchronize when skin changes
  useEffect(() => {
    const handleSkinChange = (e) => {
      const nextSkin = e.detail?.skin || 'nexus'
      document.documentElement.dataset.skin = nextSkin
    }
    window.addEventListener('aezakmi:skin-changed', handleSkinChange)
    return () => window.removeEventListener('aezakmi:skin-changed', handleSkinChange)
  }, [])

  // Keyboard shortcut: F9 to toggle Dashboard vs Esports mode
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'F9') {
        e.preventDefault()
        toggleThemeMode()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [themeMode])

  const value = useMemo(() => ({
    themeMode,
    isEsportsMode: themeMode === 'esports',
    isDashboardMode: themeMode === 'dashboard',
    setThemeMode,
    toggleThemeMode,
  }), [themeMode])

  return (
    <EsportsThemeContext.Provider value={value}>
      {children}
    </EsportsThemeContext.Provider>
  )
}

export function useEsportsTheme() {
  const context = useContext(EsportsThemeContext)
  if (!context) {
    return {
      themeMode: 'dashboard',
      isEsportsMode: false,
      isDashboardMode: true,
      setThemeMode: () => {},
      toggleThemeMode: () => {},
    }
  }
  return context
}

