import { get, put } from "@vercel/blob";
import { sanitizeLocation, sanitizeStoreName, type StoreProfile } from "@/shared/protocol";

// Only the store name and location are kept; never emails, passwords or NIFs.
const pathFor = (storeId: string) => `stores/${storeId}.json`;

// Connected stores authenticate via OIDC (BLOB_STORE_ID) by default; a read-write token also works.
export const profilesEnabled = () => Boolean(process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN);

export async function readProfile(storeId: string): Promise<StoreProfile | null> {
  const res = await get(pathFor(storeId), { access: "private", useCache: false });
  if (!res || res.statusCode !== 200) return null;
  const data = (await new Response(res.stream).json().catch(() => null)) as Partial<StoreProfile> | null;
  const name = sanitizeStoreName(data?.name);
  return name ? { name, location: sanitizeLocation(data?.location) } : null;
}

export async function writeProfile(storeId: string, profile: StoreProfile): Promise<void> {
  await put(pathFor(storeId), JSON.stringify(profile), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: "application/json",
  });
}
