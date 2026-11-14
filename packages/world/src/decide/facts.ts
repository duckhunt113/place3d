// Geometry facts for rules: things tags cannot say, computed from shapes (CLAUDE.md, hard rule 12).
// Thresholds live in the rules' `where`, never here.

import type { GeoFeature, LatLon } from "../types.ts";
import { centroid, type Pair, pointInRing, signedArea } from "../util/geometry.ts";
import type { Facts } from "./engine.ts";

type Building = Extract<GeoFeature, { kind: "building" }>;

const DEG = Math.PI / 180;
/** Mean Earth radius in metres; good to about 0.3% for small shapes. */
const EARTH_RADIUS = 6371008.8;

const toPair = (p: LatLon): Pair => [p.lon, p.lat];

/** Ground area of a lat/lon ring in square metres. */
export function ringAreaM2(ring: readonly LatLon[]): number {
  const origin = ring[0];
  if (!origin) return 0;
  const scaleX = EARTH_RADIUS * DEG * Math.cos(origin.lat * DEG);
  const scaleY = EARTH_RADIUS * DEG;
  const metres = ring.map(
    (p): Pair => [(p.lon - origin.lon) * scaleX, (p.lat - origin.lat) * scaleY],
  );
  return Math.abs(signedArea(metres));
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
   * footprintM2: ground area; shopNodesInside: shop points inside the footprint;
   * insideLanduse: the landuse value of the area around the building's centre, if any.
   * Only features of the same tile are seen, so a shop in the part of a building that
   * pokes into the next tile is not counted.
   */
  forBuilding(building: Building): Facts {
    const ring = building.footprint.map(toPair);
    const centre = centroid(ring);
    return {
      footprintM2: ringAreaM2(building.footprint),
      shopNodesInside: this.#shops.filter((shop) => pointInRing(shop, ring)).length,
      insideLanduse: this.#landuse.find((area) => pointInRing(centre, area.outline))?.value,
    };
  }
}
