// Simple solid shapes for the physics (CLAUDE.md, hard rule 7: never the visual meshes).
// Buildings become boxes; models use the collider their catalog entry describes.

import type { AssetSelector } from "../assets/select.ts";
import type { Collider, GroundGrid, Placement, Vec2 } from "../types.ts";
import { boundingRectangle, type Pair, signedArea } from "../util/geometry.ts";
import { groundHeightAt } from "./ground.ts";

/**
 * A building whose outline fills at least this share of its surrounding rectangle becomes one
 * box. Below it, the box would block empty corners (an L-shape's notch), so each wall gets
 * its own thin box instead.
 */
export const ONE_BOX_FIT = 0.97;
/** Thickness of a wall box. */
export const WALL_THICKNESS_M = 0.4;

/**
 * Cells along each side of a tile's ground grid (about 7 m each at zoom 17). Many small cells
 * instead of one big slab: physics engines lose precision on very large shapes, and terrain
 * later needs the grid anyway.
 */
export const GROUND_CELLS = 32;
/** The ground reaches this far past the tile's edge, so neighbouring tiles leave no gap. */
export const GROUND_OVERLAP_M = 0.5;

/** The solid ground under a tile, given its corners. Heights come from `groundHeightAt`. */
export function groundCollider(corners: readonly Vec2[]): GroundGrid {
  let [minX, minZ, maxX, maxZ] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, z] of corners) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  minX -= GROUND_OVERLAP_M;
  minZ -= GROUND_OVERLAP_M;
  const width = maxX + GROUND_OVERLAP_M - minX;
  const depth = maxZ + GROUND_OVERLAP_M - minZ;
  const side = GROUND_CELLS + 1;
  const heights = new Float32Array(side * side);
  for (let row = 0; row < side; row++) {
    for (let column = 0; column < side; column++) {
      heights[row * side + column] = groundHeightAt(
        minX + (column / GROUND_CELLS) * width,
        minZ + (row / GROUND_CELLS) * depth,
      );
    }
  }
  return {
    centre: [minX + width / 2, minZ + depth / 2],
    size: [width, depth],
    cells: GROUND_CELLS,
    heights,
  };
}

/** The solid shape of one building: one box, or a thin box along every wall. */
export function buildingColliders(footprint: readonly Vec2[], heightM: number): Collider[] {
  if (footprint.length < 3 || !(heightM > 0)) return [];
  const ring = footprint as readonly Pair[];
  const box = boundingRectangle(ring);
  if (!box) return [];
  const halfHeight = heightM / 2;
  const boxArea = 4 * box.halfLong * box.halfShort;
  if (boxArea > 0 && Math.abs(signedArea(ring)) / boxArea >= ONE_BOX_FIT) {
    const [x, z] = box.centre;
    return [
      {
        shape: "box",
        centre: [x, groundHeightAt(x, z) + halfHeight, z],
        half: [box.halfLong, halfHeight, box.halfShort],
        // A box's long side lies along local x when unturned; turn it onto the building's axis.
        rotY: Math.atan2(-box.axis[1], box.axis[0]),
      },
    ];
  }
  const walls: Collider[] = [];
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i] as Vec2;
    const b = footprint[(i + 1) % footprint.length] as Vec2;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.01) continue;
    const x = (a[0] + b[0]) / 2;
    const z = (a[1] + b[1]) / 2;
    walls.push({
      shape: "box",
      centre: [x, groundHeightAt(x, z) + halfHeight, z],
      half: [length / 2, halfHeight, WALL_THICKNESS_M / 2],
      rotY: Math.atan2(-dz, dx),
    });
  }
  return walls;
}

/** The solid part of each placed model (a tree's trunk, a bench), from its catalog entry. */
export function placementColliders(
  placements: readonly Placement[],
  selector: AssetSelector,
): Collider[] {
  const out: Collider[] = [];
  for (const placement of placements) {
    const collider = selector.entry(placement.asset)?.collider;
    if (!collider || collider.type === "none") continue;
    const [x, y, z] = placement.pos;
    const scale = placement.scale;
    if (collider.type === "cylinder") {
      const halfHeight = (collider.height * scale) / 2;
      out.push({
        shape: "cylinder",
        centre: [x, y + halfHeight, z],
        radius: collider.radius * scale,
        halfHeight,
      });
    } else {
      const [width, depth, height] = collider.size;
      const halfHeight = (height * scale) / 2;
      out.push({
        shape: "box",
        centre: [x, y + halfHeight, z],
        half: [(width * scale) / 2, halfHeight, (depth * scale) / 2],
        rotY: placement.rotY,
      });
    }
  }
  return out;
}
