import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import type { Server as HttpsServer } from "node:https";
import { Server, type Socket } from "socket.io";
import {
  isValidNif,
  isValidStoreId,
  isValidStoreSecret,
  sanitizeStoreName,
  type Ack,
  type ClientToServerEvents,
  type ErrorCode,
  type NifEntry,
  type ServerToClientEvents,
} from "../src/shared/protocol";
import { RateLimiter } from "./rateLimiter";
import { StoreRegistry, storeIdFromSecret, type StoreState } from "./storeRegistry";

interface SocketData {
  ip: string;
  storeId?: string;
  joinedStores: Set<string>;
  sharing: boolean;
}

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface RealtimeOptions {
  corsOrigins?: string[];
  trustProxy?: boolean;
}

const DELIVERY_TIMEOUT_MS = 5_000;
const MAX_JOINED_PER_SOCKET = 3;
const storeRoom = (id: string) => `store:${id}`;
const customerRoom = (id: string) => `customers:${id}`;
// Never log NIFs; store ids are shortened as well.
const short = (id: string) => `${id.slice(0, 6)}…`;
const log = (msg: string) => console.log(`[realtime] ${new Date().toISOString()} ${msg}`);

const limits = {
  socketEvents: new RateLimiter(40, 10_000),
  open: new RateLimiter(30, 60_000),
  join: new RateLimiter(30, 60_000),
  share: new RateLimiter(12, 60_000),
};

function clientIp(socket: AppSocket, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = socket.handshake.headers["x-forwarded-for"];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(",")[0]?.trim();
    if (first) return first;
  }
  return socket.handshake.address;
}

function reply<T extends object>(cb: unknown, res: Ack<T>) {
  if (typeof cb === "function") cb(res);
}
const fail = (cb: unknown, code: ErrorCode) => reply(cb, { ok: false, code });

function ownsStore(storeId: string, secret: string): boolean {
  const expected = Buffer.from(storeIdFromSecret(secret));
  const given = Buffer.from(storeId);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function attachRealtime(httpServer: HttpServer | HttpsServer, options: RealtimeOptions = {}): AppServer {
  const io: AppServer = new Server(httpServer, {
    path: "/socket.io",
    serveClient: false,
    maxHttpBufferSize: 10_000,
    pingInterval: 10_000,
    pingTimeout: 8_000,
    // Let other upgrade handlers (Next.js HMR) coexist on the same HTTP server.
    destroyUpgrade: false,
    cors: options.corsOrigins?.length ? { origin: options.corsOrigins, methods: ["GET", "POST"] } : undefined,
  });

  const registry = new StoreRegistry();

  const notifyCustomers = (store: StoreState, online: boolean) =>
    io.to(customerRoom(store.id)).emit("store:status", { storeId: store.id, online, storeName: store.name });

  function leaveStore(socket: AppSocket) {
    const id = socket.data.storeId;
    if (!id) return;
    socket.data.storeId = undefined;
    socket.leave(storeRoom(id));
    if (registry.detach(id, socket.id)) {
      const store = registry.get(id);
      if (store) notifyCustomers(store, false);
      log(`store ${short(id)} offline`);
    }
  }

  io.on("connection", (rawSocket) => {
    const socket = rawSocket as AppSocket;
    socket.data.ip = clientIp(socket, options.trustProxy ?? false);
    socket.data.joinedStores = new Set();
    socket.data.sharing = false;

    socket.use((_packet, next) => {
      if (limits.socketEvents.consume(socket.id)) next();
      else next(new Error("rate_limited"));
    });

    // ---------- Store ----------

    socket.on("store:open", (p, cb) => {
      if (!limits.open.consume(socket.data.ip)) return fail(cb, "RATE_LIMITED");
      const name = sanitizeStoreName(p?.name);
      if (!isValidStoreId(p?.storeId) || !isValidStoreSecret(p?.secret) || !name) return fail(cb, "INVALID_REQUEST");
      if (!ownsStore(p.storeId, p.secret)) return fail(cb, "UNAUTHORIZED");

      if (socket.data.storeId && socket.data.storeId !== p.storeId) leaveStore(socket);
      const wasOnline = registry.isOnline(p.storeId);
      const store = registry.attach(p.storeId, name, socket.id);
      if (!store) return fail(cb, "SERVER_BUSY");
      socket.data.storeId = store.id;
      socket.join(storeRoom(store.id));
      notifyCustomers(store, true);
      if (!wasOnline) log(`store ${short(store.id)} online`);
      reply(cb, { ok: true, entries: store.entries });
    });

    socket.on("store:close", () => leaveStore(socket));

    socket.on("store:clear", (cb) => {
      const store = socket.data.storeId ? registry.get(socket.data.storeId) : undefined;
      if (!store) return fail(cb, "UNAUTHORIZED");
      store.entries = [];
      reply(cb, { ok: true });
    });

    // ---------- Customer ----------

    socket.on("customer:join", (p, cb) => {
      if (!limits.join.consume(socket.data.ip)) return fail(cb, "RATE_LIMITED");
      if (!isValidStoreId(p?.storeId)) return fail(cb, "INVALID_REQUEST");
      const store = registry.get(p.storeId);
      if (!store || store.socketIds.size === 0) return fail(cb, "STORE_OFFLINE");

      const joined = socket.data.joinedStores;
      if (!joined.has(store.id)) {
        if (joined.size >= MAX_JOINED_PER_SOCKET) {
          const oldest = joined.values().next().value as string;
          joined.delete(oldest);
          socket.leave(customerRoom(oldest));
        }
        joined.add(store.id);
        socket.join(customerRoom(store.id));
      }
      reply(cb, { ok: true, storeName: store.name });
    });

    socket.on("customer:leave", (p) => {
      if (!isValidStoreId(p?.storeId)) return;
      socket.data.joinedStores.delete(p.storeId);
      socket.leave(customerRoom(p.storeId));
    });

    socket.on("customer:share", (p, cb) => {
      if (!limits.share.consume(socket.data.ip)) return fail(cb, "RATE_LIMITED");
      if (!isValidStoreId(p?.storeId)) return fail(cb, "INVALID_REQUEST");
      if (!isValidNif(p?.nif)) return fail(cb, "INVALID_NIF");
      if (!socket.data.joinedStores.has(p.storeId)) return fail(cb, "NOT_JOINED");
      if (socket.data.sharing) return fail(cb, "DUPLICATE_REQUEST");

      const store = registry.get(p.storeId);
      if (!store || store.socketIds.size === 0) return fail(cb, "STORE_OFFLINE");

      const entry: NifEntry = { id: randomUUID(), nif: p.nif, receivedAt: Date.now() };
      socket.data.sharing = true;
      // Delivered only to the devices signed in to this exact store.
      io.to(storeRoom(store.id))
        .timeout(DELIVERY_TIMEOUT_MS)
        .emit("store:nif", entry, (_err: Error | null, responses: boolean[]) => {
          socket.data.sharing = false;
          if (!responses?.some((r) => r === true)) {
            log(`delivery to store ${short(store.id)} failed`);
            return fail(cb, "DELIVERY_FAILED");
          }
          registry.addEntry(store, entry);
          log(`NIF delivered to store ${short(store.id)}`);
          reply(cb, { ok: true, receivedAt: entry.receivedAt, storeName: store.name });
        });
    });

    socket.on("disconnect", () => leaveStore(socket));
  });

  return io;
}
