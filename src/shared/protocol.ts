// Shared contract between NIFPass browsers and the Vercel API routes.

export const QR_PREFIX = "NIFPASS:";
export const STORE_QUERY_PARAM = "s";
export const STORE_NAME_MAX = 60;
/** Stores registered before the account registry used base64url(SHA-256(prefix + secret)) as their QR id. */
export const STORE_ID_HASH_PREFIX = "nifpass-store-id:v1:";
export const NIF_EVENT = "nif";
/** Sent to a store's old channel when the owner generates a new QR, so its other screens switch over. */
export const QR_REPLACED_EVENT = "qr-replaced";

/** 22 base64url chars (132 bits), random or legacy-derived. */
export const STORE_ID_RE = /^[A-Za-z0-9_-]{22}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const EMAIL_MAX = 254;
/** 32 bytes as base64url. */
export const STORE_SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
export const NIF_RE = /^\d{9}$/;

/** Each store has one private realtime channel; only its signed-in screens may subscribe. */
export const storeChannel = (storeId: string) => `nifpass:store:${storeId}`;

export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_NIF"
  | "STORE_OFFLINE"
  | "DELIVERY_FAILED"
  | "UNAUTHORIZED"
  | "ACCOUNT_NOT_FOUND"
  | "WRONG_PASSWORD"
  | "EMAIL_TAKEN"
  | "QR_REPLACED"
  | "RATE_LIMITED"
  | "SERVER_BUSY";

export type ApiResult<T extends object = object> = ({ ok: true } & T) | { ok: false; code: ErrorCode };

export interface NifEntry {
  id: string;
  nif: string;
  /** Epoch milliseconds, assigned by the server. */
  receivedAt: number;
}

export interface StorePresence {
  name: string;
}

/** Public store details kept server-side so the same login works on any device. */
export interface StoreProfile {
  name: string;
  location: string;
}

/** What the server returns about a signed-in store. */
export interface StoreAccountInfo extends StoreProfile {
  storeId: string;
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && value.length <= EMAIL_MAX && EMAIL_RE.test(value);
}

export const STORE_LOCATION_MAX = 80;

export function sanitizeLocation(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, STORE_LOCATION_MAX);
}

export interface StoreTokenRequestBody {
  email: string;
  secret: string;
  storeId: string;
}

export function isValidNif(value: unknown): value is string {
  return typeof value === "string" && NIF_RE.test(value);
}

export function isValidStoreId(value: unknown): value is string {
  return typeof value === "string" && STORE_ID_RE.test(value);
}

export function isValidStoreSecret(value: unknown): value is string {
  return typeof value === "string" && STORE_SECRET_RE.test(value);
}

export function sanitizeStoreName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return name.length > 0 && name.length <= STORE_NAME_MAX ? name : null;
}
