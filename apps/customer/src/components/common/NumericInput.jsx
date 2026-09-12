function sanitize(value) {
  const next = String(value ?? '').replace(/\D/g, '')
  return next === '' ? '' : String(Math.floor(Number(next)))
}

export default function NumericInput({ onChange, value, className = '', ...props }) {
  return <input
    {...props}
    type="text"
    inputMode="numeric"
    value={value === '' || value == null ? '' : String(Math.floor(Number(value) || 0))}
    onChange={(event) => onChange?.({ target: { value: sanitize(event.target.value) } })}
    className={className}
  />
}
