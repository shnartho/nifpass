import { RateLimiter } from "@/lib/server/rateLimiter";
import { ably, clientIp, fail, ok } from "@/lib/server/ably";
import { readCredentials, regenerateStoreId, toPublic, verifyAccount } from "@/lib/server/storeAccounts";
import { QR_REPLACED_EVENT, isValidStoreId, storeChannel } from "@/shared/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(5, 60_000);

/** Replaces the store's QR code with a new one. The old QR stops reaching this store. */
export async function POST(req: Request) {
  if (!limiter.consume(clientIp(req))) return fail("RATE_LIMITED");
  const body = (await req.json().catch(() => null)) as { email?: unknown; secret?: unknown; storeId?: unknown } | null;
  const creds = readCredentials(body);
  if (!creds || !isValidStoreId(body?.storeId)) return fail("INVALID_REQUEST");
  try {
    const result = await verifyAccount(creds.email, creds.secret);
    if (!result.ok) return fail(result.code);
    // Another screen already replaced it: don't replace twice.
    if (result.record.storeId !== body.storeId) return fail("QR_REPLACED");

    const updated = await regenerateStoreId(result.record, creds.email);
    // Tell the store's other screens to leave the old channel and switch to the new QR.
    await ably()
      ?.channels.get(storeChannel(body.storeId))
      .publish(QR_REPLACED_EVENT, null)
      .catch(() => {});
    return ok({ account: toPublic(updated) });
  } catch {
    return fail("SERVER_BUSY");
  }
}
