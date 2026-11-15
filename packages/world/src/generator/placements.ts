// Where models go: mapped things at their own spots (hydrants, stop signs, mapped trees), and
// seeded scatter inside areas (trees in parks, woods and yards).
//
// Scatter uses a fixed grid over the whole world (in global Web Mercator metres), one candidate
// spot per cell, seeded by the cell's own numbers. So the same tree stands in the same place
// for everyone, whatever tile or region it is loaded through, and tiles agree along their edges.

import type { AssetSelector } from "../assets/select.ts";
import { mercator } from "../data/project.ts";
import { tileBounds } from "../data/tiles.ts";
import type {
  AreaDecision,
  AssetEntry,
  ObjectDecision,
  Placement,
  RoadDecision,
  TileId,
  Vec2,
} from "../types.ts";
import { type Pair, pointInRing } from "../util/geometry.ts";
import { createRng } from "../util/rng.ts";
import { roadReach } from "./roads.ts";

/** Scatter grid cell size in global Web Mercator metres (about 4.3 m on the ground near Toronto). */
export const SCATTER_CELL = 6;
/** A candidate sits this far inside its cell at least, so neighbours never touch. */
const CELL_MARGIN = 0.15;
/** Share of a model's half-width to keep clear of walls, and of road edges. Canopies may overhang. */
const WALL_CLEARANCE = 0.6;
const ROAD_CLEARANCE = 0.35;
const MIN_CLEARANCE_M = 0.6;
/** How far past the road's edge a mapped roadside sign stands. */
const SIGN_SETBACK_M = 0.8;
/** Living things vary a little in size; made things do not. */
const SIZE_RANGE: [number, number] = [0.85, 1.15];

export type ScatterArea = { decision: AreaDecision; outline: Vec2[]; holes: Vec2[][] };
export type RoadShape = { decision: RoadDecision; line: Vec2[] };
/** A mapped thing that stands at its own spot (decisions with place "point"). */
export type MappedObject = { decision: ObjectDecision; at: Vec2 };

export type PlacementInput = {
  id: TileId;
  /** Global Mercator metres -> local metres. */
  toLocal: (m: { x: number; y: number }) => Vec2;
  /** Real metres per Mercator metre here (the region's k). */
  scale: number;
  areas: readonly ScatterArea[];
  roads: readonly RoadShape[];
  /** Outlines of every building that touches the tile, in local metres. */
  buildings: readonly Vec2[][];
  objects: readonly MappedObject[];
};

function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): { distance: number; along: Vec2 } {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const length2 = dx * dx + dz * dz;
  const t =
    length2 === 0
      ? 0
      : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length2));
  const length = Math.sqrt(length2) || 1;
  return {
    distance: Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)),
    along: [dx / length, dz / length],
  };
}

function distanceToRing(p: Vec2, ring: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const { distance } = distanceToSegment(p, ring[i] as Vec2, ring[(i + 1) % ring.length] as Vec2);
    best = Math.min(best, distance);
  }
  return best;
}

function isLiving(entry: AssetEntry): boolean {
  return (
    entry.category === "tree" || entry.category === "bush" || entry.category.startsWith("detail.")
  );
}

/** True if a model of this size can stand at `p` without being in a building or on a road. */
function isClear(p: Vec2, entry: AssetEntry, input: PlacementInput): boolean {
  const half = Math.max(entry.footprintM[0], entry.footprintM[1]) / 2;
  const fromWalls = Math.max(MIN_CLEARANCE_M, half * WALL_CLEARANCE);
  for (const ring of input.buildings) {
    if (pointInRing(p as Pair, ring as Pair[]) || distanceToRing(p, ring) < fromWalls) return false;
  }
  const fromRoads = Math.max(MIN_CLEARANCE_M, half * ROAD_CLEARANCE);
  for (const road of input.roads) {
    // Clear of the road and of its curb and sidewalk.
    const reach = roadReach(road.decision) + fromRoads;
    for (let i = 0; i + 1 < road.line.length; i++) {
      if (distanceToSegment(p, road.line[i] as Vec2, road.line[i + 1] as Vec2).distance < reach) {
        return false;
      }
    }
  }
  return true;
}

/** The topmost area at a point: the highest layer wins, as when the ground is drawn. */
function areaAt(p: Vec2, areas: readonly ScatterArea[]): ScatterArea | undefined {
  let top: ScatterArea | undefined;
  for (const area of areas) {
    if (top && area.decision.layer <= top.decision.layer) continue;
    if (!pointInRing(p as Pair, area.outline as Pair[])) continue;
    if (area.holes.some((hole) => pointInRing(p as Pair, hole as Pair[]))) continue;
    top = area;
  }
  return top;
}

function scatter(input: PlacementInput, selector: AssetSelector): Placement[] {
  const box = tileBounds(input.id);
  const northWest = mercator({ lat: box.north, lon: box.west });
  const southEast = mercator({ lat: box.south, lon: box.east });
  const cellM2 = (SCATTER_CELL * input.scale) ** 2;
  const out: Placement[] = [];
  const firstX = Math.floor(northWest.x / SCATTER_CELL);
  const lastX = Math.floor(southEast.x / SCATTER_CELL);
  const firstY = Math.floor(southEast.y / SCATTER_CELL);
  const lastY = Math.floor(northWest.y / SCATTER_CELL);
  for (let iy = firstY; iy <= lastY; iy++) {
    for (let ix = firstX; ix <= lastX; ix++) {
      const seed = `scatter/${ix}/${iy}`;
      const rng = createRng(seed);
      const spot = {
        x: (ix + rng.range(CELL_MARGIN, 1 - CELL_MARGIN)) * SCATTER_CELL,
        y: (iy + rng.range(CELL_MARGIN, 1 - CELL_MARGIN)) * SCATTER_CELL,
      };
      // A spot belongs to the one tile that contains it, so no tree is planted twice.
      if (spot.x < northWest.x || spot.x >= southEast.x) continue;
      if (spot.y <= southEast.y || spot.y > northWest.y) continue;
      const p = input.toLocal(spot);
      const area = areaAt(p, input.areas);
      if (!area) continue;
      const rule = area.decision.scatter.find((item) => rng.chance(item.perM2 * cellM2));
      if (!rule) continue;
      const asset = selector.select(rule.asset, seed);
      const entry = asset ? selector.entry(asset) : undefined;
      if (!asset || !entry || !isClear(p, entry, input)) continue;
      out.push({
        asset,
        pos: [p[0], 0, p[1]],
        rotY: rng.range(0, Math.PI * 2),
        scale: isLiving(entry) ? rng.range(...SIZE_RANGE) : 1,
      });
    }
  }
  return out;
}

/** The nearest road to a point, with the direction it runs there. */
function nearestRoad(p: Vec2, roads: readonly RoadShape[]) {
  let best: { distance: number; along: Vec2; halfWidth: number } | undefined;
  for (const road of roads) {
    if (road.decision.kind === "path") continue;
    for (let i = 0; i + 1 < road.line.length; i++) {
      const hit = distanceToSegment(p, road.line[i] as Vec2, road.line[i + 1] as Vec2);
      if (!best || hit.distance < best.distance) {
        best = { ...hit, halfWidth: road.decision.widthM / 2 };
      }
    }
  }
  return best;
}

function mapped(input: PlacementInput, selector: AssetSelector): Placement[] {
  const out: Placement[] = [];
  for (const object of input.objects) {
    const seed = object.decision.id;
    const asset = selector.select(object.decision.asset, seed);
    const entry = asset ? selector.entry(asset) : undefined;
    if (!asset || !entry) continue;
    const rng = createRng(`${seed}/place`);
    let [x, z] = object.at;
    let rotY = rng.range(0, Math.PI * 2);
    const road = nearestRoad(object.at, input.roads);
    // Signs are mapped as a point on the road itself: stand them at the roadside, on the right
    // of the direction the road is drawn, facing back along it.
    if (entry.category.startsWith("sign.") && road && road.distance < road.halfWidth) {
      const [ax, az] = road.along;
      x += -az * (road.halfWidth + SIGN_SETBACK_M);
      z += ax * (road.halfWidth + SIGN_SETBACK_M);
      rotY = Math.atan2(-ax, -az);
    }
    out.push({
      asset,
      pos: [x, 0, z],
      rotY,
      scale: isLiving(entry) ? rng.range(...SIZE_RANGE) : 1,
    });
  }
  return out;
}

/** Every model placement for one tile: mapped objects first, then the scatter. */
export function placeAssets(input: PlacementInput, selector: AssetSelector): Placement[] {
  return [...mapped(input, selector), ...scatter(input, selector)];
}
