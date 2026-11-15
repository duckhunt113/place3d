// This device's tile storage: tiles fetched from the map server are kept in the browser's
// IndexedDB, so a place you have visited loads without asking the server again.
// Implements the world package's `TileCache`; the world package itself never touches storage.

import { type TileCache, type TileId, tileKey, type WorldTile } from "@somewhere/world";
import { createStore, delMany, get, keys, set } from "idb-keyval";

/** The few storage operations the cache needs, so it can be tested with a plain Map. */
export type KeyValueStore = {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  keys(): Promise<string[]>;
  delMany(keys: string[]): Promise<void>;
};

export type StoredTileCache = TileCache & {
  /** Deletes tiles saved in older formats. Returns how many were deleted. */
  prune(): Promise<number>;
};

/**
 * A tile cache on top of a key-value store. Keys carry the tile format version
 * ("v4/17/36550/47896"), so tiles in an older format are never read back.
 */
export function createTileCache(store: KeyValueStore, version: number): StoredTileCache {
  const prefix = `v${version}/`;
  const keyOf = (id: TileId): string => `${prefix}${tileKey(id)}`;
  return {
    async get(id) {
      return (await store.get(keyOf(id))) as WorldTile | undefined;
    },
    async put(tile) {
      await store.set(keyOf(tile.id), tile);
    },
    async prune() {
      const old = (await store.keys()).filter((key) => !key.startsWith(prefix));
      if (old.length > 0) await store.delMany(old);
      return old.length;
    },
  };
}

/** The browser's IndexedDB as a key-value store (works on the page and in a Web Worker). */
export function browserStore(): KeyValueStore {
  const store = createStore("somewhere", "tiles");
  return {
    get: (key) => get(key, store),
    set: (key, value) => set(key, value, store),
    keys: async () => (await keys(store)).map(String),
    delMany: (list) => delMany(list, store),
  };
}
