export const SUBSCRIPTION_PACKAGES = [
  { id: 'bronze', label: 'Bronze', maxStations: 50 },
  { id: 'silver', label: 'Silver', maxStations: 100 },
  { id: 'gold', label: 'Gold', maxStations: 200 },
  { id: 'platinum', label: 'Platinum', maxStations: 350 },
  { id: 'diamond', label: 'Diamond', maxStations: 500 },
  { id: 'ultra', label: 'Ultra', maxStations: null },
]

export function packageForStations(value) {
  const stations = Math.max(1, Number(value) || 1)
  return SUBSCRIPTION_PACKAGES.find((item) => item.maxStations !== null && stations <= item.maxStations) || SUBSCRIPTION_PACKAGES.at(-1)
}

export function packageDefinition(id) {
  return SUBSCRIPTION_PACKAGES.find((item) => item.id === String(id || '').toLowerCase()) || SUBSCRIPTION_PACKAGES[0]
}

export function packageStationLimit(id, ultraLimit) {
  const item = packageDefinition(id)
  return item.maxStations ?? Math.max(1, Math.floor(Number(ultraLimit) || 1))
}
