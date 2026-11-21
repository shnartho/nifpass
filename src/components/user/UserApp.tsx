"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Spinner } from "@/components/Button";
import { Logo } from "@/components/Logo";
import { api } from "@/lib/api";
import { friendlyError, type ClientErrorCode, type FriendlyError } from "@/lib/errors";
import { formatLisbonDateTime, groupNif } from "@/lib/format";
import { parseQrPayload } from "@/lib/qrPayload";
import { useOnline } from "@/lib/useOnline";
import { STORE_QUERY_PARAM, isValidNif, isValidStoreId } from "@/shared/protocol";
import { NifForm } from "./NifForm";
import { QrScanner, type CameraErrorKind } from "./QrScanner";

type Screen = "home" | "nif" | "scan" | "connecting" | "confirm" | "sharing" | "success" | "error";

interface StoreLink {
  storeId: string;
  storeName: string;
  online: boolean;
}

interface ScreenError extends FriendlyError {
  retry: "scan" | "share";
}

const NIF_STORAGE_KEY = "nifpass.customer.nif";
const AUTO_SHARE_STORAGE_KEY = "nifpass.customer.autoShare";
const PRIVACY_MESSAGE =
  "Your NIF is shared only after your confirmation. This demonstration does not permanently store your NIF.";

const cameraErrors: Record<CameraErrorKind, FriendlyError> = {
  denied: {
    title: "Camera access denied",
    message: "NIFPass needs your camera to scan the store's QR code. Allow camera access in your browser settings and try again.",
  },
  unavailable: {
    title: "Camera unavailable",
    message: "We couldn't find or start a camera on this device. Close other apps using the camera and try again.",
  },
  insecure: {
    title: "Secure connection required",
    message: "Your browser only allows camera access on secure (HTTPS) pages. Open NIFPass through its HTTPS address.",
  },
  failed: {
    title: "Camera problem",
    message: "We couldn't start the camera. Please try again.",
  },
};

export default function UserApp() {
  const isOnline = useOnline();

  const [screen, setScreenState] = useState<Screen>("home");
  const [nif, setNifState] = useState<string | null>(null);
  const [autoShare, setAutoShareState] = useState(false);
  const [nifNotice, setNifNotice] = useState<string | null>(null);
  const [merchant, setMerchantState] = useState<StoreLink | null>(null);
  const [error, setError] = useState<ScreenError | null>(null);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const [sharedAt, setSharedAt] = useState<number | null>(null);
  const [sharedWith, setSharedWith] = useState<string | null>(null);

  // Refs mirror state to block duplicate requests.
  const screenRef = useRef<Screen>("home");
  const merchantRef = useRef<StoreLink | null>(null);
  const pendingRef = useRef<{ type: "scan" } | { type: "join"; storeId: string } | null>(null);
  const busyRef = useRef(false);
  const nifRef = useRef<string | null>(null);
  const autoShareRef = useRef(false);

  const setPrefs = useCallback((value: string | null, auto: boolean) => {
    nifRef.current = value;
    autoShareRef.current = auto;
    setNifState(value);
    setAutoShareState(auto);
  }, []);

  const setScreen = useCallback((s: Screen) => {
    screenRef.current = s;
    setScreenState(s);
    window.scrollTo({ top: 0 });
  }, []);
  const setMerchant = useCallback((m: StoreLink | null) => {
    merchantRef.current = m;
    setMerchantState(m);
  }, []);

  const leaveMerchant = useCallback(() => setMerchant(null), [setMerchant]);

  const showError = useCallback(
    (err: FriendlyError, retry: ScreenError["retry"]) => {
      setError({ ...err, retry });
      setScreen("error");
    },
    [setScreen],
  );

  const showCodeError = useCallback(
    (code: ClientErrorCode) => {
      const retry: ScreenError["retry"] =
        code === "DELIVERY_FAILED" || code === "RATE_LIMITED" || code === "TIMEOUT" ? "share" : "scan";
      if (retry === "scan") leaveMerchant();
      showError(friendlyError(code), merchantRef.current ? retry : "scan");
    },
    [leaveMerchant, showError],
  );

  const join = useCallback(
    (storeId: string) => api<{ storeName: string }>(`/api/stores/${encodeURIComponent(storeId)}`),
    [],
  );

  /** Sends the NIF to the scanned store. Callers own busyRef. */
  const deliver = useCallback(
    async (m: StoreLink, value: string) => {
      const res = await api<{ receivedAt: number; storeName: string }>("/api/share", { storeId: m.storeId, nif: value });
      if (res.ok) {
        setSharedAt(res.receivedAt);
        setSharedWith(res.storeName);
        leaveMerchant();
        setScreen("success");
      } else {
        showCodeError(res.code);
      }
    },
    [leaveMerchant, setScreen, showCodeError],
  );

  const connectToMerchant = useCallback(
    async (storeId: string) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setScreen("connecting");
      try {
        const res = await join(storeId);
        if (res.ok) {
          const link = { storeId, storeName: res.storeName, online: true };
          setMerchant(link);
          const value = nifRef.current;
          // The customer consented once to automatic sharing when saving their NIF.
          if (autoShareRef.current && value) await deliver(link, value);
          else setScreen("confirm");
        } else {
          showCodeError(res.code);
        }
      } catch {
        showCodeError("TIMEOUT");
      } finally {
        busyRef.current = false;
      }
    },
    [join, deliver, setMerchant, setScreen, showCodeError],
  );

  const share = useCallback(async () => {
    const m = merchantRef.current;
    const value = nifRef.current;
    if (!m || !value || busyRef.current || screenRef.current !== "confirm") return;
    busyRef.current = true;
    setScreen("sharing");
    try {
      await deliver(m, value);
    } catch {
      showCodeError("TIMEOUT");
    } finally {
      busyRef.current = false;
    }
  }, [deliver, setScreen, showCodeError]);

  const startScan = useCallback(() => {
    leaveMerchant();
    setScanHint(null);
    if (!nif) {
      pendingRef.current = { type: "scan" };
      setNifNotice("Enter your NIF before scanning a store's QR code.");
      setScreen("nif");
      return;
    }
    setScreen("scan");
  }, [nif, leaveMerchant, setScreen]);

  const saveNif = (value: string, auto: boolean) => {
    sessionStorage.setItem(NIF_STORAGE_KEY, value);
    sessionStorage.setItem(AUTO_SHARE_STORAGE_KEY, String(auto));
    setPrefs(value, auto);
    setNifNotice(null);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (pending?.type === "scan") setScreen("scan");
    else if (pending?.type === "join") void connectToMerchant(pending.storeId);
    else setScreen("home");
  };

  const onScanResult = (text: string) => {
    const storeId = parseQrPayload(text);
    if (!storeId) {
      setScanHint("This isn't a NIFPass store QR code. Point your camera at the code on the store's screen.");
      return false;
    }
    void connectToMerchant(storeId);
    return true;
  };

  // Load the saved NIF and handle QR links opened with the phone's native camera.
  useEffect(() => {
    const stored = sessionStorage.getItem(NIF_STORAGE_KEY);
    const savedNif = isValidNif(stored) ? stored : null;
    setPrefs(savedNif, !!savedNif && sessionStorage.getItem(AUTO_SHARE_STORAGE_KEY) === "true");

    const params = new URLSearchParams(window.location.search);
    const linked = params.get(STORE_QUERY_PARAM);
    if (linked === null) return;
    window.history.replaceState(null, "", window.location.pathname);
    if (!isValidStoreId(linked)) {
      showError(
        { title: "Invalid QR code", message: "This link isn't a valid NIFPass store code. Please scan again." },
        "scan",
      );
      return;
    }
    if (savedNif) {
      void connectToMerchant(linked);
    } else {
      pendingRef.current = { type: "join", storeId: linked };
      setNifNotice("Enter your NIF to connect to the store.");
      setScreen("nif");
    }
    // Run once on mount.
  }, []);

  const goHome = () => {
    leaveMerchant();
    setScreen("home");
  };

  return (
    <div className="flex min-h-dvh justify-center bg-ink-50 sm:py-8">
      <div className="relative flex min-h-dvh w-full max-w-md flex-col bg-white sm:min-h-[760px] sm:rounded-[2rem] sm:shadow-card sm:ring-1 sm:ring-ink-100">
        <header className="flex items-center justify-between gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
          <button type="button" onClick={goHome} className="rounded-xl" aria-label="NIFPass home">
            <Logo size="sm" />
          </button>
          <span className="flex items-center gap-2 text-xs font-medium text-ink-500">
            <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-emerald-500" : "bg-rose-500"}`} />
            {isOnline ? "Online" : "Offline"}
          </span>
        </header>

        {!isOnline && (
          <div className="mx-5 mt-2 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
            <Spinner /> No internet connection. Waiting…
          </div>
        )}

        <main
          key={screen}
          className="flex flex-1 animate-fade-up flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4"
        >
          {screen === "home" && (
            <HomeScreen nif={nif} autoShare={autoShare} onEditNif={() => setScreen("nif")} onScan={startScan} />
          )}

          {screen === "nif" && (
            <NifForm
              initialValue={nif ?? ""}
              initialAutoShare={autoShare}
              notice={nifNotice}
              onSave={saveNif}
              onBack={() => {
                pendingRef.current = null;
                setNifNotice(null);
                setScreen("home");
              }}
            />
          )}

          {screen === "scan" && (
            <div className="flex flex-1 flex-col">
              <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Scan Store QR</h1>
              <p className="mt-1 text-ink-500">Point your camera at the QR code at the store.</p>
              <div className="mt-5">
                <QrScanner onResult={onScanResult} onError={(kind) => showError(cameraErrors[kind], "scan")} />
              </div>
              <p
                className={`mt-4 min-h-10 text-center text-sm ${scanHint ? "text-rose-600" : "text-ink-400"}`}
                role="status"
              >
                {scanHint ?? "Scanning…"}
              </p>
              <div className="mt-auto pt-6">
                <Button variant="secondary" size="lg" block onClick={goHome}>
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {screen === "connecting" && (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-brand-50 text-brand-600">
                <Spinner className="h-7 w-7" />
              </span>
              <h1 className="mt-6 text-xl font-semibold text-ink-900">
                {autoShare ? "Sharing your NIF…" : "Connecting to the store…"}
              </h1>
              <p className="mt-1 text-ink-500">
                {autoShare ? "Sending it securely to the store." : "Establishing a secure connection."}
              </p>
            </div>
          )}

          {(screen === "confirm" || screen === "sharing") && nif && (
            <ConfirmScreen
              nif={nif}
              storeName={merchant?.storeName ?? ""}
              merchantOnline={merchant?.online ?? false}
              online={isOnline}
              sharing={screen === "sharing"}
              onConfirm={share}
              onCancel={goHome}
            />
          )}

          {screen === "success" && (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <span className="grid h-20 w-20 animate-pop place-items-center rounded-full bg-emerald-500 text-white shadow-[0_18px_40px_-16px_rgb(16_185_129/0.7)]">
                  <svg viewBox="0 0 24 24" fill="none" className="h-10 w-10" aria-hidden>
                    <path d="m5 12.5 4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <h1 className="mt-8 text-2xl font-semibold tracking-tight text-ink-900" role="status">
                  Your NIF has been shared successfully.
                </h1>
                <p className="mt-2 text-ink-500">
                  Your NIF was sent to{" "}
                  <span className="font-semibold text-ink-900">{sharedWith ?? "the store"}</span>.
                </p>
                {sharedAt && (
                  <p className="mt-6 rounded-full bg-ink-50 px-4 py-1.5 text-sm tabular-nums text-ink-500">
                    {formatLisbonDateTime(sharedAt)}
                  </p>
                )}
                {autoShare && (
                  <p className="mt-4 max-w-xs text-xs text-ink-400">
                    Shared automatically. You can turn this off anytime in My NIF.
                  </p>
                )}
              </div>
              <div className="space-y-3 pt-6">
                <Button size="lg" block onClick={startScan}>
                  Scan another store QR
                </Button>
                <Button variant="ghost" size="lg" block onClick={goHome}>
                  Done
                </Button>
              </div>
            </div>
          )}

          {screen === "error" && error && (
            <div className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <span className="grid h-16 w-16 animate-pop place-items-center rounded-full bg-rose-50 text-rose-600">
                  <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" aria-hidden>
                    <path d="M12 8v5m0 3.5v.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
                    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </span>
                <h1 className="mt-6 text-xl font-semibold text-ink-900" role="alert">
                  {error.title}
                </h1>
                <p className="mt-2 max-w-xs text-ink-500">{error.message}</p>
              </div>
              <div className="space-y-3 pt-6">
                {error.retry === "share" && merchantRef.current ? (
                  <Button size="lg" block onClick={() => setScreen("confirm")}>
                    Try again
                  </Button>
                ) : (
                  <Button size="lg" block onClick={startScan}>
                    Scan store QR
                  </Button>
                )}
                <Button variant="ghost" size="lg" block onClick={goHome}>
                  Back to home
                </Button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function HomeScreen({
  nif,
  autoShare,
  onEditNif,
  onScan,
}: {
  nif: string | null;
  autoShare: boolean;
  onEditNif: () => void;
  onScan: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="pt-6">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">NIFPass</p>
        <h1 className="mt-3 text-[2rem] font-semibold leading-tight tracking-tight text-ink-900">
          Your NIF. One scan. Done.
        </h1>
        <p className="mt-3 text-ink-500">Share your Portuguese NIF with stores quickly and securely.</p>
      </div>

      <div className="mt-8 space-y-3">
        <button
          type="button"
          onClick={onEditNif}
          className="flex w-full items-center gap-4 rounded-3xl border border-ink-200 bg-white p-5 text-left shadow-card transition active:scale-[0.99]"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
              <path d="M7 10h4M7 14h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-ink-900">My NIF</span>
            <span className={`block truncate ${nif ? "font-mono tracking-wider text-ink-700" : "text-sm text-ink-400"}`}>
              {nif ? groupNif(nif) : "Add your NIF to get started"}
            </span>
            {nif && (
              <span className="mt-1 block text-xs font-medium text-ink-400">
                {autoShare ? "Auto-share on: no confirmation needed" : "Ask me before each share"}
              </span>
            )}
          </span>
          <span className="text-sm font-medium text-brand-600">{nif ? "Edit" : "Add"}</span>
        </button>

        <button
          type="button"
          onClick={onScan}
          className="flex w-full items-center gap-4 rounded-3xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-left text-white shadow-lift transition active:scale-[0.99]"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15">
            <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6" aria-hidden>
              <path
                d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="flex-1">
            <span className="block font-semibold">Scan Store QR</span>
            <span className="block text-sm text-white/75">Share your NIF in one tap</span>
          </span>
          <span aria-hidden>→</span>
        </button>
      </div>

      <p className="mt-auto flex gap-2 pt-10 text-xs leading-relaxed text-ink-400">
        <LockIcon />
        {PRIVACY_MESSAGE}
      </p>
      <p className="mt-3 text-center text-[11px] text-ink-300">NIFPass by GoGentik</p>
    </div>
  );
}

function ConfirmScreen({
  nif,
  storeName,
  merchantOnline,
  online,
  sharing,
  onConfirm,
  onCancel,
}: {
  nif: string;
  storeName: string;
  merchantOnline: boolean;
  online: boolean;
  sharing: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ready = merchantOnline && online;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex justify-center pt-2">
        {ready ? (
          <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
            <span className="h-2 w-2 rounded-full bg-emerald-500" /> Connected to store
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
            <Spinner className="h-3 w-3" /> {online ? "Store disconnected. Waiting…" : "Reconnecting…"}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-ink-900">Share your NIF?</h1>
        <p className="mt-2 text-ink-500">
          <span className="font-semibold text-ink-900">{storeName}</span> will receive the NIF below.
        </p>
        <div className="mt-8 w-full rounded-3xl border border-ink-200 bg-ink-50/60 px-6 py-7">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">Your NIF</p>
          <p className="mt-2 font-mono text-4xl font-semibold tabular-nums tracking-wider text-ink-900">{groupNif(nif)}</p>
        </div>
      </div>

      <p className="flex gap-2 pb-5 text-xs leading-relaxed text-ink-400">
        <LockIcon />
        {PRIVACY_MESSAGE}
      </p>
      <div className="space-y-3">
        <Button size="lg" block onClick={onConfirm} loading={sharing} disabled={!ready}>
          {sharing ? "Sharing…" : "Confirm and Share"}
        </Button>
        <Button variant="secondary" size="lg" block onClick={onCancel} disabled={sharing}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden>
      <rect x="5" y="10" width="14" height="10" rx="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
