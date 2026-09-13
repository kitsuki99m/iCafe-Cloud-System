import { useEffect, useState } from 'react'
import { Download, Share2 } from 'lucide-react'
import { getAdminPwaInstallState, promptAdminPwaInstall, subscribeAdminPwaInstall } from '../../lib/pwa.js'

export default function PwaInstallButton() {
  const [state, setState] = useState(() => getAdminPwaInstallState())
  const [showIosHelp, setShowIosHelp] = useState(false)

  useEffect(() => subscribeAdminPwaInstall(setState), [])

  if (!state.eligible || state.installed || (!state.canPrompt && !state.ios)) return null

  async function install() {
    if (state.canPrompt) {
      await promptAdminPwaInstall()
      return
    }
    if (state.ios) setShowIosHelp((value) => !value)
  }

  return (
    <div className="mb-3 rounded-xl border border-surface-line bg-[var(--admin-card-subtle)] p-2.5">
      <button type="button" onClick={install} className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left" aria-expanded={showIosHelp}>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-midnight text-soft-white">
          {state.ios && !state.canPrompt ? <Share2 size={15}/> : <Download size={15}/>} 
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold text-ink-900">Install Admin App</span>
          <span className="mt-0.5 block text-[9px] leading-3.5 text-slate-soft">Open the admin like a standalone mobile app.</span>
        </span>
      </button>
      {showIosHelp && <p className="mt-2 rounded-lg border border-surface-line bg-surface px-2.5 py-2 text-[9px] leading-4 text-slate-soft">In Safari, tap <strong className="font-semibold text-ink-900">Share</strong>, then choose <strong className="font-semibold text-ink-900">Add to Home Screen</strong>.</p>}
    </div>
  )
}
