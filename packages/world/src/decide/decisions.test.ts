import { describe, expect, it } from "vitest";
import testTile from "../data/fixtures/test-tile.json" with { type: "json" };
import { parseElements } from "../data/parse.ts";
import type { GeoFeature, LatLon, TileData } from "../types.ts";
import { decideBuilding, decideRoad } from "./decisions.ts";
import { FactFinder, ringAreaM2 } from "./facts.ts";
import { createRuleEngine } from "./rules/index.ts";

type Building = Extract<GeoFeature, { kind: "building" }>;
type Road = Extract<GeoFeature, { kind: "road" }>;

const engine = createRuleEngine();
const features = parseElements((testTile as unknown as TileData).elements);
const facts = new FactFinder(features);
const building = (id: string): Building => {
  const found = features.find((f) => f.osmId === id);
  if (found?.kind !== "building") throw new Error(`no building ${id}`);
  return found;
};
const decide = (id: string) =>
  decideBuilding(engine, building(id), facts.forBuilding(building(id)));
const road = (tags: Record<string, string>): Road => ({
  kind: "road",
  osmId: "way/1",
  line: [
    { lat: 43.5, lon: -79.6 },
    { lat: 43.6, lon: -79.6 },
  ],
  tags,
});
const plain = (tags: Record<string, string>, extraFacts = {}) =>
  decideBuilding(
    engine,
    { ...building("way/2001"), tags },
    { footprintM2: 120, shopNodesInside: 0, ...extraFacts },
  );

describe("building facts", () => {
  it("measures the footprint in square metres", () => {
    // The fixture house is 12 m by 10 m.
    expect(facts.forBuilding(building("way/2001")).footprintM2).toBeCloseTo(120, -1);
    expect(
      Math.abs((facts.forBuilding(building("way/2001")).footprintM2 as number) - 120),
    ).toBeLessThan(2);
  });

  it("counts shop points inside the footprint", () => {
    expect(facts.forBuilding(building("way/2004")).shopNodesInside).toBe(1);
    expect(facts.forBuilding(building("way/2001")).shopNodesInside).toBe(0);
  });

  it("finds the landuse around the building", () => {
    expect(facts.forBuilding(building("way/2001")).insideLanduse).toBe("residential");
    expect(facts.forBuilding(building("way/2003")).insideLanduse).toBeUndefined();
  });

  it("measures a known square", () => {
    // 0.001 degrees each way at this latitude is about 80.6 m by 111.2 m.
    const ring: LatLon[] = [
      { lat: 43.533, lon: -79.62 },
      { lat: 43.533, lon: -79.619 },
      { lat: 43.534, lon: -79.619 },
      { lat: 43.534, lon: -79.62 },
    ];
    expect(ringAreaM2(ring) / (80.61 * 111.19)).toBeCloseTo(1, 2);
  });
});

describe("decideBuilding with the project rules", () => {
  it("makes a tagged house a 2-storey house, 6 m tall", () => {
    expect(decide("way/2001")).toMatchObject({
      kind: "building",
      osmId: "way/2001",
      type: "house",
      storeys: 2,
      heightM: 6,
      roof: "flat",
      shopSigns: false,
      source: "rule",
    });
  });

  it("makes a retail building a 1-storey shop with signs, and credits the real tag", () => {
    expect(decide("way/2003")).toMatchObject({
      type: "retail",
      storeys: 1,
      heightM: 3,
      shopSigns: true,
      source: "osm",
    });
  });

  it("uses real levels and height tags over the rules", () => {
    expect(decide("way/2006")).toMatchObject({
      type: "house",
      storeys: 3,
      heightM: 9,
      source: "osm",
    });
    expect(plain({ building: "house", height: "12 m" }).heightM).toBe(12);
    expect(plain({ building: "house", height: "40'" }).heightM).toBeCloseTo(12.19, 2);
    expect(plain({ building: "house", height: "very" }).heightM).toBe(6);
    expect(plain({ building: "house", "building:levels": "many" }).storeys).toBe(2);
  });

  it("works out unlabelled buildings from their surroundings", () => {
    expect(decide("way/2002").type).toBe("shed");
    expect(decide("way/2004")).toMatchObject({ type: "retail", shopSigns: true });
    expect(plain({ building: "yes" }, { insideLanduse: "residential" }).type).toBe("house");
  });

  it("treats shops inside as the strongest clue", () => {
    const both = plain({ building: "yes" }, { insideLanduse: "residential", shopNodesInside: 2 });
    expect(both.type).toBe("retail");
  });

  it("falls back to a safe default for anything unknown", () => {
    expect(plain({ building: "cathedral" })).toMatchObject({
      type: "house",
      storeys: 2,
      source: "default",
    });
  });

  it("makes apartments 4 storeys", () => {
    expect(decide("relation/5001")).toMatchObject({ type: "apartments", storeys: 4, heightM: 12 });
  });

  it("always gives a building the same colour, from the palette's house colours", () => {
    const first = decide("way/2001");
    expect(decide("way/2001").colour).toBe(first.colour);
    expect(first.colour).toMatch(/^house\./);
    const colours = new Set(
      Array.from(
        { length: 40 },
        (_, i) =>
          decideBuilding(
            engine,
            { ...building("way/2001"), osmId: `way/${i}` },
            { footprintM2: 120 },
          ).colour,
      ),
    );
    expect(colours.size).toBeGreaterThan(3);
  });

  it("records which rules made the decision", () => {
    expect(decide("way/2001").rules).toEqual(["building.any", "building.house"]);
  });
});

describe("decideRoad with the project rules", () => {
  it("makes a residential street 7 m wide with curbs and sidewalks", () => {
    expect(decideRoad(engine, road({ highway: "residential" }))).toMatchObject({
      kind: "road",
      widthM: 7,
      sidewalks: "both",
      curbs: true,
      markings: "none",
      surface: "asphalt",
      source: "rule",
    });
  });

  it("makes a driveway narrow, with nothing beside it", () => {
    expect(decideRoad(engine, road({ highway: "service", service: "driveway" }))).toMatchObject({
      kind: "driveway",
      widthM: 3,
      sidewalks: "none",
      curbs: false,
    });
  });

  it("makes a footway a narrow path", () => {
    expect(decideRoad(engine, road({ highway: "footway" }))).toMatchObject({
      kind: "path",
      widthM: 1.8,
      surface: "sidewalk",
    });
  });

  it("uses real lanes, width and sidewalk tags over the rules", () => {
    expect(decideRoad(engine, road({ highway: "tertiary", lanes: "3" }))).toMatchObject({
      widthM: 10.5,
      markings: "centre",
      source: "osm",
    });
    expect(decideRoad(engine, road({ highway: "residential", width: "6" }))?.widthM).toBe(6);
    expect(decideRoad(engine, road({ highway: "residential", sidewalk: "no" }))?.sidewalks).toBe(
      "none",
    );
    expect(
      decideRoad(engine, road({ highway: "residential", sidewalk: "separate" }))?.sidewalks,
    ).toBe("none");
    expect(decideRoad(engine, road({ highway: "residential", sidewalk: "left" }))?.sidewalks).toBe(
      "left",
    );
    expect(decideRoad(engine, road({ highway: "residential", lanes: "several" }))?.widthM).toBe(7);
  });

  it("falls back to a plain 2-lane road for unknown road types", () => {
    expect(decideRoad(engine, road({ highway: "something_new" }))).toMatchObject({
      kind: "road",
      widthM: 7,
      source: "default",
    });
  });

  it("does not draw roads that are not built", () => {
    expect(decideRoad(engine, road({ highway: "proposed" }))).toBeUndefined();
    expect(decideRoad(engine, road({ highway: "construction" }))).toBeUndefined();
  });

  it("returns nothing for lines that are not roads", () => {
    expect(decideRoad(engine, road({ barrier: "hedge" }))).toBeUndefined();
  });
});
