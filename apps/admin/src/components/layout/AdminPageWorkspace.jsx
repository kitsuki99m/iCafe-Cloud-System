export function AdminPageWorkspace({ children, aside, className = '' }) {
  return (
    <div className={`admin-page-workspace min-h-full flex-1 grid ${aside ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'} ${className}`}>
      <div className="admin-page-main-column min-w-0 min-h-full flex-1 px-3.5 py-3 sm:px-6 sm:py-5 lg:px-7 lg:py-5">
        {children}
      </div>
      {aside ? (
        <aside className="admin-page-utility-rail border-t border-[var(--admin-ui-border)] px-5 py-4 sm:px-6 sm:py-5 xl:border-l xl:border-t-0 xl:px-5 xl:py-5">
          <div className="admin-page-rail-stack space-y-4 xl:sticky xl:top-[112px]">
            {aside}
          </div>
        </aside>
      ) : null}
    </div>
  )
}

export function AdminRailCard({ title, action, children, className = '' }) {
  return (
    <section className={`admin-rail-card ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[14px] font-semibold tracking-[-0.015em] text-ink-900">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}

export function AdminMetricCard({ label, value, icon: Icon, tone = 'neutral', onClick }) {
  const toneClass = tone === 'success'
    ? 'bg-teal/10 text-teal-dim'
    : tone === 'warning'
      ? 'bg-gold/10 text-gold-dim'
      : tone === 'danger'
        ? 'bg-ember/10 text-ember-dim'
        : 'bg-[var(--admin-card-subtle)] text-gold-dim'
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper type={onClick ? 'button' : undefined} onClick={onClick} className={`admin-metric-card ${onClick ? 'text-left transition-transform hover:-translate-y-0.5' : ''}`}>
      <div className="min-w-0">
        <p className="eyebrow">{label}</p>
        <p className="stat-figure mt-2 whitespace-nowrap text-[21px] font-bold tracking-[-0.03em] text-ink-900">{value}</p>
      </div>
      {Icon ? <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}><Icon size={17}/></span> : null}
    </Wrapper>
  )
}

export function AdminEmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="admin-empty-state-stage">
      <div className="admin-empty-state-card">
        {Icon ? <span className="admin-empty-state-icon"><Icon size={21}/></span> : null}
        <p className="mt-4 text-sm font-semibold text-ink-900">{title}</p>
        {description ? <p className="mt-1 max-w-sm text-xs leading-5 text-slate-soft">{description}</p> : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  )
}
