import { useEffect, useRef, useState } from 'react'
import { apiGet, apiUrl } from '../lib/api.js'
import { isCloudAdmin } from '../lib/cloudClient.js'

const fallback = { cafeName: 'iCafe Management System', branch: '', branchLocation: '', logoUrl: null }
let cached = null

function normalizeBranding(value) {
  const raw = { ...fallback, ...(value && typeof value === 'object' ? value : {}) }
  return {
    ...raw,
    logoUrl: isCloudAdmin()
      ? null
      : (raw.logoUrl ? apiUrl(String(raw.logoUrl).replace(/^\/api/, '')) : null),
  }
}

function cachedBranding() {
  try {
    return normalizeBranding(JSON.parse(localStorage.getItem('aezakmi.branding') || '{}'))
  } catch {
    return fallback
  }
}

async function loadBranding() {
  // Preserve the local Edge contract explicitly. Cloud Admin reaches the same
  // settings through the authenticated Supabase -> Edge admin bridge.
  const response = isCloudAdmin()
    ? await apiGet('/settings')
    : await apiGet('/public/settings')
  const raw = { ...fallback, ...(response?.settings || {}) }
  return { raw, next: normalizeBranding(raw) }
}

export function useBranding() {
  const [branding, setBranding] = useState(cached || cachedBranding())
  const requestSequenceRef = useRef(0)

  useEffect(() => {
    let active = true

    const refresh = (event) => {
      const requestId = ++requestSequenceRef.current
      const immediateLogoUrl = event?.detail?.logoUrl

      if (immediateLogoUrl && active && !isCloudAdmin()) {
        setBranding((current) => {
          const next = normalizeBranding({ ...current, logoUrl: immediateLogoUrl })
          cached = next
          return next
        })
      }

      loadBranding()
        .then(({ raw, next }) => {
          if (!active || requestId !== requestSequenceRef.current) return
          localStorage.setItem('aezakmi.branding', JSON.stringify({
            cafeName: raw.cafeName,
            branch: raw.branch,
            branchLocation: raw.branchLocation,
            logoUrl: isCloudAdmin() ? null : (raw.logoUrl || null),
          }))
          cached = next
          setBranding(next)
        })
        .catch(() => {})
    }

    refresh()
    window.addEventListener('aezakmi:branding-updated', refresh)
    return () => {
      active = false
      requestSequenceRef.current += 1
      window.removeEventListener('aezakmi:branding-updated', refresh)
    }
  }, [])

  useEffect(() => {
    const cafeName = String(branding?.cafeName || '').trim()
    document.title = `${cafeName || 'iCafe Management System'} - Admin`
  }, [branding?.cafeName])

  return branding
}
