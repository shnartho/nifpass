"use client";

import { ErrorInfo, createClient, type TokenRequest } from "@ably/pubsub-device";
import { useEffect, useRef, useState } from "react";
import { friendlyError } from "@/lib/errors";
import type { StoreAccount } from "@/lib/storeAuth";
import { NIF_EVENT, storeChannel, type ApiResult, type NifEntry, type StorePresence } from "@/shared/protocol";

export type StoreConnection = "connecting" | "open" | "reconnecting" | "error";

/**
 * Keeps this screen subscribed to its store's private Ably channel and announces it
 * via presence (so customers can see the store is open). Ably holds the idle connection;
 * our own code only runs when a token is issued or a customer shares a NIF.
 */
export function useStoreChannel(account: StoreAccount, onNif: (entry: NifEntry) => void) {
  const [state, setState] = useState<StoreConnection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const onNifRef = useRef(onNif);

  useEffect(() => {
    onNifRef.current = onNif;
  });

  useEffect(() => {
    // The token carries clientId = storeId, which device connections require.
    const client = createClient({
      authCallback: async (_params, callback) => {
        try {
          const res = await fetch("/api/store/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ storeId: account.storeId, secret: account.secret }),
            cache: "no-store",
          });
          const data = (await res.json().catch(() => null)) as TokenRequest | ApiResult | null;
          if (res.ok && data) return callback(null, data as TokenRequest);
          const code = data && "ok" in data && data.ok === false ? data.code : "SERVER_BUSY";
          // 403 makes Ably stop retrying; other failures are retried automatically.
          callback(new ErrorInfo(friendlyError(code).message, res.status === 403 ? 40160 : 50000, res.status), null);
        } catch {
          callback("Network unavailable", null);
        }
      },
      echoMessages: false,
      closeOnUnload: true,
    });

    client.connection.on((change) => {
      switch (change.current) {
        case "connected":
          setState("open");
          setError(null);
          break;
        case "connecting":
        case "initialized":
          setState((s) => (s === "open" ? "reconnecting" : s === "error" ? "error" : "connecting"));
          break;
        case "disconnected":
        case "suspended":
          setState("reconnecting");
          break;
        case "failed":
          setState("error");
          setError(change.reason?.message ?? friendlyError("UNAUTHORIZED").message);
          break;
      }
    });

    const channel = client.channels.get(storeChannel(account.storeId));
    void channel.subscribe(NIF_EVENT, (msg) => onNifRef.current(msg.data as NifEntry));
    void channel.presence.enter({ name: account.name } satisfies StorePresence).catch(() => {});

    return () => client.close();
  }, [account.storeId, account.secret, account.name]);

  return { state, error };
}
