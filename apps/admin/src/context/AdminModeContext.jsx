import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.jsx'

const AdminModeContext = createContext(null)

const UI_MODE_STORAGE_KEY = 'aezakmi.ui_mode'

function initialUiMode() {
  try {
    const saved = localStorage.getItem(UI_MODE_STORAGE_KEY) || sessionStorage.getItem(UI_MODE_STORAGE_KEY)
    if (saved === 'advance' || saved === 'simple') return saved
    return 'simple'
  } catch {
    return 'simple'
  }
}

export function AdminModeProvider({ children }) {
  const { user } = useAuth()
  const isRestrictedRole = user?.role === 'cashier' || user?.role === 'staff'
  
  const [savedMode, setSavedMode] = useState(initialUiMode)

  // Staff and Cashier roles are strictly locked to Simple Mode
  const uiMode = isRestrictedRole ? 'simple' : savedMode
  const canToggleMode = !isRestrictedRole

  const setUiMode = (mode) => {
    if (isRestrictedRole) return
    const targetMode = mode === 'advance' ? 'advance' : 'simple'
    setSavedMode(targetMode)
    try {
      localStorage.setItem(UI_MODE_STORAGE_KEY, targetMode)
      sessionStorage.setItem(UI_MODE_STORAGE_KEY, targetMode)
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
