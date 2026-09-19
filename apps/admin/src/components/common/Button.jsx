const variants = {
  primary: 'bg-midnight text-soft-white hover:bg-bluish shadow-glow',
  secondary: 'bg-surface-raised text-ink-900 border border-surface-line hover:bg-surface-line shadow-xs',
  outline: 'bg-transparent text-ink-900 hover:bg-surface-raised border border-surface-line',
  teal: 'bg-teal text-soft-white hover:bg-teal/90 shadow-glow-teal',
  danger: 'bg-ember text-soft-white hover:bg-ember/90 shadow-glow-ember',
  ghost: 'bg-transparent text-slate-soft hover:text-ink-900 hover:bg-surface-raised border border-surface-line',
  subtle: 'bg-surface-raised text-ink-900 hover:bg-surface-line border border-surface-line/60',
}

const sizes = {
  sm: 'text-xs px-3 py-1.5 gap-1.5',
  md: 'text-sm px-4 py-2 gap-2',
  lg: 'text-sm px-5 py-2.5 gap-2',
}

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className = '',
  disabled = false,
  type = 'button',
  ...props
}) {
  const activeVariant = variants[variant] || variants.primary

  return (
    <button
      type={type}
      disabled={disabled}
      className={`btn btn-${variant} ${variant} inline-flex items-center justify-center font-semibold
        transition-all duration-150
        disabled:opacity-40 disabled:cursor-not-allowed
        ${activeVariant} ${sizes[size] || sizes.md} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.25} />}
      {children}
    </button>
  )
}
