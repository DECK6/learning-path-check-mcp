import { FileStore } from "./file-store.js";
import { MemoryStore } from "./memory-store.js";
import { PostgresStore } from "./postgres-store.js";
import type { UserStore } from "./types.js";

let overrideStore: UserStore | undefined;
let cached: { signature: string; store: UserStore } | undefined;

export function getUserStore(): UserStore {
  if (overrideStore) return overrideStore;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  const filePath = process.env.STORE_PATH?.trim();
  const signature = databaseUrl ? `postgres:${databaseUrl}` : filePath ? `file:${filePath}` : "memory";
  if (cached?.signature === signature) return cached.store;
  const store = databaseUrl ? new PostgresStore(databaseUrl) : filePath ? new FileStore(filePath) : new MemoryStore();
  cached = { signature, store };
  return store;
}

export function setUserStoreForTests(store?: UserStore): void {
  overrideStore = store;
  if (!store) cached = undefined;
}
