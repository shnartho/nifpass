import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "NIFPass by GoGentik",
  description: "Share your Portuguese NIF with stores quickly and securely.",
  robots: { index: false, follow: false },
  applicationName: "NIFPass",
  appleWebApp: { capable: true, title: "NIFPass", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

// Browsers can fire this before the app has loaded, so keep it for the install button.
const captureInstallPrompt = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__nifpassInstall=e;});`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: captureInstallPrompt }} />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
