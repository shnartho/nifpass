"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/Button";
import { Logo } from "@/components/Logo";
import {
  MIN_PASSWORD_LENGTH,
  deriveStoreCredentials,
  fetchRemoteProfile,
  getSavedProfile,
  normalizeEmail,
  type StoreAccount,
} from "@/lib/storeAuth";
import { STORE_NAME_MAX, sanitizeStoreName } from "@/shared/protocol";

type Mode = "register" | "signin" | "profile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-ink-700">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-xs text-ink-400">{hint}</span>}
    </label>
  );
}

const inputClass =
  "h-12 w-full rounded-xl border border-ink-200 bg-white px-4 text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-brand-500 focus:ring-4 focus:ring-brand-100";

export function StoreAuth({ onSignedIn }: { onSignedIn: (account: StoreAccount) => void }) {
  const [mode, setMode] = useState<Mode>("register");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ storeId: string; secret: string } | null>(null);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  const finish = (creds: { storeId: string; secret: string }, storeName: string, storeLocation: string) =>
    onSignedIn({ ...creds, email: normalizeEmail(email), name: storeName, location: storeLocation.trim() });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === "profile") {
      const clean = sanitizeStoreName(name);
      if (!clean) return setError("Please enter your store name.");
      if (pending) finish(pending, clean, location);
      return;
    }

    const cleanName = mode === "register" ? sanitizeStoreName(name) : null;
    if (mode === "register" && !cleanName) return setError("Please enter your store name.");
    if (!EMAIL_RE.test(email.trim())) return setError("Please enter a valid email address.");
    if (password.length < MIN_PASSWORD_LENGTH) {
      return setError(`Your password must have at least ${MIN_PASSWORD_LENGTH} characters.`);
    }

    setBusy(true);
    try {
      const creds = await deriveStoreCredentials(email, password);
      // Same email + password = same store: reuse its saved profile from any device.
      const profile = (await fetchRemoteProfile(creds)) ?? getSavedProfile(creds.storeId);
      if (profile) return finish(creds, profile.name, profile.location);
      if (mode === "register" && cleanName) return finish(creds, cleanName, location);

      setPending(creds);
      setMode("profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_minmax(480px,560px)]">
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-ink-900 p-12 text-white lg:flex lg:flex-col">
        <div className="rounded-2xl bg-white/95 px-4 py-3 shadow-lift lg:self-start">
          <Logo showByline />
        </div>
        <div className="mt-auto max-w-md">
          <h1 className="text-4xl font-semibold leading-tight tracking-tight">Customer NIF collection made simple.</h1>
          <p className="mt-4 text-lg text-white/75">
            One permanent QR code for your store. Customers scan it, and their NIF appears on your screen instantly.
          </p>
          <ul className="mt-8 space-y-3 text-white/85">
            {["No more spelling out numbers at the counter", "Your QR never expires, so print it once", "NIFs go only to your store"].map(
              (t) => (
                <li key={t} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 place-items-center rounded-full bg-white/15 text-sm">✓</span>
                  {t}
                </li>
              ),
            )}
          </ul>
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
      </aside>

      <main className="flex flex-col justify-center px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-sm">
          <div className="lg:hidden">
            <Logo showByline />
          </div>

          {mode !== "profile" && (
            <div className="mt-8 grid grid-cols-2 rounded-xl bg-ink-100 p-1 text-sm font-semibold lg:mt-0">
              {(["register", "signin"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-lg py-2 transition ${mode === m ? "bg-white text-ink-900 shadow-card" : "text-ink-500"}`}
                >
                  {m === "register" ? "Create store" : "Sign in"}
                </button>
              ))}
            </div>
          )}

          <h2 className="mt-8 text-2xl font-semibold tracking-tight text-ink-900">
            {mode === "register" ? "Create your store" : mode === "signin" ? "Welcome back" : "Name your store"}
          </h2>
          <p className="mt-1 text-sm text-ink-500">
            {mode === "register"
              ? "Get your store's permanent NIFPass QR code."
              : mode === "signin"
                ? "Sign in to open your store's QR code."
                : "First time on this device. What's your store called?"}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
            {(mode === "register" || mode === "profile") && (
              <>
                <Field label="Store name">
                  <input
                    className={inputClass}
                    value={name}
                    maxLength={STORE_NAME_MAX}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Pastelaria Lisboa"
                    autoFocus
                  />
                </Field>
                <Field label="Location (optional)">
                  <input
                    className={inputClass}
                    value={location}
                    maxLength={80}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Rua Augusta 12, Lisboa"
                  />
                </Field>
              </>
            )}

            {mode !== "profile" && (
              <>
                <Field label="Email">
                  <input
                    className={inputClass}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="owner@store.pt"
                    autoFocus={mode === "signin"}
                  />
                </Field>
                <Field
                  label="Password"
                  hint={mode === "register" ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined}
                >
                  <input
                    className={inputClass}
                    type="password"
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
              </>
            )}

            {error && (
              <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
                {error}
              </p>
            )}

            <Button type="submit" size="lg" block loading={busy}>
              {mode === "register" ? "Create store" : mode === "signin" ? "Sign in" : "Open my store"}
            </Button>
          </form>

          <p className="mt-6 text-xs leading-relaxed text-ink-400">
            Use the same email and password on any device to open your store with the same QR code. This prototype
            doesn&apos;t keep accounts on a server, so a forgotten password can&apos;t be recovered.
          </p>
        </div>
      </main>
    </div>
  );
}
