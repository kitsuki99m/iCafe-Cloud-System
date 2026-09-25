import { getApiBase } from './serverConfig.js'

/**
 * Resolves any menu image URL, whether it is a base64 data URI, an absolute URL,
 * a local assets bundle path, a relative uploaded file, or a preset filename.
 */
export function resolveMenuImageUrl(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  // 1. Data URLs (Base64 uploads)
  if (trimmed.startsWith('data:image/')) return trimmed

  // 2. Absolute Web URLs (http/https/blob)
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('blob:')) return trimmed

  // 3. Local bundled public assets (/assets/menu/... or assets/menu/...)
  if (trimmed.startsWith('/assets/') || trimmed.startsWith('assets/')) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
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

  // 5. Bare filename matching known menu presets (e.g. "piattos-sour-cream.webp")
  if (/\.(webp|png|jpe?g|svg|gif|avif)$/i.test(trimmed) && !trimmed.includes('/')) {
    return `/assets/menu/${trimmed}`
  }

  return trimmed
}
