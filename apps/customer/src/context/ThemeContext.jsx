import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'

const ThemeContext = createContext(null)

function initialTheme() {
  const saved = localStorage.getItem('aezakmi.theme')
  return saved === 'dark' || saved === 'light' ? saved : 'dark'
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
    const valid = typeof target === 'function' ? target(theme) : target
    const nextTheme = valid === 'dark' ? 'dark' : 'light'
    setThemeState(nextTheme)
    try {
      localStorage.setItem('aezakmi.theme', nextTheme)
    } catch {}
    applyThemeWithoutTransition(() => {
      document.documentElement.dataset.theme = nextTheme
      document.documentElement.style.colorScheme = nextTheme
    })
  }, [theme])

  useEffect(() => {
    applyThemeWithoutTransition(() => {
      document.documentElement.dataset.theme = theme
      document.documentElement.style.colorScheme = theme
    })
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((current) => current === 'dark' ? 'light' : 'dark')
  }, [setTheme])

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme,
  }), [theme, setTheme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  return useContext(ThemeContext)
}
