const listeners = new Set()

export function subscribeToast(handler) {
  listeners.add(handler)
  return () => listeners.delete(handler)
}

export function showToast({ title, message, tone = 'success', duration = 5000 } = {}) {
  const toast = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: title || 'Done',
    message: message || '',
    tone,
    duration,
  }
  listeners.forEach((handler) => handler(toast))
  return toast.id
}
