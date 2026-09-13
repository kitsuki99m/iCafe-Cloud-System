let deferredInstallPrompt = null
const listeners = new Set()

function inBrowser() {
  return typeof window !== 'undefined' && typeof navigator !== 'undefined'
}

export function isAdminPwaRuntime() {
  if (!inBrowser()) return false
  if (window.aezakmiAdmin) return false
  return window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

export function isAdminPwaInstalled() {
  if (!inBrowser()) return false
  return window.matchMedia?.('(display-mode: standalone)').matches === true || window.navigator.standalone === true
}

export function isIosDevice() {
  if (!inBrowser()) return false
  const ua = window.navigator.userAgent || ''
  return /iPad|iPhone|iPod/i.test(ua) || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
}

function snapshot() {
  return {
    eligible: isAdminPwaRuntime(),
    installed: isAdminPwaInstalled(),
    canPrompt: Boolean(deferredInstallPrompt),
    ios: isIosDevice(),
  }
}

function emit() {
  const state = snapshot()
  listeners.forEach((listener) => listener(state))
}

if (inBrowser()) {
  window.addEventListener('beforeinstallprompt', (event) => {
    if (!isAdminPwaRuntime()) return
    event.preventDefault()
    deferredInstallPrompt = event
    emit()
  })

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null
    emit()
  })
}

export function getAdminPwaInstallState() {
  return snapshot()
}

export function subscribeAdminPwaInstall(listener) {
  listeners.add(listener)
  listener(snapshot())
  return () => listeners.delete(listener)
}

export async function promptAdminPwaInstall() {
  if (!deferredInstallPrompt) return { outcome: 'unavailable' }
  const prompt = deferredInstallPrompt
  deferredInstallPrompt = null
  await prompt.prompt()
  const choice = await prompt.userChoice
  emit()
  return choice || { outcome: 'dismissed' }
}

export function registerAdminPwa() {
  if (!isAdminPwaRuntime() || !('serviceWorker' in navigator)) return

  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
      registration.update().catch(() => {})
    } catch (error) {
      console.warn('Admin PWA service worker registration failed:', error?.message || error)
    }
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
