import type { Metadata } from "next";
import UserClient from "../UserClient";

export const metadata: Metadata = {
  title: "NIFPass · Your NIF. One scan. Done.",
};

/** Start page of the installed NIFPass app; scoped here so it doesn't overlap the NIFPass Store app. */
export default function InstalledAppPage() {
  return <UserClient />;
}
