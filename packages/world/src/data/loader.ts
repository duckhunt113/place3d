// How a tile is found: tiles that ship with the app first, then this device's cache, then
// the network, saving what the network returned. Storage and network are passed in, so this
// file has neither and can be tested without them.

import type { TileCache, TileId, TileSource, WorldTile } from "../types.ts";
import { prepareTile, WORLD_TILE_VERSION } from "./prepare.ts";
import { TileNotFoundError } from "./sources/file.ts";
import { tileKey } from "./tiles.ts";

/** Where a loaded tile came from. */
export type TileOrigin = "saved" | "cache" | "network";

export type LoadedTile = { tile: WorldTile; from: TileOrigin };

export type TileLoaderOptions = {
  /**
   * Tiles that ship with the app. They need no network and are never put in the cache, so
   * changing the shipped tiles always shows at once.
   */
  saved?: TileSource;
  /** Where every other tile comes from. What it returns is kept in the cache. */
  source: TileSource;
  /** This device's tile storage. Without one, every visit asks the source again. */
  cache?: TileCache;
  /** The current time as an ISO string; passed in so this never reads the clock. */
  now: () => string;
  /**
   * A cached tile older than this is fetched again, because maps change. If fetching fails,
   * the old tile is still used: old streets beat no streets.
   */
  maxAgeMs?: number;
  /** Told when the cache could not be read or written. Loading carries on without it. */
  onCacheError?: (error: unknown) => void;
};

/** Thirty days: OSM changes slowly in built-up places. */
export const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type WorldTileLoader = {
  /**
   * Finds one tile. Asking for a tile that is already on its way joins that request
   * instead of starting another.
   */
  load(id: TileId): Promise<LoadedTile>;
};

export function createTileLoader(options: TileLoaderOptions): WorldTileLoader {
  const { saved, source, cache, now, onCacheError } = options;
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const onTheWay = new Map<string, Promise<LoadedTile>>();

  /** The cached tile, if it is this tile in the current format. An unreadable cache counts as empty. */
  const fromCache = async (id: TileId): Promise<WorldTile | undefined> => {
    if (!cache) return undefined;
    try {
      const tile = await cache.get(id);
      if (!tile || tile.version !== WORLD_TILE_VERSION) return undefined;
      return tileKey(tile.id) === tileKey(id) ? tile : undefined;
    } catch (error) {
      onCacheError?.(error);
      return undefined;
    }
  };

  const find = async (id: TileId): Promise<LoadedTile> => {
    if (saved) {
      try {
        return { tile: prepareTile(await saved.getTile(id), now()), from: "saved" };
      } catch (error) {
        if (!(error instanceof TileNotFoundError)) throw error;
      }
    }
    const cached = await fromCache(id);
    const age = cached ? Date.parse(now()) - Date.parse(cached.generatedAt) : Number.NaN;
    // A tile whose age cannot be worked out counts as old.
    if (cached && age <= maxAgeMs) return { tile: cached, from: "cache" };
    let tile: WorldTile;
    try {
      tile = prepareTile(await source.getTile(id), now());
    } catch (error) {
      if (cached) return { tile: cached, from: "cache" };
      throw error;
    }
    if (cache) {
      try {
        await cache.put(tile);
      } catch (error) {
        onCacheError?.(error);
      }
    }
    return { tile, from: "network" };
  };

  return {
    load(id) {
      const key = tileKey(id);
      const running = onTheWay.get(key);
      if (running) return running;
      const request = find(id).finally(() => onTheWay.delete(key));
      onTheWay.set(key, request);
      return request;
    },
  };
}
