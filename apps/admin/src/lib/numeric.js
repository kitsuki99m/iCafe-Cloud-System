export function numericDraft(value) {
  if (value === null || value === undefined) return ''
  return String(value)
}

export function finiteNumber(value) {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function positiveNumber(value) {
  const number = finiteNumber(value)
  return number !== null && number > 0 ? number : null
}

export function nonNegativeNumber(value) {
  const number = finiteNumber(value)
  return number !== null && number >= 0 ? number : null
}

export function adminDecimalPlaces(settings = {}) {
  return settings?.numberFormat === 'whole' ? 0 : Math.max(1, Math.min(3, Number(settings?.decimalPlaces) || 3))
}

export function formatAdminNumber(value, settings = {}) {
  const number = Number(value)
  const digits = adminDecimalPlaces(settings)
  return (Number.isFinite(number) ? number : 0).toLocaleString('en-PH', {
    minimumFractionDigits:digits,
    maximumFractionDigits:digits,
  })
}

export function formatAdminPeso(value, settings = {}) {
  return `₱${formatAdminNumber(value, settings)}`
}
