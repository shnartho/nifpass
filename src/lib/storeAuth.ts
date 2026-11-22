import { api } from "@/lib/api";
import { STORE_ID_HASH_PREFIX, type StoreProfile } from "@/shared/protocol";

/**
 * Store accounts without a database: email + password are stretched with PBKDF2
 * into a 256-bit secret. The public store id (in the QR) is a hash of that secret,
 * so the same credentials give the same permanent QR on any device, and only
 * someone who knows the password can receive that store's NIFs.
 */

export interface StoreAccount {
  storeId: string;
  secret: string;
  email: string;
  name: string;
  location: string;
}

const ACCOUNT_KEY = "nifpass.store.account";
const PROFILES_KEY = "nifpass.store.profiles";
const PBKDF2_ITERATIONS = 310_000;
export const MIN_PASSWORD_LENGTH = 8;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function deriveStoreCredentials(email: string, password: string) {
  if (!window.isSecureContext || !crypto?.subtle) {
    throw new Error("Store sign-in requires a secure (HTTPS) connection.");
  }
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(`nifpass/store/v1:${normalizeEmail(email)}`),
      iterations: PBKDF2_ITERATIONS,
    },
    key,
    256,
  );
  const secret = b64url(new Uint8Array(bits));
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(STORE_ID_HASH_PREFIX + secret));
  const storeId = b64url(new Uint8Array(digest)).slice(0, 22);
  return { storeId, secret };
}

function readProfiles(): Record<string, StoreProfile> {
  try {
    return JSON.parse(localStorage.getItem(PROFILES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function getSavedProfile(storeId: string): StoreProfile | null {
  return readProfiles()[storeId] ?? null;
}

export function loadAccount(): StoreAccount | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    return raw ? (JSON.parse(raw) as StoreAccount) : null;
  } catch {
    return null;
  }
}

export function saveAccount(account: StoreAccount) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  const profiles = readProfiles();
  profiles[account.storeId] = { name: account.name, location: account.location };
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function clearAccount() {
  localStorage.removeItem(ACCOUNT_KEY);
}

type Creds = { storeId: string; secret: string };

/** The store's profile saved on the server, or null if none (or unreachable). */
export async function fetchRemoteProfile(creds: Creds): Promise<StoreProfile | null> {
  const res = await api<{ profile: StoreProfile | null }>("/api/store/profile", creds);
  return res.ok ? res.profile : null;
}

/** Best effort: lets the same email + password open this store on other devices. */
export async function saveRemoteProfile(account: StoreAccount): Promise<void> {
  await fetch("/api/store/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storeId: account.storeId,
      secret: account.secret,
      name: account.name,
      location: account.location,
    }),
  }).catch(() => {});
}
