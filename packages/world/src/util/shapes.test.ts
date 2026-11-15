import { describe, expect, it } from "vitest";
import type { Pair } from "./geometry.ts";
import {
  boxShape,
  cutAway,
  join,
  overlap,
  pointInShape,
  ribbonPieces,
  ringShape,
  shapeArea,
  unite,
} from "./shapes.ts";

describe("combining shapes", () => {
  const a = boxShape(0, 0, 10, 10);
  const b = boxShape(5, 5, 15, 15);

  it("joins overlapping shapes into one, counted once", () => {
    const joined = join(a, b);
    expect(joined).toHaveLength(1);
    expect(shapeArea(joined)).toBeCloseTo(175, 6);
    expect(join(a, [])).toEqual(a);
    expect(join()).toEqual([]);
  });

  it("cuts one shape out of another", () => {
    expect(shapeArea(cutAway(a, b))).toBeCloseTo(75, 6);
    expect(cutAway(a, [])).toEqual(a);
    // A hole in the middle: the result keeps its outline and gains a hole.
    const ring = cutAway(a, boxShape(4, 4, 6, 6));
    expect(ring).toHaveLength(1);
    expect(ring[0]).toHaveLength(2);
    expect(shapeArea(ring)).toBeCloseTo(96, 6);
  });

  it("keeps only the part two shapes share", () => {
    expect(shapeArea(overlap(a, b))).toBeCloseTo(25, 6);
    expect(overlap(a, boxShape(20, 20, 30, 30))).toEqual([]);
  });

  it("knows what is inside, minding holes", () => {
    const ring = cutAway(a, boxShape(4, 4, 6, 6));
    expect(pointInShape([1, 1], ring)).toBe(true);
    expect(pointInShape([5, 5], ring)).toBe(false);
    expect(pointInShape([11, 1], ring)).toBe(false);
  });

  it("joins many simple rings at once", () => {
    const squares: Pair[][] = [];
    for (let i = 0; i < 20; i++) {
      squares.push([
        [i, 0],
        [i + 1.5, 0],
        [i + 1.5, 1],
        [i, 1],
      ]);
    }
    const strip = unite(squares);
    expect(strip).toHaveLength(1);
    expect(shapeArea(strip)).toBeCloseTo(20.5, 6);
    expect(unite([])).toEqual([]);
  });

  it("drops shapes too thin to have an area", () => {
    expect(
      ringShape([
        [0, 0],
        [5, 0],
        [10, 0],
      ]),
    ).toEqual([]);
  });
});

describe("ribbonPieces", () => {
  const ribbon = (line: Pair[], left: number, right: number, ends = { start: 0, end: 0 }) =>
    unite(ribbonPieces(line, left, right, ends));

  it("thickens a straight line by its two widths", () => {
    const shape = ribbon(
      [
        [0, 0],
        [10, 0],
      ],
      2,
      1,
    );
    expect(shapeArea(shape)).toBeCloseTo(30, 6);
    // Travelling east, left is north (-z): the wide side.
    expect(pointInShape([5, -1.9], shape)).toBe(true);
    expect(pointInShape([5, 1.9], shape)).toBe(false);
    expect(pointInShape([5, 0.9], shape)).toBe(true);
  });

  it("fills the outside of a bend with a rounded corner, on whichever side it opens", () => {
    // East, then south: a right turn. The outside of the bend is the north-east corner.
    const right = ribbon(
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      2,
      2,
    );
    expect(pointInShape([11.3, -1.3], right)).toBe(true);
    // Rounded, not square: the very corner stays empty.
    expect(pointInShape([11.9, -1.9], right)).toBe(false);
    // East, then north: a left turn. The outside is the south-east corner.
    const left = ribbon(
      [
        [0, 0],
        [10, 0],
        [10, -10],
      ],
      2,
      2,
    );
    expect(pointInShape([11.3, 1.3], left)).toBe(true);
    expect(pointInShape([11.9, 1.9], left)).toBe(false);
    expect(left).toHaveLength(1);
  });

  it("stays whole along a gentle curve", () => {
    const curve: Pair[] = [];
    for (let i = 0; i <= 12; i++) {
      const angle = (i / 12) * Math.PI;
      curve.push([Math.cos(angle) * 30, Math.sin(angle) * 30]);
    }
    const shape = ribbon(curve, 3.5, 3.5);
    expect(shape).toHaveLength(1);
    // Half a ring between radius 26.5 and 33.5: pi * (33.5^2 - 26.5^2) / 2, give or take the flat sides.
    expect(shapeArea(shape)).toBeGreaterThan(640);
    expect(shapeArea(shape)).toBeLessThan(662);
    // No notches on the outer edge between two points of the curve.
    const mid = (7.5 / 12) * Math.PI;
    expect(pointInShape([Math.cos(mid) * 33.1, Math.sin(mid) * 33.1], shape)).toBe(true);
  });

  it("rounds an end when asked, and cuts it square otherwise", () => {
    const line: Pair[] = [
      [0, 0],
      [10, 0],
    ];
    const square = ribbon(line, 2, 2);
    expect(pointInShape([-1, 0], square)).toBe(false);
    const round = ribbon(line, 2, 2, { start: 2, end: 0 });
    expect(pointInShape([-1.8, 0], round)).toBe(true);
    expect(pointInShape([-1.8, 1.8], round)).toBe(false);
    expect(pointInShape([11, 0], round)).toBe(false);
    // Half a circle of radius 2 (drawn with flat sides) on top of the 40 m2 rectangle.
    expect(shapeArea(round)).toBeGreaterThan(40 + 6.0);
    expect(shapeArea(round)).toBeLessThan(40 + 2 * Math.PI);
  });

  it("keeps a round end inside each side's own width", () => {
    const shape = ribbon(
      [
        [0, 0],
        [10, 0],
      ],
      3,
      0,
      { start: 3, end: 0 },
    );
    // Only the left (north) quarter is rounded; nothing appears south of the line.
    expect(pointInShape([-1.5, -1.5], shape)).toBe(true);
    expect(pointInShape([-1, 0.5], shape)).toBe(false);
  });

  it("makes nothing from a single point or without any width", () => {
    expect(ribbonPieces([[1, 1]], 2, 2)).toEqual([]);
    expect(
      ribbonPieces(
        [
          [0, 0],
          [5, 0],
        ],
        0,
        0,
      ),
    ).toEqual([]);
  });
});
