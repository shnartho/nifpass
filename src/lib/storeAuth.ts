import { api, type ClientResult } from "@/lib/api";
import { normalizeEmail, type StoreAccountInfo } from "@/shared/protocol";

/**
 * Store accounts: email + password are stretched in the browser with PBKDF2 into a
 * 256-bit secret, so the password never leaves the device. The server keeps each store
 * permanently (Vercel Blob), keyed by email, with its QR id, name and location. The QR id
 * only changes when the owner generates a new QR code.
 */

export interface StoreAccount extends StoreAccountInfo {
  secret: string;
  email: string;
}

const ACCOUNT_KEY = "nifpass.store.account";
const LEGACY_PROFILES_KEY = "nifpass.store.profiles";
const PBKDF2_ITERATIONS = 310_000;
export const MIN_PASSWORD_LENGTH = 8;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export { normalizeEmail };

export type Credentials = { email: string; secret: string };

export async function deriveCredentials(email: string, password: string): Promise<Credentials> {
  if (!window.isSecureContext || !crypto?.subtle) {
    throw new Error("Store sign-in requires a secure (HTTPS) connection.");
  }
  const normalized = normalizeEmail(email);
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(`nifpass/store/v1:${normalized}`),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  return { email: normalized, secret: b64url(new Uint8Array(bits)) };
}

type AccountResponse = ClientResult<{ account: StoreAccountInfo }>;

const withCreds = (creds: Credentials, res: AccountResponse): ClientResult<{ account: StoreAccount }> =>
  res.ok ? { ok: true, account: { ...res.account, ...creds } } : res;

export async function signInStore(creds: Credentials) {
  return withCreds(creds, await api<{ account: StoreAccountInfo }>("/api/store/account", creds));
}

export async function registerStore(creds: Credentials, name: string, location: string) {
  return withCreds(creds, await api<{ account: StoreAccountInfo }>("/api/store/account", { ...creds, name, location }, "PUT"));
}

/** Replaces the store's QR code; the old one (and any printed copy) stops working. */
export async function regenerateQr(account: StoreAccount) {
  const creds = { email: account.email, secret: account.secret };
  return withCreds(creds, await api<{ account: StoreAccountInfo }>("/api/store/qr", { ...creds, storeId: account.storeId }));
}

/**
 * Fetches the latest saved details (e.g. a QR replaced on another screen). Screens signed in
 * before the server registry existed are registered with the details kept on this device.
 */
export async function syncAccount(account: StoreAccount) {
  const creds = { email: account.email, secret: account.secret };
  const res = await signInStore(creds);
  if (res.ok || res.code !== "ACCOUNT_NOT_FOUND") return res;
  return registerStore(creds, account.name, account.location);
}

export function loadAccount(): StoreAccount | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    const account = raw ? (JSON.parse(raw) as Partial<StoreAccount>) : null;
    return account?.storeId && account.secret && account.email && account.name ? (account as StoreAccount) : null;
  } catch {
    return null;
  }
}

export function saveAccount(account: StoreAccount) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  localStorage.removeItem(LEGACY_PROFILES_KEY);
}

export function clearAccount() {
  localStorage.removeItem(ACCOUNT_KEY);
}
