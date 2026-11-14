// The ground: one flat rectangle under the whole tile, with the mapped areas (lawns, parks,
// woods, parking, water) drawn on top in their real shapes.

import earcut from "earcut";
import type { ColorName, Vec2 } from "../types.ts";
import type { MeshSet, Vec3 } from "./mesh.ts";

const UP: Vec3 = [0, 1, 0];
/** Each layer sits this much above the one below, so overlapping areas never flicker. */
export const LAYER_STEP_M = 0.004;

/**
 * The height of the ground at a spot, in local metres. Flat for now (MVP). Everything that
 * stands on the ground asks here, so terrain later changes this one answer.
 */
export function groundHeightAt(_x: number, _z: number): number {
  return 0;
}

/** Adds the tile's ground: one flat rectangle through its four corners (given in order around it). */
export function addGround(
  meshes: MeshSet,
  corners: readonly [Vec2, Vec2, Vec2, Vec2],
  colour: ColorName,
): void {
  const [a, b, c, d] = corners;
  const at = (p: Vec2): Vec3 => [p[0], 0, p[1]];
  meshes.get(colour).addQuad(at(a), at(b), at(c), at(d), UP, [a, b, c, d]);
}

/**
 * Adds one area in its real shape, with any holes cut out, on the given layer.
 * Returns its area in square metres (0 if the shape was not usable).
 */
export function addArea(
  meshes: MeshSet,
  outline: readonly Vec2[],
  holes: readonly (readonly Vec2[])[],
  layer: number,
  colour: ColorName,
): number {
  if (outline.length < 3) return 0;
  const points: Vec2[] = [...outline];
  const holeStarts: number[] = [];
  for (const hole of holes) {
    if (hole.length < 3) continue;
    holeStarts.push(points.length);
    points.push(...hole);
  }
  const corners = earcut(points.flat(), holeStarts);
  const y = layer * LAYER_STEP_M;
  const mesh = meshes.get(colour);
  let area = 0;
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const [a, b, c] = [
      points[corners[i] as number],
      points[corners[i + 1] as number],
      points[corners[i + 2] as number],
    ] as [Vec2, Vec2, Vec2];
    mesh.addTriangle([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], UP, a, b, c);
    area += Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])) / 2;
  }
  return area;
}
