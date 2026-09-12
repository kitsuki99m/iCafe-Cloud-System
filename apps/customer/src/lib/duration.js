export function formatDuration(value) {
  const total = Math.max(0, Math.round(Number(value) || 0))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours <= 0) return `${minutes} min`
  const hourLabel = `${hours} ${hours === 1 ? 'hr' : 'hrs'}`
  return minutes ? `${hourLabel} ${minutes} min` : hourLabel
}
