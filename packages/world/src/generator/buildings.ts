// Buildings: walls raised from the real footprint in the building's own colour, a lighter
// band at the foot of the walls, and the roof the decision asks for (see roofs.ts).

import type { BuildingDecision, ColorName, Vec2 } from "../types.ts";
import { type Pair, signedArea } from "../util/geometry.ts";
import type { MeshSet, Vec3 } from "./mesh.ts";
import { addFlatRoof, addPitchedRoof, canPitch, wallTopFor } from "./roofs.ts";

/** Footprints smaller than this many square metres are not worth drawing. */
const MIN_AREA_M2 = 1;
/** The light band at the foot of the walls (art-style: a concrete or stone base). */
export const BASE_BAND_M = 0.7;
export const BASE_BAND_COLOUR: ColorName = "wall.base";

/** Adds one building to the tile's meshes. Returns false if it was too small or broken. */
export function addBuilding(
  meshes: MeshSet,
  footprint: readonly Vec2[],
  decision: BuildingDecision,
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

  const height = decision.heightM;
  // A pitched roof needs a usable rectangle around the footprint; otherwise the roof is flat.
  const roof = decision.roof !== "flat" && canPitch(ring) ? decision.roof : "flat";
  const wallTop = wallTopFor(roof, height);
  const band = Math.min(BASE_BAND_M, wallTop / 3);
  const walls = meshes.get(decision.colour);
  const base = meshes.get(BASE_BAND_COLOUR);

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Vec2;
    const b = ring[(i + 1) % ring.length] as Vec2;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    const outward: Vec3 = [dz / length, 0, -dx / length];
    for (const [mesh, from, to] of [
      [base, 0, band],
      [walls, band, wallTop],
    ] as const) {
      mesh.addQuad(
        [a[0], from, a[1]],
        [b[0], from, b[1]],
        [b[0], to, b[1]],
        [a[0], to, a[1]],
        outward,
        [
          [0, from],
          [length, from],
          [length, to],
          [0, to],
        ],
      );
    }
  }

  if (roof === "flat") addFlatRoof(meshes, ring, height, decision.roofColour);
  else addPitchedRoof(meshes, ring, height, roof, decision.roofColour, decision.colour);
  return true;
}
