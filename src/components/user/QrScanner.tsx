"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";
import { Spinner } from "@/components/Button";

export type CameraErrorKind = "denied" | "unavailable" | "insecure" | "failed";

interface QrScannerProps {
  /** Return true to stop scanning, false to keep scanning (e.g. unrecognised QR). */
  onResult: (text: string) => boolean;
  onError: (kind: CameraErrorKind) => void;
}

function classify(err: unknown): CameraErrorKind {
  const e = err as { name?: string; message?: string } | string | undefined;
  const text = typeof e === "string" ? e : `${e?.name ?? ""} ${e?.message ?? ""}`;
  if (/NotAllowed|Permission|denied/i.test(text)) return "denied";
  if (/NotFound|NotReadable|OverconstrainedError|no camera|device not found|Could not start video/i.test(text)) {
    return "unavailable";
  }
  return "failed";
}

export function QrScanner({ onResult, onError }: QrScannerProps) {
  const elementId = `qr-reader-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const [ready, setReady] = useState(false);
  const onResultRef = useRef(onResult);
  const onErrorRef = useRef(onError);
  const doneRef = useRef(false);

  useEffect(() => {
    onResultRef.current = onResult;
    onErrorRef.current = onError;
  });

  useEffect(() => {
    let cancelled = false;
    let scanner: Html5Qrcode | null = null;
    let started: Promise<unknown> | null = null;

    const stop = async () => {
      try {
        if (scanner?.isScanning) await scanner.stop();
        scanner?.clear();
      } catch {
        // Already stopped.
      }
    };

    (async () => {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        onErrorRef.current("insecure");
        return;
      }
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import("html5-qrcode");
      if (cancelled) return;
      scanner = new Html5Qrcode(elementId, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      });
      started = scanner.start(
        { facingMode: "environment" },
        { fps: 12, disableFlip: true },
        (text) => {
          if (doneRef.current) return;
          if (onResultRef.current(text)) {
            doneRef.current = true;
            void stop();
          }
        },
        () => {},
      );
      try {
        await started;
        if (cancelled) await stop();
        else setReady(true);
      } catch (err) {
        if (!cancelled) onErrorRef.current(classify(err));
      }
    })();

    return () => {
      cancelled = true;
      if (started) started.then(stop, () => {});
      else void stop();
    };
  }, [elementId]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-3xl bg-ink-950 shadow-lift">
      <div id={elementId} className="qr-reader absolute inset-0" />

      {!ready && (
        <div className="absolute inset-0 grid place-items-center text-ink-300">
          <div className="flex flex-col items-center gap-3 text-sm">
            <Spinner className="h-6 w-6" />
            Starting camera…
            <span className="text-xs text-ink-400">Allow camera access if your browser asks.</span>
          </div>
        </div>
      )}

      {ready && (
        <div className="pointer-events-none absolute inset-[14%]">
          {["left-0 top-0 border-l-4 border-t-4 rounded-tl-2xl", "right-0 top-0 border-r-4 border-t-4 rounded-tr-2xl", "left-0 bottom-0 border-l-4 border-b-4 rounded-bl-2xl", "right-0 bottom-0 border-r-4 border-b-4 rounded-br-2xl"].map(
            (c) => (
              <span key={c} className={`absolute h-10 w-10 border-white ${c}`} />
            ),
          )}
          <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-brand-400 shadow-[0_0_12px_2px_rgb(130_121_251/0.8)] animate-scan-line" />
        </div>
      )}
    </div>
  );
}
