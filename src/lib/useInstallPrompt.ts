"use client";

import { useCallback, useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

declare global {
  interface Window {
    __nifpassInstall?: BeforeInstallPromptEvent;
  }
}

/**
 * "Add to Home Screen" support. Android/Chromium offer a native install prompt;
 * iOS has none, so callers show manual steps (Share → Add to Home Screen) instead.
 */
export function useInstallPrompt() {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(() => window.__nifpassInstall ?? null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true,
  );

  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isMobile = isIos || /Android|Mobi/i.test(ua);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  /** Returns false when the browser has no native prompt and manual steps should be shown. */
  const install = useCallback(async () => {
    if (!promptEvent) return false;
    await promptEvent.prompt();
    const { outcome } = await promptEvent.userChoice;
    if (outcome === "accepted") setInstalled(true);
    window.__nifpassInstall = undefined;
    setPromptEvent(null);
    return true;
  }, [promptEvent]);

  return { canInstall: isMobile && !installed, isIos, install };
}
