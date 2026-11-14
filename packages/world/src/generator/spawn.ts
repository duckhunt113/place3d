// Where the player starts: on the street nearest to the place they asked for, looking along it.

import type { RoadPath, Vec2 } from "../types.ts";
import { groundHeightAt } from "./ground.ts";

export type Spawn = {
  /** Where the player's feet go, in local metres. */
  pos: [number, number, number];
  /** Which way they face: radians, 0 looks north (-z), growing clockwise (east is a quarter turn). */
  yaw: number;
};

/**
 * The nearest point on any road to `target`, facing along the road. With no roads at all,
 * the target itself, facing north.
 */
export function findSpawn(target: Vec2, roads: readonly RoadPath[]): Spawn {
  let best: { point: Vec2; along: Vec2; distance: number } | undefined;
  for (const road of roads) {
    for (let i = 0; i + 1 < road.line.length; i++) {
      const a = road.line[i] as Vec2;
      const b = road.line[i + 1] as Vec2;
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const length2 = dx * dx + dz * dz;
      if (length2 === 0) continue;
      const t = Math.max(
        0,
        Math.min(1, ((target[0] - a[0]) * dx + (target[1] - a[1]) * dz) / length2),
      );
      const point: Vec2 = [a[0] + t * dx, a[1] + t * dz];
      const distance = Math.hypot(target[0] - point[0], target[1] - point[1]);
      if (!best || distance < best.distance) {
        const length = Math.sqrt(length2);
        best = { point, along: [dx / length, dz / length], distance };
      }
    }
  }
  if (!best) return { pos: [target[0], groundHeightAt(target[0], target[1]), target[1]], yaw: 0 };
  const [x, z] = best.point;
  return { pos: [x, groundHeightAt(x, z), z], yaw: Math.atan2(best.along[0], -best.along[1]) };
}
