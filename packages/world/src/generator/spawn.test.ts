import { describe, expect, it } from "vitest";
import type { Vec2 } from "../types.ts";
import { groundHeightAt } from "./ground.ts";
import { findSpawn } from "./spawn.ts";

describe("findSpawn", () => {
  const street = {
    line: [
      [0, 100],
      [200, 100],
    ] as Vec2[],
    widthM: 7,
  };
  const avenue = {
    line: [
      [50, 0],
      [50, 300],
    ] as Vec2[],
    widthM: 7,
  };

  it("puts the player on the nearest street, on the ground", () => {
    const spawn = findSpawn([80, 130], [street, avenue]);
    expect(spawn.pos).toEqual([80, groundHeightAt(80, 100), 100]);
  });

  it("faces along the street: east is a quarter turn clockwise from north", () => {
    expect(findSpawn([80, 130], [street]).yaw).toBeCloseTo(Math.PI / 2, 9);
    // The avenue is drawn southwards (+z), so the player looks south: half a turn.
    expect(Math.abs(findSpawn([55, 40], [avenue]).yaw)).toBeCloseTo(Math.PI, 9);
  });

  it("uses the street's end when the spot is past it", () => {
    expect(findSpawn([-30, 90], [street]).pos).toEqual([0, 0, 100]);
  });

  it("falls back to the asked-for spot, facing north, when there are no streets", () => {
    expect(findSpawn([12, 34], [])).toEqual({ pos: [12, 0, 34], yaw: 0 });
  });
});
