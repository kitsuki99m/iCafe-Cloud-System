import { getApiBase } from './serverConfig.js'

export function resolveAssetUrl(url, defaultFolder = 'assets/menu') {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  // 1. Data URLs (Base64 uploads)
  if (trimmed.startsWith('data:image/')) return trimmed

  // 2. Absolute Web URLs (http/https/blob)
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('blob:')) return trimmed

  const isFileProtocol = typeof window !== 'undefined' && window.location.protocol === 'file:'

  // 3. Bundled public assets (/assets/... or assets/...)
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('assets/')) {
    const clean = trimmed.replace(/^\/+/, '')
    if (isFileProtocol) return `./${clean}`
    return `/${clean}`
  }

  // 4. Server uploads or relative API paths (/uploads/..., /api/public/...)
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/') || trimmed.startsWith('/api/') || trimmed.startsWith('api/')) {
    try {
      const apiBase = getApiBase()
      const origin = new URL(apiBase, window.location.href).origin
      const cleanPath = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
      return `${origin}${cleanPath}`
    } catch {
      return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
    }
  }

  // 5. Bare filename matching known presets (e.g. "piattos-sour-cream.webp" or "dota2.webp")
  if (/\.(webp|png|jpe?g|svg|gif|avif)$/i.test(trimmed) && !trimmed.includes('/')) {
    const folder = defaultFolder.replace(/^\/+|\/+$/g, '')
    if (isFileProtocol) return `./${folder}/${trimmed}`
    return `/${folder}/${trimmed}`
  }

  return trimmed
}

export function resolveMenuImageUrl(url) {
  return resolveAssetUrl(url, 'assets/menu')
}

export function resolveAppIconUrl(url) {
  return resolveAssetUrl(url, 'assets/launcher')
}

