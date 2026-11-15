// The ground: one flat rectangle under the whole tile, with the mapped areas (lawns, parks,
// woods, parking, water) drawn on top in their real shapes.

import earcut from "earcut";
import type { ColorName, Vec2 } from "../types.ts";
import { type Pair, signedArea } from "../util/geometry.ts";
import type { Shape } from "../util/shapes.ts";
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
 * Adds one flat outline with holes cut out, at height `y`.
 * Returns its area in square metres (0 if the shape was not usable).
 */
function addFlatPolygon(
  meshes: MeshSet,
  outline: readonly Vec2[],
  holes: readonly (readonly Vec2[])[],
  y: number,
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
  return addFlatPolygon(meshes, outline, holes, layer * LAYER_STEP_M, colour);
}

/** Adds a flat shape (any number of pieces, with holes) at height `y`. Returns its area. */
export function addFlat(meshes: MeshSet, shape: Shape, y: number, colour: ColorName): number {
  let area = 0;
  for (const [outline, ...holes] of shape) {
    if (outline) area += addFlatPolygon(meshes, outline, holes, y, colour);
  }
  return area;
}

/**
 * Adds upright walls along every edge of a shape, from `bottom` up to `top`, facing away
 * from the shape. Edges for which `skip` says yes get no wall (edges on a tile's border).
 */
export function addWalls(
  meshes: MeshSet,
  shape: Shape,
  bottom: number,
  top: number,
  colour: ColorName,
  skip: (a: Vec2, b: Vec2) => boolean = () => false,
): void {
  const mesh = meshes.get(colour);
  for (const [outline, ...holes] of shape) {
    if (!outline) continue;
    // The solid part lies inside the outline and outside the holes: "away" flips for holes.
    const rings: [readonly Vec2[], boolean][] = [[outline, false]];
    for (const hole of holes) rings.push([hole, true]);
    for (const [ring, isHole] of rings) {
      const clockwise = signedArea(ring as Pair[]) < 0;
      const flip = clockwise !== isHole ? -1 : 1;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i] as Vec2;
        const b = ring[(i + 1) % ring.length] as Vec2;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 1e-6 || skip(a, b)) continue;
        const normal: Vec3 = [(flip * (b[1] - a[1])) / length, 0, (flip * -(b[0] - a[0])) / length];
        mesh.addQuad(
          [a[0], bottom, a[1]],
          [b[0], bottom, b[1]],
          [b[0], top, b[1]],
          [a[0], top, a[1]],
          normal,
          [
            [0, 0],
            [length, 0],
            [length, top - bottom],
            [0, top - bottom],
          ],
        );
      }
    }
  }
}
