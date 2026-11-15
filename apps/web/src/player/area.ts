// The walkable area as a set of upright rectangles: one per loaded tile.

import type { KeepInside } from "./walker.ts";

/** A rectangle on the ground, in local metres. */
export type Box = { minX: number; maxX: number; minZ: number; maxZ: number };

/**
 * The walkable area made of these boxes. A spot inside any box is fine as it is; a spot
 * outside them all is moved to the nearest edge. With no boxes, everywhere is fine.
 */
export function insideBoxes(boxes: readonly Box[]): KeepInside {
  return (x, z) => {
    let best: [number, number] | undefined;
    let bestDistance = Infinity;
    for (const box of boxes) {
      const nearX = Math.max(box.minX, Math.min(box.maxX, x));
      const nearZ = Math.max(box.minZ, Math.min(box.maxZ, z));
      const distance = Math.hypot(x - nearX, z - nearZ);
      if (distance === 0) return [x, z];
      if (distance < bestDistance) {
        bestDistance = distance;
        best = [nearX, nearZ];
      }
    }
    return best ?? [x, z];
  };
}
