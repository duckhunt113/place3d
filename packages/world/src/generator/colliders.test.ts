import { describe, expect, it } from "vitest";
import realCatalog from "../../../../apps/web/public/assets/catalog.json";
import { AssetSelector } from "../assets/select.ts";
import type { AssetCatalog, Collider, Placement, Vec2 } from "../types.ts";
import {
  buildingColliders,
  GROUND_CELLS,
  GROUND_OVERLAP_M,
  groundCollider,
  placementColliders,
  WALL_THICKNESS_M,
} from "./colliders.ts";
import { groundHeightAt } from "./ground.ts";

const selector = new AssetSelector(realCatalog as unknown as AssetCatalog);
type Box = Extract<Collider, { shape: "box" }>;

/** The four corners of a box seen from above, with its turn applied. */
function corners(box: Box): Vec2[] {
  const cos = Math.cos(box.rotY);
  const sin = Math.sin(box.rotY);
  return [
    [1, 1],
    [-1, 1],
    [-1, -1],
    [1, -1],
  ].map(([sx, sz]) => {
    const x = (sx as number) * box.half[0];
    const z = (sz as number) * box.half[2];
    // The same turn three.js and Rapier apply for a rotation about the upright axis.
    return [box.centre[0] + x * cos + z * sin, box.centre[2] - x * sin + z * cos] as Vec2;
  });
}
const near = (list: Vec2[], p: Vec2) =>
  list.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-6);

describe("buildingColliders", () => {
  const house: Vec2[] = [
    [10, 20],
    [22, 20],
    [22, 28],
    [10, 28],
  ];

  it("makes one box for a rectangular house, standing on the ground up to the wall height", () => {
    const list = buildingColliders(house, 6);
    expect(list).toHaveLength(1);
    const box = list[0] as Box;
    expect(box.shape).toBe("box");
    expect(box.centre).toEqual([16, 3, 24]);
    expect(box.half[1]).toBe(3);
    for (const corner of house) expect(near(corners(box), corner)).toBe(true);
  });

  it("turns the box to match a house that sits at an angle", () => {
    const turn = (p: Vec2): Vec2 => [p[0] * 0.8 - p[1] * 0.6 + 100, p[0] * 0.6 + p[1] * 0.8 - 50];
    const turned = house.map(turn);
    const [box] = buildingColliders(turned, 6) as [Box];
    expect(box.half[0]).toBeCloseTo(6, 9);
    expect(box.half[2]).toBeCloseTo(4, 9);
    for (const corner of turned) expect(near(corners(box), corner)).toBe(true);
  });

  it("gives an L-shaped building one thin box per wall, so its empty corner stays open", () => {
    const lShape: Vec2[] = [
      [0, 0],
      [8, 0],
      [8, 4],
      [4, 4],
      [4, 8],
      [0, 8],
    ];
    const list = buildingColliders(lShape, 6) as Box[];
    expect(list).toHaveLength(6);
    for (const wall of list) {
      expect(wall.half[2]).toBe(WALL_THICKNESS_M / 2);
      expect(wall.centre[1]).toBe(3);
    }
    // Each wall box runs along its wall: both wall ends lie on the box's long centre line.
    for (let i = 0; i < lShape.length; i++) {
      const a = lShape[i] as Vec2;
      const b = lShape[(i + 1) % lShape.length] as Vec2;
      const wall = list[i] as Box;
      const along: Vec2 = [Math.cos(wall.rotY), -Math.sin(wall.rotY)];
      const end = (sign: number): Vec2 => [
        wall.centre[0] + sign * wall.half[0] * along[0],
        wall.centre[2] + sign * wall.half[0] * along[1],
      ];
      expect(near([end(1), end(-1)], a)).toBe(true);
      expect(near([end(1), end(-1)], b)).toBe(true);
    }
    // Nothing sits in the notch: no wall centre lies inside the missing corner.
    for (const wall of list) expect(wall.centre[0] > 4.5 && wall.centre[2] > 4.5).toBe(false);
  });

  it("makes nothing for a broken outline or a building without height", () => {
    expect(buildingColliders(house.slice(0, 2), 6)).toEqual([]);
    expect(buildingColliders(house, 0)).toEqual([]);
  });
});

describe("groundCollider", () => {
  const tile: Vec2[] = [
    [-100, -300],
    [120, -300],
    [120, -80],
    [-100, -80],
  ];
  const ground = groundCollider(tile);

  it("covers the tile and a little more, so neighbouring tiles leave no gap", () => {
    expect(ground.centre).toEqual([10, -190]);
    expect(ground.size).toEqual([220 + 2 * GROUND_OVERLAP_M, 220 + 2 * GROUND_OVERLAP_M]);
  });

  it("is a grid of small cells with the ground's height at every corner", () => {
    expect(ground.cells).toBe(GROUND_CELLS);
    expect(ground.heights).toHaveLength((GROUND_CELLS + 1) ** 2);
    expect(ground.size[0] / ground.cells).toBeLessThan(10);
    const side = GROUND_CELLS + 1;
    for (const [row, column] of [
      [0, 0],
      [0, GROUND_CELLS],
      [GROUND_CELLS, 0],
      [7, 20],
    ] as const) {
      const x = ground.centre[0] - ground.size[0] / 2 + (column / GROUND_CELLS) * ground.size[0];
      const z = ground.centre[1] - ground.size[1] / 2 + (row / GROUND_CELLS) * ground.size[1];
      expect(ground.heights[row * side + column]).toBe(groundHeightAt(x, z));
    }
  });
});

describe("placementColliders", () => {
  const at = (asset: string, scale = 1, rotY = 0): Placement => ({
    asset,
    pos: [5, 0, 7],
    rotY,
    scale,
  });

  it("gives a tree only its trunk, so you can walk under the leaves", () => {
    const [trunk] = placementColliders([at("tree.leafy.m")], selector);
    expect(trunk).toEqual({
      shape: "cylinder",
      centre: [5, 1.65, 7],
      radius: 0.48,
      halfHeight: 1.65,
    });
  });

  it("scales the solid part with the model", () => {
    const [trunk] = placementColliders([at("tree.leafy.m", 1.1)], selector);
    expect(trunk?.shape === "cylinder" && trunk.radius).toBeCloseTo(0.528, 9);
    expect(trunk?.centre[1]).toBeCloseTo(1.815, 9);
  });

  it("turns a box with its model: a bench is 1.8 m wide, 0.5 m deep and 0.84 m high", () => {
    const [bench] = placementColliders([at("prop.bench", 1, 1.2)], selector);
    expect(bench).toEqual({
      shape: "box",
      centre: [5, 0.42, 7],
      half: [0.9, 0.42, 0.25],
      rotY: 1.2,
    });
  });

  it("skips models you walk through, and ids the catalog does not know", () => {
    expect(placementColliders([at("detail.grass_tuft"), at("nope")], selector)).toEqual([]);
  });
});
