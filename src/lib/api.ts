import type { ClientErrorCode } from "@/lib/errors";
import type { ApiResult } from "@/shared/protocol";

const TIMEOUT_MS = 10_000;

export type ClientResult<T extends object> = ({ ok: true } & T) | { ok: false; code: ClientErrorCode };

/** JSON API call that never throws: network problems and timeouts become `TIMEOUT`. */
export async function api<T extends object>(path: string, body?: unknown, method?: "POST" | "PUT"): Promise<ClientResult<T>> {
  try {
    const res = await fetch(path, {
      method: body === undefined ? "GET" : (method ?? "POST"),
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as ApiResult<T> | null;
    return data ?? { ok: false, code: "SERVER_BUSY" };
  } catch {
    return { ok: false, code: "TIMEOUT" };
  }
}
