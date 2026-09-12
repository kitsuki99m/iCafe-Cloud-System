import { useAppData } from '../../context/AppDataContext.jsx'

function sanitize(value, wholeNumbers, decimalPlaces) {
  let next = String(value ?? '').replace(/,/g, '.')
  if (wholeNumbers) return next.replace(/\D/g, '')
  next = next.replace(/[^\d.]/g, '')
  const [whole = '', ...fraction] = next.split('.')
  return fraction.length ? `${whole}.${fraction.join('').slice(0, decimalPlaces)}` : whole
}

export default function NumericInput({ onChange, value, className = '', ...props }) {
  const { settings } = useAppData()
  const wholeNumbers = settings.numberFormat === 'whole'
  const decimalPlaces = Math.max(1, Math.min(3, Number(settings.decimalPlaces) || 3))
  return <input
    {...props}
    type="text"
    inputMode={wholeNumbers ? 'numeric' : 'decimal'}
    value={value ?? ''}
    onChange={(event) => onChange?.({ target: { value: sanitize(event.target.value, wholeNumbers, decimalPlaces) } })}
    className={className}
  />
}
