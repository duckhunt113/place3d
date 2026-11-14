import { describe, expect, it } from "vitest";
import { centroid, type Pair, pointInRing, signedArea, withoutRepeats } from "./geometry.ts";

const square: Pair[] = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
];
// An L shape: a 4 x 2 bar with a 2 x 2 block on top of its left half. Area 12.
const lShape: Pair[] = [
  [0, 0],
  [4, 0],
  [4, 2],
  [2, 2],
  [2, 4],
  [0, 4],
];

describe("signedArea", () => {
  it("measures area, with the sign giving the winding", () => {
    expect(signedArea(square)).toBe(16);
    expect(signedArea([...square].reverse())).toBe(-16);
    expect(signedArea(lShape)).toBe(12);
  });

  it("stays precise for small shapes far from zero, like lat/lon rings", () => {
    const far = square.map(([x, y]): Pair => [-79.62 + x * 1e-5, 43.53 + y * 1e-5]);
    expect(signedArea(far) / 1.6e-9).toBeCloseTo(1, 6);
  });

  it("is zero for an empty ring", () => {
    expect(signedArea([])).toBe(0);
  });
});

describe("centroid", () => {
  it("finds the centre of a square and of an L shape", () => {
    expect(centroid(square)).toEqual([2, 2]);
    // By hand: (8 * [2, 1] + 4 * [1, 3]) / 12.
    const [x, y] = centroid(lShape);
    expect(x).toBeCloseTo(5 / 3, 12);
    expect(y).toBeCloseTo(5 / 3, 12);
  });

  it("does not depend on the winding or the starting point", () => {
    const rotated = [...lShape.slice(2), ...lShape.slice(0, 2)].reverse();
    const [x, y] = centroid(rotated);
    expect(x).toBeCloseTo(5 / 3, 12);
    expect(y).toBeCloseTo(5 / 3, 12);
  });

  it("stays precise for small shapes far from zero, like lat/lon rings", () => {
    const far = square.map(([x, y]): Pair => [-79.62 + x * 1e-5, 43.53 + y * 1e-5]);
    const [x, y] = centroid(far);
    expect(x).toBeCloseTo(-79.62 + 2e-5, 10);
    expect(y).toBeCloseTo(43.53 + 2e-5, 10);
  });

  it("falls back to the average for a flat ring", () => {
    expect(
      centroid([
        [0, 0],
        [2, 0],
        [4, 0],
      ]),
    ).toEqual([2, 0]);
  });
});

describe("pointInRing", () => {
  it("tells inside from outside, including the notch of an L shape", () => {
    expect(pointInRing([1, 1], lShape)).toBe(true);
    expect(pointInRing([1, 3], lShape)).toBe(true);
    expect(pointInRing([3, 3], lShape)).toBe(false);
    expect(pointInRing([5, 1], lShape)).toBe(false);
    expect(pointInRing([-1, 1], lShape)).toBe(false);
  });
});

describe("withoutRepeats", () => {
  it("drops points that repeat the one before", () => {
    expect(
      withoutRepeats([
        [0, 0],
        [0, 0],
        [1, 0],
        [1, 0],
        [0, 0],
      ]),
    ).toEqual([
      [0, 0],
      [1, 0],
      [0, 0],
    ]);
  });
});
