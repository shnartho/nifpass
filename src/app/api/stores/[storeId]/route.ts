import { RateLimiter } from "@/lib/server/rateLimiter";
import { ably, clientIp, fail, ok, onlineStoreName } from "@/lib/server/ably";
import { isValidStoreId } from "@/shared/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(30, 60_000);

/** Customer lookup after scanning: is this store open, and what is it called? */
export async function GET(req: Request, { params }: { params: Promise<{ storeId: string }> }) {
  if (!limiter.consume(clientIp(req))) return fail("RATE_LIMITED");
  const { storeId } = await params;
  if (!isValidStoreId(storeId)) return fail("INVALID_REQUEST");

  const client = ably();
  if (!client) return fail("SERVER_BUSY");
  try {
    const storeName = await onlineStoreName(client, storeId);
    return storeName ? ok({ storeName }) : fail("STORE_OFFLINE");
  } catch {
    return fail("SERVER_BUSY");
  }
}
