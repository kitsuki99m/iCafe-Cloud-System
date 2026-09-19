import { createContext, useContext, useMemo, useState } from 'react'
import { apiPatch } from '../lib/api.js'

export const SKINS = [
  {
    id: 'nexus',
    name: 'Nexus House',
    note: 'The signature Aezakmi console look — deep slate ink, responsive to light and dark theme, glowing ring indicators.',
    mark: 'N',
    chips: ['#7B61FF', '#2ED3A0', '#FFB020', '#4CC2FF'],
    brand: '#7B61FF',
    font: 'Archivo',
  },
  {
    id: 'victus',
    name: 'Victus',
    note: 'HP performance blue over navy mica, brushed diagonal weave, clipped corner geometry on every tile.',
    mark: 'V',
    chips: ['#0096D6', '#3FD6B0', '#FFC34D', '#59C2FF'],
    brand: '#0096D6',
    font: 'Saira',
  },
  {
    id: 'alien',
    name: 'Alienware',
    note: 'Space black & honeycomb mesh with AlienFX ambient glow morphing smoothly through the spectrum.',
    mark: '◉',
    chips: ['#00CFE5', '#3BE8C0', '#7C8CFF', '#FFB648'],
    brand: '#00CFE5',
    font: 'Rajdhani',
  },
  {
    id: 'rog',
    name: 'ROG Strix',
    note: 'Republic of Gamers red on black, hazard slashes, floor sweep scanlines, and anniversary gold accents.',
    mark: '//',
    chips: ['#DE272C', '#D4A33A', '#A71C1E', '#F3F3F3'],
    brand: '#DE272C',
    font: 'Chakra Petch',
  },
  {
    id: 'razer',
    name: 'Razer Chroma',
    note: 'Deep true black and snake green with a live RGB Chroma spectrum flowing across the top border.',
    mark: '≡',
    chips: ['#44D62C', '#00E0FF', '#FFAA00', '#FFFFFF'],
    brand: '#44D62C',
    font: 'Archivo',
  },
  {
    id: 'predator',
    name: 'Predator',
    note: 'Steel blue & ember highlights with an aqua laser beam crossing the floor and angular chiseled tiles.',
    mark: '▲',
    chips: ['#0BC5C0', '#FF7A18', '#22D3A8', '#4FD8F0'],
    brand: '#0BC5C0',
    font: 'Saira',
  },
]

const SkinContext = createContext(null)
const SKIN_STORAGE_KEY = 'aezakmi.skin'

export function SkinProvider({ children }) {
  const [skinId, setSkinIdState] = useState(() => {
    try {
      return localStorage.getItem(SKIN_STORAGE_KEY) || sessionStorage.getItem(SKIN_STORAGE_KEY) || 'nexus'
    } catch {
      return 'nexus'
    }
  })
  const [isGalleryOpen, setIsGalleryOpen] = useState(false)

  const activeSkin = useMemo(() => {
    return SKINS.find((s) => s.id === skinId) || SKINS[0]
  }, [skinId])

  // Ensure document root dataset.skin is always synchronized with active skin state
  useEffect(() => {
    document.documentElement.dataset.skin = skinId
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, skinId)
      sessionStorage.setItem(SKIN_STORAGE_KEY, skinId)
    } catch {}
  }, [skinId])

  const setSkin = (targetId) => {
    const valid = SKINS.some((s) => s.id === targetId) ? targetId : 'nexus'
    setSkinIdState(valid)
    try {
      localStorage.setItem(SKIN_STORAGE_KEY, valid)
      sessionStorage.setItem(SKIN_STORAGE_KEY, valid)
    } catch {}

    document.documentElement.dataset.skin = valid

    // Trigger booting effect
    document.body.classList.add('booting')
    setTimeout(() => {
      document.body.classList.remove('booting')
    }, 420)

    window.dispatchEvent(new CustomEvent('aezakmi:skin-changed', { detail: { skin: valid } }))
    try {
      const persona = document.documentElement.getAttribute('data-theme-persona') || 'dashboard'
      apiPatch('/settings', { themePersona: persona, skinId: valid }).catch(() => {})
    } catch {}
  }

  const value = useMemo(() => ({
    skinId,
    activeSkin,
    skins: SKINS,
    setSkin,
    isGalleryOpen,
    openGallery: () => setIsGalleryOpen(true),
    closeGallery: () => setIsGalleryOpen(false),
  }), [skinId, activeSkin, isGalleryOpen])

  return <SkinContext.Provider value={value}>{children}</SkinContext.Provider>
}

export function useSkin() {
  const context = useContext(SkinContext)
  if (!context) {
    return {
      skinId: 'nexus',
      activeSkin: SKINS[0],
      skins: SKINS,
      setSkin: () => {},
      isGalleryOpen: false,
      openGallery: () => {},
      closeGallery: () => {},
    }
  }
  return context
}
