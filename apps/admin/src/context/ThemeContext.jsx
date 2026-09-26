import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'

const ThemeContext = createContext(null)

function initialTheme() {
  try {
    const saved = localStorage.getItem('aezakmi.theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function applyThemeWithoutTransition(updateFn) {
  if (typeof document === 'undefined') {
    updateFn?.()
    return
  }
  const doc = document.documentElement
  doc.classList.add('no-theme-transitions')
  try {
    updateFn?.()
  } finally {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        doc.classList.remove('no-theme-transitions')
      })
    })
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(initialTheme)

  const setTheme = useCallback((target) => {
    const valid = target === 'dark' ? 'dark' : 'light'
    setThemeState(valid)
    try {
      localStorage.setItem('aezakmi.theme', valid)
    } catch {}

    applyThemeWithoutTransition(() => {
      document.documentElement.dataset.theme = valid
      document.documentElement.classList.toggle('dark', valid === 'dark')
      document.documentElement.classList.toggle('light', valid === 'light')
      document.documentElement.style.colorScheme = valid
    })

    window.dispatchEvent(new CustomEvent('aezakmi:theme-changed', { detail: { theme: valid } }))
  }, [])

  useEffect(() => {
    applyThemeWithoutTransition(() => {
      document.documentElement.dataset.theme = theme
      document.documentElement.classList.toggle('dark', theme === 'dark')
      document.documentElement.classList.toggle('light', theme === 'light')
      document.documentElement.style.colorScheme = theme
    })
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  }), [theme, setTheme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    return {
      theme: 'light',
      isDark: false,
      setTheme: () => {},
      toggleTheme: () => {},
    }
  }
  return context
}
