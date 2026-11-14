// Turns a tile's raw data into features the game understands: OSM elements (Overpass
// `out geom` shape) first, then gap-fill buildings from other sources.
// Coordinates stay in lat/lon. Broken shapes and duplicates are dropped.

import type {
  ExtraBuilding,
  GeoFeature,
  LatLon,
  OsmElement,
  OsmId,
  Tags,
  TileData,
} from "../types.ts";
import { type Pair, signedArea } from "../util/geometry.ts";

/** Rings smaller than this (in square degrees, roughly half a square metre) are treated as broken. */
const MIN_RING_AREA = 5e-11;

const TYPE_ORDER = { node: 0, way: 1, relation: 2 } as const;

function osmIdOf(element: OsmElement): OsmId {
  return `${element.type}/${element.id}`;
}

function samePoint(a: LatLon, b: LatLon): boolean {
  return a.lat === b.lat && a.lon === b.lon;
}

/** Drops unusable points and points that repeat the one before. */
function clean(points: LatLon[] | undefined): LatLon[] {
  const out: LatLon[] = [];
  for (const p of points ?? []) {
    if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    const last = out[out.length - 1];
    if (!last || !samePoint(last, p)) out.push({ lat: p.lat, lon: p.lon });
  }
  return out;
}

function isClosed(points: LatLon[]): boolean {
  return points.length >= 4 && samePoint(points[0] as LatLon, points[points.length - 1] as LatLon);
}

function ringArea(ring: LatLon[]): number {
  return Math.abs(signedArea(ring.map((p): Pair => [p.lon, p.lat])));
}

/** A closed line as a ring without its repeated last point, or undefined if it is not a usable ring. */
function toRing(points: LatLon[]): LatLon[] | undefined {
  if (!isClosed(points)) return undefined;
  const ring = points.slice(0, -1);
  return ring.length >= 3 && ringArea(ring) >= MIN_RING_AREA ? ring : undefined;
}

/**
 * A usable outline from a closed line of points (first point repeated at the end), or undefined.
 * Shared with the other map sources, so every source drops the same broken shapes.
 */
export function closedLineToRing(points: LatLon[] | undefined): LatLon[] | undefined {
  return toRing(clean(points));
}

function isBuilding(tags: Tags): boolean {
  return tags.building !== undefined && tags.building !== "no";
}

function isAreaLike(tags: Tags): boolean {
  if (tags.natural === "tree_row") return false;
  return Boolean(tags.landuse || tags.leisure || tags.natural || tags.amenity);
}

/** Joins a relation's member ways end to end into closed rings. Pieces that never close are dropped. */
function stitchRings(lines: LatLon[][]): LatLon[][] {
  const rings: LatLon[][] = [];
  const open = lines.filter((line) => line.length >= 2);
  while (open.length > 0) {
    let current = open.shift() as LatLon[];
    let grew = true;
    while (!isClosed(current) && grew) {
      grew = false;
      const end = current[current.length - 1] as LatLon;
      for (let i = 0; i < open.length; i++) {
        const next = open[i] as LatLon[];
        const first = next[0] as LatLon;
        const last = next[next.length - 1] as LatLon;
        if (samePoint(end, first)) current = [...current, ...next.slice(1)];
        else if (samePoint(end, last)) current = [...current, ...next.slice(0, -1).reverse()];
        else continue;
        open.splice(i, 1);
        grew = true;
        break;
      }
    }
    const ring = toRing(current);
    if (ring) rings.push(ring);
  }
  return rings;
}

function parseNode(element: OsmElement, tags: Tags): GeoFeature | undefined {
  const { lat, lon } = element;
  if (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon)) {
    return undefined;
  }
  if (Object.keys(tags).length === 0) return undefined;
  return { kind: "point", id: osmIdOf(element), at: { lat, lon }, tags };
}

function parseWay(element: OsmElement, tags: Tags): GeoFeature | undefined {
  const points = clean(element.geometry);
  const ring = toRing(points);
  const id = osmIdOf(element);
  if (isBuilding(tags)) {
    return ring ? { kind: "building", id, footprint: ring, tags } : undefined;
  }
  if (tags.highway) {
    if (ring && tags.area === "yes") return { kind: "area", id, outline: ring, tags };
    return points.length >= 2 ? { kind: "road", id, line: points, tags } : undefined;
  }
  if (ring && isAreaLike(tags)) return { kind: "area", id, outline: ring, tags };
  return undefined;
}

/** Multipolygon relations: the largest outer ring becomes the shape; inner rings become holes. */
function parseRelation(element: OsmElement, tags: Tags): GeoFeature | undefined {
  if (tags.type !== "multipolygon" || !element.members) return undefined;
  const lines = (role: string) =>
    (element.members ?? []).filter((m) => m.role === role).map((m) => clean(m.geometry));
  const outers = stitchRings(lines("outer")).sort((a, b) => ringArea(b) - ringArea(a));
  const outline = outers[0];
  if (!outline) return undefined;
  const id = osmIdOf(element);
  if (isBuilding(tags)) return { kind: "building", id, footprint: outline, tags };
  if (!isAreaLike(tags)) return undefined;
  const holes = stitchRings(lines("inner"));
  return holes.length > 0
    ? { kind: "area", id, outline, holes, tags }
    : { kind: "area", id, outline, tags };
}

/**
 * Elements to features: buildings, roads, areas and points, each once, in a stable order
 * (nodes, ways, relations; by id), so the same data always gives the same list.
 */
export function parseElements(elements: readonly OsmElement[]): GeoFeature[] {
  const seen = new Set<string>();
  const sorted = [...elements].sort(
    (a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.id - b.id,
  );
  const features: GeoFeature[] = [];
  for (const element of sorted) {
    const id = osmIdOf(element);
    if (seen.has(id)) continue;
    seen.add(id);
    const tags = element.tags ?? {};
    const feature =
      element.type === "node"
        ? parseNode(element, tags)
        : element.type === "way"
          ? parseWay(element, tags)
          : parseRelation(element, tags);
    if (feature) features.push(feature);
  }
  return features;
}

/**
 * Gap-fill buildings to features, in id order. The outline is checked again here, because
 * saved tiles are read from files.
 */
export function parseExtraBuildings(buildings: readonly ExtraBuilding[]): GeoFeature[] {
  const seen = new Set<string>();
  const features: GeoFeature[] = [];
  const sorted = [...buildings].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const building of sorted) {
    if (seen.has(building.id)) continue;
    seen.add(building.id);
    const points = clean(building.footprint);
    const first = points[0];
    // Stored outlines do not repeat the first point; close the line to reuse the same checks.
    const ring = first ? toRing([...points, first]) : undefined;
    if (!ring) continue;
    features.push({ kind: "building", id: building.id, footprint: ring, tags: building.tags });
  }
  return features;
}

/** Everything in a tile's data as features: OSM first, then the gap-fill buildings. */
export function parseTile(data: Pick<TileData, "elements" | "buildings">): GeoFeature[] {
  return [...parseElements(data.elements), ...parseExtraBuildings(data.buildings ?? [])];
}
