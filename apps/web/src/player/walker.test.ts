import { type Collider, type GroundGrid, groundCollider } from "@somewhere/world";
import { beforeAll, describe, expect, it } from "vitest";
import { type Character, createPhysics, type Physics } from "../physics/world.ts";
import { createWalker, type Intent, PLAYER, STEP_SECONDS } from "./walker.ts";

const still: Intent = { forward: 0, right: 0, run: false, jump: false, yaw: 0 };
const north: Intent = { ...still, forward: 1 };
const seconds = (n: number) => Math.round(n / STEP_SECONDS);

let physics: Physics;
let last: Character | undefined;
beforeAll(async () => {
  physics = await createPhysics();
});

/** A tile-sized piece of flat ground around the origin, as the world package makes it. */
const flat: GroundGrid = groundCollider([
  [-110, -110],
  [110, -110],
  [110, 110],
  [-110, 110],
]);

/** A fresh player standing at a spot, in a world holding only the given shapes. */
function playerAt(x: number, z: number, colliders: Collider[] = [], ground: GroundGrid = flat) {
  physics.clear();
  physics.setTile("test", colliders, ground);
  // One player at a time: an earlier test's player would stand in the way.
  last?.remove();
  last = physics.createCharacter(PLAYER);
  const walker = createWalker(last);
  walker.place([x, 0.5, z]);
  const run = (steps: number, intent: Intent) => {
    for (let i = 0; i < steps; i++) walker.update(STEP_SECONDS, intent);
  };
  run(seconds(1), still);
  return { walker, run };
}

/** A 10 m wide, 6 m high house whose south wall is at z = -10. */
const house: Collider = { shape: "box", centre: [0, 3, -14], half: [5, 3, 4], rotY: 0 };
/** A tree trunk 5 m north of the start. */
const trunk: Collider = {
  shape: "cylinder",
  centre: [0, 1.65, -5],
  radius: 0.48,
  halfHeight: 1.65,
};

describe("walking", () => {
  it("lands on the ground and stays there", () => {
    const { walker } = playerAt(0, 0);
    expect(walker.grounded()).toBe(true);
    expect(walker.position()[1]).toBeCloseTo(0, 1);
  });

  it("walks north at 4 m/s and runs at 8 m/s", () => {
    const { walker, run } = playerAt(0, 0);
    run(seconds(2), north);
    expect(walker.position()[2]).toBeCloseTo(-2 * PLAYER.walkSpeed, 0);
    expect(walker.position()[0]).toBeCloseTo(0, 1);
    run(seconds(1), { ...north, run: true });
    expect(walker.position()[2]).toBeCloseTo(-2 * PLAYER.walkSpeed - PLAYER.runSpeed, 0);
  });

  it("follows where the player faces: facing east, forwards is +x and right is south (+z)", () => {
    const east = Math.PI / 2;
    const { walker, run } = playerAt(0, 0);
    run(seconds(1), { ...still, forward: 1, yaw: east });
    expect(walker.position()[0]).toBeCloseTo(PLAYER.walkSpeed, 0);
    expect(walker.position()[2]).toBeCloseTo(0, 1);
    run(seconds(1), { ...still, right: 1, yaw: east });
    expect(walker.position()[2]).toBeCloseTo(PLAYER.walkSpeed, 0);
  });

  it("is no faster diagonally", () => {
    const { walker, run } = playerAt(0, 0);
    run(seconds(1), { ...still, forward: 1, right: 1 });
    const [x, , z] = walker.position();
    expect(Math.hypot(x, z)).toBeCloseTo(PLAYER.walkSpeed, 0);
  });

  it("is stopped by a house wall", () => {
    const { walker, run } = playerAt(0, 0, [house]);
    run(seconds(6), north);
    const z = walker.position()[2];
    expect(z).toBeLessThan(-9.5);
    expect(z).toBeGreaterThan(-10 + PLAYER.radiusM - 0.01);
  });

  it("slides along a wall it meets at an angle", () => {
    // Heading north-east from the south-west, the player meets the south wall and slides east along it.
    const { walker, run } = playerAt(-8, 0, [house]);
    run(seconds(4), { ...still, forward: 1, right: 1 });
    const [x, , z] = walker.position();
    expect(z).toBeCloseTo(-10 + PLAYER.radiusM, 1);
    expect(x).toBeGreaterThan(2.5);
    expect(x).toBeLessThan(4.5);
  });

  it("never walks into a tree trunk, but passes beside it under the leaves", () => {
    const gap = (p: readonly number[]) => Math.hypot((p[0] as number) - 0, (p[2] as number) + 5);
    const blocked = playerAt(0, 0, [trunk]);
    let closest = Infinity;
    for (let i = 0; i < seconds(4); i++) {
      blocked.walker.update(STEP_SECONDS, north);
      closest = Math.min(closest, gap(blocked.walker.position()));
    }
    // It reached the trunk and stayed outside it (trunk radius plus the player's own).
    expect(closest).toBeLessThan(0.48 + PLAYER.radiusM + 0.1);
    expect(closest).toBeGreaterThan(0.48 + PLAYER.radiusM - 0.01);
    // One metre to the side there is room: leaves are not solid.
    const beside = playerAt(1, 0, [trunk]);
    beside.run(seconds(4), north);
    expect(beside.walker.position()[2]).toBeCloseTo(-4 * PLAYER.walkSpeed, 0);
    expect(beside.walker.position()[0]).toBeCloseTo(1, 1);
  });

  it("walks through where a removed tile's house used to be", () => {
    const { walker, run } = playerAt(0, 0, [house]);
    physics.setTile("test", [], flat);
    run(seconds(6), north);
    expect(walker.position()[2]).toBeLessThan(-20);
  });

  it("stands at the ground's height on a slope, whichever way it runs", () => {
    // Ground that rises 1 m for every 10 m east, and (separately) for every 10 m south.
    const sloped = (height: (x: number, z: number) => number): GroundGrid => {
      const side = flat.cells + 1;
      const heights = new Float32Array(side * side);
      for (let row = 0; row < side; row++) {
        for (let column = 0; column < side; column++) {
          const x = flat.centre[0] - flat.size[0] / 2 + (column / flat.cells) * flat.size[0];
          const z = flat.centre[1] - flat.size[1] / 2 + (row / flat.cells) * flat.size[1];
          heights[row * side + column] = height(x, z);
        }
      }
      return { ...flat, heights };
    };
    const east = playerAt(
      30,
      0,
      [],
      sloped((x) => 10 + x / 10),
    );
    east.walker.place([30, 14, 0]);
    east.run(seconds(2), still);
    expect(east.walker.position()[1]).toBeCloseTo(13, 1);
    const south = playerAt(
      0,
      30,
      [],
      sloped((_x, z) => 10 + z / 10),
    );
    south.walker.place([0, 14, 30]);
    south.run(seconds(2), still);
    expect(south.walker.position()[1]).toBeCloseTo(13, 1);
  });

  it("falls where there is no ground (outside every loaded tile)", () => {
    const { walker, run } = playerAt(500, 500);
    run(seconds(1), still);
    expect(walker.grounded()).toBe(false);
    expect(walker.position()[1]).toBeLessThan(-5);
  });

  it("jumps about 0.9 m and comes back down", () => {
    const { walker, run } = playerAt(0, 0);
    let highest = 0;
    walker.update(STEP_SECONDS, { ...still, jump: true });
    expect(walker.grounded()).toBe(false);
    for (let i = 0; i < seconds(1.5); i++) {
      walker.update(STEP_SECONDS, still);
      highest = Math.max(highest, walker.position()[1]);
    }
    expect(highest).toBeGreaterThan(0.7);
    expect(highest).toBeLessThan(1.1);
    run(seconds(0.5), still);
    expect(walker.grounded()).toBe(true);
    expect(walker.position()[1]).toBeCloseTo(0, 1);
  });

  it("stays inside the walkable circle and slides along its edge", () => {
    const { walker, run } = playerAt(0, 0);
    walker.setBounds({ centre: [0, 0], radiusM: 10 });
    run(seconds(5), north);
    expect(walker.position()[2]).toBeCloseTo(-10, 1);
    run(seconds(2), { ...still, forward: 1, right: 1 });
    const [x, , z] = walker.position();
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(10.001);
    expect(x).toBeGreaterThan(1);
  });

  it("moves the same distance whatever the frame rate", () => {
    const smooth = playerAt(0, 0);
    for (let i = 0; i < 240; i++) smooth.walker.update(1 / 120, north);
    const choppy = playerAt(0, 0);
    for (let i = 0; i < 60; i++) choppy.walker.update(1 / 30, north);
    expect(smooth.walker.position()[2]).toBeCloseTo(choppy.walker.position()[2], 1);
    expect(smooth.walker.position()[2]).toBeCloseTo(-2 * PLAYER.walkSpeed, 0);
  });
});
