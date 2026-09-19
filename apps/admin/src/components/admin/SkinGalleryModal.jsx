import { useEffect } from 'react'
import { Check, Sparkles, X } from 'lucide-react'
import { useSkin } from '../../context/SkinContext.jsx'
import { showToast } from '../../lib/toast.js'

export default function SkinGalleryModal() {
  const { skinId, setSkin, skins, isGalleryOpen, closeGallery } = useSkin()

  useEffect(() => {
    if (!isGalleryOpen) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') closeGallery()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isGalleryOpen, closeGallery])

  if (!isGalleryOpen) return null

  const handleSelect = (id) => {
    setSkin(id)
    const selected = skins.find((s) => s.id === id)
    showToast({
      title: 'Console Skin Applied',
      message: `${selected?.name || id} skin is now active on the floor console.`,
      tone: 'success',
    })
  }

  return (
    <div
      className="admin-modal-backdrop fixed inset-0 z-[200] grid place-items-center bg-black/60 p-4 backdrop-blur-sm transition-opacity"
      role="dialog"
      aria-modal="true"
      aria-label="Console Skins"
      onClick={(e) => {
        if (e.target === e.currentTarget) closeGallery()
      }}
    >
      <div className="admin-modal-shell relative flex max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden border shadow-2xl">
        {/* Header */}
        <header className="admin-modal-header sticky top-0 z-10 flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--brand,#7B61FF)] text-white shadow-md">
              <Sparkles size={18} />
            </div>
            <div>
              <h2 className="admin-modal-title font-display text-lg font-bold tracking-tight text-[var(--text,#E6EAF2)]">
                Aezakmi Console Skins
              </h2>
              <p className="admin-modal-description text-xs text-[var(--muted,#8D9AB5)]">
                Hardware-tuned floor themes. Select a skin to switch aesthetics, geometry, and ambient FX.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={closeGallery}
            className="admin-modal-close grid h-8 w-8 place-items-center rounded-lg border border-[var(--line,#26314A)] text-[var(--muted,#8D9AB5)] transition-colors hover:bg-[var(--surface-2,#1A2233)] hover:text-[var(--text,#E6EAF2)]"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        {/* Skins Grid */}
        <div className="grid grid-cols-1 gap-4 overflow-y-auto p-6 sm:grid-cols-2 lg:grid-cols-3">
          {skins.map((s) => {
            const isSelected = s.id === skinId
            return (
              <button
                key={s.id}
                type="button"
                data-skin={s.id}
                onClick={() => handleSelect(s.id)}
                className={`group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-1 ${
                  isSelected
                    ? 'border-[var(--brand,#7B61FF)] shadow-[0_0_24px_-4px_var(--glow,rgba(123,97,255,0.4))] ring-2 ring-[var(--brand,#7B61FF)]'
                    : 'border-[var(--line,#26314A)] hover:border-[var(--brand,#7B61FF)]/60'
                }`}
              >
                {/* Visual Preview Box */}
                <div className={`prev relative h-32 w-full overflow-hidden sk-${s.id}`}>
                  {/* Mock Mini Floor Layout */}
                  <div className="absolute inset-3 flex gap-2">
                    {/* Rail mock */}
                    <div className="flex w-5 flex-col items-center gap-1 rounded bg-[var(--surface,#131A28)]/80 p-1 border border-white/5">
                      <div className="h-2.5 w-2.5 rounded-full bg-[var(--brand,#7B61FF)]" />
                      <div className="h-1.5 w-2.5 rounded-sm bg-white/20" />
                      <div className="h-1.5 w-2.5 rounded-sm bg-white/20" />
                    </div>
                    {/* Stations mock */}
                    <div className="flex flex-1 flex-col gap-1.5">
                      <div className="grid grid-cols-3 gap-1.5">
                        <div
                          className="h-8 rounded-[var(--tile-r,8px)] border border-[var(--live,#FFB020)]/60 bg-[var(--surface,#131A28)]/90 shadow-[0_0_10px_var(--glow,rgba(255,176,32,0.3))] p-1 flex flex-col justify-between"
                          style={{ clipPath: 'var(--tile-clip, none)' }}
                        >
                          <div className="h-1 w-3 rounded-full bg-[var(--live,#FFB020)]" />
                          <div className="h-1 w-5 rounded-full bg-white/40" />
                        </div>
                        <div
                          className="h-8 rounded-[var(--tile-r,8px)] border border-[var(--line,#26314A)] bg-[var(--surface,#131A28)]/75 p-1 flex flex-col justify-between"
                          style={{ clipPath: 'var(--tile-clip, none)' }}
                        >
                          <div className="h-1 w-3 rounded-full bg-[var(--free,#2ED3A0)]" />
                          <div className="h-1 w-4 rounded-full bg-white/20" />
                        </div>
                        <div
                          className="h-8 rounded-[var(--tile-r,8px)] border border-[var(--line,#26314A)] bg-[var(--surface,#131A28)]/75 p-1 flex flex-col justify-between"
                          style={{ clipPath: 'var(--tile-clip, none)' }}
                        >
                          <div className="h-1 w-3 rounded-full bg-[var(--hold,#4CC2FF)]" />
                          <div className="h-1 w-4 rounded-full bg-white/20" />
                        </div>
                      </div>
                      {/* Progress bar mock */}
                      <div className="h-1.5 w-3/4 rounded-full bg-[var(--line-soft,#1E273B)] overflow-hidden">
                        <div className="h-full w-2/3 rounded-full bg-[var(--brand,#7B61FF)]" />
                      </div>
                    </div>
                  </div>

                  {/* Active Indicator Badge */}
                  {isSelected && (
                    <span className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-full bg-[var(--brand,#7B61FF)] px-2 py-0.5 text-[10px] font-bold text-white shadow-md">
                      <Check size={11} strokeWidth={3} /> ACTIVE
                    </span>
                  )}
                </div>

                {/* Metadata */}
                <div className="flex flex-1 flex-col justify-between bg-[var(--surface,#131A28)] p-3.5">
                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="font-display text-sm font-bold text-[var(--text,#E6EAF2)] group-hover:text-[var(--brand,#7B61FF)]">
                        {s.name}
                      </h3>
                      <span className="font-mono text-[10px] uppercase text-[var(--faint,#6B7891)]">
                        {s.font}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted,#8D9AB5)] line-clamp-2">
                      {s.note}
                    </p>
                  </div>

                  {/* Swatches */}
                  <div className="mt-3 flex items-center justify-between pt-2 border-t border-[var(--line-soft,#1E273B)]">
                    <div className="flex gap-1">
                      {s.chips.map((c, i) => (
                        <span
                          key={i}
                          className="h-3.5 w-3.5 rounded-sm border border-black/20 shadow-xs"
                          style={{ backgroundColor: c }}
                          title={c}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-[11px] font-bold text-[var(--text,#E6EAF2)]">
                      {s.mark}
                    </span>
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
