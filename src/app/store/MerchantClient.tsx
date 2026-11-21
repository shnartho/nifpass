"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/Button";

const MerchantApp = dynamic(() => import("@/components/merchant/MerchantApp"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-dvh place-items-center text-ink-400">
      <Spinner className="h-6 w-6" />
    </div>
  ),
});

export default function MerchantClient() {
  return <MerchantApp />;
}
