"use client";

import { QRCodeSVG } from "qrcode.react";
import { useMemo } from "react";
import { buildQrPayload } from "@/lib/qrPayload";

/** Fills its container while keeping the QR square. */
export function StoreQr({ storeId, dimmed = false }: { storeId: string; dimmed?: boolean }) {
  const payload = useMemo(() => buildQrPayload(storeId), [storeId]);
  return (
    <QRCodeSVG
      value={payload}
      level="M"
      marginSize={2}
      fgColor="#0b1736"
      bgColor="#ffffff"
      title="NIFPass store QR code"
      className={`h-full w-full transition ${dimmed ? "opacity-30 blur-[2px]" : ""}`}
    />
  );
}
