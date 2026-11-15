import { describe, expect, it } from "vitest";
import type { MeshData, RoadDecision, Vec2 } from "../types.ts";
import { boxShape } from "../util/shapes.ts";
import { MeshSet } from "./mesh.ts";
import {
  CURB_HEIGHT_M,
  CURB_WIDTH_M,
  planStreets,
  type RoadPiece,
  SIDEWALK_WIDTH_M,
} from "./roads.ts";
import {
  addSidewalks,
  CURB_COLOUR,
  JOINT_COLOUR,
  JOINT_SPACING_M,
  SIDEWALK_COLOUR,
  type TileBox,
} from "./sidewalks.ts";

const street = (line: Vec2[], over: Partial<RoadDecision> = {}, offsetM = 0): RoadPiece => ({
  decision: {
    kind: "road",
    id: "way/1",
    widthM: 7,
    sidewalks: "both",
    curbs: true,
    markings: "none",
    stalls: false,
    surface: "asphalt",
    rules: [],
    source: "rule",
    ...over,
  },
  line,
  offsetM,
  cutStart: true,
  cutEnd: true,
});

type Triangle = { corners: [number, number, number][]; normal: [number, number, number] };
function triangles(mesh: MeshData | undefined): Triangle[] {
  const out: Triangle[] = [];
  if (!mesh) return out;
  for (let i = 0; i < mesh.positions.length; i += 9) {
    const corner = (n: number): [number, number, number] => [
      mesh.positions[i + n * 3] as number,
      mesh.positions[i + n * 3 + 1] as number,
      mesh.positions[i + n * 3 + 2] as number,
    ];
    out.push({
      corners: [corner(0), corner(1), corner(2)],
      normal: [
        mesh.normals[i] as number,
        mesh.normals[i + 1] as number,
        mesh.normals[i + 2] as number,
      ],
    });
  }
  return out;
}
const area = (t: Triangle): number => {
  const [a, b, c] = t.corners;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as const;
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]] as const;
  return (
    Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2
  );
};

/** A street running west to east through a 100 m tile, and well past it on both sides. */
function build(pieces: RoadPiece[], box: TileBox = { minX: 0, minZ: -50, maxX: 100, maxZ: 50 }) {
  const set = new MeshSet();
  const plan = planStreets(pieces);
  const tile = boxShape(box.minX, box.minZ, box.maxX, box.maxZ);
  const joints = addSidewalks(set, plan, pieces, tile, box);
  const meshes = set.toMeshData();
  return { joints, mesh: (material: string) => meshes.find((m) => m.material === material) };
}

describe("addSidewalks", () => {
  const { joints, mesh } = build([
    street([
      [-40, 0],
      [140, 0],
    ]),
  ]);
  const flat = (material: string) => triangles(mesh(material)).filter((t) => t.normal[1] === 1);
  const walls = triangles(mesh(CURB_COLOUR)).filter((t) => t.normal[1] === 0);

  it("raises the curb and the sidewalk to curb height, each in its own colour", () => {
    const curbTop = flat(CURB_COLOUR);
    const walkTop = flat(SIDEWALK_COLOUR);
    for (const t of [...curbTop, ...walkTop]) {
      for (const corner of t.corners) expect(corner[1]).toBeCloseTo(CURB_HEIGHT_M, 6);
    }
    // Inside the 100 m tile: two curb strips and two sidewalks.
    expect(curbTop.reduce((sum, t) => sum + area(t), 0)).toBeCloseTo(2 * 100 * CURB_WIDTH_M, 3);
    expect(walkTop.reduce((sum, t) => sum + area(t), 0)).toBeCloseTo(2 * 100 * SIDEWALK_WIDTH_M, 3);
  });

  it("closes the sides with little walls that face away from the strip", () => {
    // Four long edges (road side and lawn side, on both sides of the street), each 100 m by curb height.
    expect(walls.reduce((sum, t) => sum + area(t), 0)).toBeCloseTo(4 * 100 * CURB_HEIGHT_M, 3);
    for (const t of walls) {
      const z = t.corners[0][2];
      // North of the road (z < 0) the strip spans -5.3..-3.5; south of it 3.5..5.3.
      const inner = Math.abs(Math.abs(z) - 3.5) < 1e-6;
      const towardsRoad = z < 0 ? 1 : -1;
      expect(t.normal[2]).toBeCloseTo(inner ? towardsRoad : -towardsRoad, 6);
      for (const corner of t.corners) {
        expect(Math.min(Math.abs(corner[1]), Math.abs(corner[1] - CURB_HEIGHT_M))).toBeLessThan(
          1e-6,
        );
      }
    }
  });

  it("builds no wall on the tile's edge, where the strip continues next door", () => {
    for (const t of walls) expect(Math.abs(t.normal[0])).toBeLessThan(1e-6);
  });

  it("lays a joint across each sidewalk every two metres", () => {
    // Joints at 40, 42, ... 138 m along the road fall at x = 0 ... 98: 50 of them, on both sides.
    expect(JOINT_SPACING_M).toBe(2);
    expect(joints).toBe(2 * 50);
    const lines = triangles(mesh(JOINT_COLOUR));
    expect(lines).toHaveLength(joints * 2);
    for (const t of lines) {
      for (const corner of t.corners) {
        expect(corner[1]).toBeGreaterThan(CURB_HEIGHT_M);
        expect(corner[1]).toBeLessThan(CURB_HEIGHT_M + 0.01);
        // Joints stay on the sidewalk, clear of the curb strip.
        expect(Math.abs(corner[2])).toBeGreaterThan(3.5 + CURB_WIDTH_M);
        expect(Math.abs(corner[2])).toBeLessThan(3.5 + CURB_WIDTH_M + SIDEWALK_WIDTH_M);
      }
    }
  });

  it("counts joints from the start of the whole road, so neighbouring tiles agree", () => {
    const xsOf = (m: MeshData | undefined) =>
      [...new Set(triangles(m).flatMap((t) => t.corners.map((c) => Math.round(c[0]))))].sort(
        (a, b) => a - b,
      );
    // The same road, but this piece starts 41 m into it: joints shift by one metre.
    const shifted = build([
      street(
        [
          [-40, 0],
          [140, 0],
        ],
        {},
        41,
      ),
    ]);
    expect(xsOf(shifted.mesh(JOINT_COLOUR))[0]).toBe(1);
    expect(xsOf(mesh(JOINT_COLOUR))[0]).toBe(0);
  });

  it("gives each joint to one tile only", () => {
    const pieces = [
      street([
        [-40, 0],
        [240, 0],
      ]),
    ];
    const west = build(pieces, { minX: 0, minZ: -50, maxX: 100, maxZ: 50 });
    const east = build(pieces, { minX: 100, minZ: -50, maxX: 200, maxZ: 50 });
    // 100 m of road in each tile, a joint every 2 m on both sides, none counted twice.
    expect(west.joints + east.joints).toBe(2 * 100);
  });

  it("draws only a curb where there is no sidewalk, and nothing where there is neither", () => {
    const curbOnly = build([
      street(
        [
          [-40, 0],
          [140, 0],
        ],
        { sidewalks: "none" },
      ),
    ]);
    expect(curbOnly.joints).toBe(0);
    expect(curbOnly.mesh(SIDEWALK_COLOUR)).toBeUndefined();
    expect(curbOnly.mesh(CURB_COLOUR)).toBeDefined();
    const bare = build([
      street(
        [
          [-40, 0],
          [140, 0],
        ],
        { sidewalks: "none", curbs: false },
      ),
    ]);
    expect(bare.mesh(CURB_COLOUR)).toBeUndefined();
  });
});
