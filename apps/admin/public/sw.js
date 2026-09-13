const CACHE_PREFIX = 'aezakmi-admin-pwa'
const CACHE_VERSION = '2026-09-13-1'
const SHELL_CACHE = `${CACHE_PREFIX}-shell-${CACHE_VERSION}`
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${CACHE_VERSION}`
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/pwa-192.png',
  '/pwa-512.png',
  '/pwa-maskable-512.png',
  '/apple-touch-icon.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  )
})

function isApiRequest(url) {
  return url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')
}

async function networkFirst(request, fallbackUrl = null) {
  try {
    const response = await fetch(request)
    if (response && response.ok) {
      const cache = await caches.open(RUNTIME_CACHE)
      cache.put(request, response.clone())
    }
    return response
  } catch (error) {
    const cached = await caches.match(request)
    if (cached) return cached
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl)
      if (fallback) return fallback
    }
    throw error
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response && response.ok) {
    const cache = await caches.open(RUNTIME_CACHE)
    cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin || isApiRequest(url)) return

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, '/index.html'))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (['style', 'script', 'image', 'font'].includes(request.destination)) {
    event.respondWith(cacheFirst(request))
  }
})

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
