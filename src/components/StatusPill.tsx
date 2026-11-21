export type StatusTone = "success" | "warning" | "danger" | "neutral";

const tones: Record<StatusTone, { wrap: string; dot: string }> = {
  success: { wrap: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  warning: { wrap: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  danger: { wrap: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" },
  neutral: { wrap: "bg-ink-50 text-ink-500 ring-ink-200", dot: "bg-ink-300" },
};

export function StatusPill({ tone, label, pulse = false }: { tone: StatusTone; label: string; pulse?: boolean }) {
  const t = tones[tone];
  return (
    <span
      role="status"
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${t.wrap}`}
    >
      <span className="relative flex h-2 w-2">
        {pulse && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${t.dot}`} />}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${t.dot}`} />
      </span>
      {label}
    </span>
  );
}
