import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

export function usePhtClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(now);

  const dateStr = new Intl.DateTimeFormat("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(now);

  return { timeStr, dateStr, now };
}

export default function PhtClock({ showDate = true, className = "" }) {
  const { timeStr, dateStr } = usePhtClock();

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-surface-line customer-neutral-surface text-xs font-mono font-bold tracking-tight text-ink-900 shadow-2xs select-none ${className}`}
      title={`Philippine Standard Time (PHT) · ${dateStr} ${timeStr}`}
    >
      <Clock size={13} className="text-gold-dim animate-pulse shrink-0" />
      {showDate && <span className="hidden xl:inline text-slate-soft text-[11px] font-medium mr-0.5">{dateStr} ·</span>}
      <span className="tabular-nums font-mono font-semibold">{timeStr}</span>
      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-soft px-1 py-0.2 rounded bg-surface-raised/80">PHT</span>
    </div>
  );
}
