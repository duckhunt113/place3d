import { describe, expect, it } from "vitest";
import type { ExtraBuilding, GeoFeature, OsmElement, TileData } from "../types.ts";
import testTile from "./fixtures/test-tile.json" with { type: "json" };
import { parseElements, parseExtraBuildings, parseTile } from "./parse.ts";

const tile = testTile as unknown as TileData;
const features = parseElements(tile.elements);
const byId = (id: string) => features.find((f) => f.id === id);
const square = (lat: number, lon: number, size = 0.0002) => [
  { lat, lon },
  { lat, lon: lon + size },
  { lat: lat + size, lon: lon + size },
  { lat: lat + size, lon },
  { lat, lon },
];

describe("parseElements on the test tile", () => {
  it("sorts every element into buildings, roads, areas and points", () => {
    const count = (kind: GeoFeature["kind"]) => features.filter((f) => f.kind === kind).length;
    expect(count("building")).toBe(7);
    expect(count("road")).toBe(4);
    expect(count("area")).toBe(3);
    expect(count("point")).toBe(6);
  });

  it("uses type-qualified ids", () => {
    expect(byId("way/2001")?.kind).toBe("building");
    expect(byId("node/3")?.kind).toBe("point");
    expect(byId("relation/5001")?.kind).toBe("building");
  });

  it("stores a building footprint without the repeated closing point", () => {
    const house = byId("way/2001");
    expect(house?.kind === "building" && house.footprint).toHaveLength(4);
  });

  it("keeps every point of a road, in order, with its tags", () => {
    const street = byId("way/1001");
    expect(street?.kind === "road" && street.line).toHaveLength(3);
    expect(street?.tags).toEqual({ highway: "residential", name: "Test Street" });
  });

  it("joins a multipolygon's outer ways into one footprint", () => {
    const flats = byId("relation/5001");
    expect(flats?.kind === "building" && flats.footprint).toHaveLength(4);
  });

  it("drops nodes without tags and shapes too broken to draw", () => {
    expect(byId("node/5")).toBeUndefined();
    expect(byId("way/9001")).toBeUndefined();
  });

  it("gives the same list whatever order the elements arrive in", () => {
    const reversed = parseElements([...tile.elements].reverse());
    expect(reversed).toEqual(features);
  });
});

describe("parseElements rules", () => {
  it("keeps each element once", () => {
    const way: OsmElement = {
      type: "way",
      id: 1,
      tags: { building: "yes" },
      geometry: square(43.5, -79.6),
    };
    expect(parseElements([way, { ...way }])).toHaveLength(1);
  });

  it("treats node 5 and way 5 as different things", () => {
    const parsed = parseElements([
      { type: "node", id: 5, lat: 43.5, lon: -79.6, tags: { natural: "tree" } },
      { type: "way", id: 5, tags: { building: "yes" }, geometry: square(43.5, -79.6) },
    ]);
    expect(parsed.map((f) => f.id)).toEqual(["node/5", "way/5"]);
  });

  it("ignores building=no and buildings that are not closed", () => {
    const open = square(43.5, -79.6).slice(0, 4);
    expect(
      parseElements([{ type: "way", id: 1, tags: { building: "yes" }, geometry: open }]),
    ).toEqual([]);
    expect(
      parseElements([
        { type: "way", id: 2, tags: { building: "no" }, geometry: square(43.5, -79.6) },
      ]),
    ).toEqual([]);
  });

  it("drops unusable points and repeats inside a line", () => {
    const [road] = parseElements([
      {
        type: "way",
        id: 1,
        tags: { highway: "service" },
        geometry: [
          { lat: 43.5, lon: -79.6 },
          { lat: 43.5, lon: -79.6 },
          { lat: Number.NaN, lon: -79.6 },
          { lat: 43.6, lon: -79.6 },
        ],
      },
    ]);
    expect(road?.kind === "road" && road.line).toEqual([
      { lat: 43.5, lon: -79.6 },
      { lat: 43.6, lon: -79.6 },
    ]);
  });

  it("treats a closed road as a road, unless it is tagged as an area", () => {
    const loop = square(43.5, -79.6);
    const [road, plaza] = parseElements([
      { type: "way", id: 1, tags: { highway: "residential" }, geometry: loop },
      { type: "way", id: 2, tags: { highway: "pedestrian", area: "yes" }, geometry: loop },
    ]);
    expect(road?.kind).toBe("road");
    expect(plaza?.kind).toBe("area");
  });

  it("gives areas their holes from a multipolygon's inner rings", () => {
    const [park] = parseElements([
      {
        type: "relation",
        id: 9,
        tags: { type: "multipolygon", leisure: "park" },
        members: [
          { type: "way", ref: 1, role: "outer", geometry: square(43.5, -79.6, 0.001) },
          { type: "way", ref: 2, role: "inner", geometry: square(43.5003, -79.5997, 0.0002) },
        ],
      },
    ]);
    expect(park?.kind === "area" && park.holes).toHaveLength(1);
  });

  it("leaves out lines the MVP does not draw yet, and tree rows", () => {
    const line = square(43.5, -79.6).slice(0, 3);
    expect(
      parseElements([{ type: "way", id: 1, tags: { barrier: "hedge" }, geometry: line }]),
    ).toEqual([]);
    const row = {
      type: "way" as const,
      id: 2,
      tags: { natural: "tree_row" },
      geometry: square(43.5, -79.6),
    };
    expect(parseElements([row])).toEqual([]);
  });
});

describe("gap-fill buildings", () => {
  const outline = square(43.5, -79.6).slice(0, -1);
  const extra = (id: string, footprint = outline): ExtraBuilding => ({
    id: `overture/${id}`,
    dataset: "Microsoft ML Buildings",
    footprint,
    tags: { building: "yes", height: "6.4" },
  });

  it("become building features that keep their source in the id", () => {
    expect(parseExtraBuildings([extra("b")])).toEqual([
      {
        kind: "building",
        id: "overture/b",
        footprint: outline,
        tags: { building: "yes", height: "6.4" },
      },
    ]);
  });

  it("come out in id order, each once, whatever order they were saved in", () => {
    const list = parseExtraBuildings([extra("c"), extra("a"), extra("c"), extra("b")]);
    expect(list.map((f) => f.id)).toEqual(["overture/a", "overture/b", "overture/c"]);
  });

  it("are dropped when the outline is broken", () => {
    const line = outline.slice(0, 2);
    const nan = [{ lat: Number.NaN, lon: -79.6 }, ...outline.slice(1)].slice(0, 3);
    expect(
      parseExtraBuildings([extra("line", line), extra("empty", []), extra("nan", nan)]),
    ).toEqual([]);
  });

  it("come after the OSM features of the tile", () => {
    const all = parseTile(tile);
    expect(all.slice(0, features.length)).toEqual(features);
    expect(all.slice(features.length).map((f) => f.id)).toEqual([
      "overture/00000000-0000-4000-8000-000000000001",
      "overture/00000000-0000-4000-8000-000000000002",
    ]);
  });

  it("are optional: a tile without them parses as before", () => {
    expect(parseTile({ elements: tile.elements })).toEqual(features);
  });
});
