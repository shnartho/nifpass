import { randomUUID } from "node:crypto";
import { RateLimiter } from "@/lib/server/rateLimiter";
import { ably, clientIp, fail, ok, onlineStoreName } from "@/lib/server/ably";
import { NIF_EVENT, isValidNif, isValidStoreId, storeChannel, type NifEntry } from "@/shared/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-instance only; serverless instances don't share memory.
const limiter = new RateLimiter(12, 60_000);

export async function POST(req: Request) {
  if (!limiter.consume(clientIp(req))) return fail("RATE_LIMITED");
  const body = (await req.json().catch(() => null)) as { storeId?: unknown; nif?: unknown } | null;
  if (!isValidStoreId(body?.storeId)) return fail("INVALID_REQUEST");
  if (!isValidNif(body?.nif)) return fail("INVALID_NIF");

  const client = ably();
  if (!client) return fail("SERVER_BUSY");

  try {
    const storeName = await onlineStoreName(client, body.storeId);
    if (!storeName) return fail("STORE_OFFLINE");
    const entry: NifEntry = { id: randomUUID(), nif: body.nif, receivedAt: Date.now() };
    await client.channels.get(storeChannel(body.storeId)).publish(NIF_EVENT, entry);
    return ok({ receivedAt: entry.receivedAt, storeName });
  } catch {
    // Never log the request body: it contains the NIF.
    console.error("[share] delivery failed");
    return fail("DELIVERY_FAILED");
  }
}
