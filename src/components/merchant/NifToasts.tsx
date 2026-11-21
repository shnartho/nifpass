"use client";

import { useEffect } from "react";
import { formatLisbonDateTime } from "@/lib/format";
import type { NifEntry } from "@/shared/protocol";

const TOAST_DURATION_MS = 6000;

function Toast({ entry, onDismiss }: { entry: NifEntry; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(entry.id), TOAST_DURATION_MS);
    return () => clearTimeout(t);
  }, [entry.id, onDismiss]);

  return (
    <div
      role="alert"
      className="pointer-events-auto flex w-full max-w-sm animate-pop items-start gap-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-lift"
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-white">
        <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" aria-hidden>
          <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-ink-900">New NIF received</p>
        <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums tracking-wider text-brand-700">{entry.nif}</p>
        <p className="text-xs tabular-nums text-ink-400">{formatLisbonDateTime(entry.receivedAt)}</p>
      </div>
      <button
        type="button"
        onClick={() => onDismiss(entry.id)}
        className="rounded-lg px-1.5 text-ink-400 hover:bg-ink-50 hover:text-ink-900"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export function NifToasts({ toasts, onDismiss }: { toasts: NifEntry[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex flex-col items-center gap-3 px-4">
      {toasts.map((t) => (
        <Toast key={t.id} entry={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
