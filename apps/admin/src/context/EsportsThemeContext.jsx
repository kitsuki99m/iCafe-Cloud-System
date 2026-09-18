import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'

const EsportsThemeContext = createContext(null)

const THEME_STORAGE_KEY = 'aezakmi.esports_theme_mode'

export function EsportsThemeProvider({ children }) {
  const { user } = useAuth()
  const isStaff = user?.role === 'cashier' || user?.role === 'staff' || user?.cloudRole === 'cashier' || user?.cloudRole === 'staff'

  const [themeMode, setThemeModeState] = useState(() => {
    try {
      const saved = sessionStorage.getItem(THEME_STORAGE_KEY) || localStorage.getItem(THEME_STORAGE_KEY)
      if (saved === 'esports' || saved === 'dashboard') return saved
      return isStaff ? 'esports' : 'dashboard'
    } catch {
      return isStaff ? 'esports' : 'dashboard'
    }
  })

  // Whenever staff logs in, if no explicit user override is stored in sessionStorage, default to esports mode
  useEffect(() => {
    if (isStaff && !sessionStorage.getItem(THEME_STORAGE_KEY)) {
      setThemeModeState('esports')
      document.documentElement.setAttribute('data-theme-persona', 'esports')
    }
  }, [isStaff])

  const setThemeMode = (mode) => {
    const target = mode === 'esports' ? 'esports' : 'dashboard'
    setThemeModeState(target)
    try {
      sessionStorage.setItem(THEME_STORAGE_KEY, target)
      localStorage.setItem(THEME_STORAGE_KEY, target)
    } catch {}
    document.documentElement.setAttribute('data-theme-persona', target)
    window.dispatchEvent(new CustomEvent('aezakmi:persona-changed', { detail: { mode: target } }))
  }

  const toggleThemeMode = () => {
    setThemeMode(themeMode === 'esports' ? 'dashboard' : 'esports')
  }

  // Keep data-theme-persona synchronized on document root
  useEffect(() => {
    document.documentElement.setAttribute('data-theme-persona', themeMode)
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

