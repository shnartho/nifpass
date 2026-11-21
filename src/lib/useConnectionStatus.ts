"use client";

import { useEffect, useState } from "react";
import type { AppSocket } from "./socket";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

export function useConnectionStatus(socket: AppSocket): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(socket.connected ? "connected" : "connecting");

  useEffect(() => {
    const onConnect = () => setStatus("connected");
    const onDisconnect = () => setStatus("disconnected");
    const onReconnecting = () => setStatus((s) => (s === "connected" ? s : "connecting"));
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onDisconnect);
    socket.io.on("reconnect_attempt", onReconnecting);
    if (socket.connected) setStatus("connected");
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onDisconnect);
      socket.io.off("reconnect_attempt", onReconnecting);
    };
  }, [socket]);

  return status;
}
