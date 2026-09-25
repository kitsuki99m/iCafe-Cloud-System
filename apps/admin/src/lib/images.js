import { getApiBase } from './serverConfig.js'

export function resolveMenuImageUrl(url) {
  if (!url || typeof url !== 'string') return null
  const trimmed = url.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('data:image/')) return trimmed
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith('blob:')) return trimmed

  if (trimmed.startsWith('/assets/') || trimmed.startsWith('assets/')) {
    return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  }

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

  if (/\.(webp|png|jpe?g|svg|gif|avif)$/i.test(trimmed) && !trimmed.includes('/')) {
    return `/assets/menu/${trimmed}`
  }

  return trimmed
}
