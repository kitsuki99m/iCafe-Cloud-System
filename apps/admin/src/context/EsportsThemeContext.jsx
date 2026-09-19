import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'

const EsportsThemeContext = createContext(null)

const THEME_STORAGE_KEY = 'aezakmi.esports_theme_mode'

export function EsportsThemeProvider({ children }) {
  const { user } = useAuth()

  const [themeMode, setThemeModeState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(THEME_STORAGE_KEY)
      if (saved === 'esports' || saved === 'dashboard') return saved
      return 'dashboard'
    } catch {
      return 'dashboard'
    }
  })

  // Whenever user logs in or out, always default to original dashboard theme
  useEffect(() => {
    if (!user) {
      setThemeModeState('dashboard')
      try {
        sessionStorage.removeItem(THEME_STORAGE_KEY)
        localStorage.removeItem(THEME_STORAGE_KEY)
      } catch {}
      syncSkinDataset('dashboard')
    }
  }, [user])

  const syncSkinDataset = (mode) => {
    try {
      const activeSkinId = localStorage.getItem('aezakmi.skin') || 'nexus'
      if (mode === 'esports') {
        document.documentElement.setAttribute('data-theme-persona', 'esports')
        document.documentElement.dataset.skin = activeSkinId
      } else {
        document.documentElement.setAttribute('data-theme-persona', 'dashboard')
        document.documentElement.dataset.skin = 'default'
      }
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
  }

  const toggleThemeMode = () => {
    setThemeMode(themeMode === 'esports' ? 'dashboard' : 'esports')
  }

  // Keep data-theme-persona and data-skin synchronized on document root
  useEffect(() => {
    syncSkinDataset(themeMode)
  }, [themeMode])

  // Synchronize when skin changes while in esports mode
  useEffect(() => {
    const handleSkinChange = (e) => {
      if (themeMode === 'esports') {
        const nextSkin = e.detail?.skin || 'nexus'
        document.documentElement.dataset.skin = nextSkin
      }
    }
    window.addEventListener('aezakmi:skin-changed', handleSkinChange)
    return () => window.removeEventListener('aezakmi:skin-changed', handleSkinChange)
  }, [themeMode])

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

