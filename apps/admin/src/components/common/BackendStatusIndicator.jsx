import { RefreshCw, Wifi } from "lucide-react";

const STATUS_META = {
  online: {
    label: "Online",
    detail: "Connected to server",
    dot: "bg-teal",
    pulse: true,
  },
  offline: {
    label: "Offline",
    detail: "No network connection",
    dot: "bg-slate",
    pulse: false,
  },
  error: {
    label: "Connection error",
    detail: "Server isn't responding",
    dot: "bg-ember",
    pulse: true,
  },
  connecting: {
    label: "Connecting…",
    detail: "Reaching the server",
    dot: "bg-gold",
    pulse: false,
  },
};

export default function BackendStatusIndicator({ status, onRetry }) {
  const meta = STATUS_META[status] || STATUS_META.connecting;
  const canRetry = status === "error" || status === "offline";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-surface-line bg-surface-raised/60 px-3 py-2">
      <span className="relative flex h-2 w-2 shrink-0">
        {meta.pulse && (
          <span
            className={`absolute inline-flex h-full w-full animate-led rounded-full ${meta.dot}`}
          />
        )}
        <span
          className={`relative inline-flex h-2 w-2 rounded-full ${meta.dot}`}
        />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-xs font-medium text-ink-900">{meta.label}</p>
        <p className="flex items-center gap-1 text-[11px] text-slate-soft">
          <Wifi size={10} /> {meta.detail}
        </p>
      </div>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="flex shrink-0 items-center gap-1 rounded-md border border-surface-line bg-surface px-2 py-1 text-[11px] font-semibold text-slate-soft transition-colors hover:text-ink-900"
        >
          <RefreshCw size={11} /> Retry
        </button>
      )}
    </div>
  );
}
