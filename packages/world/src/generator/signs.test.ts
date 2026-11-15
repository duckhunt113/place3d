import { describe, expect, it } from "vitest";
import realCatalog from "../../../../apps/web/public/assets/catalog.json";
import { AssetSelector } from "../assets/select.ts";
import type { AssetCatalog, Placement, RoadDecision, Vec2 } from "../types.ts";
import type { RoadPiece } from "./roads.ts";
import { placeSigns, type SignBuilding, type SignRequest, type SignSurroundings } from "./signs.ts";

const selector = new AssetSelector(realCatalog as unknown as AssetCatalog);

const road = (line: Vec2[], over: Partial<RoadDecision> = {}): RoadPiece => ({
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
  offsetM: 0,
  cutStart: true,
  cutEnd: true,
});
const want = (
  id: number,
  at: Vec2,
  text: string,
  over: Partial<SignRequest> = {},
): SignRequest => ({
  id: `node/${id}`,
  at,
  text,
  asset: { category: "sign.shop" },
  colour: "sign.teal",
  owned: true,
  ...over,
});
/** A plaza 60 m long (x) and 20 m deep (z), 4.5 m high. Its front (south, z = 20) faces a car park. */
const plaza: SignBuilding = {
  id: "way/50",
  footprint: [
    [0, 0],
    [60, 0],
    [60, 20],
    [0, 20],
  ],
  heightM: 4.5,
};
const carPark: Vec2[] = [
  [0, 22],
  [60, 22],
  [60, 60],
  [0, 60],
];
/** A lane runs behind the plaza (north), the car park lies in front (south). */
const around: SignSurroundings = {
  roads: [
    road(
      [
        [-20, -6],
        [80, -6],
      ],
      { id: "way/2", curbs: false, sidewalks: "none", widthM: 4 },
    ),
  ],
  lots: [carPark],
};
const hang = (requests: SignRequest[], buildings = [plaza], where = around): Placement[] =>
  placeSigns(requests, buildings, where, selector);
/** Which way a board faces: [x, z] of its face direction. */
const faces = (p: Placement): Vec2 => [Math.sin(p.rotY), Math.cos(p.rotY)];

describe("placeSigns", () => {
  it("hangs a shop's board on the wall that faces the car park, not the back lane", () => {
    // The shop is mapped in the middle of its unit: as near the back wall as the front.
    const [board] = hang([want(1, [9, 10], "Test Bakery")]);
    expect(board).toBeDefined();
    expect(board?.asset).toBe("sign.shop.blank");
    expect(board?.text).toBe("Test Bakery");
    expect(board?.tint).toBe("sign.teal");
    // On the south wall, just off it, facing south.
    expect(board?.pos[2]).toBeGreaterThan(20);
    expect(board?.pos[2]).toBeLessThan(20.2);
    expect(faces(board as Placement)[0]).toBeCloseTo(0, 9);
    expect(faces(board as Placement)[1]).toBeCloseTo(1, 9);
  });

  it("faces the street when there is no car park", () => {
    const street = road(
      [
        [-20, 30],
        [80, 30],
      ],
      { id: "way/3" },
    );
    const [board] = hang([want(1, [9, 10], "Test Bakery")], [plaza], {
      roads: [...around.roads, street],
      lots: [],
    });
    expect(board?.pos[2]).toBeGreaterThan(20);
    // With only the back lane to face, it goes there rather than nowhere.
    const [back] = hang([want(1, [9, 10], "Test Bakery")], [plaza], {
      roads: around.roads,
      lots: [],
    });
    expect(back?.pos[2]).toBeLessThan(0);
    expect(faces(back as Placement)[1]).toBeCloseTo(-1, 9);
  });

  it("does not face a wall that looks straight at another building", () => {
    // A second building stands right in front of the plaza's south wall, hiding the car park.
    const blocker: SignBuilding = {
      id: "way/51",
      footprint: [
        [0, 21],
        [60, 21],
        [60, 21.9],
        [0, 21.9],
      ],
      heightM: 6,
    };
    const [board] = hang([want(1, [9, 10], "Test Bakery")], [plaza, blocker]);
    expect(board?.pos[2]).toBeLessThan(0);
  });

  it("hangs boards high on the wall, big enough to read, below the roof", () => {
    const [board] = hang([want(1, [9, 10], "Test Bakery")]);
    expect(board?.scale).toBeCloseTo(1.6, 9);
    expect(board?.pos[1]).toBeCloseTo(3.0, 9);
    // The board is 0.6 m tall before scaling: its top stays under the 4.5 m wall.
    expect((board?.pos[1] ?? 0) + 0.6 * (board?.scale ?? 0)).toBeLessThanOrEqual(4.5 - 0.4);
    // On a low wall it hangs lower, never below 0.6 m.
    const low = hang([want(1, [9, 10], "Test Bakery")], [{ ...plaza, heightM: 3 }]);
    expect(low[0]?.pos[1]).toBeCloseTo(3 - 0.45 - 0.6 * 1.6, 9);
    const shed = hang([want(1, [9, 10], "Test Bakery")], [{ ...plaza, heightM: 1.2 }]);
    expect(shed[0]?.pos[1]).toBe(0.6);
  });

  it("gives every board its own bay of the wall, so boards never overlap", () => {
    const boards = hang([
      want(1, [9, 10], "One"),
      want(2, [10, 10], "Two"),
      want(3, [30, 10], "Three"),
      want(4, [58, 10], "Four"),
    ]);
    // Shops 1 and 2 are 1 m apart and want the same bay: the smaller id keeps it.
    expect(boards.map((b) => b.text).sort()).toEqual(["Four", "One", "Three"]);
    const xs = boards.map((b) => b.pos[0]).sort((a, b) => a - b);
    const width = 3.0 * (boards[0]?.scale ?? 0);
    for (let i = 1; i < xs.length; i++) {
      expect((xs[i] as number) - (xs[i - 1] as number)).toBeGreaterThanOrEqual(width);
    }
    // Bays are equal parts of the 60 m wall (11 bays of 5.45 m); boards sit in the middle of theirs.
    for (const x of xs) expect(((x / (60 / 11)) % 1) - 0.5).toBeCloseTo(0, 6);
  });

  it("takes a neighbour tile's shop into account without hanging its board", () => {
    const boards = hang([
      want(1, [9, 10], "Next Door", { owned: false }),
      want(2, [10, 10], "Ours"),
      want(3, [30, 10], "Also Ours"),
    ]);
    // The neighbour's shop has the smaller id and takes the bay; this tile hangs only its own board.
    expect(boards.map((b) => b.text)).toEqual(["Also Ours"]);
  });

  it("hangs one board per name on a building, even if the map has the shop twice", () => {
    const boards = hang([want(1, [9, 10], "Twice"), want(2, [40, 10], "Twice")]);
    expect(boards).toHaveLength(1);
    expect(boards[0]?.pos[0]).toBeLessThan(20);
  });

  it("puts a shop mapped at the door, just outside the wall, on that building", () => {
    const [board] = hang([want(1, [30, 23], "At The Door")]);
    expect(board?.pos[2]).toBeGreaterThan(20);
    expect(board?.pos[2]).toBeLessThan(20.2);
    // Too far from any building: no board.
    expect(hang([want(1, [30, 40], "In The Car Park")])).toEqual([]);
  });

  it("shrinks the board on a short wall, and skips walls too short to read", () => {
    const kiosk: SignBuilding = {
      id: "way/52",
      footprint: [
        [0, 0],
        [3.5, 0],
        [3.5, 3.5],
        [0, 3.5],
      ],
      heightM: 3,
    };
    const [small] = hang([want(1, [1.7, 1.7], "Kiosk")], [kiosk], { roads: [], lots: [] });
    expect(small?.scale).toBeCloseTo((3.5 - 0.3) / 3.0, 9);
    const hut: SignBuilding = {
      ...kiosk,
      footprint: kiosk.footprint.map(([x, z]) => [x / 2, z / 2]),
    };
    expect(hang([want(1, [0.8, 0.8], "Hut")], [hut], { roads: [], lots: [] })).toEqual([]);
  });

  it("gives the same boards every time, whatever order the shops arrive in", () => {
    const shops = [want(1, [9, 10], "One"), want(3, [30, 10], "Three"), want(4, [58, 10], "Four")];
    const sorted = (list: Placement[]) => [...list].sort((a, b) => a.pos[0] - b.pos[0]);
    expect(sorted(hang([...shops].reverse()))).toEqual(sorted(hang(shops)));
  });
});
