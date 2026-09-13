const STORAGE_KEY = 'aezakmi.admin.sound.v1'

export const DEFAULT_SOUND_PREFERENCES = Object.freeze({
  enabled: true,
  volume: 0.65,
  payments: true,
  help: true,
  sessions: true,
  stations: true,
})

let audioContext = null
let unlockInstalled = false
let unlocked = false
const recent = new Map()

function clampVolume(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return DEFAULT_SOUND_PREFERENCES.volume
  return Math.max(0, Math.min(1, number))
}

export function getAdminSoundPreferences() {
  if (typeof window === 'undefined') return { ...DEFAULT_SOUND_PREFERENCES }
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}')
    return {
      ...DEFAULT_SOUND_PREFERENCES,
      ...parsed,
      volume: clampVolume(parsed.volume ?? DEFAULT_SOUND_PREFERENCES.volume),
    }
  } catch {
    return { ...DEFAULT_SOUND_PREFERENCES }
  }
}

export function saveAdminSoundPreferences(next) {
  const normalized = {
    ...DEFAULT_SOUND_PREFERENCES,
    ...next,
    volume: clampVolume(next?.volume ?? DEFAULT_SOUND_PREFERENCES.volume),
  }
  if (typeof window !== 'undefined') {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized)) } catch {}
    window.dispatchEvent(new CustomEvent('aezakmi:sound-settings-changed', { detail: normalized }))
  }
  return normalized
}

function ensureContext() {
  if (typeof window === 'undefined') return null
  const Ctx = window.AudioContext || window.webkitAudioContext
  if (!Ctx) return null
  if (!audioContext || audioContext.state === 'closed') audioContext = new Ctx()
  return audioContext
}

export function unlockAdminSound() {
  try {
    const ctx = ensureContext()
    if (!ctx) return false
    unlocked = true
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
    return true
  } catch {
    return false
  }
}

export function initAdminSound() {
  if (typeof window === 'undefined' || unlockInstalled) return
  unlockInstalled = true
  // Login itself is normally the first user gesture. If the browser records
  // that activation across the SPA route change, unlock immediately; the
  // listeners below remain as a fallback for stricter autoplay policies.
  if (window.navigator?.userActivation?.hasBeenActive) unlockAdminSound()
  const unlock = () => unlockAdminSound()
  window.addEventListener('pointerdown', unlock, { once: true, capture: true })
  window.addEventListener('keydown', unlock, { once: true, capture: true })
  window.addEventListener('touchstart', unlock, { once: true, capture: true, passive: true })
}

function categoryFor(type) {
  if (type === 'payment') return 'payments'
  if (type === 'help') return 'help'
  if (type === 'station-warning' || type === 'warning') return 'stations'
  return 'sessions'
}

function toneFor(type) {
  switch (type) {
    case 'payment':
      return [
        { at: 0, frequency: 880, duration: 0.22, wave: 'sine', level: 0.16 },
        { at: 0.24, frequency: 1046.5, duration: 0.28, wave: 'sine', level: 0.14 },
      ]
    case 'help':
      return [
        { at: 0, frequency: 660, duration: 0.22, wave: 'triangle', level: 0.18 },
        { at: 0.26, frequency: 784, duration: 0.25, wave: 'triangle', level: 0.18 },
        { at: 0.54, frequency: 988, duration: 0.3, wave: 'triangle', level: 0.16 },
      ]
    case 'station-warning':
    case 'warning':
      return [
        { at: 0, frequency: 440, duration: 0.18, wave: 'square', level: 0.12 },
        { at: 0.22, frequency: 330, duration: 0.22, wave: 'square', level: 0.12 },
      ]
    case 'broadcast':
      return [
        { at: 0, frequency: 740, duration: 0.18, wave: 'sine', level: 0.1 },
        { at: 0.2, frequency: 988, duration: 0.2, wave: 'sine', level: 0.1 },
        { at: 0.42, frequency: 1175, duration: 0.24, wave: 'sine', level: 0.09 },
      ]
    case 'success':
      return [
        { at: 0, frequency: 659, duration: 0.16, wave: 'sine', level: 0.11 },
        { at: 0.16, frequency: 880, duration: 0.22, wave: 'sine', level: 0.11 },
      ]
    case 'low-time':
      return [
        { at: 0, frequency: 659, duration: 0.16, wave: 'square', level: 0.12 },
        { at: 0.22, frequency: 659, duration: 0.16, wave: 'square', level: 0.12 },
      ]
    default:
      return [{ at: 0, frequency: 784, duration: 0.2, wave: 'sine', level: 0.1 }]
  }
}

function shouldPlay(type, preferences, force) {
  if (force) return true
  if (!preferences.enabled) return false
  const category = categoryFor(type)
  return preferences[category] !== false
}

export function playAdminSound(type = 'success', { dedupeKey = '', dedupeMs = 4000, force = false, preferencesOverride = null } = {}) {
  try {
    initAdminSound()
    const preferences = preferencesOverride ? { ...DEFAULT_SOUND_PREFERENCES, ...preferencesOverride, volume:clampVolume(preferencesOverride.volume) } : getAdminSoundPreferences()
    if (!shouldPlay(type, preferences, force) || preferences.volume <= 0) return false

    const key = dedupeKey ? `${type}:${dedupeKey}` : ''
    const now = Date.now()
    if (key) {
      const last = recent.get(key) || 0
      if (now - last < dedupeMs) return false
      recent.set(key, now)
      if (recent.size > 200) {
        for (const [entry, timestamp] of recent) if (now - timestamp > 60000) recent.delete(entry)
      }
    }

    const ctx = ensureContext()
    if (!ctx || !unlocked) return false
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    const base = ctx.currentTime + 0.01
    toneFor(type).forEach((note) => {
      const start = base + note.at
      const end = start + note.duration
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = note.wave || 'sine'
      oscillator.frequency.setValueAtTime(note.frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, note.level * preferences.volume), start + Math.min(0.025, note.duration / 3))
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(end + 0.03)
    })
    return true
  } catch {
    return false
  }
}

export function testAdminSound(type = 'help', preferencesOverride = null) {
  unlockAdminSound()
  return playAdminSound(type, { force: true, dedupeKey: `test:${Date.now()}`, dedupeMs: 0, preferencesOverride })
}

export function playLowTimeAlert(dedupeKey = '') {
  return playAdminSound('low-time', { dedupeKey: dedupeKey || 'low-time', dedupeMs: 30000 })
}
