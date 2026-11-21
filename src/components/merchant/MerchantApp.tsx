"use client";

import { QRCodeCanvas } from "qrcode.react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Spinner } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { StatusPill, type StatusTone } from "@/components/StatusPill";
import { friendlyError } from "@/lib/errors";
import { formatLisbonDay, formatLisbonTime } from "@/lib/format";
import { buildQrPayload, publicBaseUrl } from "@/lib/qrPayload";
import { REQUEST_TIMEOUT_MS, getSocket } from "@/lib/socket";
import { clearAccount, loadAccount, saveAccount, type StoreAccount } from "@/lib/storeAuth";
import { useConnectionStatus } from "@/lib/useConnectionStatus";
import type { NifEntry } from "@/shared/protocol";
import { LatestNif, NifHistory } from "./NifFeed";
import { NifToasts } from "./NifToasts";
import { StoreAuth } from "./StoreAuth";
import { StoreQr } from "./StoreQr";

type OpenState = "opening" | "open" | "error";

// Stores with a printed QR at the counter can hide the on-screen one.
const SHOW_QR_KEY = "nifpass.store.showQr";

const mergeEntries = (current: NifEntry[], incoming: NifEntry[]) => {
  const byId = new Map(current.map((e) => [e.id, e]));
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => b.receivedAt - a.receivedAt);
};

function downloadPoster(qr: HTMLCanvasElement, storeName: string) {
  const W = 1240;
  const H = 1754;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = "center";
  ctx.fillStyle = "#5640e6";
  ctx.font = "600 44px system-ui, sans-serif";
  ctx.fillText("NIFPass", W / 2, 150);
  ctx.fillStyle = "#0b1736";
  ctx.font = "700 76px system-ui, sans-serif";
  ctx.fillText(storeName, W / 2, 270, W - 120);
  ctx.drawImage(qr, (W - 900) / 2, 360, 900, 900);
  ctx.font = "600 52px system-ui, sans-serif";
  ctx.fillText("Scan to share your NIF", W / 2, 1380);
  ctx.fillStyle = "#5b6584";
  ctx.font = "400 36px system-ui, sans-serif";
  ctx.fillText("No need to say it out loud.", W / 2, 1450);
  ctx.font = "400 28px system-ui, sans-serif";
  ctx.fillText("NIFPass by GoGentik", W / 2, 1660);
  const link = document.createElement("a");
  link.download = `nifpass-qr-${storeName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
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

  const signIn = (a: StoreAccount) => {
    saveAccount(a);
    setAccount(a);
  };

  if (!account) return <StoreAuth onSignedIn={signIn} />;
  return (
    <StoreDashboard
      key={account.storeId}
      account={account}
      onSignOut={() => {
        clearAccount();
        setAccount(null);
      }}
    />
  );
}

function StoreDashboard({ account, onSignOut }: { account: StoreAccount; onSignOut: () => void }) {
  const socket = useMemo(getSocket, []);
  const connection = useConnectionStatus(socket);
  const [openState, setOpenState] = useState<OpenState>("opening");
  const [openError, setOpenError] = useState<string | null>(null);
  const [entries, setEntries] = useState<NifEntry[]>([]);
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
  const { host, isLocal } = useMemo(() => publicBaseUrl(), []);
  const qrPayload = useMemo(() => buildQrPayload(account.storeId), [account.storeId]);

  const dismissToast = useCallback((id: string) => setToasts((cur) => cur.filter((t) => t.id !== id)), []);

  const openStore = useCallback(async () => {
    setOpenState("opening");
    try {
      const res = await socket
        .timeout(REQUEST_TIMEOUT_MS)
        .emitWithAck("store:open", { storeId: account.storeId, secret: account.secret, name: account.name });
      if (res.ok) {
        setEntries((cur) => mergeEntries(cur, res.entries));
        setOpenState("open");
        setOpenError(null);
      } else {
        setOpenState("error");
        setOpenError(friendlyError(res.code).message);
      }
    } catch {
      // Retried automatically on the next "connect".
    }
  }, [socket, account]);

  useEffect(() => {
    const onNif = (entry: NifEntry, ack: (received: boolean) => void) => {
      ack(true);
      setEntries((cur) => mergeEntries(cur, [entry]));
      setToasts([entry]);
    };
    const onConnect = () => void openStore();
    socket.on("store:nif", onNif);
    socket.on("connect", onConnect);
    if (socket.connected) void openStore();
    return () => {
      socket.off("store:nif", onNif);
      socket.off("connect", onConnect);
    };
  }, [socket, openStore]);

  useEffect(() => {
    if (!confirmClear) return;
    const t = setTimeout(() => setConfirmClear(false), 3000);
    return () => clearTimeout(t);
  }, [confirmClear]);

  const clearHistory = () => {
    if (!confirmClear) return setConfirmClear(true);
    setConfirmClear(false);
    setEntries([]);
    socket.emit("store:clear", () => {});
  };

  const signOut = () => {
    if (!window.confirm("Sign out? This screen will stop receiving NIFs until you sign in again.")) return;
    socket.emit("store:close");
    onSignOut();
  };

  const downloadQr = () => {
    if (posterRef.current) downloadPoster(posterRef.current, account.name);
    setMenuOpen(false);
  };

  const online = connection === "connected" && openState === "open";
  const status = ((): { tone: StatusTone; label: string; pulse?: boolean } => {
    if (connection !== "connected") return { tone: "warning", label: "Reconnecting…", pulse: true };
    if (openState === "open") return { tone: "success", label: "Open · receiving NIFs", pulse: true };
    if (openState === "error") return { tone: "danger", label: "Not connected" };
    return { tone: "neutral", label: "Connecting…" };
  })();

  const latest = entries[0] ?? null;
  const earlier = entries.slice(1);
  const today = formatLisbonDay(Date.now());
  const todayCount = entries.filter((e) => formatLisbonDay(e.receivedAt) === today).length;

  const qrOverlay = !online && (
    <div className="absolute inset-0 grid place-items-center">
      <span className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-ink-700 shadow-card">
        {openState === "error" ? openError : <><Spinner /> Connecting…</>}
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
      <QRCodeCanvas ref={posterRef} value={qrPayload} size={900} level="M" marginSize={2} className="hidden" />

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
            <Button variant="secondary" block onClick={downloadQr}>
              Download QR to print
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
            Open <span className="font-medium text-ink-600">{host}/user</span> on your mobile phone and scan this code.
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
          <p className="pt-3 text-[11px] text-ink-300">Times in Europe/Lisbon · kept in temporary memory only</p>
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
                <button type="button" onClick={downloadQr} className="w-full rounded-xl px-3 py-2.5 text-left text-sm hover:bg-ink-50">
                  Download QR to print
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
                    socket.emit("store:clear", () => {});
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
