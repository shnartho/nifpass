"use client";

import { ErrorInfo, createClient, type TokenRequest } from "@ably/pubsub-device";
import { useEffect, useRef, useState } from "react";
import { friendlyError } from "@/lib/errors";
import type { StoreAccount } from "@/lib/storeAuth";
import {
  NIF_EVENT,
  QR_REPLACED_EVENT,
  storeChannel,
  type ApiResult,
  type NifEntry,
  type StorePresence,
} from "@/shared/protocol";

export type StoreConnection = "connecting" | "open" | "reconnecting" | "error";

/**
 * Keeps this screen subscribed to its store's private Ably channel and announces it
 * via presence (so customers can see the store is open). Ably holds the idle connection;
 * our own code only runs when a token is issued or a customer shares a NIF.
 * `onReplaced` runs when the store's QR code was replaced (e.g. on another screen).
 * Nothing connects until `enabled` is true.
 */
export function useStoreChannel(
  account: StoreAccount,
  enabled: boolean,
  onNif: (entry: NifEntry) => void,
  onReplaced: () => void,
) {
  const [state, setState] = useState<StoreConnection>("connecting");
  const [error, setError] = useState<string | null>(null);
  const onNifRef = useRef(onNif);
  const onReplacedRef = useRef(onReplaced);

  useEffect(() => {
    onNifRef.current = onNif;
    onReplacedRef.current = onReplaced;
  });

  useEffect(() => {
    if (!enabled) return;
    // The token carries clientId = storeId, which device connections require.
    const client = createClient({
      authCallback: async (_params, callback) => {
        try {
          const res = await fetch("/api/store/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: account.email, secret: account.secret, storeId: account.storeId }),
            cache: "no-store",
          });
          const data = (await res.json().catch(() => null)) as TokenRequest | ApiResult | null;
          if (res.ok && data) return callback(null, data as TokenRequest);
          const code = data && "ok" in data && data.ok === false ? data.code : "SERVER_BUSY";
          if (code === "QR_REPLACED") onReplacedRef.current();
          // 4xx account errors make Ably stop retrying; other failures are retried automatically.
          const final = res.status === 403 || res.status === 404 || res.status === 409;
          callback(new ErrorInfo(friendlyError(code).message, final ? 40160 : 50000, res.status), null);
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
    void channel.subscribe(QR_REPLACED_EVENT, () => {
      // Stop announcing the old QR as open right away.
      client.close();
      onReplacedRef.current();
    });
    void channel.presence.enter({ name: account.name } satisfies StorePresence).catch(() => {});

    return () => client.close();
  }, [enabled, account.storeId, account.secret, account.email, account.name]);

  return { state, error };
}
