// Lat/lon <-> local metres (CLAUDE.md, hard rule 3).
//
// Local coordinates are measured from the north-west corner of a REGION: the zoom-10 map tile
// that contains the entered point. Axes match Three.js: x = east, z = south (north is -z).
// 1 unit = 1 metre, to within about 0.5% anywhere inside a region.
//
// Anything stored or shared keeps lat/lon. Project only when generating.

import type { LatLon, Region, Vec2 } from "../types.ts";

export const REGION_ZOOM = 10;

/** Earth radius used by Web Mercator (EPSG:3857), in metres. */
const R = 6378137;
/** Web Mercator stops here; beyond it the map would stretch to infinity. */
const MAX_LAT = 85.05112878;
const DEG = Math.PI / 180;
const WORLD = 2 * Math.PI * R;
const TILES = 2 ** REGION_ZOOM;
const TILE_SIZE = WORLD / TILES;

function check(p: LatLon): void {
  const ok =
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lon) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lon) <= 180;
  if (!ok) throw new RangeError(`Invalid lat/lon: ${p.lat}, ${p.lon}`);
}

/**
 * Global Web Mercator metres (x east, y north). The same everywhere, so it is also the right
 * thing to round to a grid when seeding by position.
 */
export function mercator(p: LatLon): { x: number; y: number } {
  check(p);
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, p.lat));
  return {
    x: R * p.lon * DEG,
    y: R * Math.log(Math.tan(Math.PI / 4 + (lat * DEG) / 2)),
  };
}

/** The region with the given zoom-10 tile numbers. */
export function regionFromTile(x: number, y: number): Region {
  const inside =
    Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < TILES && y < TILES;
  if (!inside) throw new RangeError(`Invalid region tile: ${x}, ${y}`);
  const originX = x * TILE_SIZE - WORLD / 2;
  const originY = WORLD / 2 - y * TILE_SIZE;
  // Latitude at the middle of the tile (middle in Mercator metres).
  const centreLat = Math.atan(Math.sinh((originY - TILE_SIZE / 2) / R));
  return { z: REGION_ZOOM, x, y, originX, originY, k: Math.cos(centreLat) };
}

/** The region containing a point. The same place always gives the same region. */
export function regionFor(p: LatLon): Region {
  const m = mercator(p);
  const x = Math.min(TILES - 1, Math.max(0, Math.floor((m.x + WORLD / 2) / TILE_SIZE)));
  const y = Math.min(TILES - 1, Math.max(0, Math.floor((WORLD / 2 - m.y) / TILE_SIZE)));
  return regionFromTile(x, y);
}

/** Lat/lon to local metres [x, z] in a region. */
export function project(region: Region, p: LatLon): Vec2 {
  const m = mercator(p);
  return [(m.x - region.originX) * region.k, -(m.y - region.originY) * region.k];
}

/** Local metres [x, z] in a region back to lat/lon. */
export function unproject(region: Region, v: Vec2): LatLon {
  const mx = v[0] / region.k + region.originX;
  const my = -v[1] / region.k + region.originY;
  return { lat: Math.atan(Math.sinh(my / R)) / DEG, lon: mx / R / DEG };
}
