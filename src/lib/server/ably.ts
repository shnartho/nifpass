import { createHttpClient, type PubSubHttpClient } from "@ably/pubsub-server";
import { NextResponse } from "next/server";
import { sanitizeStoreName, storeChannel, type ApiResult, type ErrorCode } from "@/shared/protocol";

let rest: PubSubHttpClient | null = null;

/** Server-side Ably client (not billed as a user); the API key never reaches the browser. */
export function ably(): PubSubHttpClient | null {
  const key = process.env.ABLY_API_KEY;
  if (!key) return null;
  rest ??= createHttpClient({ key });
  return rest;
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
  ACCOUNT_NOT_FOUND: 404,
  WRONG_PASSWORD: 403,
  EMAIL_TAKEN: 409,
  QR_REPLACED: 409,
  RATE_LIMITED: 429,
  SERVER_BUSY: 503,
};

export const fail = (code: ErrorCode) =>
  NextResponse.json<ApiResult>({ ok: false, code }, { status: statusFor[code], headers: { "Cache-Control": "no-store" } });

export const ok = <T extends object>(body: T) =>
  NextResponse.json<ApiResult<T>>({ ok: true, ...body }, { headers: { "Cache-Control": "no-store" } });
