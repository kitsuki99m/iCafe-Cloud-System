export function formatDuration(value) {
  const total = Math.max(0, Math.round(Number(value) || 0))
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  if (hours <= 0) return `${minutes} min`
  const hourLabel = `${hours} ${hours === 1 ? 'hr' : 'hrs'}`
  return minutes ? `${hourLabel} ${minutes} min` : hourLabel
}

export function splitMinutes(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0))
  return {
    hours: Math.floor(total / 60),
    minutes: total % 60,
  }
}

export function combineDurationParts(hoursValue, minutesValue) {
  const hours = Math.max(0, Math.floor(Number(hoursValue) || 0))
  const minutes = Math.max(0, Math.min(59, Math.floor(Number(minutesValue) || 0)))
  return hours * 60 + minutes
}
