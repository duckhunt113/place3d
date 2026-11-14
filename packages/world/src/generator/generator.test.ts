import { describe, expect, it } from "vitest";
import testTile from "../data/fixtures/test-tile.json" with { type: "json" };
import { prepareTile } from "../data/prepare.ts";
import { project, regionFor } from "../data/project.ts";
import { tileBounds } from "../data/tiles.ts";
import { createRuleEngine } from "../decide/rules/index.ts";
import type { BuildingDecision, MeshData, RoadDecision, TileData, Vec2 } from "../types.ts";
import { addBuilding } from "./buildings.ts";
import { addGround } from "./ground.ts";
import { MeshSet } from "./mesh.ts";
import { addRoad, PATH_Y, ROAD_Y } from "./roads.ts";
import { BUILDING_COLOUR, buildTile, GROUND_COLOUR } from "./tile.ts";

type Triangle = { corners: [number, number, number][]; normal: [number, number, number] };

function triangles(mesh: MeshData | undefined): Triangle[] {
  if (!mesh) return [];
  const out: Triangle[] = [];
  const corner = (i: number): [number, number, number] => [
    mesh.positions[i * 3] as number,
    mesh.positions[i * 3 + 1] as number,
    mesh.positions[i * 3 + 2] as number,
  ];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] as number;
    out.push({
      corners: [
        corner(a),
        corner(mesh.indices[i + 1] as number),
        corner(mesh.indices[i + 2] as number),
      ],
      normal: [
        mesh.normals[a * 3] as number,
        mesh.normals[a * 3 + 1] as number,
        mesh.normals[a * 3 + 2] as number,
      ],
    });
  }
  return out;
}

/** The triangle's area, and whether its corner order faces the same way as its stored normal. */
function measure(t: Triangle): { area: number; facesNormal: boolean } {
  const [a, b, c] = t.corners;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  const cross = [
    u[1] * v[2] - u[2] * v[1],
    u[2] * v[0] - u[0] * v[2],
    u[0] * v[1] - u[1] * v[0],
  ] as const;
  const dot = cross[0] * t.normal[0] + cross[1] * t.normal[1] + cross[2] * t.normal[2];
  return { area: Math.hypot(...cross) / 2, facesNormal: dot > 0 };
}

const totalArea = (list: Triangle[]) => list.reduce((sum, t) => sum + measure(t).area, 0);
const only = (set: MeshSet): MeshData => {
  const data = set.toMeshData();
  if (data.length !== 1 || !data[0]) throw new Error(`expected one mesh, got ${data.length}`);
  return data[0];
};

const roadDecision = (over: Partial<RoadDecision> = {}): RoadDecision => ({
  kind: "road",
  osmId: "way/1",
  widthM: 7,
  sidewalks: "none",
  curbs: false,
  markings: "none",
  surface: "asphalt",
  rules: [],
  source: "rule",
  ...over,
});
const buildingDecision = (heightM: number): BuildingDecision => ({
  kind: "building",
  osmId: "way/2",
  type: "house",
  storeys: 2,
  heightM,
  roof: "flat",
  colour: "house.beige",
  shopSigns: false,
  rules: [],
  source: "rule",
});

describe("addRoad", () => {
  const set = new MeshSet();
  addRoad(
    set,
    [
      [0, 0],
      [10, 0],
    ],
    roadDecision(),
  );
  const mesh = only(set);
  const list = triangles(mesh);

  it("uses the road's surface colour as the material", () => {
    expect(mesh.material).toBe("asphalt");
  });

  it("is flat, just above the ground, facing up", () => {
    for (const t of list) {
      expect(t.normal).toEqual([0, 1, 0]);
      expect(measure(t).facesNormal).toBe(true);
      for (const corner of t.corners) expect(corner[1]).toBeCloseTo(ROAD_Y, 6);
    }
  });

  it("is as wide as the decision says", () => {
    const zs = list.flatMap((t) => t.corners.map((c) => c[2]));
    expect(Math.max(...zs)).toBeCloseTo(3.5, 5);
    expect(Math.min(...zs)).toBeCloseTo(-3.5, 5);
  });

  it("covers the ribbon plus a round cap at each end", () => {
    // Ribbon 10 m x 7 m = 70 m2; each cap is an 8-sided disc of radius 3.5 m = 34.65 m2.
    expect(totalArea(list)).toBeCloseTo(70 + 2 * 34.648, 1);
    expect(list).toHaveLength(2 + 16);
  });

  it("puts paths a little higher than roads, in their own colour", () => {
    const paths = new MeshSet();
    addRoad(
      paths,
      [
        [0, 0],
        [5, 0],
      ],
      roadDecision({ kind: "path", widthM: 1.8, surface: "sidewalk" }),
    );
    const path = only(paths);
    expect(path.material).toBe("sidewalk");
    expect(path.positions[1]).toBeCloseTo(PATH_Y, 6);
  });

  it("follows bends without stretching a sharp corner far away", () => {
    const bend = new MeshSet();
    const line: Vec2[] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 19],
    ];
    addRoad(bend, line, roadDecision());
    const toSegment = (x: number, z: number, a: Vec2, b: Vec2): number => {
      const t =
        ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) /
        ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2);
      const k = Math.max(0, Math.min(1, t));
      return Math.hypot(x - (a[0] + k * (b[0] - a[0])), z - (a[1] + k * (b[1] - a[1])));
    };
    let farthest = 0;
    for (const t of triangles(only(bend))) {
      expect(measure(t).facesNormal).toBe(true);
      for (const [x, , z] of t.corners) {
        const distance = Math.min(
          ...line.slice(1).map((b, i) => toSegment(x, z, line[i] as Vec2, b)),
        );
        farthest = Math.max(farthest, distance);
      }
    }
    // Half the width is 3.5 m. A right-angle corner reaches 3.5 x 1.41 = 4.95 m from the line.
    expect(farthest).toBeGreaterThan(4.9);
    expect(farthest).toBeLessThanOrEqual(7.01);
  });

  it("ignores lines too short to draw", () => {
    const empty = new MeshSet();
    addRoad(empty, [[1, 1]], roadDecision());
    addRoad(
      empty,
      [
        [1, 1],
        [1, 1.001],
      ],
      roadDecision(),
    );
    expect(empty.toMeshData()).toEqual([]);
  });
});

describe("addBuilding", () => {
  const square: Vec2[] = [
    [10, 20],
    [20, 20],
    [20, 30],
    [10, 30],
  ];
  const build = (footprint: Vec2[], height = 6) => {
    const set = new MeshSet();
    const added = addBuilding(set, footprint, buildingDecision(height), "house.beige");
    return { added, list: added ? triangles(only(set)) : [] };
  };

  it("makes four walls and a roof for a square footprint", () => {
    const { list } = build(square);
    expect(list).toHaveLength(4 * 2 + 2);
    const walls = list.filter((t) => t.normal[1] === 0);
    const roof = list.filter((t) => t.normal[1] === 1);
    expect(totalArea(walls)).toBeCloseTo(4 * 10 * 6, 4);
    expect(totalArea(roof)).toBeCloseTo(100, 4);
    for (const t of roof) for (const corner of t.corners) expect(corner[1]).toBe(6);
  });

  it("stands on the ground and reaches the decided height", () => {
    const ys = build(square, 9).list.flatMap((t) => t.corners.map((c) => c[1]));
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(9);
  });

  it("points every wall outward and every face the way its normal says", () => {
    for (const footprint of [square, [...square].reverse()]) {
      for (const t of build(footprint).list) {
        expect(measure(t).facesNormal).toBe(true);
        if (t.normal[1] !== 0) continue;
        const cx = (t.corners[0][0] + t.corners[1][0] + t.corners[2][0]) / 3;
        const cz = (t.corners[0][2] + t.corners[1][2] + t.corners[2][2]) / 3;
        // The building's centre is (15, 25): a wall's normal must point away from it.
        expect((cx - 15) * t.normal[0] + (cz - 25) * t.normal[2]).toBeGreaterThan(0);
      }
    }
  });

  it("roofs an L-shaped footprint exactly", () => {
    const lShape: Vec2[] = [
      [0, 0],
      [8, 0],
      [8, 4],
      [4, 4],
      [4, 8],
      [0, 8],
    ];
    const roof = build(lShape).list.filter((t) => t.normal[1] === 1);
    expect(totalArea(roof)).toBeCloseTo(48, 4);
  });

  it("skips footprints that are too small or broken", () => {
    expect(
      build([
        [0, 0],
        [0.5, 0],
        [0.5, 0.5],
        [0, 0.5],
      ] as Vec2[]).added,
    ).toBe(false);
    expect(
      build([
        [0, 0],
        [5, 0],
      ] as Vec2[]).added,
    ).toBe(false);
    expect(build(square, 0).added).toBe(false);
  });
});

describe("addGround", () => {
  it("covers the rectangle through its four corners, flat at height 0", () => {
    const set = new MeshSet();
    addGround(
      set,
      [
        [0, 0],
        [200, 0],
        [200, 100],
        [0, 100],
      ],
      "wall.base",
    );
    const list = triangles(only(set));
    expect(list).toHaveLength(2);
    expect(totalArea(list)).toBeCloseTo(20000, 3);
    for (const t of list) {
      expect(measure(t).facesNormal).toBe(true);
      expect(t.normal).toEqual([0, 1, 0]);
    }
  });
});

describe("buildTile on the test tile", () => {
  const data = testTile as unknown as TileData;
  const tile = prepareTile(data, "2026-11-13T12:00:00.000Z");
  const region = regionFor({ lat: 43.533, lon: -79.62 });
  const engine = createRuleEngine();
  const built = buildTile(tile, region, engine);
  const mesh = (material: string) => built.meshes.find((m) => m.material === material);

  it("gives the same output every time", () => {
    expect(
      buildTile(prepareTile(data, "2026-11-13T12:00:00.000Z"), region, createRuleEngine()),
    ).toEqual(built);
  });

  it("makes one mesh per material, sorted by name", () => {
    expect(built.key).toBe("17/36547/47895");
    expect(built.meshes.map((m) => m.material)).toEqual([
      "asphalt",
      BUILDING_COLOUR,
      "sidewalk",
      GROUND_COLOUR,
    ]);
  });

  it("builds the six buildings this tile owns and its four roads", () => {
    expect(built.counts.buildings).toBe(6);
    expect(built.counts.roads).toBe(4);
    expect(built.counts.triangles).toBe(
      built.meshes.reduce((sum, m) => sum + m.indices.length / 3, 0),
    );
  });

  it("covers the whole tile with ground", () => {
    // The tile is about 222 m by 221.2 m.
    expect(totalArea(triangles(mesh(GROUND_COLOUR))) / (222.0 * 221.2)).toBeCloseTo(1, 2);
  });

  it("gives buildings their decided heights", () => {
    // Tallest: the apartments at 4 storeys x 3 m.
    const ys = triangles(mesh(BUILDING_COLOUR)).flatMap((t) => t.corners.map((c) => c[1]));
    expect(Math.max(...ys)).toBe(12);
    expect(Math.min(...ys)).toBe(0);
  });

  it("puts everything where the map says, in local metres", () => {
    const box = tileBounds(data.id);
    const [west, north] = project(region, { lat: box.north, lon: box.west });
    const [east, south] = project(region, { lat: box.south, lon: box.east });
    // Roads are cut at the tile's edge; only their round caps (half a road width) reach past it.
    for (const m of built.meshes) {
      for (let i = 0; i < m.positions.length; i += 3) {
        const x = m.positions[i] as number;
        const z = m.positions[i + 2] as number;
        expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
        expect(x).toBeGreaterThan(west - 6);
        expect(x).toBeLessThan(east + 6);
        expect(z).toBeGreaterThan(north - 6);
        expect(z).toBeLessThan(south + 6);
      }
    }
  });

  it("faces every triangle the way its normal says", () => {
    for (const m of built.meshes) {
      for (const t of triangles(m)) expect(measure(t).facesNormal).toBe(true);
    }
  });
});
