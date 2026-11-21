import { QR_PREFIX, STORE_QUERY_PARAM, isValidStoreId } from "@/shared/protocol";

const LOCAL_HOSTS = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|0\.0\.0\.0)$/i;

export function publicBaseUrl(): { base: string; host: string; isLocal: boolean } {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "");
  const base = configured || window.location.origin;
  const url = new URL(base);
  return { base, host: url.host, isLocal: LOCAL_HOSTS.test(url.hostname) };
}

/**
 * The QR only carries the public store id - never a NIF.
 * A full URL lets a phone's native camera open the customer app directly;
 * localhost origins fall back to a plain identifier the in-app scanner understands.
 */
export function buildQrPayload(storeId: string): string {
  const { base, isLocal } = publicBaseUrl();
  if (isLocal) return `${QR_PREFIX}${storeId}`;
  return `${base}/user?${STORE_QUERY_PARAM}=${encodeURIComponent(storeId)}`;
}

/** Returns the store id encoded in a NIFPass QR code, or null if it is not one. */
export function parseQrPayload(text: string): string | null {
  const value = text.trim();
  if (value.startsWith(QR_PREFIX)) {
    const id = value.slice(QR_PREFIX.length);
    return isValidStoreId(id) ? id : null;
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (!/\/user\/?$/.test(url.pathname)) return null;
    const id = url.searchParams.get(STORE_QUERY_PARAM);
    return isValidStoreId(id) ? id : null;
  } catch {
    return null;
  }
}
