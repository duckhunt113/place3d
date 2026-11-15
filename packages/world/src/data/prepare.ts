// Raw tile data -> the tile the game stores and builds from.

import type { GeoFeature, TileContext, TileData, WorldTile } from "../types.ts";
import { featuresForTile, ringTouchesBox, roadPieces } from "./clip.ts";
import { parseTile } from "./parse.ts";
import { tileBounds, tileReach } from "./tiles.ts";

/**
 * Bump when parsing or the stored tile format changes; older cached tiles are then fetched again.
 * 4: `context` (nearby roads and neighbours' buildings) replaces `blockers`; road pieces carry `offsetM`.
 */
export const WORLD_TILE_VERSION = 4;

type Building = Extract<GeoFeature, { kind: "building" }>;

/**
 * Parses a tile's raw data and keeps what belongs to that tile, in lat/lon, plus the
 * surroundings it needs to line up with its neighbours.
 * `generatedAt` is passed in (an ISO time) so this never reads the clock.
 */
export function prepareTile(data: TileData, generatedAt: string): WorldTile {
  const all = parseTile(data);
  const features = featuresForTile(all, data.id);
  const owned = new Set(features.filter((f) => f.kind === "building").map((f) => f.id));
  const box = tileBounds(data.id);
  const reach = tileReach(data.id);
  const context: TileContext = { buildings: [], roads: [], points: [] };
  const ownedPoints = new Set(features.filter((f) => f.kind === "point").map((f) => f.id));
  for (const feature of all) {
    if (feature.kind === "road") {
      context.roads.push(...roadPieces(feature, reach));
    } else if (feature.kind === "building" && !owned.has(feature.id)) {
      if (ringTouchesBox(feature.footprint, box)) context.buildings.push(feature as Building);
    } else if (feature.kind === "point" && !ownedPoints.has(feature.id)) {
      const { lat, lon } = feature.at;
      const near =
        lat >= reach.south && lat <= reach.north && lon >= reach.west && lon <= reach.east;
      if (near) context.points.push(feature);
    }
  }
  const tile: WorldTile = { id: data.id, version: WORLD_TILE_VERSION, generatedAt, features };
  if (context.buildings.length + context.roads.length + context.points.length > 0) {
    tile.context = context;
  }
  return tile;
}
