import type { Metadata } from "next";
import MerchantClient from "./MerchantClient";

export const metadata: Metadata = {
  title: "Store · NIFPass by GoGentik",
};

export default function MerchantPage() {
  return <MerchantClient />;
}
