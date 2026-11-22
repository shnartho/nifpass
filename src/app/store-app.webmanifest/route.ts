import type { MetadataRoute } from "next";

export const dynamic = "force-static";

/** Separate installable app for store owners; opens straight into the signed-in dashboard. */
export function GET() {
  const manifest: MetadataRoute.Manifest = {
    id: "/store",
    name: "NIFPass Store",
    short_name: "NIFPass Store",
    description: "Receive customer NIFs instantly at your counter.",
    start_url: "/store",
    scope: "/store",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0b1736",
    icons: [
      { src: "/icons/store-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/store-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/store-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return Response.json(manifest, { headers: { "Content-Type": "application/manifest+json" } });
}
