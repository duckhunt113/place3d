// Roads and paths as flat ribbons along their lines. First pass: simple joins, where ribbons
// overlap and a round cap fills the gap at every end. Clean intersections come later.

import type { RoadDecision, Vec2 } from "../types.ts";
import type { MeshSet, Uv, Vec3 } from "./mesh.ts";

/** Heights above the ground, so roads and paths never fight the ground for the same pixels. */
export const ROAD_Y = 0.03;
export const PATH_Y = 0.05;

const UP: Vec3 = [0, 1, 0];
const CAP_SIDES = 8;
/** A sharp corner would stretch the ribbon's outer edge far away; never more than this times the half-width. */
const MAX_MITRE = 2;

function withoutNearRepeats(line: readonly Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of line) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.01) out.push(p);
  }
  return out;
}

/** Adds one road or path to the tile's meshes, in its surface colour. */
export function addRoad(meshes: MeshSet, line: readonly Vec2[], decision: RoadDecision): void {
  const points = withoutNearRepeats(line);
  if (points.length < 2 || !(decision.widthM > 0)) return;
  const mesh = meshes.get(decision.surface);
  const half = decision.widthM / 2;
  const y = decision.kind === "path" ? PATH_Y : ROAD_Y;
  const at = (p: Vec2): Vec3 => [p[0], y, p[1]];
  const uv = (p: Vec2): Uv => [p[0], p[1]];

  // The sideways direction (unit length) of each segment.
  const sides: Vec2[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i] as Vec2;
    const b = points[i + 1] as Vec2;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    sides.push([-(b[1] - a[1]) / length, (b[0] - a[0]) / length]);
  }

  // The ribbon's two edges at every point; corners are mitred.
  const left: Vec2[] = [];
  const right: Vec2[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as Vec2;
    const before = sides[Math.max(0, i - 1)] as Vec2;
    const after = sides[Math.min(sides.length - 1, i)] as Vec2;
    let mx = before[0] + after[0];
    let mz = before[1] + after[1];
    const length = Math.hypot(mx, mz);
    if (length < 1e-6) {
      // A U-turn: no sensible mitre, so just use the next segment's side.
      mx = after[0];
      mz = after[1];
    } else {
      mx /= length;
      mz /= length;
    }
    const stretch = Math.min(MAX_MITRE, 1 / Math.max(1e-6, mx * after[0] + mz * after[1]));
    left.push([p[0] + mx * half * stretch, p[1] + mz * half * stretch]);
    right.push([p[0] - mx * half * stretch, p[1] - mz * half * stretch]);
  }

  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b, c, d] = [left[i], right[i], right[i + 1], left[i + 1]] as [Vec2, Vec2, Vec2, Vec2];
    mesh.addQuad(at(a), at(b), at(c), at(d), UP, [uv(a), uv(b), uv(c), uv(d)]);
  }

  // Round caps at both ends fill the gaps where roads meet at an angle.
  for (const centre of [points[0] as Vec2, points[points.length - 1] as Vec2]) {
    for (let i = 0; i < CAP_SIDES; i++) {
      const a0 = (i / CAP_SIDES) * 2 * Math.PI;
      const a1 = ((i + 1) / CAP_SIDES) * 2 * Math.PI;
      const p0: Vec2 = [centre[0] + Math.cos(a0) * half, centre[1] + Math.sin(a0) * half];
      const p1: Vec2 = [centre[0] + Math.cos(a1) * half, centre[1] + Math.sin(a1) * half];
      mesh.addTriangle(at(centre), at(p0), at(p1), UP, uv(centre), uv(p0), uv(p1));
    }
  }
}
