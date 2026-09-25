import { useState, useMemo } from 'react'
import { UtensilsCrossed, Coffee, Package, Soup, Flame } from 'lucide-react'
import { resolveMenuImageUrl } from '../../lib/images.js'

function getCategoryIcon(category = '') {
  const cat = String(category).toLowerCase()
  if (cat.includes('drink') || cat.includes('beverage') || cat.includes('coffee') || cat.includes('tea')) {
    return Coffee
  }
  if (cat.includes('noodle') || cat.includes('soup') || cat.includes('ramen')) {
    return Soup
  }
  if (cat.includes('spicy') || cat.includes('hot') || cat.includes('meal')) {
    return Flame
  }
  if (cat.includes('snack') || cat.includes('chips') || cat.includes('biscuit')) {
    return Package
  }
  return UtensilsCrossed
}

export default function MenuThumbnail({
  item,
  className = "w-full h-full object-contain",
  containerClassName = "relative w-full h-full flex items-center justify-center bg-surface-raised/40",
  fallbackIconSize = 24
}) {
  const [hasError, setHasError] = useState(false)
  const rawUrl = item?.image_url || item?.imageUrl || item?.image
  const resolvedUrl = useMemo(() => resolveMenuImageUrl(rawUrl), [rawUrl])
  const FallbackIcon = useMemo(() => getCategoryIcon(item?.category), [item?.category])

  if (!resolvedUrl || hasError) {
    return (
      <div className={`${containerClassName} overflow-hidden rounded-lg bg-surface-raised/60 border border-surface-line/40 select-none group-hover:bg-surface-raised/80 transition-colors`}>
        <div className="flex flex-col items-center justify-center gap-1 text-slate-soft/50 group-hover:text-gold/70 transition-colors">
          <FallbackIcon size={fallbackIconSize} className="transition-transform duration-200 group-hover:scale-110" />
        </div>
      </div>
    )
  }

  return (
    <div className={`${containerClassName} overflow-hidden rounded-lg bg-surface-raised/30 border border-surface-line/30`}>
      <img
        src={resolvedUrl}
        alt={item?.name || 'Menu item'}
        loading="lazy"
        className={`${className} transition-transform duration-200 group-hover:scale-105`}
        onError={() => setHasError(true)}
      />
    </div>
  )
}
