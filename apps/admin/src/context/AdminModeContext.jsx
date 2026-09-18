import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'

const AdminModeContext = createContext(null)

const UI_MODE_STORAGE_KEY = 'aezakmi.ui_mode'

export function AdminModeProvider({ children }) {
  const { user } = useAuth()
  const isRestrictedRole = user?.role === 'cashier' || user?.role === 'staff'
  
  const [savedMode, setSavedMode] = useState(() => {
    try {
      const stored = sessionStorage.getItem(UI_MODE_STORAGE_KEY)
      return stored === 'simple' || stored === 'advance' ? stored : 'simple'
    } catch {
      return 'simple'
    }
  })

  // When user logs out (user is null or changes), reset to simple mode and clean temp storage
  useEffect(() => {
    if (!user) {
      setSavedMode('simple')
      try {
        sessionStorage.removeItem(UI_MODE_STORAGE_KEY)
        localStorage.removeItem(UI_MODE_STORAGE_KEY)
      } catch {}
    }
  }, [user])

  // Staff and Cashier roles are strictly locked to Simple Mode
  const uiMode = isRestrictedRole ? 'simple' : savedMode
  const canToggleMode = !isRestrictedRole

  const setUiMode = (mode) => {
    if (isRestrictedRole) return
    const targetMode = mode === 'simple' ? 'simple' : 'advance'
    setSavedMode(targetMode)
    try {
      sessionStorage.setItem(UI_MODE_STORAGE_KEY, targetMode)
      localStorage.removeItem(UI_MODE_STORAGE_KEY)
    } catch {}
  }

  const toggleUiMode = () => {
    if (isRestrictedRole) return
    setUiMode(uiMode === 'simple' ? 'advance' : 'simple')
  }

  // Keyboard shortcut: F8 to toggle mode for authorized admins
  useEffect(() => {
    if (!canToggleMode) return undefined
    const handleKeyDown = (e) => {
      if (e.key === 'F8') {
        e.preventDefault()
        toggleUiMode()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [canToggleMode, uiMode])

  const value = useMemo(() => ({
    uiMode,
    isSimpleMode: uiMode === 'simple',
    isAdvanceMode: uiMode === 'advance',
    canToggleMode,
    setUiMode,
    toggleUiMode,
  }), [uiMode, canToggleMode])

  return (
    <AdminModeContext.Provider value={value}>
      {children}
    </AdminModeContext.Provider>
  )
}

export function useAdminMode() {
  const context = useContext(AdminModeContext)
  if (!context) {
    return {
      uiMode: 'simple',
      isSimpleMode: true,
      isAdvanceMode: false,
      canToggleMode: false,
      setUiMode: () => {},
      toggleUiMode: () => {},
    }
  }
  return context
}
