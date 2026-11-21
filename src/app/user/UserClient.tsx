"use client";

import dynamic from "next/dynamic";
import { Spinner } from "@/components/Button";

const UserApp = dynamic(() => import("@/components/user/UserApp"), {
  ssr: false,
  loading: () => (
    <div className="grid min-h-dvh place-items-center text-ink-400">
      <Spinner className="h-6 w-6" />
    </div>
  ),
});

export default function UserClient() {
  return <UserApp />;
}
