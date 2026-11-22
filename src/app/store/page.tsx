import type { Metadata } from "next";
import MerchantClient from "./MerchantClient";

export const metadata: Metadata = {
  title: "NIFPass Store",
  manifest: "/store-app.webmanifest",
  appleWebApp: { capable: true, title: "NIFPass Store", statusBarStyle: "default" },
  icons: { apple: "/icons/store-apple-touch-icon.png" },
};

export default function MerchantPage() {
  return <MerchantClient />;
}
