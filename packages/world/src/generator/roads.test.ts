import { describe, expect, it } from "vitest";
import type { MeshData, RoadDecision, Vec2 } from "../types.ts";
import { boxShape, pointInShape, shapeArea } from "../util/shapes.ts";
import { MeshSet } from "./mesh.ts";
import {
  addStreets,
  CENTRE_LINE_COLOUR,
  CENTRE_LINE_M,
  CURB_WIDTH_M,
  MARKING_Y,
  PATH_Y,
  planStreets,
  ROAD_Y,
  type RoadPiece,
  roadReach,
  SIDEWALK_WIDTH_M,
  sideWidths,
} from "./roads.ts";

const decision = (over: Partial<RoadDecision> = {}): RoadDecision => ({
  kind: "road",
  id: "way/1",
  widthM: 7,
  sidewalks: "none",
  curbs: false,
  markings: "none",
  stalls: false,
  surface: "asphalt",
  rules: [],
  source: "rule",
  ...over,
});
const piece = (
  line: Vec2[],
  over: Partial<RoadDecision> = {},
  cut: Partial<RoadPiece> = {},
): RoadPiece => ({
  decision: decision(over),
  line,
  offsetM: 0,
  cutStart: false,
  cutEnd: false,
  ...cut,
});
/** A street with curbs and sidewalks on both sides. */
const street = (line: Vec2[], id: `way/${number}`, cut: Partial<RoadPiece> = {}) =>
  piece(line, { id, curbs: true, sidewalks: "both" }, cut);

describe("sideWidths and roadReach", () => {
  it("adds a curb, and a sidewalk on the sides that have one", () => {
    expect(sideWidths(decision())).toEqual({ curb: 0, left: 0, right: 0 });
    expect(sideWidths(decision({ curbs: true }))).toEqual({
      curb: CURB_WIDTH_M,
      left: CURB_WIDTH_M,
      right: CURB_WIDTH_M,
    });
    const both = sideWidths(decision({ curbs: true, sidewalks: "both" }));
    expect(both.left).toBeCloseTo(CURB_WIDTH_M + SIDEWALK_WIDTH_M, 9);
    expect(both.right).toBe(both.left);
    const left = sideWidths(decision({ curbs: true, sidewalks: "left" }));
    expect(left.left).toBeGreaterThan(left.right);
    expect(left.right).toBe(CURB_WIDTH_M);
  });

  it("gives paths no curb or sidewalk", () => {
    expect(sideWidths(decision({ kind: "path", curbs: true, sidewalks: "both" }))).toEqual({
      curb: 0,
      left: 0,
      right: 0,
    });
  });

  it("reaches from the centre line to the outer edge of the sidewalk", () => {
    expect(roadReach(decision())).toBe(3.5);
    expect(roadReach(decision({ curbs: true, sidewalks: "left" }))).toBeCloseTo(3.5 + 1.8, 9);
  });
});

describe("planStreets: one road", () => {
  it("is as wide as decided, with a round end at each real end", () => {
    const plan = planStreets([
      piece([
        [0, 0],
        [10, 0],
      ]),
    ]);
    expect(plan.roadways).toHaveLength(1);
    expect(plan.roadways[0]?.colour).toBe("asphalt");
    // 10 m x 7 m, plus two half discs of radius 3.5 m drawn with flat sides (a little under pi r^2).
    const area = shapeArea(plan.driving);
    expect(area).toBeGreaterThan(70 + 36);
    expect(area).toBeLessThan(70 + Math.PI * 3.5 ** 2);
    expect(pointInShape([5, 3.4], plan.driving)).toBe(true);
    expect(pointInShape([5, 3.6], plan.driving)).toBe(false);
    expect(pointInShape([-3, 0], plan.driving)).toBe(true);
  });

  it("is cut square where it was cut at the margin", () => {
    const plan = planStreets([
      piece(
        [
          [0, 0],
          [10, 0],
        ],
        {},
        { cutStart: true, cutEnd: true },
      ),
    ]);
    expect(shapeArea(plan.driving)).toBeCloseTo(70, 6);
  });

  it("has no curb, sidewalk or centre line unless decided", () => {
    const plan = planStreets([
      piece([
        [0, 0],
        [10, 0],
      ]),
    ]);
    expect(plan.curb).toEqual([]);
    expect(plan.sidewalk).toEqual([]);
    expect(plan.raised).toEqual([]);
    expect(plan.centreLines).toEqual([]);
  });

  it("gets a curb strip on both sides, and a sidewalk beyond it where decided", () => {
    const cut = { cutStart: true, cutEnd: true };
    const plan = planStreets([
      street(
        [
          [0, 0],
          [100, 0],
        ],
        "way/1",
        cut,
      ),
    ]);
    expect(shapeArea(plan.curb)).toBeCloseTo(2 * 100 * CURB_WIDTH_M, 4);
    expect(shapeArea(plan.sidewalk)).toBeCloseTo(2 * 100 * SIDEWALK_WIDTH_M, 4);
    expect(shapeArea(plan.raised)).toBeCloseTo(2 * 100 * (CURB_WIDTH_M + SIDEWALK_WIDTH_M), 4);
    // From the centre line outwards: road, curb, sidewalk, lawn.
    expect(pointInShape([50, 3.4], plan.driving)).toBe(true);
    expect(pointInShape([50, 3.65], plan.curb)).toBe(true);
    expect(pointInShape([50, 4.5], plan.sidewalk)).toBe(true);
    expect(pointInShape([50, 5.4], plan.raised)).toBe(false);
    // Nothing raised lies on the road itself.
    expect(pointInShape([50, 0], plan.raised)).toBe(false);
  });

  it("puts a one-sided sidewalk on the left of the direction the road is drawn", () => {
    const cut = { cutStart: true, cutEnd: true };
    // Drawn eastwards: left is north (-z).
    const plan = planStreets([
      piece(
        [
          [0, 0],
          [100, 0],
        ],
        { curbs: true, sidewalks: "left" },
        cut,
      ),
    ]);
    expect(pointInShape([50, -4.5], plan.sidewalk)).toBe(true);
    expect(pointInShape([50, 4.5], plan.sidewalk)).toBe(false);
    expect(pointInShape([50, 3.65], plan.curb)).toBe(true);
  });

  it("wraps the sidewalk around a dead end", () => {
    const plan = planStreets([
      street(
        [
          [0, 0],
          [50, 0],
        ],
        "way/1",
        { cutStart: true },
      ),
    ]);
    // Straight past the end of the road: road, then curb, then sidewalk.
    expect(pointInShape([53, 0], plan.driving)).toBe(true);
    expect(pointInShape([53.65, 0], plan.curb)).toBe(true);
    expect(pointInShape([54.5, 0], plan.sidewalk)).toBe(true);
    expect(pointInShape([56, 0], plan.raised)).toBe(false);
  });
});

describe("planStreets: where roads meet", () => {
  const cut = { cutStart: true, cutEnd: true };
  // A main street running east, and a side street coming up from the south to meet it at x = 50.
  const main = street(
    [
      [0, 0],
      [50, 0],
      [100, 0],
    ],
    "way/1",
    cut,
  );
  const side = street(
    [
      [50, 60],
      [50, 0],
    ],
    "way/2",
    { cutStart: true },
  );
  const plan = planStreets([main, side]);

  it("joins the roads into one driving surface, counted once", () => {
    expect(plan.driving).toHaveLength(1);
    // Main street 100 x 7; the side street adds 7 m wide up to the main street's edge.
    expect(shapeArea(plan.driving)).toBeCloseTo(700 + 7 * (60 - 3.5), 0);
  });

  it("does not let the side street bulge out of the far side of the main street", () => {
    expect(pointInShape([50, -3.4], plan.driving)).toBe(true);
    expect(pointInShape([50, -3.6], plan.driving)).toBe(false);
    // The far sidewalk runs straight past the junction.
    expect(pointInShape([50, -4.5], plan.sidewalk)).toBe(true);
  });

  it("opens the near sidewalk for the side street and turns it around the corners", () => {
    // In the mouth of the side street there is road, not sidewalk.
    expect(pointInShape([50, 4.5], plan.driving)).toBe(true);
    expect(pointInShape([50, 4.5], plan.raised)).toBe(false);
    // On the corner, the two sidewalks meet.
    expect(pointInShape([45.3, 4.7], plan.sidewalk)).toBe(true);
    expect(pointInShape([54.7, 4.7], plan.sidewalk)).toBe(true);
    // And each continues along its own street.
    expect(pointInShape([20, 4.5], plan.sidewalk)).toBe(true);
    expect(pointInShape([45.5, 30], plan.sidewalk)).toBe(true);
  });

  it("lets a driveway cut through the curb and the sidewalk", () => {
    const driveway = piece(
      [
        [30, 0],
        [30, -15],
      ],
      { id: "way/3", kind: "driveway", widthM: 3 },
    );
    const withDriveway = planStreets([main, side, driveway]);
    expect(pointInShape([30, -4.5], withDriveway.driving)).toBe(true);
    expect(pointInShape([30, -4.5], withDriveway.raised)).toBe(false);
    expect(pointInShape([27, -4.5], withDriveway.sidewalk)).toBe(true);
  });

  it("keeps a wide road from bulging through a narrow one it ends on", () => {
    const narrow = piece(
      [
        [0, 0],
        [50, 0],
        [100, 0],
      ],
      { id: "way/1", widthM: 4 },
      cut,
    );
    const wide = piece(
      [
        [50, 60],
        [50, 0],
      ],
      { id: "way/2", widthM: 14 },
      { cutStart: true },
    );
    const meeting = planStreets([narrow, wide]);
    expect(pointInShape([50, -2.2], meeting.driving)).toBe(false);
    expect(pointInShape([44, 1], meeting.driving)).toBe(true);
  });

  it("stops footpaths at the sidewalk and the road", () => {
    const path = piece(
      [
        [20, -30],
        [20, 30],
      ],
      { id: "way/4", kind: "path", widthM: 1.8, surface: "sidewalk" },
    );
    const withPath = planStreets([main, side, path]);
    const paths = withPath.paths[0]?.shape ?? [];
    expect(withPath.paths[0]?.colour).toBe("sidewalk");
    expect(pointInShape([20, -20], paths)).toBe(true);
    expect(pointInShape([20, 0], paths)).toBe(false);
    expect(pointInShape([20, -4.5], paths)).toBe(false);
    // The road is not widened by the path crossing it.
    expect(pointInShape([20, 3.6], withPath.driving)).toBe(false);
  });
});

describe("planStreets: centre lines", () => {
  const cut = { cutStart: true, cutEnd: true };
  const marked = (line: Vec2[], id: `way/${number}`) =>
    piece(line, { id, curbs: true, sidewalks: "both", markings: "centre" }, cut);

  it("paints a line down the middle of a marked road", () => {
    const plan = planStreets([
      marked(
        [
          [0, 0],
          [100, 0],
        ],
        "way/1",
      ),
    ]);
    expect(shapeArea(plan.centreLines)).toBeCloseTo(100 * CENTRE_LINE_M, 4);
    expect(pointInShape([50, 0], plan.centreLines)).toBe(true);
    expect(pointInShape([50, 0.2], plan.centreLines)).toBe(false);
  });

  it("breaks the line where another street joins, but not for a driveway", () => {
    const main = marked(
      [
        [0, 0],
        [50, 0],
        [100, 0],
      ],
      "way/1",
    );
    const side = street(
      [
        [50, 60],
        [50, 0],
      ],
      "way/2",
      { cutStart: true },
    );
    const joined = planStreets([main, side]);
    expect(pointInShape([50, 0], joined.centreLines)).toBe(false);
    expect(pointInShape([46, 0], joined.centreLines)).toBe(false);
    expect(pointInShape([40, 0], joined.centreLines)).toBe(true);
    const driveway = piece(
      [
        [50, 0],
        [50, -15],
      ],
      { id: "way/3", kind: "driveway", widthM: 3 },
    );
    const withDriveway = planStreets([
      marked(
        [
          [0, 0],
          [50, 0],
          [100, 0],
        ],
        "way/1",
      ),
      driveway,
    ]);
    expect(pointInShape([50, 0], withDriveway.centreLines)).toBe(true);
  });
});

describe("planStreets: the same every time", () => {
  it("gives identical shapes for identical roads", () => {
    const roads = () => [
      street(
        [
          [0, 0],
          [50, 0],
          [100, 3],
        ],
        "way/1",
      ),
      street(
        [
          [50, 60],
          [50, 0],
        ],
        "way/2",
      ),
      piece(
        [
          [20, -30],
          [20, 30],
        ],
        { id: "way/4", kind: "path", widthM: 1.8, surface: "sidewalk" },
      ),
    ];
    expect(planStreets(roads())).toEqual(planStreets(roads()));
  });

  it("makes nothing from nothing", () => {
    expect(planStreets([])).toEqual({
      roadways: [],
      driving: [],
      paths: [],
      curb: [],
      sidewalk: [],
      raised: [],
      centreLines: [],
    });
  });
});

describe("addStreets", () => {
  const heights = (mesh: MeshData | undefined): number[] => {
    const ys = new Set<number>();
    for (let i = 1; i < (mesh?.positions.length ?? 0); i += 3) {
      ys.add(Math.round((mesh?.positions[i] as number) * 1000) / 1000);
    }
    return [...ys];
  };
  const xs = (mesh: MeshData | undefined): number[] => {
    const out: number[] = [];
    for (let i = 0; i < (mesh?.positions.length ?? 0); i += 3)
      out.push(mesh?.positions[i] as number);
    return out;
  };
  const cut = { cutStart: true, cutEnd: true };
  const plan = planStreets([
    piece(
      [
        [-50, 0],
        [150, 0],
      ],
      { curbs: true, markings: "centre" },
      cut,
    ),
    piece(
      [
        [20, -30],
        [20, 30],
      ],
      { id: "way/4", kind: "path", widthM: 1.8, surface: "sidewalk" },
    ),
  ]);
  const set = new MeshSet();
  addStreets(set, plan, boxShape(0, -100, 100, 100));
  const meshes = set.toMeshData();
  const mesh = (material: string) => meshes.find((m) => m.material === material);

  it("draws roads, paths and paint at their own heights, facing up", () => {
    expect(heights(mesh("asphalt"))).toEqual([ROAD_Y]);
    expect(heights(mesh("sidewalk"))).toEqual([PATH_Y]);
    expect(heights(mesh(CENTRE_LINE_COLOUR))).toEqual([Math.round(MARKING_Y * 1000) / 1000]);
    expect(MARKING_Y).toBeGreaterThan(ROAD_Y);
    for (const m of meshes) {
      for (let i = 1; i < m.normals.length; i += 3) expect(m.normals[i]).toBe(1);
    }
  });

  it("cuts everything at the tile's edges", () => {
    for (const m of meshes) {
      expect(Math.min(...xs(m))).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs(m))).toBeLessThanOrEqual(100);
    }
    expect(Math.min(...xs(mesh("asphalt")))).toBe(0);
    expect(Math.max(...xs(mesh("asphalt")))).toBe(100);
  });
});
