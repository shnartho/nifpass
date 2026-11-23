"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Spinner } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import { formatLisbonDay, formatLisbonTime } from "@/lib/format";
import { buildQrPayload, publicBaseUrl } from "@/lib/qrPayload";
import {
  clearAccount,
  loadAccount,
  regenerateQr,
  saveAccount,
  syncAccount,
  type StoreAccount,
} from "@/lib/storeAuth";
import { friendlyError } from "@/lib/errors";
import { useInstallPrompt } from "@/lib/useInstallPrompt";
import { InstallSheet } from "@/components/user/InstallSheet";
import { PlatformLogos } from "@/components/PlatformLogos";
import { useStoreChannel } from "@/lib/useStoreChannel";
import type { NifEntry } from "@/shared/protocol";
import { LatestNif, NifHistory } from "./NifFeed";
import { NifToasts } from "./NifToasts";
import { StoreAuth } from "./StoreAuth";
import { StoreQr } from "./StoreQr";

// Stores with a printed QR at the counter can hide the on-screen one.
const SHOW_QR_KEY = "nifpass.store.showQr";
const MAX_ENTRIES = 100;
// Kept on this device so reopening the app (or the home-screen app) shows them again.
const entriesKey = (storeId: string) => `nifpass.store.entries.${storeId}`;

function loadEntries(storeId: string): NifEntry[] {
  try {
    return JSON.parse(localStorage.getItem(entriesKey(storeId)) ?? "[]");
  } catch {
    return [];
  }
}

const mergeEntries = (current: NifEntry[], incoming: NifEntry[]) => {
  const byId = new Map(current.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, MAX_ENTRIES);
};

const FONT = "system-ui, -apple-system, 'Segoe UI', sans-serif";
const INK = "#0b1736";
const MUTED = "#5b6584";
const BRAND = "#5640e6";

/** Draws left-aligned text wrapped to `maxWidth`; returns the y below the last line. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  let line = "";
  for (const word of text.split(" ")) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Printable A4 landscape poster. Left (~30%): how to get NIFPass, with a small QR to the
 * website. Right: the store's QR, big, for customers who already have the app.
 */
function downloadPoster(storeQr: HTMLCanvasElement, siteQr: HTMLCanvasElement, storeName: string, host: string) {
  const W = 3508;
  const H = 2480;
  const M = 140;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Header
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  ctx.font = `800 190px ${FONT}`;
  ctx.fillText("Share your NIF here", W / 2, 330);
  ctx.fillStyle = MUTED;
  ctx.font = `500 84px ${FONT}`;
  ctx.fillText(`${storeName} · no need to say it out loud`, W / 2, 470, W - 2 * M);

  const top = 590;
  const bottom = H - 200;
  const leftW = Math.round((W - 2 * M) * 0.3);
  const gap = 90;

  // Left panel: for customers without NIFPass
  roundRect(ctx, M, top, leftW, bottom - top, 64);
  ctx.fillStyle = "#f2f1fd";
  ctx.fill();
  const lx = M + 80;
  const lw = leftW - 160;
  ctx.textAlign = "left";
  ctx.fillStyle = BRAND;
  ctx.font = `800 96px ${FONT}`;
  let y = wrapText(ctx, "Don't have NIFPass?", lx, top + 170, lw, 110);

  const siteQrSize = 540;
  ctx.drawImage(siteQr, M + (leftW - siteQrSize) / 2, y + 10, siteQrSize, siteQrSize);
  ctx.textAlign = "center";
  ctx.fillStyle = MUTED;
  ctx.font = `500 50px ${FONT}`;
  ctx.fillText(host, M + leftW / 2, y + siteQrSize + 80, lw);
  y += siteQrSize + 200;

  const steps = [
    `Go to ${host} or scan the QR code above.`,
    "Tap Install.",
    "Open the app and scan the big QR code on the right to send your NIF.",
  ];
  const badge = 46;
  steps.forEach((step, i) => {
    ctx.fillStyle = BRAND;
    ctx.beginPath();
    ctx.arc(lx + badge, y - 22, badge, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = `800 58px ${FONT}`;
    ctx.fillText(String(i + 1), lx + badge, y);
    ctx.textAlign = "left";
    ctx.fillStyle = INK;
    ctx.font = `600 60px ${FONT}`;
    y = wrapText(ctx, step, lx + badge * 2 + 36, y, lw - badge * 2 - 36, 74) + 46;
  });

  // Right: the store's QR, as big as fits
  const rx = M + leftW + gap;
  const rw = W - M - rx;
  ctx.textAlign = "center";
  ctx.fillStyle = INK;
  ctx.font = `700 92px ${FONT}`;
  ctx.fillText("Have NIFPass? Scan this code", rx + rw / 2, top + 90, rw);
  const qrSize = Math.min(rw, bottom - top - 150);
  ctx.drawImage(storeQr, rx + (rw - qrSize) / 2, top + 140, qrSize, qrSize);

  // Footer
  ctx.fillStyle = MUTED;
  ctx.font = `500 54px ${FONT}`;
  ctx.fillText("NIFPass by GoGentik", W / 2, H - 90);

  const link = document.createElement("a");
  const slug = storeName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  link.download = `nifpass-qr-${slug || "store"}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export default function MerchantApp() {
  const [account, setAccount] = useState<StoreAccount | null>(() => loadAccount());
  // Accounts restored from this device are re-checked with the server once before connecting.
  const [syncedId, setSyncedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const update = useCallback(
    (next: StoreAccount) => {
      // A new QR id keeps this screen's received NIFs.
      if (account && account.storeId !== next.storeId) {
        const saved = localStorage.getItem(entriesKey(account.storeId));
        if (saved) localStorage.setItem(entriesKey(next.storeId), saved);
        localStorage.removeItem(entriesKey(account.storeId));
      }
      saveAccount(next);
      setAccount(next);
      setSyncedId(next.storeId);
    },
    [account],
  );

  const signOut = useCallback(
    (message: string | null = null) => {
      if (account) localStorage.removeItem(entriesKey(account.storeId));
      clearAccount();
      setAccount(null);
      setNotice(message);
    },
    [account],
  );

  if (!account) return <StoreAuth notice={notice} onSignedIn={update} />;
  return (
    <StoreDashboard
      key={account.storeId}
      account={account}
      synced={syncedId === account.storeId}
      onUpdate={update}
      onSignOut={signOut}
    />
  );
}

// Answers that mean this device's saved login is no longer valid.
const FINAL_SYNC_ERRORS = new Set(["ACCOUNT_NOT_FOUND", "WRONG_PASSWORD", "EMAIL_TAKEN", "UNAUTHORIZED", "INVALID_REQUEST"]);

function StoreDashboard({
  account,
  synced,
  onUpdate,
  onSignOut,
}: {
  account: StoreAccount;
  synced: boolean;
  onUpdate: (account: StoreAccount) => void;
  onSignOut: (message?: string | null) => void;
}) {
  const [ready, setReady] = useState(synced);
  const [regenerating, setRegenerating] = useState(false);
  const [entries, setEntries] = useState<NifEntry[]>(() => loadEntries(account.storeId));
  const [toasts, setToasts] = useState<NifEntry[]>([]);
  const [nfcNotice, setNfcNotice] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [showQr, setShowQr] = useState(() => localStorage.getItem(SHOW_QR_KEY) !== "false");

  const toggleQr = () => {
    setShowQr((v) => {
      localStorage.setItem(SHOW_QR_KEY, String(!v));
      return !v;
    });
    setMenuOpen(false);
  };
  const posterRef = useRef<HTMLCanvasElement>(null);
  const siteQrRef = useRef<HTMLCanvasElement>(null);
  const { base, host, isLocal } = useMemo(() => publicBaseUrl(), []);
  const qrPayload = useMemo(() => buildQrPayload(account.storeId), [account.storeId]);

  const dismissToast = useCallback((id: string) => setToasts((cur) => cur.filter((t) => t.id !== id)), []);

  const { canInstall, isIos, install } = useInstallPrompt({ mobileOnly: false });
  const [showInstallSteps, setShowInstallSteps] = useState(false);
  const onInstall = async () => {
    setMenuOpen(false);
    if (!(await install())) setShowInstallSteps(true);
  };

  /** Loads the store's saved details (e.g. its current QR id) from the server. */
  const resync = useCallback(async () => {
    const res = await syncAccount(account);
    if (res.ok) {
      if (res.account.storeId !== account.storeId || res.account.name !== account.name || res.account.location !== account.location) {
        onUpdate(res.account);
      }
    } else if (FINAL_SYNC_ERRORS.has(res.code)) {
      onSignOut(friendlyError(res.code).message);
      return;
    }
    // Offline or busy: connect anyway; the token request retries on its own.
    setReady(true);
  }, [account, onUpdate, onSignOut]);

  useEffect(() => {
    if (!synced) void resync();
    // Once per screen (dashboard remounts when the QR id changes).
  }, []);

  const { state: connection, error: connectionError } = useStoreChannel(
    account,
    ready,
    (entry) => {
      setEntries((cur) => mergeEntries(cur, [entry]));
      setToasts([entry]);
    },
    () => void resync(),
  );

  useEffect(() => {
    localStorage.setItem(entriesKey(account.storeId), JSON.stringify(entries));
  }, [account.storeId, entries]);

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const clearHistory = () => {
    if (!confirmClear) return setConfirmClear(true);
    setConfirmClear(false);
    setEntries([]);
  };

  const signOut = () => {
    if (!window.confirm("Sign out? This screen will stop receiving NIFs until you sign in again.")) return;
    onSignOut();
  };

  const newQr = async () => {
    setMenuOpen(false);
    if (
      !window.confirm(
        "Generate a new QR code?\n\nYour current QR code, including any printed copies, will stop working. Customers will need to scan the new one.",
      )
    ) {
      return;
    }
    setRegenerating(true);
    const res = await regenerateQr(account);
    setRegenerating(false);
    if (res.ok) return onUpdate(res.account);
    if (res.code === "QR_REPLACED") return void resync();
    window.alert(friendlyError(res.code).message);
  };

  const downloadQr = () => {
    if (posterRef.current && siteQrRef.current) downloadPoster(posterRef.current, siteQrRef.current, account.name, host);
    setMenuOpen(false);
  };

  const online = connection === "open";
  const status = ((): { tone: StatusTone; label: string; pulse?: boolean } => {
    if (connection === "open") return { tone: "success", label: "Open · receiving NIFs", pulse: true };
    if (connection === "reconnecting") return { tone: "warning", label: "Reconnecting…", pulse: true };
    if (connection === "error") return { tone: "danger", label: "Not connected" };
    return { tone: "neutral", label: "Connecting…" };
  })();

  const latest = entries[0] ?? null;
  const earlier = entries.slice(1);
  const today = formatLisbonDay(Date.now());
  const todayCount = entries.filter((e) => formatLisbonDay(e.receivedAt) === today).length;

  const qrOverlay = !online && (
    <div className="absolute inset-0 grid place-items-center">
      <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink-700 shadow-card">
        {connection === "error" ? connectionError : <><Spinner /> Connecting…</>}
      </span>
    </div>
  );

  const nfcBanner = nfcNotice && (
    <div role="alert" className="animate-fade-up rounded-2xl bg-ink-50 p-4 text-sm text-ink-600 ring-1 ring-inset ring-ink-200">
      <div className="flex items-start justify-between gap-2">
        <p>
          <span className="font-semibold text-ink-900">NFC is coming soon.</span> NFC support is not available in this
          prototype. Please use the QR code.
        </p>
        <button type="button" onClick={() => setNfcNotice(false)} className="text-ink-400 hover:text-ink-900" aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );

  return (
    <div className="h-dvh overflow-hidden bg-ink-50">
      <NifToasts toasts={toasts} onDismiss={dismissToast} />
      {showInstallSteps && (
        <InstallSheet
          isIos={isIos}
          appName="NIFPass Store"
          iconSrc="/icons/store-icon-192.png"
          onClose={() => setShowInstallSteps(false)}
        />
      )}
      <QRCodeCanvas ref={posterRef} value={qrPayload} size={1600} level="M" marginSize={2} className="hidden" />
      <QRCodeCanvas ref={siteQrRef} value={`${base}/`} size={600} level="M" marginSize={2} className="hidden" />

      {/* ---------- Desktop / laptop: 3 columns, no page scroll ---------- */}
      <div
        className={`hidden h-full gap-5 p-5 lg:grid ${
          showQr ? "lg:grid-cols-[280px_minmax(0,1fr)_minmax(360px,420px)]" : "lg:grid-cols-[280px_minmax(0,1fr)]"
        }`}
      >
        <aside className="flex min-h-0 flex-col rounded-3xl border border-ink-200 bg-white p-6 shadow-card">
          <Logo showByline />
          <div className="mt-8 flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-ink-900 text-lg font-semibold text-white">
              {initials(account.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-semibold text-ink-900">{account.name}</p>
              {account.location && <p className="truncate text-sm text-ink-500">{account.location}</p>}
            </div>
          </div>
          <div className="mt-4">
            <StatusPill {...status} />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-ink-50 p-4">
              <p className="text-xs font-medium text-ink-400">Today</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{todayCount}</p>
            </div>
            <div className="rounded-2xl bg-ink-50 p-4">
              <p className="text-xs font-medium text-ink-400">Recent</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900">{entries.length}</p>
            </div>
          </div>

          <p className="mt-8 text-xs font-semibold uppercase tracking-wider text-ink-400">Method</p>
          <div className="mt-2 space-y-2">
            <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5 ring-1 ring-inset ring-brand-200">
              <span className="text-sm font-semibold text-ink-900">QR Code</span>
              <span className="text-[11px] font-semibold text-emerald-700">Active</span>
            </div>
            <button
              type="button"
              onClick={() => setNfcNotice(true)}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 ring-1 ring-inset ring-ink-200 transition hover:bg-ink-50"
            >
              <span className="text-sm font-semibold text-ink-500">NFC</span>
              <span className="text-[11px] font-semibold text-ink-400">Coming soon</span>
            </button>
          </div>
          <div className="mt-3">{nfcBanner}</div>

          <label className="mt-6 flex cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ring-inset ring-ink-200 transition hover:bg-ink-50">
            <span>
              <span className="block text-sm font-semibold text-ink-900">Show QR code</span>
              <span className="block text-xs text-ink-400">Hide it if you use a printed QR</span>
            </span>
            <span className="relative inline-flex shrink-0">
              <input type="checkbox" role="switch" checked={showQr} onChange={toggleQr} className="peer sr-only" />
              <span className="h-6 w-11 rounded-full bg-ink-200 transition peer-checked:bg-brand-600 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-100" />
              <span className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
            </span>
          </label>

          <div className="mt-auto space-y-2 pt-6">
            {canInstall && (
              <Button variant="secondary" block onClick={onInstall}>
                <PlatformLogos />
                Install
              </Button>
            )}
            <Button variant="secondary" block onClick={downloadQr}>
              Download QR to print
            </Button>
            <Button variant="ghost" block loading={regenerating} onClick={() => void newQr()}>
              Generate new QR code
            </Button>
            <Button variant="ghost" block onClick={signOut}>
              Sign out
            </Button>
          </div>
        </aside>

        {showQr && (
        <main className="flex min-h-0 flex-col items-center rounded-3xl border border-ink-200 bg-white p-8 text-center shadow-card">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-600">Scan to share your NIF</p>
          <h1 className="mt-2 max-w-full truncate text-3xl font-semibold tracking-tight text-ink-900 xl:text-4xl">
            {account.name}
          </h1>
          <div className="relative my-5 min-h-0 w-full flex-1">
            <StoreQr storeId={account.storeId} dimmed={!online} />
            {qrOverlay}
          </div>
          <p className="text-lg font-medium text-ink-700">
            Scan this QR code with your NIFPass app to share your NIF.
          </p>
          <p className="mt-1 text-sm text-ink-400">
            Open <span className="font-medium text-ink-600">{host}</span> on your mobile phone and scan this code.
          </p>
          {isLocal && (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">
              You are on localhost. Open this page through your public HTTPS URL so customers&apos; phones can reach it.
            </p>
          )}
        </main>
        )}

        <section className="flex min-h-0 flex-col rounded-3xl border border-ink-200 bg-white p-6 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink-900">Received NIFs</h2>
            <Button
              size="sm"
              variant={confirmClear ? "danger" : "ghost"}
              disabled={entries.length === 0}
              onClick={clearHistory}
            >
              {confirmClear ? "Tap again to clear" : "Clear"}
            </Button>
          </div>
          <div className="mt-4">
            <LatestNif entry={latest} size={showQr ? "normal" : "hero"} />
          </div>
          <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-ink-400">Earlier</p>
          <div className="mt-1 min-h-0 flex-1 overflow-y-auto pr-1">
            <NifHistory entries={earlier} />
          </div>
          <p className="pt-3 text-[11px] text-ink-300">Times in Europe/Lisbon · saved on this device only</p>
        </section>
      </div>

      {/* ---------- Phone / tablet: single screen, no page scroll ---------- */}
      <div className="flex h-full flex-col gap-3 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:hidden">
        <header className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-900 font-semibold text-white">
              {initials(account.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink-900">{account.name}</p>
              <p className="flex items-center gap-1.5 text-xs text-ink-500">
                <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-amber-400"}`} />
                {status.label}
              </p>
            </div>
          </div>
          <div className="relative">
            <Button variant="secondary" size="sm" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen}>
              Menu
            </Button>
            {menuOpen && (
              <div className="absolute right-0 top-11 z-40 w-56 animate-fade-up rounded-2xl border border-ink-200 bg-white p-2 shadow-lift">
                <button type="button" onClick={toggleQr} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink-50">
                  {showQr ? "Hide QR code" : "Show QR code"}
                </button>
                {canInstall && (
                  <button type="button" onClick={onInstall} className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink-50">
                    <PlatformLogos />
                    Install
                  </button>
                )}
                <button type="button" onClick={downloadQr} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink-50">
                  Download QR to print
                </button>
                <button
                  type="button"
                  disabled={regenerating}
                  onClick={() => void newQr()}
                  className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink-50 disabled:text-ink-300"
                >
                  Generate new QR code
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNfcNotice(true);
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink-50"
                >
                  NFC <span className="text-xs text-ink-400">Coming soon</span>
                </button>
                <button
                  type="button"
                  disabled={entries.length === 0}
                  onClick={() => {
                    setEntries([]);
                    setMenuOpen(false);
                  }}
                  className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink-50 disabled:text-ink-300"
                >
                  Clear received NIFs
                </button>
                <button type="button" onClick={signOut} className="w-full rounded-xl px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50">
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {nfcBanner}
        <LatestNif entry={latest} size={showQr ? "compact" : "normal"} />

        {showQr ? (
          <>
            <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center rounded-3xl border border-ink-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">Scan to share your NIF</p>
              <div className="relative mt-2 min-h-0 w-full flex-1">
                <StoreQr storeId={account.storeId} dimmed={!online} />
                {qrOverlay}
              </div>
            </div>

            {earlier.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {earlier.slice(0, 2).map((e) => (
                  <div key={e.id} className="rounded-2xl bg-ink-50 px-3 py-2">
                    <p className="font-mono text-lg font-semibold tabular-nums tracking-wide text-ink-800">{e.nif}</p>
                    <p className="text-[11px] tabular-nums text-ink-400">{formatLisbonTime(e.receivedAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-400">Earlier</p>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <NifHistory entries={earlier} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
