// Runs the world package off the main thread (CLAUDE.md, hard rule 7), so the page never
// freezes while an area is fetched and built. The main thread talks to it through comlink.

import {
  type AssetCatalog,
  AssetSelector,
  buildTile,
  createRuleEngine,
  FallbackTileSource,
  FileTileSource,
  type LatLon,
  loadFixtureTile,
  OverpassTileSource,
  prepareTile,
  regionFor,
  type TileId,
  type TileMeshes,
  tileKey,
  tilesInRadius,
} from "@somewhere/world";
import { expose, transfer } from "comlink";

export type TileResult =
  | { key: string; ok: true; tile: TileMeshes }
  | { key: string; ok: false; error: string };

export type AreaSummary = {
  tiles: number;
  failed: number;
  buildings: number;
  roads: number;
  /** Models placed: trees, bushes and props. */
  placements: number;
  triangles: number;
  /** False if a newer request replaced this one before it finished. */
  finished: boolean;
};

/** How many tiles are fetched at once. Kept low to be fair to the public map server. */
const PARALLEL = 2;

// Saved tiles first (no network needed), then the live map for anywhere else.
const source = new FallbackTileSource([
  new FileTileSource(loadFixtureTile),
  new OverpassTileSource({ now: () => new Date().toISOString() }),
]);
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

const api = {
  /**
   * Fetches and builds every tile within `radiusM` of `centre`, reporting each one as it is
   * ready. Starting a new request makes any older one stop after its current tiles.
   */
  async loadArea(
    centre: LatLon,
    radiusM: number,
    onTile: (result: TileResult) => void | Promise<void>,
  ): Promise<AreaSummary> {
    const request = ++latestRequest;
    const region = regionFor(centre);
    const queue: TileId[] = tilesInRadius(centre, radiusM);
    const summary: AreaSummary = {
      tiles: queue.length,
      failed: 0,
      buildings: 0,
      roads: 0,
      placements: 0,
      triangles: 0,
      finished: true,
    };

    const work = async (): Promise<void> => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        if (request !== latestRequest) {
          summary.finished = false;
          return;
        }
        const key = tileKey(id);
        try {
          const data = await source.getTile(id);
          const tile = buildTile(
            prepareTile(data, new Date().toISOString()),
            region,
            engine,
            await selector,
          );
          summary.buildings += tile.counts.buildings;
          summary.roads += tile.counts.roads;
          summary.placements += tile.counts.placements;
          summary.triangles += tile.counts.triangles;
          // Hand the big number arrays over instead of copying them.
          const buffers = [
            ...tile.meshes.flatMap((m) => [
              m.positions.buffer,
              m.normals.buffer,
              m.uvs.buffer,
              m.indices.buffer,
            ]),
            tile.ground.heights.buffer,
          ];
          await onTile(transfer({ key, ok: true, tile }, buffers));
        } catch (error) {
          summary.failed++;
          await onTile({
            key,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, work));
    return summary;
  },
};

export type WorldWorkerApi = typeof api;

expose(api);
