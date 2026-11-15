// Runs the world package off the main thread (CLAUDE.md, hard rule 7), so the page never
// freezes while an area is fetched and built. The main thread talks to it through comlink.

import {
  type AssetCatalog,
  AssetSelector,
  buildTile,
  createRuleEngine,
  createTileLoader,
  FileTileSource,
  type LatLon,
  loadFixtureTile,
  OverpassTileSource,
  type Region,
  regionFor,
  type TileId,
  type TileMeshes,
  type TileOrigin,
  tileKey,
  tilesInRadius,
  WORLD_TILE_VERSION,
  type WorldTile,
} from "@somewhere/world";
import { expose, transfer } from "comlink";
import { browserStore, createTileCache } from "../cache/tiles.ts";

export type TileResult = {
  key: string;
  /** The built tile. For a tile that could not be loaded: plain ground, so nobody falls through. */
  tile: TileMeshes;
  /** Where the tile's map data came from, or "failed" if it could not be loaded. */
  from: TileOrigin | "failed";
  /** Why it failed. */
  error?: string;
  /** True if a failed tile will be tried again by itself; false once it has been given up on. */
  retrying?: boolean;
};

export type AreaSummary = {
  tiles: number;
  /** False if a newer request replaced this one before it finished. */
  finished: boolean;
};

/** How many tiles are fetched at once. Kept low to be fair to the public map server. */
const PARALLEL = 2;
/** A tile that failed is tried again after these waits (seconds), then given up on. */
const RETRY_AFTER_S = [5, 20, 60];

const now = (): string => new Date().toISOString();
const cache = createTileCache(browserStore(), WORLD_TILE_VERSION);
// Tidy up tiles saved by older versions of the game. Nothing waits for this.
cache.prune().catch(() => {});
let cacheWarned = false;

// Tiles that ship with the app first (no network), then this device's cache, then the live map.
// VITE_OVERPASS_URL points the game at another Overpass server (see docs/05-data-sources.md).
const overpassUrl: unknown = import.meta.env.VITE_OVERPASS_URL;
const loader = createTileLoader({
  saved: new FileTileSource(loadFixtureTile),
  source: new OverpassTileSource(
    typeof overpassUrl === "string" && overpassUrl !== ""
      ? { now, endpoint: overpassUrl }
      : { now },
  ),
  cache,
  now,
  onCacheError(error) {
    if (cacheWarned) return;
    cacheWarned = true;
    console.warn(
      `The tile cache is not available; tiles will be fetched every time: ${String(error)}`,
    );
  },
});
const engine = createRuleEngine();
let latestRequest = 0;

/** The asset catalog, fetched once. Without it the world still builds, just without models. */
const selector: Promise<AssetSelector | undefined> = fetch(
  `${import.meta.env.BASE_URL}assets/catalog.json`,
)
  .then(async (response) => {
    if (!response.ok) throw new Error(`status ${response.status}`);
    return new AssetSelector((await response.json()) as AssetCatalog);
  })
  .catch((error) => {
    console.warn(
      `The asset catalog could not be loaded; building without models: ${String(error)}`,
    );
    return undefined;
  });

/** Hands the big number arrays over to the main thread instead of copying them. */
function send(result: TileResult): TileResult {
  const buffers = [
    ...result.tile.meshes.flatMap((m) => [
      m.positions.buffer,
      m.normals.buffer,
      m.uvs.buffer,
      m.indices.buffer,
    ]),
    result.tile.ground.heights.buffer,
  ];
  return transfer(result, buffers);
}

/** Loads and builds one tile; on failure, plain ground in its place. */
async function buildOne(id: TileId, region: Region, retrying: boolean): Promise<TileResult> {
  const key = tileKey(id);
  try {
    const loaded = await loader.load(id);
    return { key, tile: buildTile(loaded.tile, region, engine, await selector), from: loaded.from };
  } catch (error) {
    const empty: WorldTile = { id, version: WORLD_TILE_VERSION, generatedAt: now(), features: [] };
    return {
      key,
      tile: buildTile(empty, region, engine),
      from: "failed",
      error: error instanceof Error ? error.message : String(error),
      retrying,
    };
  }
}

const wait = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

const api = {
  /**
   * Fetches and builds every tile within `radiusM` of `centre`, reporting each one as it is
   * ready. Tiles that fail are shown as plain ground and tried again in the background, also
   * after this call has returned; each later result arrives through `onTile` too. `onStart`
   * is told how many tiles there are before the first arrives. Starting a new request makes
   * any older one stop after its current tiles.
   */
  async loadArea(
    centre: LatLon,
    radiusM: number,
    onTile: (result: TileResult) => void | Promise<void>,
    onStart: (tiles: number) => void | Promise<void>,
  ): Promise<AreaSummary> {
    const request = ++latestRequest;
    const region = regionFor(centre);
    const queue: TileId[] = tilesInRadius(centre, radiusM);
    const summary: AreaSummary = { tiles: queue.length, finished: true };
    await onStart(queue.length);
    let failed: TileId[] = [];

    const work = async (): Promise<void> => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        if (request !== latestRequest) {
          summary.finished = false;
          return;
        }
        const result = await buildOne(id, region, true);
        if (result.from === "failed") failed.push(id);
        await onTile(send(result));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, work));

    const retry = async (): Promise<void> => {
      for (const [round, seconds] of RETRY_AFTER_S.entries()) {
        if (failed.length === 0) return;
        await wait(seconds);
        const last = round === RETRY_AFTER_S.length - 1;
        const still: TileId[] = [];
        for (const id of failed) {
          if (request !== latestRequest) return;
          const result = await buildOne(id, region, !last);
          if (result.from === "failed") still.push(id);
          // A tile that failed again only needs reporting once it is given up on.
          if (result.from !== "failed" || last) await onTile(send(result));
        }
        failed = still;
      }
    };
    if (summary.finished && failed.length > 0) void retry();
    return summary;
  },
};

export type WorldWorkerApi = typeof api;

expose(api);
