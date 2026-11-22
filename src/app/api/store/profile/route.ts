import { RateLimiter } from "@/lib/server/rateLimiter";
import { clientIp, fail, ok, ownsStore } from "@/lib/server/ably";
import { profilesEnabled, readProfile, writeProfile } from "@/lib/server/storeProfiles";
import { isValidStoreId, isValidStoreSecret, sanitizeLocation, sanitizeStoreName } from "@/shared/protocol";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const limiter = new RateLimiter(30, 60_000);

type Body = { storeId?: unknown; secret?: unknown; name?: unknown; location?: unknown } | null;

async function authorize(req: Request) {
  if (!limiter.consume(clientIp(req))) return { error: fail("RATE_LIMITED") } as const;
  const body = (await req.json().catch(() => null)) as Body;
  if (!isValidStoreId(body?.storeId) || !isValidStoreSecret(body?.secret)) return { error: fail("INVALID_REQUEST") } as const;
  if (!ownsStore(body.storeId, body.secret)) return { error: fail("UNAUTHORIZED") } as const;
  return { storeId: body.storeId, body } as const;
}

/** Load the store's profile (only for its owner). `profile: null` means none saved yet. */
export async function POST(req: Request) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  if (!profilesEnabled()) return ok({ profile: null });
  try {
    return ok({ profile: await readProfile(auth.storeId) });
  } catch {
    return fail("SERVER_BUSY");
  }
}

/** Save the store's profile so signing in on another device restores it. */
export async function PUT(req: Request) {
  const auth = await authorize(req);
  if ("error" in auth) return auth.error;
  const name = sanitizeStoreName(auth.body?.name);
  if (!name) return fail("INVALID_REQUEST");
  if (!profilesEnabled()) return ok({ saved: false });
  try {
    await writeProfile(auth.storeId, { name, location: sanitizeLocation(auth.body?.location) });
    return ok({ saved: true });
  } catch {
    return fail("SERVER_BUSY");
  }
}
