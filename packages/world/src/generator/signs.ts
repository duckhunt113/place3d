// Shop signs: a name board on the wall of the building a shop is in, on the side that faces
// the parking lot or the street, so you can read it as you arrive.

import type { AssetSelector } from "../assets/select.ts";
import type { AssetRequest, ColorName, FeatureId, Placement, Vec2 } from "../types.ts";
import { type Pair, pointInRing } from "../util/geometry.ts";
import type { RoadPiece } from "./roads.ts";

/** A place that wants a name sign: where it is mapped and what the sign says. */
export type SignRequest = {
  id: FeatureId;
  at: Vec2;
  text: string;
  asset: AssetRequest;
  colour?: ColorName;
  /**
   * False for a place in a neighbouring tile. Its board is put up by that tile, but it is
   * taken into account here so both tiles agree on who gets a spot they both want.
   */
  owned: boolean;
};

/** A building a sign can hang on. */
export type SignBuilding = { id: FeatureId; footprint: Vec2[]; heightM: number };

/** What a wall can face. */
export type SignSurroundings = {
  roads: readonly RoadPiece[];
  /** Outlines of parking lots. */
  lots: readonly Vec2[][];
};

/** A shop mapped just outside a building (at its door) still belongs to it, up to this far. */
const MAX_TO_BUILDING_M = 8;
/** Walls shorter than this are too small for a sign. */
const MIN_WALL_M = 2.5;
/** How far a wall "looks" for a parking lot or a road in front of it. */
const LOOK_M = 40;
/** How much worse each kind of thing is to face than a parking lot or a street (in metres). */
const FACING = { street: 0, lane: 6, driveway: 12, nothing: 40 };
/** Each metre between the wall and what it faces counts as this many metres of distance. */
const PER_METRE = 0.3;
/** Boards are bigger than real ones, so the names read from across a parking lot. */
const MAX_SCALE = 1.6;
/** Below this size the name is unreadable: a wall too short for that gets no sign. */
const MIN_SCALE = 0.7;
/** Space kept between two boards, and between a board and the wall's ends. */
const GAP_M = 0.3;
/** The bottom of a board hangs this high where the wall allows: above a door. */
const HANG_M = 3.0;
/** A board keeps this far below the top of the wall, and never hangs lower than this. */
const BELOW_TOP_M = 0.45;
const LOWEST_M = 0.6;
/** A board stands this far off the wall, so the two never flicker. */
const OFF_WALL_M = 0.01;

type Wall = { a: Vec2; along: Vec2; out: Vec2; length: number };

function wallsOf(footprint: readonly Vec2[]): Wall[] {
  const walls: Wall[] = [];
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i] as Vec2;
    const b = footprint[(i + 1) % footprint.length] as Vec2;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < MIN_WALL_M) continue;
    const along: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let out: Vec2 = [along[1], -along[0]];
    // "Out" must point away from the building: test a spot just off the wall's middle.
    const probe: Pair = [(a[0] + b[0]) / 2 + out[0] * 0.05, (a[1] + b[1]) / 2 + out[1] * 0.05];
    if (pointInRing(probe, footprint as Pair[])) out = [-out[0], -out[1]];
    walls.push({ a, along, out, length });
  }
  return walls;
}

/** How far along a ray (from `origin`, in unit direction `dir`) it crosses the segment a-b. */
function rayHit(origin: Vec2, dir: Vec2, a: Vec2, b: Vec2): number | undefined {
  const ex = b[0] - a[0];
  const ez = b[1] - a[1];
  const cross = dir[0] * ez - dir[1] * ex;
  if (Math.abs(cross) < 1e-9) return undefined;
  const ox = a[0] - origin[0];
  const oz = a[1] - origin[1];
  const t = (ox * ez - oz * ex) / cross;
  const u = (ox * dir[1] - oz * dir[0]) / cross;
  return t >= 0 && u >= 0 && u <= 1 ? t : undefined;
}

function nearestHit(origin: Vec2, dir: Vec2, ring: readonly Vec2[], closed: boolean): number {
  let best = Infinity;
  const count = closed ? ring.length : ring.length - 1;
  for (let i = 0; i < count; i++) {
    const hit = rayHit(origin, dir, ring[i] as Vec2, ring[(i + 1) % ring.length] as Vec2);
    if (hit !== undefined && hit < best) best = hit;
  }
  return best;
}

/**
 * How good a spot on a wall is for a sign, as a distance in metres: lower is better. Facing
 * a parking lot or a street close by is best; facing a back lane is worse; facing nothing,
 * or another building, is worst.
 */
function facing(
  spot: Vec2,
  out: Vec2,
  own: SignBuilding,
  buildings: readonly SignBuilding[],
  around: SignSurroundings,
): number {
  const origin: Vec2 = [spot[0] + out[0] * 0.1, spot[1] + out[1] * 0.1];
  // Nothing behind another building counts.
  let reach = LOOK_M;
  for (const other of buildings) {
    if (other !== own) reach = Math.min(reach, nearestHit(origin, out, other.footprint, true));
  }
  let best = FACING.nothing;
  for (const lot of around.lots) {
    const hit = pointInRing(origin as Pair, lot as Pair[]) ? 0 : nearestHit(origin, out, lot, true);
    if (hit < reach) best = Math.min(best, hit * PER_METRE);
  }
  for (const road of around.roads) {
    const { kind, curbs } = road.decision;
    if (kind === "path") continue;
    const hit = nearestHit(origin, out, road.line, false);
    if (hit >= reach) continue;
    const worse = kind === "driveway" ? FACING.driveway : curbs ? FACING.street : FACING.lane;
    best = Math.min(best, worse + hit * PER_METRE);
  }
  return best;
}

/**
 * A wall is divided into equal bays, like the sign band of a real plaza: one board per bay,
 * centred in it. The bays depend only on the wall, never on which signs exist, so two tiles
 * that share a building work out the same bays.
 */
function baysOf(wall: Wall, boardWidth: number): { count: number; width: number; scale: number } {
  const count = Math.max(1, Math.floor(wall.length / (boardWidth * MAX_SCALE + GAP_M)));
  const width = wall.length / count;
  return { count, width, scale: Math.min(MAX_SCALE, (width - GAP_M) / boardWidth) };
}

/** The wall of a building a sign for a shop at `at` should hang on, and where along it. */
function chooseWall(
  at: Vec2,
  building: SignBuilding,
  walls: readonly Wall[],
  buildings: readonly SignBuilding[],
  around: SignSurroundings,
): { wall: Wall; along: number } | undefined {
  let best: { wall: Wall; along: number; score: number } | undefined;
  for (const wall of walls) {
    const dx = at[0] - wall.a[0];
    const dz = at[1] - wall.a[1];
    const along = Math.max(0, Math.min(wall.length, dx * wall.along[0] + dz * wall.along[1]));
    const spot: Vec2 = [wall.a[0] + wall.along[0] * along, wall.a[1] + wall.along[1] * along];
    const distance = Math.hypot(at[0] - spot[0], at[1] - spot[1]);
    const score = distance + facing(spot, wall.out, building, buildings, around);
    if (!best || score < best.score) best = { wall, along, score };
  }
  return best;
}

function distanceToRing(p: Vec2, ring: readonly Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Vec2;
    const b = ring[(i + 1) % ring.length] as Vec2;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length2 = dx * dx + dz * dz;
    const t =
      length2 === 0
        ? 0
        : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / length2));
    best = Math.min(best, Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz)));
  }
  return best;
}

/** The building a shop is in; failing that, the nearest one close enough to be its own. */
function buildingOf(at: Vec2, buildings: readonly SignBuilding[]): SignBuilding | undefined {
  const inside = buildings.find((b) => pointInRing(at as Pair, b.footprint as Pair[]));
  if (inside) return inside;
  let best: { building: SignBuilding; distance: number } | undefined;
  for (const building of buildings) {
    const distance = distanceToRing(at, building.footprint);
    if (distance <= MAX_TO_BUILDING_M && (!best || distance < best.distance)) {
      best = { building, distance };
    }
  }
  return best?.building;
}

/**
 * Hangs a name board for every owned request on its building's front wall, one board per
 * bay of the wall. When several places want the same bay, the one with the smallest id gets
 * it and the others go without. The same input always gives the same boards.
 */
export function placeSigns(
  requests: readonly SignRequest[],
  buildings: readonly SignBuilding[],
  around: SignSurroundings,
  selector: AssetSelector,
): Placement[] {
  const sorted = [...requests].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const wallsByBuilding = new Map<SignBuilding, Wall[]>();
  const taken = new Map<Wall, Set<number>>();
  const names = new Set<string>();
  const out: Placement[] = [];
  for (const request of sorted) {
    const building = buildingOf(request.at, buildings);
    if (!building) continue;
    // One sign per name per building, even when the map has the place twice.
    const name = `${building.id}|${request.text}`;
    if (names.has(name)) continue;
    const asset = selector.select(request.asset, request.id);
    const entry = asset ? selector.entry(asset) : undefined;
    if (!asset || !entry) continue;
    const boardWidth = Number(entry.attributes.widthM) || entry.footprintM[0];
    const boardHeight = Number(entry.attributes.heightM) || 0.6;
    const boardDepth = entry.footprintM[1];
    let walls = wallsByBuilding.get(building);
    if (!walls) {
      walls = wallsOf(building.footprint);
      wallsByBuilding.set(building, walls);
    }
    const fits = walls.filter((wall) => baysOf(wall, boardWidth).scale >= MIN_SCALE);
    const choice = chooseWall(request.at, building, fits, buildings, around);
    if (!choice) continue;
    const { wall } = choice;
    const bays = baysOf(wall, boardWidth);
    const bay = Math.min(bays.count - 1, Math.floor(choice.along / bays.width));
    const used = taken.get(wall) ?? new Set<number>();
    taken.set(wall, used);
    if (used.has(bay)) continue;
    used.add(bay);
    names.add(name);
    if (!request.owned) continue;
    const along = (bay + 0.5) * bays.width;
    const top = building.heightM - BELOW_TOP_M;
    const bottom = Math.max(LOWEST_M, Math.min(HANG_M, top - boardHeight * bays.scale));
    const off = (boardDepth / 2) * bays.scale + OFF_WALL_M;
    const placement: Placement = {
      asset,
      pos: [
        wall.a[0] + wall.along[0] * along + wall.out[0] * off,
        bottom,
        wall.a[1] + wall.along[1] * along + wall.out[1] * off,
      ],
      // The board's face looks along +z when unturned; turn it to look out from the wall.
      rotY: Math.atan2(wall.out[0], wall.out[1]),
      scale: bays.scale,
      text: request.text,
    };
    if (request.colour) placement.tint = request.colour;
    out.push(placement);
  }
  return out;
}
