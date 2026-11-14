// Raw tile data -> the tile the game stores and builds from.

import type { TileData, WorldTile } from "../types.ts";
import { featuresForTile } from "./clip.ts";
import { parseElements } from "./parse.ts";

/** Bump when parsing or the stored tile format changes; older cached tiles are then fetched again. */
export const WORLD_TILE_VERSION = 1;

/**
 * Parses a tile's raw data and keeps what belongs to that tile, in lat/lon.
 * `generatedAt` is passed in (an ISO time) so this never reads the clock.
 */
export function prepareTile(data: TileData, generatedAt: string): WorldTile {
  return {
    id: data.id,
    version: WORLD_TILE_VERSION,
    generatedAt,
    features: featuresForTile(parseElements(data.elements), data.id),
  };
}
