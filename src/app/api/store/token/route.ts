import { RateLimiter } from "@/lib/server/rateLimiter";
import { ably, clientIp, fail, ownsStore } from "@/lib/server/ably";
import { isValidStoreId, isValidStoreSecret, storeChannel } from "@/shared/protocol";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(30, 60_000);
const TOKEN_TTL_MS = 60 * 60 * 1000;

/** Issues a short-lived Ably token that can only listen on (and announce presence in) the caller's own store channel. */
export async function POST(req: Request) {
  if (!limiter.consume(clientIp(req))) return fail("RATE_LIMITED");
  const body = (await req.json().catch(() => null)) as { storeId?: unknown; secret?: unknown } | null;
  if (!isValidStoreId(body?.storeId) || !isValidStoreSecret(body?.secret)) return fail("INVALID_REQUEST");
  if (!ownsStore(body.storeId, body.secret)) return fail("UNAUTHORIZED");

  const client = ably();
  if (!client) return fail("SERVER_BUSY");
  try {
    const tokenRequest = await client.auth.createTokenRequest({
      clientId: body.storeId,
      ttl: TOKEN_TTL_MS,
      capability: { [storeChannel(body.storeId)]: ["subscribe", "presence"] },
    });
    return NextResponse.json(tokenRequest, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("SERVER_BUSY");
  }
}
