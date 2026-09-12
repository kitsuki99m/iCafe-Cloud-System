import { combineDurationParts, splitMinutes } from '../../lib/duration.js'

const inputClass = 'w-full rounded-lg border bg-ink py-2 pl-12 pr-3 text-sm text-ink-900 outline-none transition-colors placeholder:text-slate-soft/60 focus:border-gold/50 disabled:cursor-not-allowed disabled:opacity-50'
const prefixClass = 'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-soft'

function wholeNumber(value, max) {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (!digits) return 0
  const parsed = Math.max(0, Math.floor(Number(digits) || 0))
  return Number.isFinite(max) ? Math.min(max, parsed) : parsed
}

export default function DurationInput({
  label = 'Duration',
  valueMinutes = 0,
  onChange,
  error = false,
  disabled = false,
  autoFocus = false,
  maxHours = 999,
  className = '',
}) {
  const { hours, minutes } = splitMinutes(valueMinutes)
  const borderClass = error ? 'border-ember/60' : 'border-surface-line'

  function updateHours(value) {
    onChange?.(combineDurationParts(wholeNumber(value, maxHours), minutes))
  }

  function updateMinutes(value) {
    onChange?.(combineDurationParts(hours, wholeNumber(value, 59)))
  }

  return (
    <div className={className} role="group" aria-label={label}>
      <span className="eyebrow mb-1.5 block">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        <label className="relative block min-w-0">
          <span className={prefixClass}>HH</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max={maxHours}
            step="1"
            autoFocus={autoFocus}
            disabled={disabled}
            value={hours > 0 ? hours : ''}
            placeholder="5"
            onChange={(event) => updateHours(event.target.value)}
            aria-label={`${label} hours`}
            className={`${inputClass} ${borderClass}`}
          />
        </label>
        <label className="relative block min-w-0">
          <span className={prefixClass}>MM</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            max="59"
            step="1"
            disabled={disabled}
            value={minutes > 0 ? minutes : ''}
            placeholder="30"
            onChange={(event) => updateMinutes(event.target.value)}
            aria-label={`${label} minutes`}
            className={`${inputClass} ${borderClass}`}
          />
        </label>
      </div>
    </div>
  )
}
