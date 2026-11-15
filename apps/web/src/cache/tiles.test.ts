import type { TileId, WorldTile } from "@somewhere/world";
import { describe, expect, it } from "vitest";
import { createTileCache, type KeyValueStore } from "./tiles.ts";

/** A key-value store held in memory, standing in for the browser's IndexedDB. */
function memoryStore() {
  const map = new Map<string, unknown>();
  const store: KeyValueStore = {
    get: async (key) => map.get(key),
    set: async (key, value) => {
      map.set(key, value);
    },
    keys: async () => [...map.keys()],
    delMany: async (keys) => {
      for (const key of keys) map.delete(key);
    },
  };
  return { map, store };
}
const TILE: TileId = { z: 17, x: 36550, y: 47896 };
const tile = (id: TileId = TILE): WorldTile => ({
  id,
  version: 4,
  generatedAt: "2026-06-01T12:00:00.000Z",
  features: [],
});

describe("createTileCache", () => {
  it("gives back what was put in, by tile", async () => {
    const { store } = memoryStore();
    const cache = createTileCache(store, 4);
    expect(await cache.get(TILE)).toBeUndefined();
    await cache.put(tile());
    expect(await cache.get(TILE)).toEqual(tile());
    expect(await cache.get({ ...TILE, x: TILE.x + 1 })).toBeUndefined();
  });

  it("keys tiles by format version and tile id", async () => {
    const { map, store } = memoryStore();
    await createTileCache(store, 4).put(tile());
    expect([...map.keys()]).toEqual(["v4/17/36550/47896"]);
  });

  it("never reads back a tile saved in another format version", async () => {
    const { store } = memoryStore();
    await createTileCache(store, 3).put(tile());
    expect(await createTileCache(store, 4).get(TILE)).toBeUndefined();
  });

  it("deletes tiles of older versions when pruned, and keeps the current ones", async () => {
    const { map, store } = memoryStore();
    await createTileCache(store, 3).put(tile());
    await createTileCache(store, 3).put(tile({ ...TILE, y: TILE.y + 1 }));
    const cache = createTileCache(store, 4);
    await cache.put(tile());
    expect(await cache.prune()).toBe(2);
    expect([...map.keys()]).toEqual(["v4/17/36550/47896"]);
    expect(await cache.prune()).toBe(0);
  });
});
