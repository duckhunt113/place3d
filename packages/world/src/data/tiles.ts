// The fixed zoom-17 tile grid (CLAUDE.md, hard rule 4). Tiles are the unit of fetching,
// caching and building. The grid is fixed to the world, never to where the player clicked.

import type { LatLon, TileId } from "../types.ts";
import { mercator } from "./project.ts";

export const TILE_ZOOM = 17;

const R = 6378137;
const DEG = Math.PI / 180;
const WORLD = 2 * Math.PI * R;
const TILES = 2 ** TILE_ZOOM;
/** Tile width in Web Mercator metres (real width is this times cos(latitude)). */
const TILE_SIZE = WORLD / TILES;

export type LatLonBox = { south: number; west: number; north: number; east: number };

function clampIndex(value: number): number {
  return Math.min(TILES - 1, Math.max(0, value));
}

/** The tile containing a point. Points on a shared edge belong to the tile to the east/south. */
export function tileAt(p: LatLon): TileId {
  const m = mercator(p);
  return {
    z: TILE_ZOOM,
    x: clampIndex(Math.floor((m.x + WORLD / 2) / TILE_SIZE)),
    y: clampIndex(Math.floor((WORLD / 2 - m.y) / TILE_SIZE)),
  };
}

export function sameTile(a: TileId, b: TileId): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z;
}

/** "17/x/y": the key used for caches, file names and seeds. */
export function tileKey(id: TileId): string {
  return `${id.z}/${id.x}/${id.y}`;
}

export function parseTileKey(key: string): TileId {
  const match = /^17\/(\d+)\/(\d+)$/.exec(key);
  if (!match) throw new RangeError(`Not a zoom-17 tile key: ${key}`);
  const x = Number(match[1]);
  const y = Number(match[2]);
  if (x >= TILES || y >= TILES) throw new RangeError(`Tile out of range: ${key}`);
  return { z: TILE_ZOOM, x, y };
}

/** The tile's edges in degrees. Neighbouring tiles share exactly the same edge values. */
export function tileBounds(id: TileId): LatLonBox {
  const lon = (x: number) => (x / TILES) * 360 - 180;
  const lat = (y: number) => Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / TILES))) / DEG;
  return { south: lat(id.y + 1), west: lon(id.x), north: lat(id.y), east: lon(id.x + 1) };
}

/** Every tile that a circle of real-world radius `radiusM` around `centre` touches, north to south, west to east. */
export function tilesInRadius(centre: LatLon, radiusM: number): TileId[] {
  if (!(radiusM >= 0)) throw new RangeError(`Invalid radius: ${radiusM}`);
  const c = mercator(centre);
  // Mercator stretches distances by 1 / cos(latitude), so stretch the radius to match.
  const r = radiusM / Math.cos(centre.lat * DEG);
  const cx = c.x + WORLD / 2;
  const cy = WORLD / 2 - c.y;
  const x0 = clampIndex(Math.floor((cx - r) / TILE_SIZE));
  const x1 = clampIndex(Math.floor((cx + r) / TILE_SIZE));
  const y0 = clampIndex(Math.floor((cy - r) / TILE_SIZE));
  const y1 = clampIndex(Math.floor((cy + r) / TILE_SIZE));
  const tiles: TileId[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      // Distance from the centre to the nearest point of this tile's square.
      const dx = Math.max(x * TILE_SIZE - cx, 0, cx - (x + 1) * TILE_SIZE);
      const dy = Math.max(y * TILE_SIZE - cy, 0, cy - (y + 1) * TILE_SIZE);
      if (dx * dx + dy * dy <= r * r) tiles.push({ z: TILE_ZOOM, x, y });
    }
  }
  return tiles;
}
