// Decides which tile each feature belongs to, so nothing is built twice (CLAUDE.md, hard rule 4):
// a building belongs to the tile holding its centre, a point to the tile it is in, and
// roads and areas are cut at the tile's edges so the pieces in neighbouring tiles line up.

import polygonClipping from "polygon-clipping";
import type { GeoFeature, LatLon, TileId } from "../types.ts";
import { centroid, type Pair } from "../util/geometry.ts";
import { type LatLonBox, sameTile, tileAt, tileBounds } from "./tiles.ts";

type Road = Extract<GeoFeature, { kind: "road" }>;
type Area = Extract<GeoFeature, { kind: "area" }>;

const toPair = (p: LatLon): Pair => [p.lon, p.lat];
const toLatLon = (p: Pair): LatLon => ({ lat: p[1], lon: p[0] });

/** The centre of a footprint, used to pick a building's owner tile. */
export function footprintCentre(footprint: readonly LatLon[]): LatLon {
  return toLatLon(centroid(footprint.map(toPair)));
}

/**
 * Cuts one segment a->b to the box (Liang-Barsky). Returns the part inside, or undefined.
 * A cut end is placed exactly on the edge value, so both neighbouring tiles get the same point.
 */
function clipSegment(a: LatLon, b: LatLon, box: LatLonBox): [LatLon, LatLon] | undefined {
  const dx = b.lon - a.lon;
  const dy = b.lat - a.lat;
  // For each edge: p is the direction towards it, q the distance to it, `edge` its value.
  const edges = [
    { p: -dx, q: a.lon - box.west, axis: "lon", value: box.west },
    { p: dx, q: box.east - a.lon, axis: "lon", value: box.east },
    { p: -dy, q: a.lat - box.south, axis: "lat", value: box.south },
    { p: dy, q: box.north - a.lat, axis: "lat", value: box.north },
  ] as const;
  let t0 = 0;
  let t1 = 1;
  let enter: (typeof edges)[number] | undefined;
  let leave: (typeof edges)[number] | undefined;
  for (const edge of edges) {
    if (edge.p === 0) {
      if (edge.q < 0) return undefined;
      continue;
    }
    const t = edge.q / edge.p;
    if (edge.p < 0) {
      if (t > t1) return undefined;
      if (t > t0) {
        t0 = t;
        enter = edge;
      }
    } else {
      if (t < t0) return undefined;
      if (t < t1) {
        t1 = t;
        leave = edge;
      }
    }
  }
  const at = (t: number, edge: (typeof edges)[number] | undefined): LatLon => {
    if (!edge) return t === 0 ? a : b;
    const point = { lat: a.lat + t * dy, lon: a.lon + t * dx };
    point[edge.axis] = edge.value;
    return point;
  };
  return [at(t0, enter), at(t1, leave)];
}

/** Cuts a line to the box. A line that leaves and comes back gives several pieces. */
export function clipLine(line: readonly LatLon[], box: LatLonBox): LatLon[][] {
  const pieces: LatLon[][] = [];
  let current: LatLon[] | undefined;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as LatLon;
    const b = line[i + 1] as LatLon;
    const inside = clipSegment(a, b, box);
    if (!inside) {
      current = undefined;
      continue;
    }
    const [start, end] = inside;
    if (current && start === a) current.push(end);
    else {
      current = [start, end];
      pieces.push(current);
    }
    if (end !== b) current = undefined;
  }
  return pieces.filter((piece) =>
    piece.some((p) => p.lat !== (piece[0] as LatLon).lat || p.lon !== (piece[0] as LatLon).lon),
  );
}

function clipArea(area: Area, box: LatLonBox): Area[] {
  const points = [area.outline, ...(area.holes ?? [])].flat();
  const fullyInside = points.every(
    (p) => p.lon >= box.west && p.lon <= box.east && p.lat >= box.south && p.lat <= box.north,
  );
  if (fullyInside) return [area];
  const polygon = [area.outline, ...(area.holes ?? [])].map((ring) => ring.map(toPair));
  const boxRing: Pair[] = [
    [box.west, box.south],
    [box.east, box.south],
    [box.east, box.north],
    [box.west, box.north],
  ];
  let clipped: Pair[][][];
  try {
    clipped = polygonClipping.intersection(polygon, [boxRing]);
  } catch {
    // A self-crossing outline the clipper cannot handle: leave the area out of this tile.
    return [];
  }
  return clipped.map((rings): Area => {
    const [outline, ...holes] = rings.map((ring) => ring.slice(0, -1).map(toLatLon));
    const piece: Area = {
      kind: "area",
      id: area.id,
      outline: outline ?? [],
      tags: area.tags,
    };
    if (holes.length > 0) piece.holes = holes;
    return piece;
  });
}

/** The features (or pieces of features) that belong to one tile. */
export function featuresForTile(features: readonly GeoFeature[], id: TileId): GeoFeature[] {
  const box = tileBounds(id);
  const out: GeoFeature[] = [];
  for (const feature of features) {
    if (feature.kind === "building") {
      if (sameTile(tileAt(footprintCentre(feature.footprint)), id)) out.push(feature);
    } else if (feature.kind === "point") {
      if (sameTile(tileAt(feature.at), id)) out.push(feature);
    } else if (feature.kind === "road") {
      for (const line of clipLine(feature.line, box)) {
        const piece: Road = { kind: "road", id: feature.id, line, tags: feature.tags };
        out.push(piece);
      }
    } else {
      out.push(...clipArea(feature, box));
    }
  }
  return out;
}
