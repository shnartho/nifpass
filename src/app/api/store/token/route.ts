import { RateLimiter } from "@/lib/server/rateLimiter";
import { ably, clientIp, fail } from "@/lib/server/ably";
import { readCredentials, verifyAccount } from "@/lib/server/storeAccounts";
import { isValidStoreId, storeChannel } from "@/shared/protocol";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(30, 60_000);
const TOKEN_TTL_MS = 60 * 60 * 1000;

/**
 * Issues a short-lived Ably token that can only listen on (and announce presence in) the caller's
 * own store channel, and only for the store's current QR id: replaced QR ids are refused.
 */
export async function POST(req: Request) {
  if (!limiter.consume(clientIp(req))) return fail("RATE_LIMITED");
  const body = (await req.json().catch(() => null)) as { email?: unknown; secret?: unknown; storeId?: unknown } | null;
  const creds = readCredentials(body);
  if (!creds || !isValidStoreId(body?.storeId)) return fail("INVALID_REQUEST");

  const client = ably();
  if (!client) return fail("SERVER_BUSY");
  try {
    const result = await verifyAccount(creds.email, creds.secret);
    if (!result.ok) return fail(result.code === "ACCOUNT_NOT_FOUND" ? "ACCOUNT_NOT_FOUND" : "UNAUTHORIZED");
    const { storeId } = result.record;
    if (storeId !== body.storeId) return fail("QR_REPLACED");

    const tokenRequest = await client.auth.createTokenRequest({
      clientId: storeId,
      ttl: TOKEN_TTL_MS,
      capability: { [storeChannel(storeId)]: ["subscribe", "presence"] },
    });
    return NextResponse.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("SERVER_BUSY");
  }
}
