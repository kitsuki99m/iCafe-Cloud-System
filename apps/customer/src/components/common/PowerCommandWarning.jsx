import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, RotateCw, Power } from 'lucide-react'

export default function PowerCommandWarning() {
  const [warning, setWarning] = useState(null)
  const overlayRef = useRef(null)
  const previousFocusRef = useRef(null)
  useEffect(() => window.aezakmiClient?.onPowerWarning?.((payload) => setWarning({ ...payload, remaining:Number(payload?.seconds || 5) })), [])
  useEffect(() => window.aezakmiClient?.onPowerCommandResult?.(() => setWarning(null)), [])
  useEffect(() => {
    if (!warning) return undefined
    const timer = window.setInterval(() => setWarning((current) => current ? { ...current, remaining:Math.max(0, current.remaining - 1) } : null), 1000)
    return () => window.clearInterval(timer)
  }, [warning?.command])
  useEffect(() => {
    if (!warning) return undefined
    previousFocusRef.current = document.activeElement
    const frame = requestAnimationFrame(() => overlayRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      const previous = previousFocusRef.current
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus()
      previousFocusRef.current = null
    }
  }, [Boolean(warning)])
  if (!warning) return null
  const restarting = warning.command === 'reboot'
  const Icon = restarting ? RotateCw : Power
  return <div ref={overlayRef} tabIndex={-1} onKeyDown={(event) => { if (['Escape','Tab','Enter',' '].includes(event.key)) event.preventDefault() }} className="fixed inset-0 z-[1000] flex items-center justify-center bg-midnight/85 p-5 text-center text-soft-white" role="alertdialog" aria-modal="true" aria-live="assertive"><div className="w-full max-w-sm rounded-2xl border border-ember/40 bg-surface p-6 shadow-2xl"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ember/15 text-ember-dim"><Icon size={24}/></div><p className="eyebrow mt-4 text-ember-dim">Station command received</p><h2 className="mt-1 font-display text-2xl font-semibold text-ink-900">PC will {restarting ? 'restart' : 'shut down'}</h2><p className="mt-2 text-sm text-slate-soft">Please save any work. The command will force in</p><p className="stat-figure mt-2 text-4xl font-bold text-ember-dim">{warning.remaining}</p><div className="mt-4 flex items-center justify-center gap-2 text-xs text-slate-soft"><AlertTriangle size={14}/> This action cannot be cancelled.</div></div></div>
}
