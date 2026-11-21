"use client";

import { useState } from "react";
import { formatLisbonDay, formatLisbonTime } from "@/lib/format";
import type { NifEntry } from "@/shared/protocol";

function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard may be unavailable on insecure origins.
        }
      }}
      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
        copied ? "bg-emerald-500 text-white" : "bg-ink-100 text-ink-500 hover:bg-ink-200 hover:text-ink-900"
      } ${className}`}
      aria-label={`Copy NIF ${value}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

type LatestSize = "compact" | "normal" | "hero";

const latestStyles: Record<LatestSize, { box: string; nif: string; time: string }> = {
  compact: { box: "px-4 py-3", nif: "mt-1 text-4xl", time: "mt-0.5 text-xs" },
  normal: { box: "px-6 py-6", nif: "mt-3 text-5xl xl:text-6xl", time: "mt-2 text-sm" },
  hero: { box: "px-8 py-10", nif: "mt-4 text-7xl xl:text-8xl", time: "mt-3 text-base" },
};

/** The most recent NIF, shown large so staff can read it from a distance. */
export function LatestNif({ entry, size = "normal" }: { entry: NifEntry | null; size?: LatestSize }) {
  const compact = size === "compact";
  const s = latestStyles[size];
  if (!entry) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-ink-200 text-center ${
          compact ? "px-4 py-4" : "px-6 py-10"
        }`}
      >
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand-400 opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-brand-500" />
        </span>
        <p className={`${compact ? "mt-2 text-sm" : "mt-4"} font-medium text-ink-700`}>Waiting for your first customer.</p>
        {!compact && <p className="mt-1 text-sm text-ink-400">New NIFs appear here instantly.</p>}
      </div>
    );
  }

  return (
    <div
      key={entry.id}
      className={`animate-arrive rounded-3xl bg-brand-50/60 ring-2 ring-brand-500 ${s.box}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white" /> New
        </span>
        <CopyButton value={entry.nif} />
      </div>
      <p className={`font-mono font-bold tabular-nums tracking-wider text-ink-950 ${s.nif}`}>{entry.nif}</p>
      <p className={`tabular-nums text-ink-500 ${s.time}`}>
        {formatLisbonTime(entry.receivedAt)} · {formatLisbonDay(entry.receivedAt)}
      </p>
    </div>
  );
}

export function NifHistory({ entries }: { entries: NifEntry[] }) {
  if (entries.length === 0) return <p className="px-1 py-6 text-center text-sm text-ink-400">No earlier NIFs yet.</p>;
  return (
    <ul className="divide-y divide-ink-100">
      {entries.map((e) => (
        <li key={e.id} className="flex items-center justify-between gap-3 px-1 py-3">
          <div className="min-w-0">
            <p className="font-mono text-2xl font-semibold tabular-nums tracking-wider text-ink-900">{e.nif}</p>
            <p className="text-xs tabular-nums text-ink-400">
              {formatLisbonTime(e.receivedAt)} · {formatLisbonDay(e.receivedAt)}
            </p>
          </div>
          <CopyButton value={e.nif} />
        </li>
      ))}
    </ul>
  );
}
