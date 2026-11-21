"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/Button";
import { NIF_RE } from "@/shared/protocol";

interface NifFormProps {
  initialValue: string;
  initialAutoShare: boolean;
  notice?: string | null;
  onSave: (nif: string, autoShare: boolean) => void;
  onBack: () => void;
}

export function NifForm({ initialValue, initialAutoShare, notice, onSave, onBack }: NifFormProps) {
  const [value, setValue] = useState(initialValue);
  const [autoShare, setAutoShare] = useState(initialAutoShare);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const onChange = (raw: string) => {
    const compact = raw.replace(/\s+/g, "");
    if (/\D/.test(compact)) {
      setError("Your NIF can only contain numbers.");
      setValue(compact.replace(/\D/g, "").slice(0, 9));
      return;
    }
    setError(compact.length > 9 ? "Your NIF must have exactly 9 digits." : null);
    setValue(compact.slice(0, 9));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (value.length === 0) return setError("Please enter your NIF.");
    if (!NIF_RE.test(value)) return setError(`Your NIF must have exactly 9 digits. You entered ${value.length}.`);
    onSave(value, autoShare);
  };

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col" noValidate>
      <div className="flex-1">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">My NIF</h1>
        <p className="mt-1 text-ink-500">Enter your Portuguese tax number (NIF).</p>

        {notice && (
          <p className="mt-4 rounded-2xl bg-brand-50 px-4 py-2.5 text-sm text-brand-700 ring-1 ring-inset ring-brand-100">
            {notice}
          </p>
        )}

        <label htmlFor="nif" className="mt-5 block text-sm font-medium text-ink-700">
          NIF
        </label>
        <div className="relative mt-2">
          <input
            ref={inputRef}
            id="nif"
            name="nif"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]*"
            placeholder="123456789"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={!!error}
            aria-describedby="nif-help"
            className={`h-16 w-full rounded-2xl border bg-white px-5 font-mono text-2xl tracking-[0.25em] text-ink-900 outline-none transition placeholder:text-ink-200 focus:ring-4 ${
              error ? "border-rose-300 focus:ring-rose-100" : "border-ink-200 focus:border-brand-500 focus:ring-brand-100"
            }`}
          />
          <span className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 text-sm tabular-nums text-ink-400">
            {value.length}/9
          </span>
        </div>
        <p id="nif-help" className={`mt-2 min-h-5 text-sm ${error ? "text-rose-600" : "text-ink-400"}`}>
          {error ?? "Exactly 9 digits, numbers only."}
        </p>

        <label
          htmlFor="auto-share"
          className={`mt-4 flex cursor-pointer items-start gap-4 rounded-2xl border p-4 transition ${
            autoShare ? "border-brand-300 bg-brand-50/60" : "border-ink-200 bg-white"
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-ink-900">Share automatically after scanning</span>
            <span className="mt-1 block text-sm text-ink-500">
              Skip the confirmation step. Your NIF is sent as soon as you scan a store&apos;s NIFPass QR code.
            </span>
          </span>
          <span className="relative mt-1 inline-flex shrink-0">
            <input
              id="auto-share"
              type="checkbox"
              role="switch"
              checked={autoShare}
              onChange={(e) => setAutoShare(e.target.checked)}
              className="peer sr-only"
            />
            <span className="h-7 w-12 rounded-full bg-ink-200 transition peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100" />
            <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
          </span>
        </label>

        <p className="mt-4 flex gap-2 rounded-2xl bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
          <span className="shrink-0 rounded bg-amber-200/70 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide">
            Test mode
          </span>
          Only the 9-digit format is checked. This prototype does not verify that it is a valid Portuguese NIF.
        </p>

        <p className="mt-3 text-xs text-ink-400">
          Your NIF stays on this device for this browser session. It is only sent to a store after you confirm, or when
          you scan their QR code with automatic sharing on.
        </p>
      </div>

      <div className="mt-5 space-y-2">
        <Button type="submit" size="lg" block>
          Save NIF
        </Button>
        <Button variant="ghost" block onClick={onBack}>
          Back
        </Button>
      </div>
    </form>
  );
}
