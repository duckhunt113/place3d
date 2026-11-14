import { describe, expect, it } from "vitest";
import realCatalog from "../../../../apps/web/public/assets/catalog.json";
import { AssetSelector } from "../assets/select.ts";
import { fromMercator, project, regionFor, regionFromTile, unproject } from "../data/project.ts";
import { tileAt, tileBounds } from "../data/tiles.ts";
import type {
  AreaDecision,
  AssetCatalog,
  ObjectDecision,
  RoadDecision,
  TileId,
  Vec2,
} from "../types.ts";
import { type Pair, pointInRing } from "../util/geometry.ts";
import { type PlacementInput, placeAssets, SCATTER_CELL } from "./placements.ts";

const selector = new AssetSelector(realCatalog as unknown as AssetCatalog);
const TILE: TileId = { z: 17, x: 36547, y: 47895 };
const EAST: TileId = { ...TILE, x: TILE.x + 1 };
const region = regionFor({ lat: 43.533, lon: -79.62 });

/** The tile's outline in local metres, shrunk by `inset` metres on every side. */
function tileRing(id: TileId, inset = 0, from = region): Vec2[] {
  const box = tileBounds(id);
  const nw = project(from, { lat: box.north, lon: box.west });
  const se = project(from, { lat: box.south, lon: box.east });
  return [
    [nw[0] + inset, nw[1] + inset],
    [se[0] - inset, nw[1] + inset],
    [se[0] - inset, se[1] - inset],
    [nw[0] + inset, se[1] - inset],
  ];
}
const area = (id: string, layer: number, perM2: number, category = "tree"): AreaDecision => ({
  kind: "area",
  id: `way/${id}` as AreaDecision["id"],
  surface: "grass",
  layer,
  scatter: perM2 > 0 ? [{ asset: { category }, perM2 }] : [],
  rules: [],
  source: "rule",
});
const input = (over: Partial<PlacementInput> = {}, id = TILE, from = region): PlacementInput => ({
  id,
  toLocal: (m) => fromMercator(from, m),
  scale: from.k,
  areas: [{ decision: area("1", 2, 0.01), outline: tileRing(id, 0, from), holes: [] }],
  roads: [],
  buildings: [],
  objects: [],
  ...over,
});
const spots = (placements: { pos: [number, number, number] }[]): Vec2[] =>
  placements.map((p) => [p.pos[0], p.pos[2]]);

describe("scatter", () => {
  const placed = placeAssets(input(), selector);

  it("plants about as many trees as the rule's density asks for", () => {
    // The tile is about 222 m x 221 m = 49,000 m2; 0.01 trees per m2 is about 490.
    expect(placed.length).toBeGreaterThan(400);
    expect(placed.length).toBeLessThan(580);
    for (const p of placed) expect(selector.entry(p.asset)?.category).toBe("tree");
  });

  it("gives the same placements every time", () => {
    expect(placeAssets(input(), selector)).toEqual(placed);
  });

  it("keeps every tree on the ground, inside its own tile, with a little variety in size", () => {
    for (const p of placed) {
      expect(p.pos[1]).toBe(0);
      expect(tileAt(unproject(region, [p.pos[0], p.pos[2]]))).toEqual(TILE);
      expect(p.scale).toBeGreaterThanOrEqual(0.85);
      expect(p.scale).toBeLessThanOrEqual(1.15);
    }
    expect(new Set(placed.map((p) => p.scale)).size).toBeGreaterThan(10);
  });

  it("never plants two trees closer than the grid allows", () => {
    const minGap = SCATTER_CELL * region.k * 0.3 - 1e-6;
    const list = spots(placed);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i] as Vec2;
        const b = list[j] as Vec2;
        expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(minGap);
      }
    }
  });

  it("only plants inside the area, and not in its holes", () => {
    const outline = tileRing(TILE, 60);
    const hole = tileRing(TILE, 90);
    const some = placeAssets(
      input({ areas: [{ decision: area("1", 2, 0.02), outline, holes: [hole] }] }),
      selector,
    );
    expect(some.length).toBeGreaterThan(50);
    for (const p of spots(some)) {
      expect(pointInRing(p as Pair, outline as Pair[])).toBe(true);
      expect(pointInRing(p as Pair, hole as Pair[])).toBe(false);
    }
  });

  it("lets the topmost area decide: no trees in a car park that lies on a park", () => {
    const carPark = tileRing(TILE, 70);
    const both = placeAssets(
      input({
        areas: [
          { decision: area("1", 2, 0.02), outline: tileRing(TILE), holes: [] },
          { decision: area("2", 3, 0), outline: carPark, holes: [] },
        ],
      }),
      selector,
    );
    expect(both.length).toBeGreaterThan(100);
    for (const p of spots(both)) expect(pointInRing(p as Pair, carPark as Pair[])).toBe(false);
  });

  it("keeps trees out of buildings and off roads, with room to spare", () => {
    const building = tileRing(TILE, 80);
    const [nw, , se] = tileRing(TILE) as [Vec2, Vec2, Vec2, Vec2];
    const road: RoadDecision = {
      kind: "road",
      id: "way/5",
      widthM: 8,
      sidewalks: "none",
      curbs: false,
      markings: "none",
      surface: "asphalt",
      rules: [],
      source: "rule",
    };
    const line: Vec2[] = [
      [nw[0], nw[1] + 30],
      [se[0], nw[1] + 30],
    ];
    const some = placeAssets(
      input({ buildings: [building], roads: [{ decision: road, line }] }),
      selector,
    );
    expect(some.length).toBeGreaterThan(100);
    for (const p of spots(some)) {
      expect(pointInRing(p as Pair, building as Pair[])).toBe(false);
      expect(Math.abs(p[1] - (nw[1] + 30))).toBeGreaterThan(4 + 0.6);
    }
    expect(some.length).toBeLessThan(placed.length);
  });

  it("plants nothing where no area asks for it", () => {
    expect(placeAssets(input({ areas: [] }), selector)).toEqual([]);
    expect(
      placeAssets(
        input({ areas: [{ decision: area("1", 1, 0), outline: tileRing(TILE), holes: [] }] }),
        selector,
      ),
    ).toEqual([]);
  });

  it("puts each tree in exactly one tile: neighbours share no spot and leave no gap pattern", () => {
    const next = placeAssets(input({}, EAST), selector);
    for (const p of next) expect(tileAt(unproject(region, [p.pos[0], p.pos[2]]))).toEqual(EAST);
    const mine = new Set(spots(placed).map((p) => `${p[0].toFixed(3)},${p[1].toFixed(3)}`));
    for (const p of spots(next))
      expect(mine.has(`${p[0].toFixed(3)},${p[1].toFixed(3)}`)).toBe(false);
  });

  it("plants the same trees at the same places on Earth whichever region they are measured in", () => {
    const other = regionFromTile(region.x + 1, region.y);
    const there = placeAssets(input({}, TILE, other), selector);
    expect(there.map((p) => p.asset)).toEqual(placed.map((p) => p.asset));
    for (let i = 0; i < placed.length; i++) {
      const a = unproject(region, [placed[i]?.pos[0] ?? 0, placed[i]?.pos[2] ?? 0]);
      const b = unproject(other, [there[i]?.pos[0] ?? 0, there[i]?.pos[2] ?? 0]);
      expect(a.lat).toBeCloseTo(b.lat, 9);
      expect(a.lon).toBeCloseTo(b.lon, 9);
    }
  });
});

describe("mapped objects", () => {
  const object = (category: string, id: string): ObjectDecision => ({
    kind: "object",
    id: `node/${id}` as ObjectDecision["id"],
    asset: { category },
    rules: [],
    source: "rule",
  });
  const road: RoadDecision = {
    kind: "road",
    id: "way/5",
    widthM: 8,
    sidewalks: "none",
    curbs: false,
    markings: "none",
    surface: "asphalt",
    rules: [],
    source: "rule",
  };
  // A road running east along z = 100.
  const line: Vec2[] = [
    [0, 100],
    [200, 100],
  ];
  const base = { areas: [], roads: [{ decision: road, line }] };

  it("stand at their mapped spot", () => {
    const [hydrant] = placeAssets(
      input({ ...base, objects: [{ decision: object("prop.hydrant", "1"), at: [50, 110] }] }),
      selector,
    );
    expect(hydrant).toMatchObject({ asset: "prop.hydrant", pos: [50, 0, 110], scale: 1 });
  });

  it("move a sign mapped on the road to the roadside, facing back along the road", () => {
    const [sign] = placeAssets(
      input({ ...base, objects: [{ decision: object("sign.stop", "2"), at: [50, 100] }] }),
      selector,
    );
    expect(sign?.asset).toBe("prop.stop_sign");
    expect(sign?.pos[0]).toBeCloseTo(50, 9);
    // Half the road (4 m) plus the setback, on the right of the road's direction (south here).
    expect(sign?.pos[2]).toBeCloseTo(100 + 4 + 0.8, 9);
    // The model faces +z when unturned; here it must face west (-x), back along the road.
    expect(Math.sin(sign?.rotY ?? 0)).toBeCloseTo(-1, 9);
  });

  it("keep the same turn every time, and skip things the catalog cannot supply", () => {
    const objects = [
      { decision: object("prop.bench", "3"), at: [10, 10] as Vec2 },
      { decision: object("statue", "4"), at: [20, 20] as Vec2 },
    ];
    const first = placeAssets(input({ ...base, objects }), selector);
    expect(first).toHaveLength(1);
    expect(placeAssets(input({ ...base, objects }), selector)).toEqual(first);
  });
});
