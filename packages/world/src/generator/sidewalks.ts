// Curbs and sidewalks: the raised strips beside roads, with the joints between sidewalk panels.
// Their outlines come from the street plan (roads.ts); this file gives them height.

import type { ColorName, Vec2 } from "../types.ts";
import type { Pair } from "../util/geometry.ts";
import { overlap, pointInShape, type Shape } from "../util/shapes.ts";
import { addFlat, addWalls } from "./ground.ts";
import type { MeshSet, Vec3 } from "./mesh.ts";
import { CURB_HEIGHT_M, type RoadPiece, type StreetPlan, sideWidths } from "./roads.ts";

export const CURB_COLOUR: ColorName = "curb";
export const SIDEWALK_COLOUR: ColorName = "sidewalk";
export const JOINT_COLOUR: ColorName = "sidewalk.joint";
/** Sidewalk panels are this long; a joint line crosses the sidewalk between them. */
export const JOINT_SPACING_M = 2;
/** Width of a joint line. Wider than a real joint, so it does not flicker in the distance. */
const JOINT_WIDTH_M = 0.06;
/** Joints sit this much above the sidewalk. */
const JOINT_LIFT_M = 0.004;
/** A joint stops this far short of both edges of the sidewalk. */
const JOINT_INSET_M = 0.08;

const UP: Vec3 = [0, 1, 0];

/** The tile's edges in local metres. */
export type TileBox = { minX: number; minZ: number; maxX: number; maxZ: number };

/** True if both points lie on the same edge of the box (to the millimetre). */
function onBoxEdge(a: Vec2, b: Vec2, box: TileBox): boolean {
  const near = (value: number, edge: number) => Math.abs(value - edge) < 0.002;
  return (
    (near(a[0], box.minX) && near(b[0], box.minX)) ||
    (near(a[0], box.maxX) && near(b[0], box.maxX)) ||
    (near(a[1], box.minZ) && near(b[1], box.minZ)) ||
    (near(a[1], box.maxZ) && near(b[1], box.maxZ))
  );
}

/**
 * Adds the curbs and sidewalks of a tile: tops, the little walls down to the road and the
 * lawn, and panel joints. Returns how many joints were drawn.
 */
export function addSidewalks(
  meshes: MeshSet,
  plan: StreetPlan,
  pieces: readonly RoadPiece[],
  tile: Shape,
  box: TileBox,
): number {
  addFlat(meshes, overlap(plan.curb, tile), CURB_HEIGHT_M, CURB_COLOUR);
  addFlat(meshes, overlap(plan.sidewalk, tile), CURB_HEIGHT_M, SIDEWALK_COLOUR);
  // No wall where the strip simply continues into the next tile.
  addWalls(meshes, overlap(plan.raised, tile), 0, CURB_HEIGHT_M, CURB_COLOUR, (a, b) =>
    onBoxEdge(a, b, box),
  );
  return addJoints(meshes, plan.sidewalk, pieces, box);
}

/**
 * Joint lines across the sidewalk, every JOINT_SPACING_M along the road. They are counted
 * from the start of the whole road, so they continue evenly from one tile into the next.
 */
function addJoints(
  meshes: MeshSet,
  sidewalk: Shape,
  pieces: readonly RoadPiece[],
  box: TileBox,
): number {
  if (sidewalk.length === 0) return 0;
  const mesh = meshes.get(JOINT_COLOUR);
  const y = CURB_HEIGHT_M + JOINT_LIFT_M;
  let count = 0;
  for (const piece of pieces) {
    const sides = sideWidths(piece.decision);
    const half = piece.decision.widthM / 2;
    // The sidewalk on each side runs from just past the curb to the strip's outer edge.
    const spans: [number, number][] = [];
    if (sides.left > sides.curb) spans.push([half + sides.curb, half + sides.left]);
    if (sides.right > sides.curb) spans.push([-(half + sides.curb), -(half + sides.right)]);
    if (spans.length === 0) continue;
    let travelled = piece.offsetM;
    for (let i = 0; i + 1 < piece.line.length; i++) {
      const a = piece.line[i] as Vec2;
      const b = piece.line[i + 1] as Vec2;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-6) continue;
      const dx = (b[0] - a[0]) / length;
      const dz = (b[1] - a[1]) / length;
      // Left of the direction of travel (north is -z).
      const lx = dz;
      const lz = -dx;
      const first = Math.ceil(travelled / JOINT_SPACING_M) * JOINT_SPACING_M;
      for (let at = first; at < travelled + length; at += JOINT_SPACING_M) {
        const px = a[0] + dx * (at - travelled);
        const pz = a[1] + dz * (at - travelled);
        for (const [near, far] of spans) {
          const sign = Math.sign(far);
          const from = near + sign * JOINT_INSET_M;
          const to = far - sign * JOINT_INSET_M;
          const start: Pair = [px + lx * from, pz + lz * from];
          const end: Pair = [px + lx * to, pz + lz * to];
          const middle: Pair = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
          // Each joint belongs to the tile holding its middle, and only where there is sidewalk.
          if (middle[0] < box.minX || middle[0] >= box.maxX) continue;
          if (middle[1] < box.minZ || middle[1] >= box.maxZ) continue;
          if (!pointInShape(start, sidewalk) || !pointInShape(end, sidewalk)) continue;
          const wx = (dx * JOINT_WIDTH_M) / 2;
          const wz = (dz * JOINT_WIDTH_M) / 2;
          mesh.addQuad(
            [start[0] - wx, y, start[1] - wz],
            [start[0] + wx, y, start[1] + wz],
            [end[0] + wx, y, end[1] + wz],
            [end[0] - wx, y, end[1] - wz],
            UP,
            [start, start, end, end],
          );
          count++;
        }
      }
      travelled += length;
    }
  }
  return count;
}
