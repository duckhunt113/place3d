// Geometry facts for rules: things tags cannot say, computed from shapes (CLAUDE.md, hard rule 11).
// Thresholds live in the rules' `where`, never here.

import type { GeoFeature, LatLon } from "../types.ts";
import {
  boundingRectangle,
  centroid,
  type Pair,
  pointInRing,
  signedArea,
} from "../util/geometry.ts";
import type { Facts } from "./engine.ts";

type Building = Extract<GeoFeature, { kind: "building" }>;

const DEG = Math.PI / 180;
/** Mean Earth radius in metres; good to about 0.3% for small shapes. */
const EARTH_RADIUS = 6371008.8;

const toPair = (p: LatLon): Pair => [p.lon, p.lat];

/** A lat/lon ring in metres, measured from its first point. Good for shapes up to a few km. */
function toMetres(ring: readonly LatLon[]): Pair[] {
  const origin = ring[0];
  if (!origin) return [];
  const scaleX = EARTH_RADIUS * DEG * Math.cos(origin.lat * DEG);
  const scaleY = EARTH_RADIUS * DEG;
  return ring.map((p): Pair => [(p.lon - origin.lon) * scaleX, (p.lat - origin.lat) * scaleY]);
}

/** Ground area of a lat/lon ring in square metres. */
export function ringAreaM2(ring: readonly LatLon[]): number {
  return Math.abs(signedArea(toMetres(ring)));
}

/**
 * How much of its tightest surrounding rectangle a shape fills, from 0 to 1.
 * A plain rectangular house is 1; an L-shape or a ragged outline is lower.
 */
export function rectangularity(ring: readonly LatLon[]): number {
  const metres = toMetres(ring);
  const box = boundingRectangle(metres);
  if (!box) return 0;
  const boxArea = 4 * box.halfLong * box.halfShort;
  return boxArea > 0 ? Math.min(1, Math.abs(signedArea(metres)) / boxArea) : 0;
}

/** Looks up facts for buildings using the other features of the same tile. */
export class FactFinder {
  readonly #shops: Pair[] = [];
  readonly #landuse: { value: string; outline: Pair[] }[] = [];

  constructor(features: readonly GeoFeature[]) {
    for (const feature of features) {
      if (feature.kind === "point" && feature.tags.shop) this.#shops.push(toPair(feature.at));
      if (feature.kind === "area" && feature.tags.landuse) {
        this.#landuse.push({ value: feature.tags.landuse, outline: feature.outline.map(toPair) });
      }
    }
  }

  /**
   * footprintM2: ground area; rectangularity: share of its tightest rectangle it fills (0-1);
   * shopNodesInside: shop points inside the footprint;
   * insideLanduse: the landuse value of the area around the building's centre, if any.
   * Only features of the same tile are seen, so a shop in the part of a building that
   * pokes into the next tile is not counted.
   */
  forBuilding(building: Building): Facts {
    const ring = building.footprint.map(toPair);
    const centre = centroid(ring);
    return {
      footprintM2: ringAreaM2(building.footprint),
      rectangularity: rectangularity(building.footprint),
      shopNodesInside: this.#shops.filter((shop) => pointInRing(shop, ring)).length,
      insideLanduse: this.#landuse.find((area) => pointInRing(centre, area.outline))?.value,
    };
  }
}
