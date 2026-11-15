import { describe, expect, it } from "vitest";
import { type Box, insideBoxes } from "./area.ts";

// Two tiles side by side (they overlap a little, as tile ground does), and one further south.
const west: Box = { minX: 0, maxX: 100.5, minZ: 0, maxZ: 100 };
const east: Box = { minX: 99.5, maxX: 200, minZ: 0, maxZ: 100 };
const south: Box = { minX: 0, maxX: 100, minZ: 99.5, maxZ: 200 };
const keep = insideBoxes([west, east, south]);

describe("insideBoxes", () => {
  it("leaves a spot inside any box where it is", () => {
    expect(keep(50, 50)).toEqual([50, 50]);
    expect(keep(150, 20)).toEqual([150, 20]);
    expect(keep(20, 180)).toEqual([20, 180]);
  });

  it("lets the player cross from one tile into the next", () => {
    expect(keep(100, 50)).toEqual([100, 50]);
    expect(keep(100.4, 50)).toEqual([100.4, 50]);
    expect(keep(50, 99.8)).toEqual([50, 99.8]);
  });

  it("moves a spot outside every box to the nearest edge", () => {
    expect(keep(-3, 50)).toEqual([0, 50]);
    expect(keep(150, -7)).toEqual([150, 0]);
    expect(keep(230, 130)).toEqual([200, 100]);
    // The empty corner between the east and south tiles: back to whichever is nearer.
    expect(keep(120, 103)).toEqual([120, 100]);
    expect(keep(103, 150)).toEqual([100, 150]);
  });

  it("pulls back a player who has drifted a hair outside", () => {
    expect(keep(-0.0005, 50)).toEqual([0, 50]);
  });

  it("allows everything when there are no boxes", () => {
    expect(insideBoxes([])(12, 34)).toEqual([12, 34]);
  });
});
