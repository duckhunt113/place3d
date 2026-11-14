// The physics world: solid shapes the player can bump into, built with Rapier.
// Shapes come from the world package's collider data, never from visual meshes
// (CLAUDE.md, hard rule 7). src/physics is the only place that imports Rapier.

import type Rapier from "@dimforge/rapier3d-compat";
import type { Collider, GroundGrid } from "@somewhere/world";

export type Vec3 = [number, number, number];

/** Something that walks: an upright capsule that slides along whatever is solid. */
export type Character = {
  /** Where its feet are, in local metres. */
  position(): Vec3;
  /** Puts its feet somewhere, without checking for anything in the way. */
  teleport(feet: Vec3): void;
  /** Tries to move by `delta` metres, sliding along walls. Says whether it ends up standing on something. */
  move(delta: Vec3): boolean;
  /** Takes it out of the world. */
  remove(): void;
};

export type Physics = {
  /** Sets the solid shapes of one tile (and its ground), replacing that tile's older ones. */
  setTile(key: string, colliders: readonly Collider[], ground?: GroundGrid): void;
  /** Removes every tile's shapes and ground. */
  clear(): void;
  /** How many solid shapes are in the world, not counting the ground. */
  count(): number;
  createCharacter(shape: { radiusM: number; heightM: number }): Character;
};

/** A small gap the character keeps from everything, so it never gets stuck in a surface. */
const SKIN_M = 0.02;
/** Steps up to this height are climbed without jumping (curbs arrive in step 4). */
const STEP_HEIGHT_M = 0.3;
const STEP_MIN_WIDTH_M = 0.2;
/** Slopes steeper than this cannot be walked up. */
const MAX_SLOPE_DEG = 50;

/** A turn about the upright axis, in the form Rapier wants. */
const turnY = (rotY: number) => ({ x: 0, y: Math.sin(rotY / 2), z: 0, w: Math.cos(rotY / 2) });

/**
 * Starts Rapier and makes an empty world. Rapier is a big download, so it is fetched as its
 * own file, side by side with everything else the page needs.
 */
export async function createPhysics(): Promise<Physics> {
  const RAPIER = (await import("@dimforge/rapier3d-compat")).default;
  await RAPIER.init();
  // Nothing in this world falls by itself; the player handles its own gravity.
  const world = new RAPIER.World({ x: 0, y: 0, z: 0 });

  const describe = (collider: Collider): Rapier.ColliderDesc => {
    const [x, y, z] = collider.centre;
    if (collider.shape === "cylinder") {
      return RAPIER.ColliderDesc.cylinder(collider.halfHeight, collider.radius).setTranslation(
        x,
        y,
        z,
      );
    }
    const [hx, hy, hz] = collider.half;
    return RAPIER.ColliderDesc.cuboid(hx, hy, hz)
      .setTranslation(x, y, z)
      .setRotation(turnY(collider.rotY));
  };

  /**
   * The ground as Rapier's grid of heights. Rapier wants the heights column by column
   * (west to east, each column north to south); our data is row by row.
   */
  const describeGround = (ground: GroundGrid): Rapier.ColliderDesc => {
    const side = ground.cells + 1;
    const heights = new Float32Array(side * side);
    for (let row = 0; row < side; row++) {
      for (let column = 0; column < side; column++) {
        heights[row + column * side] = ground.heights[row * side + column] as number;
      }
    }
    return RAPIER.ColliderDesc.heightfield(ground.cells, ground.cells, heights, {
      x: ground.size[0],
      y: 1,
      z: ground.size[1],
    }).setTranslation(ground.centre[0], 0, ground.centre[1]);
  };

  const tiles = new Map<string, { shapes: Rapier.Collider[]; count: number }>();
  let total = 0;
  /** New or removed shapes are only seen by the character after the world has taken a step. */
  let stale = true;
  const refresh = () => {
    if (!stale) return;
    world.step();
    stale = false;
  };
  const removeTile = (key: string) => {
    const old = tiles.get(key);
    if (!old) return;
    for (const shape of old.shapes) world.removeCollider(shape, false);
    total -= old.count;
    tiles.delete(key);
    stale = true;
  };

  return {
    setTile(key, colliders, ground) {
      removeTile(key);
      const shapes = colliders.map((collider) => world.createCollider(describe(collider)));
      if (ground) shapes.push(world.createCollider(describeGround(ground)));
      tiles.set(key, { shapes, count: colliders.length });
      total += colliders.length;
      stale = true;
    },
    clear() {
      for (const key of [...tiles.keys()]) removeTile(key);
    },
    count: () => total,
    createCharacter({ radiusM, heightM }) {
      const halfHeight = heightM / 2;
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      const capsule = world.createCollider(
        RAPIER.ColliderDesc.capsule(Math.max(0, halfHeight - radiusM), radiusM),
        body,
      );
      const controller = world.createCharacterController(SKIN_M);
      controller.enableAutostep(STEP_HEIGHT_M, STEP_MIN_WIDTH_M, false);
      controller.enableSnapToGround(STEP_HEIGHT_M);
      controller.setMaxSlopeClimbAngle((MAX_SLOPE_DEG * Math.PI) / 180);
      stale = true;
      return {
        position() {
          const at = body.translation();
          return [at.x, at.y - halfHeight, at.z];
        },
        teleport([x, y, z]) {
          body.setTranslation({ x, y: y + halfHeight, z }, false);
          stale = true;
        },
        move([dx, dy, dz]) {
          refresh();
          controller.computeColliderMovement(capsule, { x: dx, y: dy, z: dz });
          const moved = controller.computedMovement();
          const at = body.translation();
          body.setNextKinematicTranslation({
            x: at.x + moved.x,
            y: at.y + moved.y,
            z: at.z + moved.z,
          });
          world.step();
          return controller.computedGrounded();
        },
        remove() {
          world.removeCharacterController(controller);
          world.removeRigidBody(body);
          stale = true;
        },
      };
    },
  };
}
