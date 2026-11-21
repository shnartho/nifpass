import { createHash } from "node:crypto";
import { STORE_ID_HASH_PREFIX, type NifEntry } from "../src/shared/protocol";

export interface StoreState {
  id: string;
  name: string;
  socketIds: Set<string>;
  /** Newest first. Lives only in memory and is dropped when the store stays offline. */
  entries: NifEntry[];
  dropTimer: NodeJS.Timeout | null;
}

const MAX_STORES = 5_000;
const MAX_ENTRIES_PER_STORE = 100;
/** Recent NIFs survive short disconnects (page reloads, Wi-Fi drops), then are deleted. */
const OFFLINE_RETENTION_MS = 10 * 60 * 1000;

export const storeIdFromSecret = (secret: string) =>
  createHash("sha256").update(STORE_ID_HASH_PREFIX + secret).digest("base64url").slice(0, 22);

export class StoreRegistry {
  private stores = new Map<string, StoreState>();

  get(id: string): StoreState | undefined {
    return this.stores.get(id);
  }

  isOnline(id: string): boolean {
    return (this.stores.get(id)?.socketIds.size ?? 0) > 0;
  }

  /** Adds a device to a store. Returns null when the server is at capacity. */
  attach(id: string, name: string, socketId: string): StoreState | null {
    let store = this.stores.get(id);
    if (!store) {
      if (this.stores.size >= MAX_STORES) return null;
      store = { id, name, socketIds: new Set(), entries: [], dropTimer: null };
      this.stores.set(id, store);
    }
    if (store.dropTimer) {
      clearTimeout(store.dropTimer);
      store.dropTimer = null;
    }
    store.name = name;
    store.socketIds.add(socketId);
    return store;
  }

  /** Removes a device. Returns true when the store just went offline. */
  detach(id: string, socketId: string): boolean {
    const store = this.stores.get(id);
    if (!store || !store.socketIds.delete(socketId) || store.socketIds.size > 0) return false;
    store.dropTimer = setTimeout(() => this.stores.delete(id), OFFLINE_RETENTION_MS);
    store.dropTimer.unref();
    return true;
  }

  addEntry(store: StoreState, entry: NifEntry) {
    store.entries.unshift(entry);
    if (store.entries.length > MAX_ENTRIES_PER_STORE) store.entries.length = MAX_ENTRIES_PER_STORE;
  }
}
