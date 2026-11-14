import { describe, expect, it } from "vitest";
import type { MeshData, Vec2 } from "../types.ts";
import { MeshSet } from "./mesh.ts";
import {
  addFlatRoof,
  addPitchedRoof,
  canPitch,
  FASCIA_M,
  FLAT_CAP_M,
  MAX_RISE_M,
  OVERHANG_M,
  PITCH,
  TRIM_COLOUR,
  wallTopFor,
} from "./roofs.ts";

type Corner = [number, number, number];
type Triangle = { corners: [Corner, Corner, Corner]; normal: Corner };

function triangles(mesh: MeshData | undefined): Triangle[] {
  if (!mesh) return [];
  const out: Triangle[] = [];
  const at = (i: number): Corner => [
    mesh.positions[i * 3] as number,
    mesh.positions[i * 3 + 1] as number,
    mesh.positions[i * 3 + 2] as number,
  ];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const a = mesh.indices[i] as number;
    out.push({
      corners: [at(a), at(mesh.indices[i + 1] as number), at(mesh.indices[i + 2] as number)],
      normal: [
        mesh.normals[a * 3] as number,
        mesh.normals[a * 3 + 1] as number,
        mesh.normals[a * 3 + 2] as number,
      ],
    });
  }
  return out;
}

/** Area of a triangle seen from straight above (its shadow on the ground at noon). */
function planArea(t: Triangle): number {
  const [a, b, c] = t.corners;
  return Math.abs((b[0] - a[0]) * (c[2] - a[2]) - (c[0] - a[0]) * (b[2] - a[2])) / 2;
}

function facesNormal(t: Triangle): boolean {
  const [a, b, c] = t.corners;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  return (
    (cross[0] as number) * t.normal[0] +
      (cross[1] as number) * t.normal[1] +
      (cross[2] as number) * t.normal[2] >
    0
  );
}

// A house 12 m long (x) and 8 m wide (z), centred on (6, 4).
const house: Vec2[] = [
  [0, 0],
  [12, 0],
  [12, 8],
  [0, 8],
];
const EAVE = 6;
const LONG = 6 + OVERHANG_M;
const SHORT = 4 + OVERHANG_M;
const RISE = SHORT * PITCH;

function pitched(shape: "hipped" | "gabled" | "pyramidal", footprint = house) {
  const set = new MeshSet();
  const top = addPitchedRoof(set, footprint, EAVE, shape, "roof.terracotta", "house.beige");
  const meshes = set.toMeshData();
  const of = (material: string) => triangles(meshes.find((m) => m.material === material));
  return {
    top,
    roof: of("roof.terracotta"),
    trim: of(TRIM_COLOUR),
    wall: of("house.beige"),
    meshes,
  };
}

describe("hipped roof", () => {
  const { top, roof, trim, wall } = pitched("hipped");

  it("rises from the eaves at the set pitch", () => {
    expect(top).toBeCloseTo(EAVE + RISE, 4);
    const ys = roof.flatMap((t) => t.corners.map((c) => c[1]));
    expect(Math.min(...ys)).toBe(EAVE);
    expect(Math.max(...ys)).toBeCloseTo(EAVE + RISE, 4);
  });

  it("covers the house plus the overhang on every side", () => {
    const total = roof.reduce((sum, t) => sum + planArea(t), 0);
    expect(total).toBeCloseTo(2 * LONG * (2 * SHORT), 3);
    const xs = roof.flatMap((t) => t.corners.map((c) => c[0]));
    const zs = roof.flatMap((t) => t.corners.map((c) => c[2]));
    expect(Math.min(...xs)).toBeCloseTo(-OVERHANG_M, 4);
    expect(Math.max(...xs)).toBeCloseTo(12 + OVERHANG_M, 4);
    expect(Math.min(...zs)).toBeCloseTo(-OVERHANG_M, 4);
    expect(Math.max(...zs)).toBeCloseTo(8 + OVERHANG_M, 4);
  });

  it("has its ridge along the long side, shorter than the house", () => {
    const ridge = roof
      .flatMap((t) => t.corners)
      .filter((c) => Math.abs(c[1] - (EAVE + RISE)) < 1e-4);
    for (const c of ridge) expect(c[2]).toBeCloseTo(4, 4);
    const xs = ridge.map((c) => c[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * (LONG - SHORT), 4);
  });

  it("slopes on all four sides, every face pointing up and outward", () => {
    expect(roof).toHaveLength(2 * 2 + 2);
    for (const t of roof) {
      expect(t.normal[1]).toBeGreaterThan(0);
      expect(facesNormal(t)).toBe(true);
      const cx = (t.corners[0][0] + t.corners[1][0] + t.corners[2][0]) / 3 - 6;
      const cz = (t.corners[0][2] + t.corners[1][2] + t.corners[2][2]) / 3 - 4;
      expect(cx * t.normal[0] + cz * t.normal[2]).toBeGreaterThan(0);
    }
    expect(wall).toEqual([]);
  });

  it("gets a strip around the eaves and a closed underside", () => {
    const upright = trim.filter((t) => Math.abs(t.normal[1]) < 1e-6);
    const under = trim.filter((t) => t.normal[1] === -1);
    expect(upright).toHaveLength(8);
    expect(under.reduce((sum, t) => sum + planArea(t), 0)).toBeCloseTo(2 * LONG * (2 * SHORT), 3);
    for (const t of under) for (const c of t.corners) expect(c[1]).toBeCloseTo(EAVE - FASCIA_M, 4);
    for (const t of trim) expect(facesNormal(t)).toBe(true);
  });
});

describe("other pitched roofs", () => {
  it("gabled: two slopes, a full-length ridge, and a triangle of wall at each end", () => {
    const { roof, wall } = pitched("gabled");
    expect(roof).toHaveLength(4);
    const ridge = roof.flatMap((t) => t.corners).filter((c) => c[1] > EAVE + RISE - 1e-4);
    const xs = ridge.map((c) => c[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(2 * LONG, 4);
    expect(wall).toHaveLength(2);
    for (const t of wall) {
      expect(t.normal[1]).toBeCloseTo(0, 4);
      expect(Math.abs(t.normal[0])).toBeCloseTo(1, 4);
      expect(facesNormal(t)).toBe(true);
    }
    // The end walls sit on the house's own ends, not out under the overhang.
    expect(new Set(wall.flatMap((t) => t.corners.map((c) => c[0])))).toEqual(new Set([0, 12]));
  });

  it("pyramidal: four slopes meeting in one point above the middle", () => {
    const { roof } = pitched("pyramidal");
    expect(roof).toHaveLength(4);
    const peaks = roof.flatMap((t) => t.corners).filter((c) => c[1] > EAVE + 1e-4);
    for (const c of peaks) expect([c[0], c[2]]).toEqual([6, 4]);
  });

  it("builds the same roof on a house turned at an angle", () => {
    const turn = (p: Vec2): Vec2 => [p[0] * 0.8 - p[1] * 0.6 + 100, p[0] * 0.6 + p[1] * 0.8 - 50];
    const turned = pitched("hipped", house.map(turn));
    expect(turned.top).toBeCloseTo(EAVE + RISE, 4);
    const total = turned.roof.reduce((sum, t) => sum + planArea(t), 0);
    expect(total).toBeCloseTo(2 * LONG * (2 * SHORT), 3);
  });

  it("caps the rise on very wide buildings", () => {
    const hall: Vec2[] = [
      [0, 0],
      [60, 0],
      [60, 40],
      [0, 40],
    ];
    expect(pitched("hipped", hall).top).toBe(EAVE + MAX_RISE_M);
  });

  it("gives the same roof every time", () => {
    expect(pitched("hipped").meshes).toEqual(pitched("hipped").meshes);
  });

  it("refuses a footprint too narrow for a pitched roof", () => {
    const sliver: Vec2[] = [
      [0, 0],
      [10, 0],
      [10, 1],
      [0, 1],
    ];
    expect(canPitch(sliver)).toBe(false);
    expect(canPitch(house)).toBe(true);
    expect(pitched("hipped", sliver).top).toBeUndefined();
    expect(pitched("hipped", sliver).meshes).toEqual([]);
  });
});

describe("flat roof", () => {
  it("is the footprint at full height, with a cap band around the top of the walls", () => {
    const set = new MeshSet();
    addFlatRoof(set, house, 6, "roof.dark");
    const list = triangles(set.toMeshData()[0]);
    const top = list.filter((t) => t.normal[1] === 1);
    const band = list.filter((t) => t.normal[1] === 0);
    expect(top.reduce((sum, t) => sum + planArea(t), 0)).toBeCloseTo(96, 4);
    expect(band).toHaveLength(8);
    const ys = band.flatMap((t) => t.corners.map((c) => c[1]));
    expect(Math.min(...ys)).toBeCloseTo(6 - FLAT_CAP_M, 4);
    expect(Math.max(...ys)).toBe(6);
  });

  it("tells the walls where to stop", () => {
    expect(wallTopFor("flat", 6)).toBeCloseTo(6 - FLAT_CAP_M, 9);
    expect(wallTopFor("hipped", 6)).toBe(6);
    // A very low building keeps at least half its height as wall.
    expect(wallTopFor("flat", 0.4)).toBe(0.2);
  });
});
