// Buildings as simple boxes: walls raised from the real footprint, with a flat roof.

import earcut from "earcut";
import type { BuildingDecision, ColorName, Vec2 } from "../types.ts";
import { type Pair, signedArea } from "../util/geometry.ts";
import type { MeshSet, Vec3 } from "./mesh.ts";

const UP: Vec3 = [0, 1, 0];
/** Footprints smaller than this many square metres are not worth drawing. */
const MIN_AREA_M2 = 1;

/** Adds one building to the tile's meshes in the given colour. Returns false if it was too small or broken. */
export function addBuilding(
  meshes: MeshSet,
  footprint: readonly Vec2[],
  decision: BuildingDecision,
  colour: ColorName,
): boolean {
  let ring: Vec2[] = [];
  for (const p of footprint) {
    const last = ring[ring.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) ring.push(p);
  }
  const area = signedArea(ring as Pair[]);
  if (ring.length < 3 || Math.abs(area) < MIN_AREA_M2 || !(decision.heightM > 0)) return false;
  // Put every footprint in the same winding, so "outward" is the same side of every wall.
  if (area < 0) ring = ring.reverse();

  const mesh = meshes.get(colour);
  const height = decision.heightM;

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Vec2;
    const b = ring[(i + 1) % ring.length] as Vec2;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    const outward: Vec3 = [dz / length, 0, -dx / length];
    mesh.addQuad(
      [a[0], 0, a[1]],
      [b[0], 0, b[1]],
      [b[0], height, b[1]],
      [a[0], height, a[1]],
      outward,
      [
        [0, 0],
        [length, 0],
        [length, height],
        [0, height],
      ],
    );
  }

  // The roof: the footprint cut into triangles, lifted to the building's height.
  const corners = earcut(ring.flat());
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const [a, b, c] = [
      ring[corners[i] as number],
      ring[corners[i + 1] as number],
      ring[corners[i + 2] as number],
    ] as [Vec2, Vec2, Vec2];
    mesh.addTriangle([a[0], height, a[1]], [b[0], height, b[1]], [c[0], height, c[1]], UP, a, b, c);
  }
  return true;
}
