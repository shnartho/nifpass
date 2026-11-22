"use client";

import { Button } from "@/components/Button";

function ShareIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="inline h-5 w-5 align-text-bottom text-brand-600" aria-label="Share">
      <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 11H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

/** Manual "Add to Home Screen" steps for browsers without a native install prompt (e.g. iPhone). */
export function InstallSheet({
  isIos,
  onClose,
  appName = "NIFPass",
  iconSrc = "/icons/icon-192.png",
}: {
  isIos: boolean;
  onClose: () => void;
  appName?: string;
  iconSrc?: string;
}) {
  const steps = isIos
    ? [
        <>Tap <ShareIcon /> <b>Share</b> in the browser bar</>,
        <>Scroll and tap <b>Add to Home Screen</b></>,
        <>Tap <b>Add</b>. {appName} appears like an app.</>,
      ]
    : [
        <>Open the browser menu <b>⋮</b></>,
        <>Tap <b>Add to Home screen</b> or <b>Install app</b></>,
        <>Confirm. {appName} appears like an app.</>,
      ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/40 p-3" onClick={onClose} role="dialog" aria-modal>
      <div
        className="w-full max-w-md animate-fade-up rounded-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={iconSrc} alt="" className="h-12 w-12 rounded-xl" />
          <div>
            <p className="font-semibold text-ink-900">Add {appName} to your Home Screen</p>
            <p className="text-sm text-ink-500">Open it in one tap, like an app.</p>
          </div>
        </div>
        <ol className="mt-5 space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-3 text-sm text-ink-700">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
        <Button className="mt-6" size="lg" block onClick={onClose}>
          Got it
        </Button>
      </div>
    </div>
  );
}
