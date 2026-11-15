import { describe, expect, it } from "vitest";
import type { MeshData, RoadDecision, Vec2 } from "../types.ts";
import { boxShape } from "../util/shapes.ts";
import { MeshSet } from "./mesh.ts";
import {
  addStalls,
  type ParkingLot,
  STALL_COLOUR,
  STALL_DEPTH_M,
  STALL_LINE_M,
  STALL_WIDTH_M,
  STALL_Y,
} from "./parking.ts";
import { planStreets, ROAD_Y, type RoadPiece } from "./roads.ts";

const aisle = (line: Vec2[], id: `way/${number}` = "way/1", offsetM = 0): RoadPiece => ({
  decision: {
    kind: "road",
    id,
    widthM: 6,
    sidewalks: "none",
    curbs: false,
    markings: "none",
    stalls: true,
    surface: "asphalt",
    rules: [],
    source: "rule",
  } satisfies RoadDecision,
  line,
  offsetM,
  cutStart: true,
  cutEnd: true,
});
const lot = (minX: number, minZ: number, maxX: number, maxZ: number, whole = true): ParkingLot => ({
  outline: [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
  ],
  holes: [],
  whole,
});
const everywhere = boxShape(-1000, -1000, 1000, 1000);

function paint(lots: ParkingLot[], pieces: RoadPiece[], tile = everywhere) {
  const set = new MeshSet();
  const area = addStalls(set, lots, pieces, planStreets(pieces).driving, tile);
  const mesh: MeshData | undefined = set.toMeshData().find((m) => m.material === STALL_COLOUR);
  const points: [number, number, number][] = [];
  for (let i = 0; i < (mesh?.positions.length ?? 0); i += 3) {
    points.push([
      mesh?.positions[i] as number,
      mesh?.positions[i + 1] as number,
      mesh?.positions[i + 2] as number,
    ]);
  }
  return { area, points, mesh };
}
/** The x positions lines are centred on, rounded to a centimetre. */
const lineXs = (points: [number, number, number][]) =>
  [...new Set(points.map((p) => Math.round(p[0] / STALL_WIDTH_M) * STALL_WIDTH_M))].sort(
    (a, b) => a - b,
  );

describe("addStalls along an aisle", () => {
  // An aisle running east through the middle of a 54 m by 30 m lot.
  const { area, points, mesh } = paint(
    [lot(0, -15, 54, 15)],
    [
      aisle([
        [-20, 0],
        [80, 0],
      ]),
    ],
  );

  it("paints white lines just under road height", () => {
    expect(mesh?.material).toBe("road.white");
    for (const p of points) expect(p[1]).toBeCloseTo(STALL_Y, 6);
    expect(STALL_Y).toBeLessThan(ROAD_Y);
    expect(STALL_Y).toBeGreaterThan(0.012);
  });

  it("puts a line every stall width on both sides of the aisle", () => {
    // Lines at multiples of 2.7 m along the aisle (measured from its start at x = -20) that
    // fall inside the lot: 20 of them, on two sides, each 5.2 m long.
    expect(area).toBeCloseTo(2 * 20 * STALL_DEPTH_M * STALL_LINE_M, 2);
    const zs = points.map((p) => p[2]);
    expect(Math.min(...zs)).toBeCloseTo(-(3 + STALL_DEPTH_M), 6);
    expect(Math.max(...zs)).toBeCloseTo(3 + STALL_DEPTH_M, 6);
  });

  it("keeps the aisle itself clear", () => {
    for (const p of points) expect(Math.abs(p[2])).toBeGreaterThanOrEqual(3 - 1e-6);
  });

  it("stays inside the lot", () => {
    for (const p of points) {
      expect(p[0]).toBeGreaterThanOrEqual(0);
      expect(p[0]).toBeLessThanOrEqual(54);
    }
    // A lot too narrow for full stalls gets shorter lines, never lines on the lawn.
    const narrow = paint(
      [lot(0, -5, 54, 5)],
      [
        aisle([
          [-20, 0],
          [80, 0],
        ]),
      ],
    );
    for (const p of narrow.points) expect(Math.abs(p[2])).toBeLessThanOrEqual(5 + 1e-6);
    expect(narrow.area).toBeGreaterThan(0);
  });

  it("counts stalls from the start of the whole aisle, so neighbouring tiles agree", () => {
    const whole = paint(
      [lot(0, -15, 54, 15)],
      [
        aisle(
          [
            [0, 0],
            [54, 0],
          ],
          "way/1",
          20,
        ),
      ],
    );
    const first = (list: [number, number, number][]) => Math.min(...list.map((p) => p[0]));
    // Both describe the same aisle; one piece simply starts 20 m into it.
    expect(first(whole.points)).toBeCloseTo(first(points), 6);
  });

  it("cuts the lines at the tile's edge", () => {
    const half = paint(
      [lot(0, -15, 54, 15)],
      [
        aisle([
          [-20, 0],
          [80, 0],
        ]),
      ],
      boxShape(0, -100, 27, 100),
    );
    for (const p of half.points) expect(p[0]).toBeLessThanOrEqual(27);
    expect(half.area).toBeGreaterThan(area * 0.4);
    expect(half.area).toBeLessThan(area * 0.6);
  });

  it("paints nothing outside parking lots, or along roads that are not aisles", () => {
    expect(
      paint(
        [],
        [
          aisle([
            [-20, 0],
            [80, 0],
          ]),
        ],
      ).area,
    ).toBe(0);
    const road = aisle([
      [-20, 0],
      [80, 0],
    ]);
    road.decision = { ...road.decision, stalls: false };
    // The lot has a road through it but no aisle: it falls back to rows along its long sides.
    const rows = paint([lot(0, -15, 54, 15)], [road]);
    expect(Math.max(...rows.points.map((p) => Math.abs(p[2])))).toBeCloseTo(15, 6);
  });
});

describe("addStalls where two aisles meet", () => {
  it("lets the first aisle keep its stalls and stops the other's lines there", () => {
    const lots = [lot(-40, -40, 40, 40)];
    const first = aisle(
      [
        [-40, 0],
        [40, 0],
      ],
      "way/1",
    );
    const second = aisle(
      [
        [0, -40],
        [0, 40],
      ],
      "way/2",
    );
    const alone = paint(lots, [second]);
    const both = paint(lots, [first, second]);
    // The second aisle's lines run east-west. Within the first aisle's stalls (|z| < 8.2) none remain.
    const crossing = both.points.filter(
      (p) =>
        Math.abs(p[2]) < 3 + STALL_DEPTH_M - 0.5 && Math.abs(p[2]) > 3.5 && Math.abs(p[0]) > 3.2,
    );
    const eastWest = crossing.filter((p) => Math.abs(Math.abs(p[0]) - (3 + STALL_DEPTH_M)) < 0.01);
    expect(eastWest).toEqual([]);
    expect(alone.area).toBeGreaterThan(0);
    // Nothing is painted twice, and the second aisle lost the lines that would have crossed.
    expect(both.area).toBeLessThan(paint(lots, [first]).area + alone.area);
  });
});

describe("addStalls in a lot without an aisle", () => {
  it("lines both long sides of a wide lot", () => {
    const { points, area } = paint([lot(0, 0, 40, 20)], []);
    const zs = points.map((p) => p[2]);
    expect(Math.min(...zs)).toBeCloseTo(0, 6);
    expect(Math.max(...zs)).toBeCloseTo(20, 6);
    // Nothing in the driving space down the middle.
    for (const z of zs)
      expect(z <= STALL_DEPTH_M + 1e-6 || z >= 20 - STALL_DEPTH_M - 1e-6).toBe(true);
    // 15 lines per side (every 2.7 m along 40 m), each 5.2 m long.
    expect(area).toBeCloseTo(2 * 15 * STALL_DEPTH_M * STALL_LINE_M, 1);
    expect(lineXs(points).length).toBeGreaterThanOrEqual(15);
  });

  it("lines one side of a narrow lot, and leaves a tiny one bare", () => {
    const narrow = paint([lot(0, 0, 40, 10)], []);
    expect(narrow.area).toBeCloseTo(15 * STALL_DEPTH_M * STALL_LINE_M, 1);
    expect(paint([lot(0, 0, 40, 6)], []).area).toBe(0);
  });

  it("leaves a lot cut by the tile's edge bare: its real shape is not known here", () => {
    expect(paint([lot(0, 0, 40, 20, false)], []).area).toBe(0);
  });

  it("gives the same paint every time", () => {
    const again = () =>
      paint(
        [lot(0, 0, 40, 20), lot(100, -15, 154, 15)],
        [
          aisle([
            [80, 0],
            [180, 0],
          ]),
        ],
      );
    expect(again().points).toEqual(again().points);
  });
});
