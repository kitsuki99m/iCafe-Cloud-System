import { useEffect, useRef, useState } from 'react'
import { apiGet, apiUrl } from '../lib/api.js'

const fallback = { cafeName:'iCafe', branch:'Customer Station', branchLocation:'', logoUrl:null }
let cached = null

function normalizeBranding(value) {
  const raw = { ...fallback, ...(value && typeof value === 'object' ? value : {}) }
  return {
    ...raw,
    logoUrl: raw.logoUrl ? apiUrl(String(raw.logoUrl).replace(/^\/api/, '')) : null,
  }
}

function cachedBranding() {
  try {
    return normalizeBranding(JSON.parse(localStorage.getItem('aezakmi.customer.branding') || '{}'))
  } catch {
    return fallback
  }
}

async function loadBranding() {
  const { settings } = await apiGet('/public/settings')
  const raw = { ...fallback, ...settings }
  return { raw, next:normalizeBranding(raw) }
}

export function useBranding() {
  const [branding, setBranding] = useState(cached || cachedBranding())
  const requestSequenceRef = useRef(0)

  useEffect(() => {
    let active = true
    const refresh = (event) => {
      const requestId = ++requestSequenceRef.current
      const immediateLogoUrl = event?.detail?.logoUrl
      if (immediateLogoUrl && active) {
        setBranding((current) => {
          const next = normalizeBranding({ ...(current || fallback), logoUrl: immediateLogoUrl })
          cached = next
          return next
        })
      }
      loadBranding().then(({ raw, next }) => {
        if (!active || requestId !== requestSequenceRef.current) return
        localStorage.setItem('aezakmi.customer.branding', JSON.stringify({
          cafeName: raw.cafeName,
          branch: raw.branch,
          branchLocation: raw.branchLocation,
          logoUrl: raw.logoUrl || null,
        }))
        cached = next
        setBranding(next)
      }).catch(() => {})
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
    document.title = `${cafeName || 'iCafe'} Customer Station`
  }, [branding?.cafeName])

  return branding
}
