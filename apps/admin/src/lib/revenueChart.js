function toDayKey(date) {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDay(day) {
  const parsed = new Date(`${day}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function defaultEndDay() {
  const now = new Date()
  return toDayKey(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())))
}

export function normalizeSevenDayRevenue(data = [], endDay = defaultEndDay()) {
  const revenueByDay = new Map(
    data.map((item) => [String(item?.day || ''), Math.max(0, Number(item?.revenue || 0))]),
  )
  const end = parseDay(endDay) || parseDay(defaultEndDay())

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(end)
    date.setUTCDate(end.getUTCDate() - (6 - index))
    const day = toDayKey(date)
    return { day, revenue: revenueByDay.get(day) || 0 }
  })
}

function niceStep(value) {
  if (!(value > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const fraction = value / power
  const niceFraction = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return niceFraction * power
}

export function buildRevenueScale(values = []) {
  const highest = Math.max(0, ...values.map((value) => Math.max(0, Number(value || 0))))
  if (highest === 0) return { max: 1, ticks: [0] }

  const step = niceStep(highest / 3)
  const max = Math.ceil(highest / step) * step
  const ticks = []
  for (let value = max; value > 0; value -= step) ticks.push(value)
  ticks.push(0)
  return { max, ticks }
}

export function formatRevenueDay(day) {
  const date = parseDay(day)
  if (!date) return String(day || '')
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}
