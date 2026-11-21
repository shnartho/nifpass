import { createHash, timingSafeEqual } from "node:crypto";
import { createHttpClient, type PubSubHttpClient } from "@ably/pubsub-server";
import { NextResponse } from "next/server";
import { STORE_ID_HASH_PREFIX, sanitizeStoreName, storeChannel, type ApiResult, type ErrorCode } from "@/shared/protocol";

let rest: PubSubHttpClient | null = null;

/** Server-side Ably client (not billed as a user); the API key never reaches the browser. */
export function ably(): PubSubHttpClient | null {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  rest ??= createHttpClient({ key });
  return rest;
}

export function ownsStore(storeId: string, secret: string): boolean {
  const expected = Buffer.from(
    createHash("sha256").update(STORE_ID_HASH_PREFIX + secret).digest("base64url").slice(0, 22),
  );
  const given = Buffer.from(storeId);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Name of the store if at least one of its screens is open, otherwise null. */
export async function onlineStoreName(client: PubSubHttpClient, storeId: string): Promise<string | null> {
  const page = await client.channels.get(storeChannel(storeId)).presence.get();
  for (const member of page.items) {
    const name = sanitizeStoreName((member.data as { name?: unknown } | undefined)?.name);
    if (name) return name;
  }
  return null;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

const statusFor: Record<ErrorCode, number> = {
  INVALID_REQUEST: 400,
  INVALID_NIF: 400,
  STORE_OFFLINE: 404,
  DELIVERY_FAILED: 502,
  UNAUTHORIZED: 403,
  RATE_LIMITED: 429,
  SERVER_BUSY: 503,
};

export const fail = (code: ErrorCode) =>
  NextResponse.json<ApiResult>({ ok: false, code }, { status: statusFor[code], headers: { "Cache-Control": "no-store" } });

export const ok = <T extends object>(body: T) =>
  NextResponse.json<ApiResult<T>>({ ok: true, ...body }, { headers: { "Cache-Control": "no-store" } });
