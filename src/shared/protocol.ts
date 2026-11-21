// Shared contract between the NIFPass browser clients and the realtime server.

export const QR_PREFIX = "NIFPASS:";
export const STORE_QUERY_PARAM = "s";
export const STORE_NAME_MAX = 60;
/** The public store id is derived from the secret, so the server can verify ownership without a database. */
export const STORE_ID_HASH_PREFIX = "nifpass-store-id:v1:";

/** First 22 chars of base64url(SHA-256(prefix + secret)). */
export const STORE_ID_RE = /^[A-Za-z0-9_-]{22}$/;
/** 32 bytes as base64url. */
export const STORE_SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
export const NIF_RE = /^\d{9}$/;

export type ErrorCode =
  | "INVALID_REQUEST"
  | "INVALID_NIF"
  | "STORE_OFFLINE"
  | "NOT_JOINED"
  | "DELIVERY_FAILED"
  | "DUPLICATE_REQUEST"
  | "UNAUTHORIZED"
  | "RATE_LIMITED"
  | "SERVER_BUSY";

export type Ack<T extends object = object> = ({ ok: true } & T) | { ok: false; code: ErrorCode };

export interface NifEntry {
  id: string;
  nif: string;
  /** Epoch milliseconds, assigned by the server. */
  receivedAt: number;
}

export interface StoreOpenRequest {
  storeId: string;
  secret: string;
  name: string;
}

export interface StoreStatus {
  storeId: string;
  online: boolean;
  storeName: string;
}

export interface ServerToClientEvents {
  "store:nif": (entry: NifEntry, ack: (received: boolean) => void) => void;
  "store:status": (payload: StoreStatus) => void;
}

export interface ClientToServerEvents {
  "store:open": (p: StoreOpenRequest, cb: (res: Ack<{ entries: NifEntry[] }>) => void) => void;
  "store:close": () => void;
  "store:clear": (cb: (res: Ack) => void) => void;
  "customer:join": (p: { storeId: string }, cb: (res: Ack<{ storeName: string }>) => void) => void;
  "customer:leave": (p: { storeId: string }) => void;
  "customer:share": (
    p: { storeId: string; nif: string },
    cb: (res: Ack<{ receivedAt: number; storeName: string }>) => void,
  ) => void;
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
