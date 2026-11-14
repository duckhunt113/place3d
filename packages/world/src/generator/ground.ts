// Flat ground under a whole tile. Lawns, parks and water are drawn on top of it in the style pass.

import type { ColorName, Vec2 } from "../types.ts";
import type { MeshSet, Vec3 } from "./mesh.ts";

const UP: Vec3 = [0, 1, 0];

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
