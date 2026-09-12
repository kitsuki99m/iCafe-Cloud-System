import { ScrollText } from 'lucide-react'

export default function LogsPage() {
  return (
    <div className="p-6 lg:p-8">
      <div className="mb-6">
        <p className="eyebrow mb-1">Session History</p>
        <h1 className="font-display text-2xl font-semibold text-ink-900">Session Logs</h1>
      </div>
      <div className="panel flex flex-col items-center gap-2 py-16 text-center">
        <ScrollText size={22} className="text-slate-soft" />
        <p className="text-sm font-medium text-ink-900">Session history is managed by staff.</p>
        <p className="text-xs text-slate-soft">No frontend mock session records are used.</p>
      </div>
    </div>
  )
}
