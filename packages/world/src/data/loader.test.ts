import { describe, expect, it } from "vitest";
import type { TileCache, TileData, TileId, TileSource, WorldTile } from "../types.ts";
import fixture from "./fixtures/test-tile.json" with { type: "json" };
import { createTileLoader, DEFAULT_MAX_AGE_MS } from "./loader.ts";
import { WORLD_TILE_VERSION } from "./prepare.ts";
import { TileNotFoundError } from "./sources/file.ts";
import { tileKey } from "./tiles.ts";

const data = fixture as unknown as TileData;
const TILE: TileId = data.id;
const OTHER: TileId = { ...TILE, x: TILE.x + 5 };
const NOW = "2026-06-01T12:00:00.000Z";
const daysAgo = (days: number) => new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

/** A source that counts how often it is asked, and can be told to fail or to wait. */
function fakeSource(tiles: TileId[] = [TILE]) {
  const state = {
    asked: 0,
    fail: undefined as Error | undefined,
    hold: undefined as Promise<void> | undefined,
  };
  const source: TileSource = {
    async getTile(id) {
      state.asked++;
      if (state.hold) await state.hold;
      if (state.fail) throw state.fail;
      if (!tiles.some((tile) => tileKey(tile) === tileKey(id))) {
        throw new TileNotFoundError(id, "the fake source");
      }
      return { ...data, id };
    },
  };
  return { source, state };
}

/** A cache held in memory. */
function fakeCache(initial: WorldTile[] = []) {
  const stored = new Map(initial.map((tile) => [tileKey(tile.id), tile]));
  const state = { gets: 0, puts: 0, broken: false };
  const cache: TileCache = {
    async get(id) {
      state.gets++;
      if (state.broken) throw new Error("storage is not available");
      return stored.get(tileKey(id));
    },
    async put(tile) {
      state.puts++;
      if (state.broken) throw new Error("storage is full");
      stored.set(tileKey(tile.id), tile);
    },
  };
  return { cache, stored, state };
}
const cachedTile = (over: Partial<WorldTile> = {}): WorldTile => ({
  id: TILE,
  version: WORLD_TILE_VERSION,
  generatedAt: daysAgo(1),
  features: [],
  ...over,
});
const now = () => NOW;

describe("createTileLoader", () => {
  it("fetches a tile that is nowhere yet, prepares it and saves it in the cache", async () => {
    const { source, state } = fakeSource();
    const { cache, stored } = fakeCache();
    const loaded = await createTileLoader({ source, cache, now }).load(TILE);
    expect(loaded.from).toBe("network");
    expect(loaded.tile.id).toEqual(TILE);
    expect(loaded.tile.version).toBe(WORLD_TILE_VERSION);
    expect(loaded.tile.generatedAt).toBe(NOW);
    expect(loaded.tile.features.length).toBeGreaterThan(0);
    expect(state.asked).toBe(1);
    expect(stored.get(tileKey(TILE))).toEqual(loaded.tile);
  });

  it("uses the cache on the next visit and asks the source nothing", async () => {
    const { source, state } = fakeSource();
    const { cache } = fakeCache();
    const loader = createTileLoader({ source, cache, now });
    const first = await loader.load(TILE);
    const second = await loader.load(TILE);
    expect(second.from).toBe("cache");
    expect(second.tile).toEqual(first.tile);
    expect(state.asked).toBe(1);
  });

  it("takes tiles that ship with the app first, and never puts them in the cache", async () => {
    const shipped = fakeSource([TILE]);
    const network = fakeSource([TILE, OTHER]);
    const { cache, state } = fakeCache();
    const loader = createTileLoader({ saved: shipped.source, source: network.source, cache, now });
    expect((await loader.load(TILE)).from).toBe("saved");
    expect(network.state.asked).toBe(0);
    expect(state.puts).toBe(0);
    expect(state.gets).toBe(0);
    // A tile the app does not ship comes from the network and is cached as usual.
    expect((await loader.load(OTHER)).from).toBe("network");
    expect(state.puts).toBe(1);
  });

  it("does not hide a broken shipped tile behind the network", async () => {
    const shipped = fakeSource();
    shipped.state.fail = new Error("the shipped tile is damaged");
    const network = fakeSource();
    const loader = createTileLoader({ saved: shipped.source, source: network.source, now });
    await expect(loader.load(TILE)).rejects.toThrow("damaged");
    expect(network.state.asked).toBe(0);
  });

  it("fetches again when the cached tile is in an older format", async () => {
    const { source, state } = fakeSource();
    const { cache, stored } = fakeCache([cachedTile({ version: WORLD_TILE_VERSION - 1 })]);
    const loaded = await createTileLoader({ source, cache, now }).load(TILE);
    expect(loaded.from).toBe("network");
    expect(state.asked).toBe(1);
    expect(stored.get(tileKey(TILE))?.version).toBe(WORLD_TILE_VERSION);
  });

  it("ignores a cache entry that holds a different tile", async () => {
    const { source } = fakeSource();
    const { cache, stored } = fakeCache();
    stored.set(tileKey(TILE), cachedTile({ id: OTHER }));
    expect((await createTileLoader({ source, cache, now }).load(TILE)).from).toBe("network");
  });

  it("fetches a cached tile again once it is older than the limit", async () => {
    expect(DEFAULT_MAX_AGE_MS).toBe(30 * 86_400_000);
    const fresh = fakeCache([cachedTile({ generatedAt: daysAgo(29) })]);
    const old = fakeCache([cachedTile({ generatedAt: daysAgo(31) })]);
    const { source, state } = fakeSource();
    expect((await createTileLoader({ source, cache: fresh.cache, now }).load(TILE)).from).toBe(
      "cache",
    );
    expect(state.asked).toBe(0);
    expect((await createTileLoader({ source, cache: old.cache, now }).load(TILE)).from).toBe(
      "network",
    );
    expect(old.stored.get(tileKey(TILE))?.generatedAt).toBe(NOW);
    // The limit can be changed.
    const short = createTileLoader({ source, cache: fresh.cache, now, maxAgeMs: 86_400_000 });
    expect((await short.load(TILE)).from).toBe("network");
  });

  it("keeps using an old cached tile when fetching a newer one fails", async () => {
    const { source, state } = fakeSource();
    state.fail = new Error("Overpass answered 504");
    const stale = cachedTile({ generatedAt: daysAgo(90) });
    const { cache } = fakeCache([stale]);
    const loaded = await createTileLoader({ source, cache, now }).load(TILE);
    expect(loaded).toEqual({ tile: stale, from: "cache" });
  });

  it("fails when the tile is nowhere and the source fails", async () => {
    const { source, state } = fakeSource();
    state.fail = new Error("Overpass answered 504");
    const { cache } = fakeCache();
    await expect(createTileLoader({ source, cache, now }).load(TILE)).rejects.toThrow("504");
  });

  it("carries on when the cache cannot be read or written, and says so", async () => {
    const { source } = fakeSource();
    const { cache, state } = fakeCache();
    state.broken = true;
    const errors: unknown[] = [];
    const loader = createTileLoader({ source, cache, now, onCacheError: (e) => errors.push(e) });
    expect((await loader.load(TILE)).from).toBe("network");
    // Once for the failed read, once for the failed write.
    expect(errors).toHaveLength(2);
  });

  it("works without any cache", async () => {
    const { source, state } = fakeSource();
    const loader = createTileLoader({ source, now });
    expect((await loader.load(TILE)).from).toBe("network");
    expect((await loader.load(TILE)).from).toBe("network");
    expect(state.asked).toBe(2);
  });

  it("shares one request between everyone asking for the same tile at once", async () => {
    const { source, state } = fakeSource([TILE, OTHER]);
    let release: () => void = () => {};
    state.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loader = createTileLoader({ source, cache: fakeCache().cache, now });
    const a = loader.load(TILE);
    const b = loader.load(TILE);
    const c = loader.load(OTHER);
    expect(a).toBe(b);
    release();
    const [first, second, third] = await Promise.all([a, b, c]);
    expect(first).toBe(second);
    expect(third.tile.id).toEqual(OTHER);
    // One request per tile, not per caller.
    expect(state.asked).toBe(2);
    // Afterwards a new request starts fresh (and finds the cache).
    expect((await loader.load(TILE)).from).toBe("cache");
  });

  it("lets a failed request be tried again", async () => {
    const { source, state } = fakeSource();
    state.fail = new Error("Overpass answered 429");
    const loader = createTileLoader({ source, now });
    await expect(loader.load(TILE)).rejects.toThrow("429");
    state.fail = undefined;
    expect((await loader.load(TILE)).from).toBe("network");
  });
});
