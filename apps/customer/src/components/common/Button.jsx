const variants = {
  primary: 'bg-midnight text-soft-white hover:bg-bluish shadow-glow',
  teal: 'bg-teal text-soft-white hover:bg-teal/90 shadow-glow-teal',
  danger: 'bg-ember text-soft-white hover:bg-ember/90 shadow-glow-ember',
  ghost: 'bg-transparent text-slate-soft hover:text-ink-900 hover:bg-surface-raised border border-surface-line',
  subtle: 'bg-surface-raised text-ink-900 hover:bg-surface-line',
}

const sizes = {
  sm: 'min-h-10 text-xs px-3 py-1.5 gap-1.5',
  md: 'min-h-11 text-sm px-4 py-2 gap-2',
  lg: 'min-h-12 text-sm px-5 py-2.5 gap-2',
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
  return (
    <button
      type={type}
      disabled={disabled}
      className={`inline-flex items-center justify-center rounded-lg font-semibold
        transition-colors duration-150
        disabled:opacity-40 disabled:cursor-not-allowed
        ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2.25} />}
      {children}
    </button>
  )
}
