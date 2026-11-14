import { describe, expect, it } from "vitest";
import {
  boundingRectangle,
  centroid,
  convexHull,
  type Pair,
  pointInRing,
  signedArea,
  withoutRepeats,
} from "./geometry.ts";

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

describe("boundingRectangle", () => {
  it("finds an upright rectangle: centre, long side and half sizes", () => {
    const box = boundingRectangle([
      [0, 0],
      [12, 0],
      [12, 8],
      [0, 8],
    ]);
    expect(box?.centre).toEqual([6, 4]);
    expect(box?.halfLong).toBeCloseTo(6, 9);
    expect(box?.halfShort).toBeCloseTo(4, 9);
    expect(Math.abs(box?.axis[0] ?? 0)).toBeCloseTo(1, 9);
    expect(box?.axis[1]).toBeCloseTo(0, 9);
  });

  it("finds a tilted rectangle at its own angle, not a bigger upright box", () => {
    // 10 x 4, turned so the long side runs along (0.6, 0.8).
    const turn = (u: number, v: number): [number, number] => [
      u * 0.6 - v * 0.8 + 50,
      u * 0.8 + v * 0.6 - 20,
    ];
    const box = boundingRectangle([turn(0, 0), turn(10, 0), turn(10, 4), turn(0, 4)]);
    expect(box?.halfLong).toBeCloseTo(5, 9);
    expect(box?.halfShort).toBeCloseTo(2, 9);
    expect(Math.abs((box?.axis[0] ?? 0) * 0.6 + (box?.axis[1] ?? 0) * 0.8)).toBeCloseTo(1, 9);
    const [cx, cy] = turn(5, 2);
    expect(box?.centre[0]).toBeCloseTo(cx, 9);
    expect(box?.centre[1]).toBeCloseTo(cy, 9);
  });

  it("wraps an L-shape in the rectangle around its corners", () => {
    const box = boundingRectangle([
      [0, 0],
      [8, 0],
      [8, 4],
      [4, 4],
      [4, 8],
      [0, 8],
    ]);
    expect(4 * (box?.halfLong ?? 0) * (box?.halfShort ?? 0)).toBeCloseTo(64, 9);
  });

  it("is undefined for a line or an empty ring", () => {
    expect(boundingRectangle([])).toBeUndefined();
    expect(
      boundingRectangle([
        [0, 0],
        [5, 5],
        [9, 9],
      ]),
    ).toBeUndefined();
  });

  it("builds the hull without points that lie inside or along an edge", () => {
    const hull = convexHull([
      [0, 0],
      [4, 0],
      [2, 0],
      [4, 4],
      [2, 2],
      [0, 4],
    ]);
    expect(hull).toHaveLength(4);
  });
});
