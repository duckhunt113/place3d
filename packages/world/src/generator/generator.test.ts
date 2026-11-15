import { describe, expect, it } from "vitest";
import realCatalog from "../../../../apps/web/public/assets/catalog.json";
import { AssetSelector } from "../assets/select.ts";
import testTile from "../data/fixtures/test-tile.json" with { type: "json" };
import { prepareTile } from "../data/prepare.ts";
import { project, regionFor } from "../data/project.ts";
import { tileBounds } from "../data/tiles.ts";
import { createRuleEngine } from "../decide/rules/index.ts";
import type { AssetCatalog, BuildingDecision, MeshData, TileData, Vec2 } from "../types.ts";
import { boxShape, cutAway } from "../util/shapes.ts";
import { addBuilding, BASE_BAND_M } from "./buildings.ts";
import { addArea, addFlat, addGround, addWalls, LAYER_STEP_M } from "./ground.ts";
import { MeshSet } from "./mesh.ts";
import { CURB_HEIGHT_M, ROAD_Y } from "./roads.ts";
import { FLAT_CAP_M } from "./roofs.ts";
import { buildTile, GROUND_COLOUR } from "./tile.ts";

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

const buildingDecision = (
  heightM: number,
  over: Partial<BuildingDecision> = {},
): BuildingDecision => ({
  kind: "building",
  id: "way/2",
  type: "house",
  storeys: 2,
  heightM,
  roof: "flat",
  colour: "house.beige",
  roofColour: "roof.dark",
  shopSigns: false,
  rules: [],
  source: "rule",
  ...over,
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
    const added = addBuilding(set, footprint, buildingDecision(height));
    const meshes = added ? set.toMeshData() : [];
    const of = (material: string) => triangles(meshes.find((m) => m.material === material));
    return {
      added,
      of,
      list: meshes.flatMap((m) => triangles(m)),
      materials: meshes.map((m) => m.material),
    };
  };

  it("makes four walls and a flat roof for a square footprint", () => {
    const { list } = build(square);
    // Per side: a base band, the wall and the roof cap (2 triangles each); plus 2 for the top.
    expect(list).toHaveLength(4 * 3 * 2 + 2);
    const walls = list.filter((t) => t.normal[1] === 0);
    const roof = list.filter((t) => t.normal[1] === 1);
    expect(totalArea(walls)).toBeCloseTo(4 * 10 * 6, 4);
    expect(totalArea(roof)).toBeCloseTo(100, 4);
    for (const t of roof) for (const corner of t.corners) expect(corner[1]).toBe(6);
  });

  it("colours the walls, a light band at their foot, and a darker cap and roof", () => {
    const { of, materials } = build(square);
    expect(materials).toEqual(["house.beige", "roof.dark", "wall.base"]);
    const heights = (material: string) => of(material).flatMap((t) => t.corners.map((c) => c[1]));
    expect(Math.min(...heights("wall.base"))).toBe(0);
    expect(Math.max(...heights("wall.base"))).toBeCloseTo(BASE_BAND_M, 5);
    expect(Math.min(...heights("house.beige"))).toBeCloseTo(BASE_BAND_M, 5);
    expect(Math.max(...heights("house.beige"))).toBeCloseTo(6 - FLAT_CAP_M, 5);
    expect(Math.min(...heights("roof.dark"))).toBeCloseTo(6 - FLAT_CAP_M, 5);
    expect(Math.max(...heights("roof.dark"))).toBe(6);
  });

  it("gives a house the pitched roof its decision asks for, above the walls", () => {
    const set = new MeshSet();
    addBuilding(
      set,
      square,
      buildingDecision(6, { roof: "hipped", roofColour: "roof.terracotta" }),
    );
    const roof = triangles(set.toMeshData().find((m) => m.material === "roof.terracotta"));
    const ys = roof.flatMap((t) => t.corners.map((c) => c[1]));
    expect(Math.min(...ys)).toBe(6);
    expect(Math.max(...ys)).toBeGreaterThan(8);
    for (const t of roof) expect(t.normal[1]).toBeGreaterThan(0);
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

describe("addArea", () => {
  const outline: Vec2[] = [
    [0, 0],
    [20, 0],
    [20, 10],
    [0, 10],
  ];
  const hole: Vec2[] = [
    [5, 2],
    [10, 2],
    [10, 6],
    [5, 6],
  ];

  it("fills the real shape, flat, facing up, at its layer's height", () => {
    const set = new MeshSet();
    expect(addArea(set, outline, [], 3, "asphalt")).toBeCloseTo(200, 6);
    const list = triangles(only(set));
    expect(totalArea(list)).toBeCloseTo(200, 6);
    for (const t of list) {
      expect(t.normal).toEqual([0, 1, 0]);
      expect(measure(t).facesNormal).toBe(true);
      for (const corner of t.corners) expect(corner[1]).toBeCloseTo(3 * LAYER_STEP_M, 6);
    }
  });

  it("cuts holes out", () => {
    const set = new MeshSet();
    expect(addArea(set, outline, [hole], 1, "grass")).toBeCloseTo(200 - 20, 6);
  });

  it("keeps every layer below the roads", () => {
    expect(4 * LAYER_STEP_M).toBeLessThan(ROAD_Y);
  });

  it("adds nothing for a broken outline", () => {
    const set = new MeshSet();
    expect(addArea(set, outline.slice(0, 2), [], 1, "grass")).toBe(0);
    expect(set.toMeshData()).toEqual([]);
  });
});

describe("addFlat and addWalls", () => {
  // A 10 m square with a 2 m square hole in the middle.
  const shape = cutAway(boxShape(0, 0, 10, 10), boxShape(4, 4, 6, 6));

  it("draws a flat shape with its holes left open, at the height given", () => {
    const set = new MeshSet();
    expect(addFlat(set, shape, 0.15, "sidewalk")).toBeCloseTo(96, 6);
    const list = triangles(only(set));
    expect(totalArea(list)).toBeCloseTo(96, 4);
    for (const t of list) {
      expect(t.normal).toEqual([0, 1, 0]);
      expect(measure(t).facesNormal).toBe(true);
      for (const corner of t.corners) expect(corner[1]).toBeCloseTo(0.15, 6);
    }
    expect(addFlat(new MeshSet(), [], 0, "sidewalk")).toBe(0);
  });

  it("stands walls along every edge, facing away from the shape: outwards, and into the hole", () => {
    const set = new MeshSet();
    addWalls(set, shape, 0, 0.15, "curb");
    const list = triangles(only(set));
    // Outline 40 m and hole 8 m of wall, 0.15 m high.
    expect(totalArea(list)).toBeCloseTo(48 * 0.15, 4);
    for (const t of list) {
      expect(measure(t).facesNormal).toBe(true);
      const x = t.corners.reduce((sum, c) => sum + c[0], 0) / 3;
      const z = t.corners.reduce((sum, c) => sum + c[2], 0) / 3;
      const onHole = x > 3.9 && x < 6.1 && z > 3.9 && z < 6.1;
      // Away from the solid part: away from the centre on the outline, towards it on the hole.
      const outwards = (x - 5) * t.normal[0] + (z - 5) * t.normal[2];
      expect(onHole ? outwards < 0 : outwards > 0).toBe(true);
    }
  });

  it("leaves out the edges it is told to skip", () => {
    const set = new MeshSet();
    addWalls(set, boxShape(0, 0, 10, 10), 0, 1, "curb", (a, b) => a[0] === 0 && b[0] === 0);
    expect(totalArea(triangles(only(set)))).toBeCloseTo(30, 4);
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
    const names = built.meshes.map((m) => m.material);
    expect(names).toEqual([...names].sort());
    expect(new Set(names).size).toBe(names.length);
    // Roads, sidewalks and curbs, the centre line of Test Road, unmapped ground, building
    // bases and flat-roof caps.
    for (const name of [
      "asphalt",
      "sidewalk",
      "sidewalk.joint",
      "curb",
      "road.yellow",
      GROUND_COLOUR,
      "wall.base",
      "roof.dark",
    ]) {
      expect(names).toContain(name);
    }
  });

  it("raises curbs and sidewalks above the road, and keeps paint just over it", () => {
    const heights = (material: string) =>
      new Set(
        triangles(mesh(material)).flatMap((t) =>
          t.corners.map((c) => Math.round(c[1] * 1000) / 1000),
        ),
      );
    expect([...heights("sidewalk")]).toContain(CURB_HEIGHT_M);
    expect(Math.max(...heights("curb"))).toBe(CURB_HEIGHT_M);
    expect(Math.min(...heights("curb"))).toBe(0);
    const paint = [...heights("road.yellow")];
    expect(paint).toHaveLength(1);
    expect(paint[0]).toBeGreaterThan(ROAD_Y);
    expect(paint[0]).toBeLessThan(ROAD_Y + 0.02);
  });

  it("draws the driving surface once: no overlapping road pieces", () => {
    // Every road triangle at road height lies flat; together they cover each spot only once,
    // so their total area equals the area of their outline. Checked on a coarse grid of spots.
    const road = triangles(mesh("asphalt")).filter((t) =>
      t.corners.every((c) => Math.abs(c[1] - ROAD_Y) < 1e-6),
    );
    expect(road.length).toBeGreaterThan(10);
    const inside = (x: number, z: number, t: Triangle): boolean => {
      const [a, b, c] = t.corners;
      const side = (p: number[], q: number[]) =>
        (q[0] - p[0]) * (z - p[2]) - (q[2] - p[2]) * (x - p[0]);
      const [d1, d2, d3] = [side(a, b), side(b, c), side(c, a)];
      return (d1 > 1e-9 && d2 > 1e-9 && d3 > 1e-9) || (d1 < -1e-9 && d2 < -1e-9 && d3 < -1e-9);
    };
    const xs = road.flatMap((t) => t.corners.map((c) => c[0]));
    const zs = road.flatMap((t) => t.corners.map((c) => c[2]));
    let covered = 0;
    for (let x = Math.min(...xs) + 0.37; x < Math.max(...xs); x += 3.1) {
      for (let z = Math.min(...zs) + 0.53; z < Math.max(...zs); z += 3.1) {
        const hits = road.filter((t) => inside(x, z, t)).length;
        expect(hits).toBeLessThanOrEqual(1);
        covered += hits;
      }
    }
    expect(covered).toBeGreaterThan(50);
  });

  it("builds the seven buildings this tile owns (six from OSM, one gap-fill) and its four roads", () => {
    expect(built.counts.buildings).toBe(7);
    expect(built.counts.roads).toBe(4);
    expect(built.counts.areas).toBe(3);
    expect(built.counts.signs).toBe(0);
    expect(built.counts.triangles).toBe(
      built.meshes.reduce((sum, m) => sum + m.indices.length / 3, 0),
    );
  });

  it("covers the whole tile with ground", () => {
    // The tile is about 222 m by 221.2 m.
    // The base ground lies at height 0; mapped grass areas in the same colour lie above it.
    const base = triangles(mesh(GROUND_COLOUR)).filter((t) => t.corners.every((c) => c[1] === 0));
    expect(totalArea(base) / (222.0 * 221.2)).toBeCloseTo(1, 2);
  });

  it("gives buildings their decided heights", () => {
    // Tallest: the flat-roofed apartments at 4 storeys x 3 m. Pitched house roofs stay below that.
    const ys = built.meshes.flatMap((m) => triangles(m).flatMap((t) => t.corners.map((c) => c[1])));
    expect(Math.max(...ys)).toBe(12);
    expect(Math.min(...ys)).toBe(0);
  });

  it("draws mapped areas on top of the plain ground, each on its own layer", () => {
    // The fixture's park is grass (layer 2); its car park is asphalt (layer 3), below the roads.
    const grassHeights = new Set(
      triangles(mesh("grass")).flatMap((t) =>
        t.corners.map((c) => Math.round(c[1] / LAYER_STEP_M)),
      ),
    );
    expect(grassHeights.has(0)).toBe(true);
    expect([...grassHeights].every((layer) => layer <= 2)).toBe(true);
    const lowestAsphalt = Math.min(
      ...triangles(mesh("asphalt")).flatMap((t) => t.corners.map((c) => c[1])),
    );
    expect(lowestAsphalt).toBeLessThan(ROAD_Y);
  });

  it("puts everything where the map says, in local metres", () => {
    const box = tileBounds(data.id);
    const [west, north] = project(region, { lat: box.north, lon: box.west });
    const [east, south] = project(region, { lat: box.south, lon: box.east });
    // Roads and sidewalks are cut exactly at the tile's edge; only buildings may poke out a little.
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

  it("gives the physics a solid shape for every building, and the streets for spawning", () => {
    // Seven buildings, each one box or a box per wall; no models without a catalog.
    expect(built.colliders.length).toBeGreaterThanOrEqual(7);
    for (const collider of built.colliders) expect(collider.shape).toBe("box");
    // Solid ground under the whole tile.
    expect(built.ground.heights.length).toBe((built.ground.cells + 1) ** 2);
    expect(built.ground.size[0]).toBeGreaterThan(150);
    // Streets only: the fixture's footway is left out.
    expect(built.roads).toHaveLength(3);
    for (const road of built.roads) expect(road.widthM).toBeGreaterThan(2);
  });

  it("places no models without a catalog, and the mapped and scattered ones with it", () => {
    expect(built.placements).toEqual([]);
    const selector = new AssetSelector(realCatalog as unknown as AssetCatalog);
    const withModels = buildTile(tile, region, engine, selector);
    expect(withModels.meshes).toEqual(built.meshes);
    // Tree trunks and props add their own solid shapes on top of the buildings'.
    expect(withModels.colliders.length).toBeGreaterThan(built.colliders.length);
    expect(withModels.colliders.some((c) => c.shape === "cylinder")).toBe(true);
    expect(withModels.counts.placements).toBe(withModels.placements.length);
    expect(withModels.placements.length).toBeGreaterThan(20);
    expect(buildTile(tile, region, createRuleEngine(), selector).placements).toEqual(
      withModels.placements,
    );
    // The two named shops in Test Plaza each get a board with their name on it.
    const boards = withModels.placements.filter((p) => p.text !== undefined);
    expect(boards.map((p) => p.text).sort()).toEqual(["Test Bakery", "Test Flowers"]);
    expect(withModels.counts.signs).toBe(2);
    for (const board of boards) {
      expect(board.asset).toBe("sign.shop.blank");
      expect(board.tint).toMatch(/^(sign\.|cream)/);
      expect(board.pos[1]).toBeGreaterThan(2);
    }
    // Trees fill the fixture's park and yards; every asset id exists in the catalog.
    for (const p of withModels.placements) expect(selector.entry(p.asset)).toBeDefined();
    expect(withModels.placements.some((p) => p.asset.startsWith("tree."))).toBe(true);
  });
});
