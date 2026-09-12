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
