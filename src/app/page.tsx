import type { Metadata } from "next";
import UserClient from "./UserClient";

export const metadata: Metadata = {
  title: "NIFPass · Your NIF. One scan. Done.",
};

export default function HomePage() {
  return <UserClient />;
}
