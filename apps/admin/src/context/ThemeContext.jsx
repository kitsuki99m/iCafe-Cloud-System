import { createContext, useContext, useEffect, useMemo, useState } from 'react'

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

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(initialTheme)

  const setTheme = (target) => {
    const valid = target === 'dark' ? 'dark' : 'light'
    setThemeState(valid)
    try {
      localStorage.setItem('aezakmi.theme', valid)
    } catch {}
    document.documentElement.dataset.theme = valid
    document.documentElement.classList.toggle('dark', valid === 'dark')
    document.documentElement.classList.toggle('light', valid === 'light')
    document.documentElement.style.colorScheme = valid
    window.dispatchEvent(new CustomEvent('aezakmi:theme-changed', { detail: { theme: valid } }))
  }

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.style.colorScheme = theme
    try {
      localStorage.setItem('aezakmi.theme', theme)
    } catch {}
    window.dispatchEvent(new CustomEvent('aezakmi:theme-changed', { detail: { theme } }))
  }, [theme])

  const value = useMemo(() => ({
    theme,
    isDark: theme === 'dark',
    setTheme,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
  }), [theme])

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
