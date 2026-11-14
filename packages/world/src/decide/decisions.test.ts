import { describe, expect, it } from "vitest";
import testTile from "../data/fixtures/test-tile.json" with { type: "json" };
import { parseElements, parseTile } from "../data/parse.ts";
import type { GeoFeature, LatLon, TileData } from "../types.ts";
import { decideArea, decideBuilding, decideRoad, toAssetRequest } from "./decisions.ts";
import { FactFinder, rectangularity, ringAreaM2 } from "./facts.ts";
import { createRuleEngine } from "./rules/index.ts";

type Building = Extract<GeoFeature, { kind: "building" }>;
type Road = Extract<GeoFeature, { kind: "road" }>;

const engine = createRuleEngine();
const features = parseElements((testTile as unknown as TileData).elements);
const facts = new FactFinder(features);
const building = (id: string): Building => {
  const found = features.find((f) => f.id === id);
  if (found?.kind !== "building") throw new Error(`no building ${id}`);
  return found;
};
const decide = (id: string) =>
  decideBuilding(engine, building(id), facts.forBuilding(building(id)));
const road = (tags: Record<string, string>): Road => ({
  kind: "road",
  id: "way/1",
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
      id: "way/2001",
      type: "house",
      storeys: 2,
      heightM: 6,
      roof: "hipped",
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
          decideBuilding(engine, { ...building("way/2001"), id: `way/${i}` }, { footprintM2: 120 })
            .colour,
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

describe("gap-fill building decisions", () => {
  const all = parseTile(testTile as unknown as TileData);
  const finder = new FactFinder(all);
  const find = (id: string): Building => {
    const found = all.find((f) => f.id === id);
    if (found?.kind !== "building") throw new Error(`no building ${id}`);
    return found;
  };
  const house = find("overture/00000000-0000-4000-8000-000000000001");

  it("go through the same rules as OSM buildings", () => {
    // 120 m2, building=yes, inside residential land: a house. Overture measured its height.
    const decision = decideBuilding(engine, house, finder.forBuilding(house));
    expect(decision.id).toBe("overture/00000000-0000-4000-8000-000000000001");
    expect(decision.type).toBe("house");
    expect(decision.storeys).toBe(2);
    expect(decision.heightM).toBe(6.4);
    expect(decision.rules).toContain("building.yes.small-residential");
    expect(decision.rules).toContain("tag.height");
  });

  it("say the answer came from Overture when a measured value was used, never from OSM", () => {
    expect(decideBuilding(engine, house, finder.forBuilding(house)).source).toBe("overture");
    const bare = { ...house, tags: { building: "yes" } };
    expect(decideBuilding(engine, bare, finder.forBuilding(bare)).source).toBe("rule");
    expect(decide("way/2006").source).toBe("osm");
  });

  it("pick the same colour every time, seeded by the feature id", () => {
    const first = decideBuilding(engine, house, finder.forBuilding(house));
    expect(decideBuilding(engine, house, finder.forBuilding(house))).toEqual(first);
  });
});

describe("roofs", () => {
  // Shapes in steps of 0.0001 degrees, near the fixture.
  const shape = (points: [number, number][]): LatLon[] =>
    points.map(([x, y]) => ({ lat: 43.533 + y * 0.0001, lon: -79.62 + x * 0.0001 }));
  const rectangle = shape([
    [0, 0],
    [2, 0],
    [2, 1],
    [0, 1],
  ]);
  const lShape = shape([
    [0, 0],
    [2, 0],
    [2, 1],
    [1, 1],
    [1, 2],
    [0, 2],
  ]);

  it("measure how much of its surrounding rectangle a shape fills", () => {
    expect(rectangularity(rectangle)).toBeCloseTo(1, 6);
    expect(rectangularity(lShape)).toBeCloseTo(0.75, 3);
    expect(rectangularity(rectangle.slice(0, 2))).toBe(0);
  });

  it("are pitched on a house that is close to a rectangle, flat on shops and apartments", () => {
    expect(decide("way/2001").roof).toBe("hipped");
    expect(decide("way/2003").roof).toBe("flat");
    expect(decide("relation/5001").roof).toBe("flat");
  });

  it("fall back to flat when the outline is too irregular for a simple pitched roof", () => {
    expect(plain({ building: "house" }, { rectangularity: 0.9 }).roof).toBe("hipped");
    const irregular = plain({ building: "house" }, { rectangularity: 0.6 });
    expect(irregular.roof).toBe("flat");
    expect(irregular.roofColour).toBe("roof.dark");
    expect(irregular.rules).toContain("building.irregular.flat-roof");
  });

  it("follow a real roof:shape tag even on an irregular outline", () => {
    const tagged = plain({ building: "house", "roof:shape": "gabled" }, { rectangularity: 0.6 });
    expect(tagged.roof).toBe("gabled");
    expect(tagged.source).toBe("osm");
  });

  it("get a colour from the rule's list, the same one every time for the same building", () => {
    const first = decide("way/2001");
    expect(["roof.terracotta", "roof.shingle", "roof.dark"]).toContain(first.roofColour);
    expect(decide("way/2001").roofColour).toBe(first.roofColour);
  });
});

describe("decideArea", () => {
  const area = (tags: Record<string, string>): Extract<GeoFeature, { kind: "area" }> => ({
    kind: "area",
    id: "way/9",
    outline: [],
    tags,
  });

  it("gives a park grass, a layer above plain land use, and trees to scatter", () => {
    const park = decideArea(engine, area({ leisure: "park" }));
    expect(park).toMatchObject({ kind: "area", id: "way/9", surface: "grass", layer: 2 });
    expect(park?.scatter).toEqual([
      { asset: { category: "tree" }, perM2: 0.004 },
      { asset: { category: "prop.bench" }, perM2: 0.0001 },
    ]);
  });

  it("stacks surfaces: land use, then green, then hard surfaces, then water", () => {
    const layer = (tags: Record<string, string>) => decideArea(engine, area(tags))?.layer;
    expect(layer({ landuse: "residential" })).toBe(1);
    expect(layer({ leisure: "park" })).toBe(2);
    expect(layer({ amenity: "parking" })).toBe(3);
    expect(layer({ natural: "water" })).toBe(4);
  });

  it("passes a mapped leaf type on to the tree request, and leaves it out when unmapped", () => {
    const mapped = decideArea(engine, area({ natural: "wood", leaf_type: "needleleaved" }));
    expect(mapped?.scatter[0]?.asset).toEqual({
      category: "tree",
      want: { leafType: "needleleaved" },
    });
    const unmapped = decideArea(engine, area({ natural: "wood" }));
    expect(unmapped?.scatter[0]?.asset).toEqual({ category: "tree" });
  });

  it("is undefined for areas no rule covers", () => {
    expect(decideArea(engine, area({ landuse: "railway" }))).toBeUndefined();
  });

  it("reads asset requests safely", () => {
    expect(
      toAssetRequest({ category: "tree", want: { genus: "Acer", size: 2, odd: null } }),
    ).toEqual({
      category: "tree",
      want: { genus: "Acer", size: 2 },
    });
    expect(toAssetRequest({ want: {} })).toBeUndefined();
    expect(toAssetRequest("tree")).toBeUndefined();
  });
});
