// OSM first: buildings from other sources are only used where OSM has none.
// Whoever saves or builds tiles (the fixture script now, the tile builder later) runs this once
// over the whole area, so a tile's `buildings` never overlap an OSM building.

import polygonClipping from "polygon-clipping";
import type { ExtraBuilding, GeoFeature, LatLon } from "../types.ts";
import { centroid, type Pair, pointInRing, signedArea } from "../util/geometry.ts";
import type { LatLonBox } from "./tiles.ts";

/**
 * Two outlines are the same building when the shared part is at least this share of the
 * smaller one. Neighbours whose traced outlines merely touch stay separate.
 */
export const OVERLAP_SHARE = 0.2;

/** Grid cell size in degrees (about 200 m) for looking up nearby buildings without scanning all of them. */
const CELL = 0.002;

type Shape = { ring: Pair[]; box: LatLonBox; area: number };

function shapeOf(footprint: readonly LatLon[]): Shape {
  const ring = footprint.map((p): Pair => [p.lon, p.lat]);
  const lats = footprint.map((p) => p.lat);
  const lons = footprint.map((p) => p.lon);
  return {
    ring,
    box: {
      south: Math.min(...lats),
      west: Math.min(...lons),
      north: Math.max(...lats),
      east: Math.max(...lons),
    },
    area: Math.abs(signedArea(ring)),
  };
}

function boxesTouch(a: LatLonBox, b: LatLonBox): boolean {
  return a.west <= b.east && a.east >= b.west && a.south <= b.north && a.north >= b.south;
}

function cellsOf(box: LatLonBox): string[] {
  const keys: string[] = [];
  for (let y = Math.floor(box.south / CELL); y <= Math.floor(box.north / CELL); y++) {
    for (let x = Math.floor(box.west / CELL); x <= Math.floor(box.east / CELL); x++) {
      keys.push(`${x}:${y}`);
    }
  }
  return keys;
}

function sharedArea(a: Shape, b: Shape): number {
  try {
    const pieces = polygonClipping.intersection([a.ring], [b.ring]);
    let total = 0;
    for (const polygon of pieces) {
      const outer = polygon[0];
      if (outer) total += Math.abs(signedArea(outer.slice(0, -1)));
    }
    return total;
  } catch {
    // A twisted outline can defeat the clipper. Fall back to "is one centre inside the other".
    const inside = pointInRing(centroid(a.ring), b.ring) || pointInRing(centroid(b.ring), a.ring);
    return inside ? Math.min(a.area, b.area) : 0;
  }
}

function overlaps(a: Shape, b: Shape): boolean {
  if (!boxesTouch(a.box, b.box)) return false;
  const smaller = Math.min(a.area, b.area);
  return smaller > 0 && sharedArea(a, b) >= OVERLAP_SHARE * smaller;
}

/**
 * Keeps the candidates that do not overlap any OSM building, in the order given.
 * `osm` may hold any features; only its buildings are looked at.
 */
export function fillBuildingGaps(
  candidates: readonly ExtraBuilding[],
  osm: readonly GeoFeature[],
): ExtraBuilding[] {
  const index = new Map<string, Shape[]>();
  for (const feature of osm) {
    if (feature.kind !== "building") continue;
    const shape = shapeOf(feature.footprint);
    for (const key of cellsOf(shape.box)) {
      const list = index.get(key) ?? [];
      list.push(shape);
      index.set(key, list);
    }
  }
  return candidates.filter((candidate) => {
    if (candidate.footprint.length < 3) return false;
    const shape = shapeOf(candidate.footprint);
    for (const key of cellsOf(shape.box)) {
      for (const existing of index.get(key) ?? []) {
        if (overlaps(shape, existing)) return false;
      }
    }
    return true;
  });
}

/**
 * The buildings whose bounding box touches the box: what one tile's data carries.
 * A building on a tile edge goes into both tiles' data; its centre later picks the one owner.
 */
export function buildingsTouching(
  buildings: readonly ExtraBuilding[],
  box: LatLonBox,
): ExtraBuilding[] {
  return buildings.filter(
    (b) => b.footprint.length >= 3 && boxesTouch(shapeOf(b.footprint).box, box),
  );
}
