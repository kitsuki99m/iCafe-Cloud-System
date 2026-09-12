import { useEffect, useRef, useState } from 'react'
import { Lock } from 'lucide-react'

// This overlay sits above every other in-app modal (z-[550], between the
// standard Modal layer at z-[500] and the Emergency Commands modal at
// z-[600]) so a customer can never interact with the station behind it.
// It intentionally has no close button and has no
// backdrop-click handler — the only way out is a real unlock, which comes
// from the Electron main process (remote command or the Alt+Shift+U
// emergency shortcut), never from anything inside this component.
export default function StationLockedOverlay() {
  const [locked, setLocked] = useState(false)
  const overlayRef = useRef(null)
  const previousFocusRef = useRef(null)

  useEffect(() => window.aezakmiClient?.onStationLocked?.(setLocked), [])

  useEffect(() => {
    if (!locked) return undefined
    const previousOverflow = document.body.style.overflow
    previousFocusRef.current = document.activeElement
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => overlayRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      const previous = previousFocusRef.current
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus()
      previousFocusRef.current = null
    }
  }, [locked])

  if (!locked) return null

  return (
    <div
      ref={overlayRef}
      tabIndex={-1}
      onKeyDown={(event) => { if (['Escape','Tab','Enter',' '].includes(event.key)) event.preventDefault() }}
      className="fixed inset-0 z-[550] flex items-center justify-center bg-midnight/95 p-4"
      role="alertdialog"
      aria-modal="true"
      aria-label="Session locked"
    >
      <div className="panel flex w-full max-w-sm flex-col items-center gap-4 px-6 py-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold-dim">
          <Lock size={26} />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Session Locked</h2>
          <p className="mt-2 text-sm leading-6 text-slate-soft">
            Staff has locked this station. Please wait — your session and
            balance are unaffected. Ask the counter if you need help.
          </p>
        </div>
      </div>
    </div>
  )
}
