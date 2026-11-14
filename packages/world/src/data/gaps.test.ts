import { describe, expect, it } from "vitest";
import type { ExtraBuilding, GeoFeature, LatLon } from "../types.ts";
import { buildingsTouching, fillBuildingGaps, OVERLAP_SHARE } from "./gaps.ts";
import { tileBounds } from "./tiles.ts";

// Rectangles measured in "steps" of 0.0001 degrees (about 11 m north-south) from a corner.
const STEP = 0.0001;
const LAT = 43.53;
const LON = -79.61;
function rect(x: number, y: number, w: number, h: number): LatLon[] {
  const west = LON + x * STEP;
  const south = LAT + y * STEP;
  return [
    { lat: south, lon: west },
    { lat: south, lon: west + w * STEP },
    { lat: south + h * STEP, lon: west + w * STEP },
    { lat: south + h * STEP, lon: west },
  ];
}
const osm = (id: number, footprint: LatLon[]): GeoFeature => ({
  kind: "building",
  id: `way/${id}`,
  footprint,
  tags: { building: "yes" },
});
const extra = (name: string, footprint: LatLon[]): ExtraBuilding => ({
  id: `overture/${name}`,
  dataset: "Microsoft ML Buildings",
  footprint,
  tags: { building: "yes" },
});
const names = (list: ExtraBuilding[]) => list.map((b) => b.id.replace("overture/", ""));

describe("fillBuildingGaps", () => {
  const mapped = [osm(1, rect(0, 0, 2, 2))];

  it("keeps buildings where OSM has nothing", () => {
    expect(names(fillBuildingGaps([extra("far", rect(10, 10, 2, 2))], mapped))).toEqual(["far"]);
    expect(names(fillBuildingGaps([extra("alone", rect(0, 0, 2, 2))], []))).toEqual(["alone"]);
  });

  it("drops a building OSM already has, even when the outlines differ a little", () => {
    const same = extra("same", rect(0, 0, 2, 2));
    const shifted = extra("shifted", rect(0.5, 0.3, 2, 2));
    expect(fillBuildingGaps([same, shifted], mapped)).toEqual([]);
  });

  it("drops a small outline inside a big OSM building, and a big outline around a small one", () => {
    const inside = extra("inside", rect(0.5, 0.5, 0.5, 0.5));
    const around = extra("around", rect(-3, -3, 8, 8));
    expect(fillBuildingGaps([inside, around], mapped)).toEqual([]);
  });

  it("keeps neighbours that only touch or barely overlap", () => {
    const touching = extra("touching", rect(2, 0, 2, 2));
    // Shares a strip 0.2 wide of a 2 x 2 outline: 10% of it, under the limit.
    const sliver = extra("sliver", rect(1.8, 0, 2, 2));
    expect(OVERLAP_SHARE).toBe(0.2);
    expect(names(fillBuildingGaps([touching, sliver], mapped))).toEqual(["touching", "sliver"]);
  });

  it("drops at the limit: a shared part of 20% of the smaller outline counts as the same building", () => {
    // Shares a strip 0.5 wide: 25%.
    expect(fillBuildingGaps([extra("quarter", rect(1.5, 0, 2, 2))], mapped)).toEqual([]);
  });

  it("only looks at OSM buildings, not at roads, areas or points", () => {
    const others: GeoFeature[] = [
      { kind: "area", id: "way/2", outline: rect(0, 0, 50, 50), tags: { landuse: "residential" } },
      { kind: "road", id: "way/3", line: rect(0, 0, 2, 2), tags: { highway: "residential" } },
      { kind: "point", id: "node/4", at: { lat: LAT, lon: LON }, tags: { shop: "bakery" } },
    ];
    expect(names(fillBuildingGaps([extra("house", rect(0, 0, 2, 2))], others))).toEqual(["house"]);
  });

  it("finds overlaps for buildings of any size, wherever they sit on the lookup grid", () => {
    // A long OSM building (about 550 m) and outlines along it, spread over several grid cells.
    const long = [osm(9, rect(0, 0, 50, 2))];
    const along = [0, 12, 24, 36, 48].map((x) => extra(`on-${x}`, rect(x, 0, 2, 2)));
    const beside = [0, 12, 24, 36, 48].map((x) => extra(`off-${x}`, rect(x, 5, 2, 2)));
    expect(names(fillBuildingGaps([...along, ...beside], long))).toEqual(names(beside));
  });

  it("keeps the given order and gives the same answer every time", () => {
    const list = [extra("b", rect(20, 0, 2, 2)), extra("a", rect(30, 0, 2, 2))];
    expect(names(fillBuildingGaps(list, mapped))).toEqual(["b", "a"]);
    expect(fillBuildingGaps(list, mapped)).toEqual(fillBuildingGaps(list, mapped));
  });

  it("drops candidates without a usable outline", () => {
    expect(fillBuildingGaps([extra("line", rect(0, 0, 2, 2).slice(0, 2))], [])).toEqual([]);
  });
});

describe("buildingsTouching", () => {
  const box = tileBounds({ z: 17, x: 36547, y: 47895 });
  const at = (lat: number, lon: number): LatLon[] => [
    { lat, lon },
    { lat, lon: lon + 0.0002 },
    { lat: lat + 0.0001, lon: lon + 0.0002 },
    { lat: lat + 0.0001, lon },
  ];

  it("keeps buildings inside the box and ones that straddle its edge", () => {
    const inside = extra("inside", at(43.5335, -79.6195));
    const straddling = extra("straddling", at(43.5335, box.east - 0.0001));
    const outside = extra("outside", at(43.5335, box.east + 0.0005));
    const north = extra("north", at(box.north + 0.0005, -79.6195));
    expect(names(buildingsTouching([inside, straddling, outside, north], box))).toEqual([
      "inside",
      "straddling",
    ]);
  });

  it("puts a straddling building in both tiles' data, so its owner tile always has it", () => {
    const east = tileBounds({ z: 17, x: 36548, y: 47895 });
    const straddling = extra("straddling", at(43.5335, box.east - 0.0001));
    expect(buildingsTouching([straddling], east)).toEqual([straddling]);
  });
});
