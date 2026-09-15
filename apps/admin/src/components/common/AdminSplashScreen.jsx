/**
 * Branded full-screen loading state. Replaces the old bare "Checking admin
 * session…" text-in-a-box, which — before fonts/CSS finished their first
 * paint — could render as an empty bordered rectangle with no visible
 * content. This component's static twin lives inline in index.html so the
 * very first paint already shows the logo, not a blank box; React just
 * takes over seamlessly once it mounts.
 */
export default function AdminSplashScreen({ label = "Loading your floor…" }) {
  return (
    <div className="splash-screen" role="status" aria-live="polite">
      <div className="animate-splash-in flex flex-col items-center gap-6">
        <div className="splash-ring">
          <img
            src="/aezakmi-logo.png"
            alt="Aezakmi Cafe"
            className="splash-logo"
            width={64}
            height={64}
          />
        </div>
        <div className="flex flex-col items-center gap-1.5">
          <p className="font-display text-[15px] font-semibold tracking-tight text-ink-900">
            Aezakmi Cafe
          </p>
          <p className="eyebrow !tracking-[0.14em] text-slate">{label}</p>
        </div>
        <div className="splash-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </div>
  );
}
