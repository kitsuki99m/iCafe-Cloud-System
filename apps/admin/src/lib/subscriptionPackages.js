export const SUBSCRIPTION_PACKAGES = [
  { id: 'bronze', label: 'Bronze', maxStations: 10, monthlyPrice: 499, priceSuffix: '/month', description: 'Up to 10 PCs' },
  { id: 'silver', label: 'Silver', maxStations: 25, monthlyPrice: 799, priceSuffix: '/month', description: 'Up to 25 PCs' },
  { id: 'gold', label: 'Gold', maxStations: 50, monthlyPrice: 1299, priceSuffix: '/month', description: 'Up to 50 PCs' },
  { id: 'ultra', label: 'Ultra', maxStations: null, monthlyPrice: 1999, priceSuffix: '+ / month', description: '50+ PCs or multiple branches' },
]

export function normalizeSubscriptionPackages(rows) {
  if (!Array.isArray(rows) || !rows.length) return SUBSCRIPTION_PACKAGES
  const normalized = rows
    .filter((item) => item && (item.isActive ?? item.is_active) !== false)
    .map((item) => {
      // This normalizer is intentionally idempotent. Cloud REST responses use
      // snake_case while page snapshots store the already-normalized camelCase
      // shape. Accept both so cached Developer data cannot turn every package
      // into a null cap / PHP 0 package when it is normalized a second time.
      const maxStationsRaw = item.maxStations !== undefined ? item.maxStations : item.max_stations
      const monthlyPriceRaw = item.monthlyPrice !== undefined ? item.monthlyPrice : item.monthly_price
      const priceSuffixRaw = item.priceSuffix !== undefined ? item.priceSuffix : item.price_suffix
      const displayOrderRaw = item.displayOrder !== undefined ? item.displayOrder : item.display_order
      return {
        id: String(item.id || '').toLowerCase(),
        label: String(item.label || item.id || ''),
        maxStations: maxStationsRaw == null || maxStationsRaw === '' ? null : Number(maxStationsRaw),
        monthlyPrice: Number(monthlyPriceRaw ?? 0),
        priceSuffix: String(priceSuffixRaw || '/month'),
        description: String(item.description || ''),
        displayOrder: Number(displayOrderRaw || 0),
      }
    })
    .filter((item) => item.id)
    .sort((a, b) => a.displayOrder - b.displayOrder)
  return normalized.length ? normalized : SUBSCRIPTION_PACKAGES
}

export function packageForStations(value, packages = SUBSCRIPTION_PACKAGES) {
  const stations = Math.max(1, Number(value) || 1)
  const list = Array.isArray(packages) && packages.length ? packages : SUBSCRIPTION_PACKAGES
  return list.find((item) => item.maxStations !== null && stations <= Number(item.maxStations)) || list.find((item) => item.id === 'ultra') || list.at(-1)
}

export function packageDefinition(id, packages = SUBSCRIPTION_PACKAGES) {
  const list = Array.isArray(packages) && packages.length ? packages : SUBSCRIPTION_PACKAGES
  return list.find((item) => item.id === String(id || '').toLowerCase()) || list[0]
}

export function packageStationLimit(id, ultraLimit, packages = SUBSCRIPTION_PACKAGES) {
  const item = packageDefinition(id, packages)
  return item.maxStations ?? Math.max(1, Math.floor(Number(ultraLimit) || 1))
}

export function formatPackagePrice(pkg) {
  if (!pkg) return 'Custom'
  const amount = Number(pkg.monthlyPrice || 0)
  const suffix=String(pkg.priceSuffix||'').trim();return `${new Intl.NumberFormat('en-PH', { style:'currency', currency:'PHP', maximumFractionDigits:0 }).format(amount)}${suffix?(suffix.startsWith('+')?suffix:` ${suffix}`):''}`
}
