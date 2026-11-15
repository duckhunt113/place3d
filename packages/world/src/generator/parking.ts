// Parking stalls: white lines painted inside parking lots.
//
// Where the map has the lot's driving aisles, stalls line both sides of each aisle, the way
// real lots are laid out. A small lot with no mapped aisle gets a row of stalls along its
// long sides instead.

import type { ColorName, Vec2 } from "../types.ts";
import { boundingRectangle, type Pair, pointInRing } from "../util/geometry.ts";
import { cutAway, join, overlap, ribbonPieces, type Shape, unite } from "../util/shapes.ts";
import { addFlat } from "./ground.ts";
import type { MeshSet } from "./mesh.ts";
import { ROAD_Y, type RoadPiece } from "./roads.ts";

/** Stall sizes in metres: typical North American values. */
export const STALL_WIDTH_M = 2.7;
export const STALL_DEPTH_M = 5.2;
/** Width of a painted line. Wider than real paint, so it reads from a distance. */
export const STALL_LINE_M = 0.14;
export const STALL_COLOUR: ColorName = "road.white";
/** Stall lines sit above the lot's surface and below the roads that cross it. */
export const STALL_Y = ROAD_Y - 0.01;
/** A lot needs this much width for stalls on both long sides with room to drive between. */
const TWO_ROWS_MIN_M = 2 * STALL_DEPTH_M + 5;
/** And this much for a single row. */
const ONE_ROW_MIN_M = STALL_DEPTH_M + 3;

/** One parking lot (or the part of it inside this tile), in local metres. */
export type ParkingLot = {
  outline: Vec2[];
  holes: Vec2[][];
  /** False when the tile's edge cut a piece off: the lot's true shape is then unknown here. */
  whole: boolean;
};

/** A thin rectangle from `a` to `b`. */
function line(a: Vec2, b: Vec2): Pair[] {
  const length = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  const wx = (-(b[1] - a[1]) / length) * (STALL_LINE_M / 2);
  const wz = ((b[0] - a[0]) / length) * (STALL_LINE_M / 2);
  return [
    [a[0] + wx, a[1] + wz],
    [b[0] + wx, b[1] + wz],
    [b[0] - wx, b[1] - wz],
    [a[0] - wx, a[1] - wz],
  ];
}

function inLot(p: Vec2, lot: ParkingLot): boolean {
  if (!pointInRing(p as Pair, lot.outline as Pair[])) return false;
  return !lot.holes.some((hole) => pointInRing(p as Pair, hole as Pair[]));
}

/**
 * Stall lines along both sides of every aisle. Lines are counted from the start of the whole
 * aisle, so they continue evenly from one tile into the next. Where the stalls of two aisles
 * would cross, the first aisle (by id) keeps its stalls and the other's lines stop there.
 * Also notes which lots had an aisle.
 */
function alongAisles(
  pieces: readonly RoadPiece[],
  lots: readonly ParkingLot[],
  served: Set<ParkingLot>,
): Shape {
  const aisles = pieces
    .filter((piece) => piece.decision.stalls)
    .sort((a, b) =>
      a.decision.id < b.decision.id
        ? -1
        : a.decision.id > b.decision.id
          ? 1
          : a.offsetM - b.offsetM,
    );
  let paint: Shape = [];
  // The ground already given to earlier aisles' stalls.
  let taken: Shape = [];
  let takenBy: RoadPiece["decision"]["id"] | undefined;
  let pending: Pair[][] = [];
  for (const piece of aisles) {
    // Pieces of the same aisle never cut into each other; a new aisle closes the last one's ground.
    if (piece.decision.id !== takenBy) {
      taken = join(taken, unite(pending));
      pending = [];
      takenBy = piece.decision.id;
    }
    const half = piece.decision.widthM / 2;
    const rings: Pair[][] = [];
    let travelled = piece.offsetM;
    for (let i = 0; i + 1 < piece.line.length; i++) {
      const a = piece.line[i] as Vec2;
      const b = piece.line[i + 1] as Vec2;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-6) continue;
      const dx = (b[0] - a[0]) / length;
      const dz = (b[1] - a[1]) / length;
      const first = Math.ceil(travelled / STALL_WIDTH_M) * STALL_WIDTH_M;
      for (let at = first; at < travelled + length; at += STALL_WIDTH_M) {
        const px = a[0] + dx * (at - travelled);
        const pz = a[1] + dz * (at - travelled);
        for (const side of [1, -1]) {
          // Across the direction of travel, to one side then the other.
          const sx = dz * side;
          const sz = -dx * side;
          const from: Vec2 = [px + sx * half, pz + sz * half];
          const to: Vec2 = [px + sx * (half + STALL_DEPTH_M), pz + sz * (half + STALL_DEPTH_M)];
          const middle: Vec2 = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
          const lot = lots.find((candidate) => inLot(middle, candidate));
          if (!lot) continue;
          served.add(lot);
          rings.push(line(from, to));
        }
      }
      travelled += length;
    }
    if (rings.length > 0) paint = join(paint, cutAway(unite(rings), taken));
    const reach = half + STALL_DEPTH_M;
    pending.push(...ribbonPieces(piece.line as Pair[], reach, reach));
  }
  return paint;
}

/** A row of stalls along one or both long sides of a lot that has no mapped aisle. */
function alongEdges(lot: ParkingLot): Pair[][] {
  const box = boundingRectangle(lot.outline as Pair[]);
  if (!box) return [];
  const width = 2 * box.halfShort;
  if (width < ONE_ROW_MIN_M) return [];
  const [ax, az] = box.axis;
  // Across the lot, from its centre line towards one long side.
  const sx = -az;
  const sz = ax;
  const sides = width >= TWO_ROWS_MIN_M ? [1, -1] : [1];
  const count = Math.floor((2 * box.halfLong) / STALL_WIDTH_M);
  const rings: Pair[][] = [];
  for (let i = 0; i <= count; i++) {
    const along = (i - count / 2) * STALL_WIDTH_M;
    const cx = box.centre[0] + ax * along;
    const cz = box.centre[1] + az * along;
    for (const side of sides) {
      const edge = box.halfShort * side;
      const inner = (box.halfShort - STALL_DEPTH_M) * side;
      rings.push(line([cx + sx * edge, cz + sz * edge], [cx + sx * inner, cz + sz * inner]));
    }
  }
  return rings;
}

/**
 * Paints the stall lines of a tile's parking lots. Lines stay inside the lots, off the
 * driving surface, and inside the tile. Returns the painted area in square metres.
 */
export function addStalls(
  meshes: MeshSet,
  lots: readonly ParkingLot[],
  pieces: readonly RoadPiece[],
  driving: Shape,
  tile: Shape,
): number {
  if (lots.length === 0) return 0;
  const served = new Set<ParkingLot>();
  let lines = alongAisles(pieces, lots, served);
  const rows: Pair[][] = [];
  for (const lot of lots) {
    if (lot.whole && !served.has(lot)) rows.push(...alongEdges(lot));
  }
  if (rows.length > 0) lines = join(lines, unite(rows));
  if (lines.length === 0) return 0;
  const ground = unite(lots.map((lot) => lot.outline as Pair[]));
  const holes = unite(lots.flatMap((lot) => lot.holes as Pair[][]));
  const paint = overlap(cutAway(overlap(lines, ground), holes, driving), tile);
  return addFlat(meshes, paint, STALL_Y, STALL_COLOUR);
}
