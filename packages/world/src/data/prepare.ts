// Raw tile data -> the tile the game stores and builds from.

import type { LatLon, TileData, WorldTile } from "../types.ts";
import { featuresForTile } from "./clip.ts";
import { parseTile } from "./parse.ts";
import { tileBounds } from "./tiles.ts";

/** Bump when parsing or the stored tile format changes; older cached tiles are then fetched again. */
export const WORLD_TILE_VERSION = 3;

/**
 * Parses a tile's raw data and keeps what belongs to that tile, in lat/lon.
 * `generatedAt` is passed in (an ISO time) so this never reads the clock.
 */
export function prepareTile(data: TileData, generatedAt: string): WorldTile {
  const all = parseTile(data);
  const features = featuresForTile(all, data.id);
  const owned = new Set(features.filter((f) => f.kind === "building").map((f) => f.id));
  const box = tileBounds(data.id);
  const blockers: LatLon[][] = [];
  for (const feature of all) {
    if (feature.kind !== "building" || owned.has(feature.id)) continue;
    const reaches = feature.footprint.some(
      (p) => p.lat >= box.south && p.lat <= box.north && p.lon >= box.west && p.lon <= box.east,
    );
    if (reaches) blockers.push(feature.footprint);
  }
  const tile: WorldTile = { id: data.id, version: WORLD_TILE_VERSION, generatedAt, features };
  if (blockers.length > 0) tile.blockers = blockers;
  return tile;
}
