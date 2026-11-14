// Roofs. Flat roofs get a darker cap; pitched roofs (hipped, gabled, pyramidal) are built on
// the tightest rectangle around the footprint, with an overhang, a fascia strip and a soffit.
// Which roof a building gets is decided by the rules; this file only knows how to build each.

import earcut from "earcut";
import type { ColorName, RoofShape, Vec2 } from "../types.ts";
import { boundingRectangle, type Pair } from "../util/geometry.ts";
import type { MeshBuilder, MeshSet, Uv, Vec3 } from "./mesh.ts";

const UP: Vec3 = [0, 1, 0];
const DOWN: Vec3 = [0, -1, 0];

/** Height of the darker band around the top of a flat-roofed building. */
export const FLAT_CAP_M = 0.35;
/** Buildings narrower than twice this get a flat roof: a pitched one would be a sliver. */
const MIN_HALF_WIDTH_M = 0.75;
/** How far a pitched roof sticks out past the walls. */
export const OVERHANG_M = 0.4;
/** Roof slope: rise per metre of run (about 27 degrees). */
export const PITCH = 0.5;
/** Tallest a pitched roof may rise, so very wide buildings do not get towering roofs. */
export const MAX_RISE_M = 3.5;
/** Thickness of the strip around the eaves. */
export const FASCIA_M = 0.18;
/** The colour of the fascia and the underside of the overhang (art-style: a cream fascia). */
export const TRIM_COLOUR: ColorName = "cream";

/** True if a pitched roof can be built on this footprint (it has a usable surrounding rectangle). */
export function canPitch(ring: readonly Vec2[]): boolean {
  const box = boundingRectangle(ring as readonly Pair[]);
  return box !== undefined && box.halfShort >= MIN_HALF_WIDTH_M;
}

/** Where the wall colour stops: below the cap on a flat roof, at the eaves under a pitched one. */
export function wallTopFor(roof: RoofShape, heightM: number): number {
  return roof === "flat" ? Math.max(heightM - FLAT_CAP_M, heightM / 2) : heightM;
}

function addFace(mesh: MeshBuilder, corners: Vec3[], hint: Vec3): void {
  const [a, b, c] = corners as [Vec3, Vec3, Vec3];
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let n: Vec3 = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
  const length = Math.hypot(n[0], n[1], n[2]);
  if (length < 1e-9) return;
  n = [n[0] / length, n[1] / length, n[2] / length];
  if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) n = [-n[0], -n[1], -n[2]];
  const uv = (p: Vec3): Uv => [p[0], p[2]];
  for (let i = 1; i + 1 < corners.length; i++) {
    const p = corners[i] as Vec3;
    const q = corners[i + 1] as Vec3;
    mesh.addTriangle(a, p, q, n, uv(a), uv(p), uv(q));
  }
}

/** A flat roof: the footprint as the top, and a darker band around the top of the walls. */
export function addFlatRoof(
  meshes: MeshSet,
  ring: readonly Vec2[],
  heightM: number,
  colour: ColorName,
): void {
  const mesh = meshes.get(colour);
  const bandBottom = wallTopFor("flat", heightM);
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Vec2;
    const b = ring[(i + 1) % ring.length] as Vec2;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    mesh.addQuad(
      [a[0], bandBottom, a[1]],
      [b[0], bandBottom, b[1]],
      [b[0], heightM, b[1]],
      [a[0], heightM, a[1]],
      [dz / length, 0, -dx / length],
      [
        [0, bandBottom],
        [length, bandBottom],
        [length, heightM],
        [0, heightM],
      ],
    );
  }
  const corners = earcut(ring.flat());
  for (let i = 0; i + 2 < corners.length; i += 3) {
    const [a, b, c] = [
      ring[corners[i] as number],
      ring[corners[i + 1] as number],
      ring[corners[i + 2] as number],
    ] as [Vec2, Vec2, Vec2];
    mesh.addTriangle(
      [a[0], heightM, a[1]],
      [b[0], heightM, b[1]],
      [c[0], heightM, c[1]],
      UP,
      a,
      b,
      c,
    );
  }
}

/**
 * A pitched roof on the rectangle around the footprint. Returns the height of its ridge, or
 * undefined if the footprint has no usable rectangle (the caller then uses a flat roof).
 *   hipped: slopes on all four sides, the ridge shorter than the building
 *   gabled: two slopes and a triangular wall (in `wallColour`) at each end
 *   pyramidal: four slopes meeting in one point
 */
export function addPitchedRoof(
  meshes: MeshSet,
  ring: readonly Vec2[],
  eaveM: number,
  shape: Exclude<RoofShape, "flat">,
  colour: ColorName,
  wallColour: ColorName,
): number | undefined {
  const box = boundingRectangle(ring as readonly Pair[]);
  if (!box || box.halfShort < MIN_HALF_WIDTH_M) return undefined;
  const [ux, uz] = box.axis;
  const [cx, cz] = box.centre;
  const long = box.halfLong + OVERHANG_M;
  const short = box.halfShort + OVERHANG_M;
  const rise = Math.min(short * PITCH, MAX_RISE_M);
  const top = eaveM + rise;
  // Half the ridge length: the full roof for a gable, nothing for a pyramid, in between for a hip.
  const ridge = shape === "gabled" ? long : shape === "pyramidal" ? 0 : Math.max(0, long - short);
  /** A point given along the long side (u) and across it (v), at height y. */
  const at = (u: number, v: number, y: number): Vec3 => [
    cx + u * ux - v * uz,
    y,
    cz + u * uz + v * ux,
  ];

  const roof = meshes.get(colour);
  for (const side of [1, -1]) {
    // The two long slopes.
    const slope = [at(-long, side * short, eaveM), at(long, side * short, eaveM)];
    if (ridge > 0) slope.push(at(ridge, 0, top), at(-ridge, 0, top));
    else slope.push(at(0, 0, top));
    addFace(roof, slope, UP);
    // The two ends: a sloping hip, or for a gable an upright triangle of wall.
    if (shape === "gabled") {
      const end = side * box.halfLong;
      addFace(
        meshes.get(wallColour),
        [at(end, -box.halfShort, eaveM), at(end, box.halfShort, eaveM), at(end, 0, top)],
        [side * ux, 0, side * uz],
      );
    } else {
      addFace(
        roof,
        [at(side * long, -short, eaveM), at(side * long, short, eaveM), at(side * ridge, 0, top)],
        UP,
      );
    }
  }

  // The strip around the eaves, and the underside of the overhang, so the roof looks solid from below.
  const trim = meshes.get(TRIM_COLOUR);
  const low = eaveM - FASCIA_M;
  const cornersAt = (y: number): Vec3[] => [
    at(-long, -short, y),
    at(long, -short, y),
    at(long, short, y),
    at(-long, short, y),
  ];
  const upper = cornersAt(eaveM);
  const lower = cornersAt(low);
  const centre = at(0, 0, eaveM);
  for (let i = 0; i < 4; i++) {
    const a = upper[i] as Vec3;
    const b = upper[(i + 1) % 4] as Vec3;
    const outward: Vec3 = [(a[0] + b[0]) / 2 - centre[0], 0, (a[2] + b[2]) / 2 - centre[2]];
    addFace(trim, [lower[i] as Vec3, lower[(i + 1) % 4] as Vec3, b, a], outward);
  }
  addFace(trim, lower, DOWN);
  return top;
}
