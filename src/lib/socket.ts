import { io, type Socket } from "socket.io-client";
import type { ClientToServerEvents, ServerToClientEvents } from "@/shared/protocol";

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: AppSocket | null = null;

/** Browser-only singleton. Connects to NEXT_PUBLIC_SOCKET_URL or the page origin. */
export function getSocket(): AppSocket {
  if (!socket) {
    const options = {
      path: "/socket.io",
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
      timeout: 10_000,
    };
    const url = process.env.NEXT_PUBLIC_SOCKET_URL;
    socket = url ? io(url, options) : io(options);
  }
  return socket;
}

export const REQUEST_TIMEOUT_MS = 10_000;
