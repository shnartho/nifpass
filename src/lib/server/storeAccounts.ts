import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { get, put } from "@vercel/blob";
import {
  STORE_ID_HASH_PREFIX,
  isValidEmail,
  isValidStoreSecret,
  normalizeEmail,
  sanitizeLocation,
  sanitizeStoreName,
  type StoreAccountInfo,
  type StoreProfile,
} from "@/shared/protocol";

/**
 * Permanent store registry, one private JSON file per store account in Vercel Blob.
 * Keyed by a hash of the email, so emails themselves are never stored. Customers'
 * scans never read it: only sign-in, registration, QR regeneration and hourly token renewals do.
 */
interface AccountRecord {
  v: 1;
  /** Public id printed in the QR. Stays the same until the owner generates a new one. */
  storeId: string;
  secretHash: string;
  name: string;
  location: string;
  createdAt: number;
  qrCreatedAt: number;
}

export const toPublic = (r: AccountRecord): StoreAccountInfo => ({ storeId: r.storeId, name: r.name, location: r.location });

const sha256 = (value: string) => createHash("sha256").update(value).digest("base64url");
const accountPath = (email: string) => `accounts/${sha256(`nifpass-account:v1:${email}`)}.json`;
const hashSecret = (secret: string) => sha256(`nifpass-account-secret:v1:${secret}`);
/** Before the registry existed, the QR id was derived from the secret; keep that id so printed QRs keep working. */
const legacyStoreId = (secret: string) => sha256(STORE_ID_HASH_PREFIX + secret).slice(0, 22);
const legacyProfilePath = (storeId: string) => `stores/${storeId}.json`;
/** 16 random bytes = 22 base64url chars, the same shape as every other store id. */
const newStoreId = () => randomBytes(16).toString("base64url");

// ---------- Storage: Vercel Blob in production, local files for `npm run dev` ----------

const blobEnabled = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);
const localDir = path.join(process.cwd(), ".data");

function assertStorage() {
  if (!blobEnabled() && process.env.VERCEL) {
    console.error("[accounts] No Vercel Blob store connected (BLOB_STORE_ID / BLOB_READ_WRITE_TOKEN).");
    throw new Error("storage unavailable");
  }
}

async function readJson<T>(pathname: string): Promise<T | null> {
  assertStorage();
  if (!blobEnabled()) {
    try {
      return JSON.parse(await readFile(path.join(localDir, pathname), "utf8")) as T;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }
  const res = await get(pathname, { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return null;
  return (await new Response(res.stream).json()) as T;
}

/** Returns false if the file already exists (when `overwrite` is false). */
async function writeJson(pathname: string, data: unknown, overwrite: boolean): Promise<boolean> {
  assertStorage();
  const body = JSON.stringify(data);
  if (!blobEnabled()) {
    const file = path.join(localDir, pathname);
    await mkdir(path.dirname(file), { recursive: true });
    try {
      await writeFile(file, body, { flag: overwrite ? "w" : "wx" });
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "EEXIST") return false;
      throw err;
    }
  }
  try {
    await put(pathname, body, {
      access: "private",
      addRandomSuffix: false,
      allowOverwrite: overwrite,
      contentType: "application/json",
    });
    return true;
  } catch (err) {
    // A create that lost a race: the caller re-reads the record.
    if (!overwrite && (await readJson(pathname))) return false;
    throw err;
  }
}

// ---------- Accounts ----------

export type AccountResult =
  | { ok: true; record: AccountRecord }
  | { ok: false; code: "ACCOUNT_NOT_FOUND" | "WRONG_PASSWORD" | "EMAIL_TAKEN" };

function secretMatches(record: AccountRecord, secret: string): boolean {
  const a = Buffer.from(record.secretHash);
  const b = Buffer.from(hashSecret(secret));
  return a.length === b.length && timingSafeEqual(a, b);
}

async function createRecord(email: string, secret: string, profile: StoreProfile): Promise<AccountResult> {
  const now = Date.now();
  const record: AccountRecord = {
    v: 1,
    storeId: legacyStoreId(secret),
    secretHash: hashSecret(secret),
    name: profile.name,
    location: profile.location,
    createdAt: now,
    qrCreatedAt: now,
  };
  if (await writeJson(accountPath(email), record, false)) return { ok: true, record };
  // Someone registered this email at the same moment.
  return verifyAccount(email, secret);
}

/** Loads the account if the secret (derived from the password) matches. */
export async function verifyAccount(email: string, secret: string): Promise<AccountResult> {
  const record = await readJson<AccountRecord>(accountPath(email));
  if (!record) {
    // Stores created before the registry only had a name in `stores/<id>.json`: move them over.
    const legacy = await readJson<Partial<StoreProfile>>(legacyProfilePath(legacyStoreId(secret)));
    const name = sanitizeStoreName(legacy?.name);
    if (!name) return { ok: false, code: "ACCOUNT_NOT_FOUND" };
    return createRecord(email, secret, { name, location: sanitizeLocation(legacy?.location) });
  }
  return secretMatches(record, secret) ? { ok: true, record } : { ok: false, code: "WRONG_PASSWORD" };
}

export async function registerAccount(email: string, secret: string, profile: StoreProfile): Promise<AccountResult> {
  const existing = await verifyAccount(email, secret);
  if (existing.ok) return existing;
  if (existing.code === "WRONG_PASSWORD") return { ok: false, code: "EMAIL_TAKEN" };
  return createRecord(email, secret, profile);
}

/** Gives the store a brand-new QR id; token renewals for the old id are refused from now on. */
export async function regenerateStoreId(record: AccountRecord, email: string): Promise<AccountRecord> {
  const updated: AccountRecord = { ...record, storeId: newStoreId(), qrCreatedAt: Date.now() };
  await writeJson(accountPath(email), updated, true);
  return updated;
}

export type Credentials = { email: string; secret: string };

/** Validates `{ email, secret }` from a request body; the email is normalized. */
export function readCredentials(body: { email?: unknown; secret?: unknown } | null): Credentials | null {
  const email = typeof body?.email === "string" ? normalizeEmail(body.email) : null;
  if (!isValidEmail(email) || !isValidStoreSecret(body?.secret)) return null;
  return { email, secret: body.secret };
}
