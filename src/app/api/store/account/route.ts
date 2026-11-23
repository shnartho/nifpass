import { RateLimiter } from "@/lib/server/rateLimiter";
import { clientIp, fail, ok } from "@/lib/server/ably";
import { readCredentials, registerAccount, toPublic, verifyAccount, type AccountResult } from "@/lib/server/storeAccounts";
import { sanitizeLocation, sanitizeStoreName } from "@/shared/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(20, 60_000);

type Body = { email?: unknown; secret?: unknown; name?: unknown; location?: unknown } | null;

const respond = (result: AccountResult) => (result.ok ? ok({ account: toPublic(result.record) }) : fail(result.code));

/** Sign in: returns the store's permanent QR id, name and location. */
export async function POST(req: Request) {
  if (!limiter.consume(clientIp(req))) return fail("RATE_LIMITED");
  const creds = readCredentials((await req.json().catch(() => null)) as Body);
  if (!creds) return fail("INVALID_REQUEST");
  try {
    return respond(await verifyAccount(creds.email, creds.secret));
  } catch {
    return fail("SERVER_BUSY");
  }
}

/** Register a store. Saved permanently; registering again with the same email and password just signs in. */
export async function PUT(req: Request) {
  if (!limiter.consume(clientIp(req))) return fail("RATE_LIMITED");
  const body = (await req.json().catch(() => null)) as Body;
  const creds = readCredentials(body);
  const name = sanitizeStoreName(body?.name);
  if (!creds || !name) return fail("INVALID_REQUEST");
  try {
    return respond(await registerAccount(creds.email, creds.secret, { name, location: sanitizeLocation(body?.location) }));
  } catch {
    return fail("SERVER_BUSY");
  }
}
