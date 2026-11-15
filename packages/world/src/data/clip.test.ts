import { describe, expect, it } from "vitest";
import type { GeoFeature, LatLon, TileData, TileId } from "../types.ts";
import { clipLine, featuresForTile, footprintCentre, ringTouchesBox } from "./clip.ts";
import testTile from "./fixtures/test-tile.json" with { type: "json" };
import { parseTile } from "./parse.ts";
import { prepareTile, WORLD_TILE_VERSION } from "./prepare.ts";
import { tileBounds, tileReach } from "./tiles.ts";

const data = testTile as unknown as TileData;
const TILE: TileId = data.id;
const EAST: TileId = { ...TILE, x: TILE.x + 1 };
const WEST: TileId = { ...TILE, x: TILE.x - 1 };
const box = tileBounds(TILE);
const all = parseTile(data);
const here = featuresForTile(all, TILE);
const ids = (features: GeoFeature[], kind: GeoFeature["kind"]) =>
  features.filter((f) => f.kind === kind).map((f) => f.id);
const inBox = (p: LatLon) =>
  p.lon >= box.west && p.lon <= box.east && p.lat >= box.south && p.lat <= box.north;

describe("building ownership", () => {
  it("gives each building to exactly one tile: the one holding its centre", () => {
    // way/2005's centre is east of the tile; way/2006 pokes out west but its centre is inside.
    // Gap-fill buildings follow the same rule: one is inside, one has its centre to the east.
    expect(ids(here, "building")).toEqual([
      "way/2001",
      "way/2002",
      "way/2003",
      "way/2004",
      "way/2006",
      "relation/5001",
      "overture/00000000-0000-4000-8000-000000000001",
    ]);
    expect(ids(featuresForTile(all, EAST), "building")).toEqual([
      "way/2005",
      "overture/00000000-0000-4000-8000-000000000002",
    ]);
    expect(ids(featuresForTile(all, WEST), "building")).toEqual([]);
  });

  it("keeps an owned building whole, even the part outside the tile", () => {
    const house = here.find((f) => f.id === "way/2006");
    expect(house?.kind === "building" && house.footprint.some((p) => p.lon < box.west)).toBe(true);
  });

  it("finds the centre of a footprint", () => {
    const house = all.find((f) => f.id === "way/2001");
    if (house?.kind !== "building") throw new Error("fixture changed");
    const centre = footprintCentre(house.footprint);
    // The house spans 45-57 m east and 140-150 m north of the tile's south-west corner.
    expect((centre.lon - box.west) * 80833).toBeCloseTo(51, 1);
    expect((centre.lat - box.south) * 111103).toBeCloseTo(145, 1);
  });
});

describe("points", () => {
  it("belong to the tile they are in", () => {
    expect(ids(here, "point")).not.toContain("node/7");
    expect(ids(featuresForTile(all, EAST), "point")).toEqual(["node/7"]);
  });
});

describe("roads", () => {
  it("are cut at the tile's edges", () => {
    const street = here.filter((f) => f.id === "way/1001");
    expect(street).toHaveLength(1);
    const line = street[0]?.kind === "road" ? street[0].line : [];
    expect(line.every(inBox)).toBe(true);
    expect(line[0]?.lon).toBe(box.west);
    expect(line[line.length - 1]?.lon).toBe(box.east);
    expect(line).toHaveLength(3);
  });

  it("meet at exactly the same point in the neighbouring tile", () => {
    const end = (features: GeoFeature[], which: "first" | "last") => {
      const road = features.find((f) => f.id === "way/1001");
      const line = road?.kind === "road" ? road.line : [];
      return which === "first" ? line[0] : line[line.length - 1];
    };
    expect(end(featuresForTile(all, EAST), "first")).toEqual(end(here, "last"));
    expect(end(featuresForTile(all, WEST), "last")).toEqual(end(here, "first"));
  });

  it("keep their shape when they are fully inside, and start at 0 m along the road", () => {
    const driveway = here.find((f) => f.id === "way/1002");
    const original = all.find((f) => f.id === "way/1002");
    expect(driveway).toEqual({ ...original, offsetM: 0 });
  });

  it("say how far along the whole road each cut piece starts", () => {
    // Test Street runs west to east through three tiles; each piece starts where the last ended.
    const piece = (tile: TileId) => {
      const road = featuresForTile(all, tile).find((f) => f.id === "way/1001");
      if (road?.kind !== "road") throw new Error("no piece of Test Street in this tile");
      return road;
    };
    const metres = (a: LatLon, b: LatLon) =>
      Math.hypot(
        (b.lat - a.lat) * 111195,
        (b.lon - a.lon) * 111195 * Math.cos((a.lat * Math.PI) / 180),
      );
    const length = (line: LatLon[]) =>
      line.slice(1).reduce((sum, p, i) => sum + metres(line[i] as LatLon, p), 0);
    const west = piece(WEST);
    const middle = piece(TILE);
    const east = piece(EAST);
    expect(west.offsetM).toBe(0);
    expect(middle.offsetM).toBeCloseTo(length(west.line), 1);
    expect(east.offsetM).toBeCloseTo(length(west.line) + length(middle.line), 1);
    expect(middle.offsetM).toBeGreaterThan(10);
  });
});

describe("clipLine", () => {
  const p = (x: number, y: number): LatLon => ({
    lon: box.west + (box.east - box.west) * x,
    lat: box.south + (box.north - box.south) * y,
  });

  it("gives several pieces when a line leaves and comes back", () => {
    const pieces = clipLine([p(0.2, 0.5), p(1.5, 0.5), p(1.5, 0.8), p(0.2, 0.8)], box);
    expect(pieces).toHaveLength(2);
    expect(pieces[0]?.[1]?.lon).toBe(box.east);
    expect(pieces[1]?.[0]?.lon).toBe(box.east);
  });

  it("gives nothing for a line that never enters the box", () => {
    expect(clipLine([p(1.2, 0.1), p(1.8, 0.9)], box)).toEqual([]);
    expect(clipLine([p(-0.5, 1.5), p(1.5, 1.5)], box)).toEqual([]);
  });

  it("cuts a line that crosses the whole box in one segment", () => {
    const [piece] = clipLine([p(-1, 0.5), p(2, 0.5)], box);
    expect(piece?.map((q) => q.lon)).toEqual([box.west, box.east]);
  });
});

describe("areas", () => {
  it("are cut to the tile", () => {
    const land = here.filter((f) => f.id === "way/3001");
    expect(land).toHaveLength(1);
    const outline = land[0]?.kind === "area" ? land[0].outline : [];
    expect(outline.length).toBeGreaterThanOrEqual(4);
    expect(outline.every(inBox)).toBe(true);
  });

  it("show up in every tile they cover", () => {
    expect(ids(featuresForTile(all, EAST), "area")).toContain("way/3001");
    expect(ids(featuresForTile(all, WEST), "area")).toContain("way/3001");
  });

  it("stay untouched when they are fully inside", () => {
    expect(here.find((f) => f.id === "way/3002")).toEqual(all.find((f) => f.id === "way/3002"));
  });
});

describe("prepareTile", () => {
  it("parses, keeps what belongs to the tile, and stamps the version and the given time", () => {
    const tile = prepareTile(data, "2026-11-13T12:00:00.000Z");
    expect(tile.id).toEqual(TILE);
    expect(tile.version).toBe(WORLD_TILE_VERSION);
    expect(tile.generatedAt).toBe("2026-11-13T12:00:00.000Z");
    expect(tile.features).toEqual(here);
  });

  it("gives the same tile every time", () => {
    expect(prepareTile(data, "t")).toEqual(prepareTile(data, "t"));
  });

  it("remembers neighbours' buildings that reach into the tile", () => {
    // way/2005 belongs to the tile to the east but pokes in; so does the second gap-fill building.
    const tile = prepareTile(data, "t");
    const reaching = all.filter(
      (f) => f.id === "way/2005" || f.id === "overture/00000000-0000-4000-8000-000000000002",
    );
    expect(tile.context?.buildings).toEqual(reaching);
    // A tile with nothing around it has no surroundings at all.
    expect(prepareTile({ ...data, elements: [], buildings: [] }, "t").context).toBeUndefined();
  });

  it("remembers every road piece within the margin around the tile, cut at the margin", () => {
    const tile = prepareTile(data, "t");
    const reach = tileReach(TILE);
    const roads = tile.context?.roads ?? [];
    // Every road of the tile is there too, and reaches at least as far as the tile's own piece.
    const ownIds = here.filter((f) => f.kind === "road").map((f) => f.id);
    for (const id of ownIds) expect(roads.map((road) => road.id)).toContain(id);
    for (const road of roads) {
      expect(road.offsetM).toBeGreaterThanOrEqual(0);
      for (const p of road.line) {
        expect(p.lat).toBeGreaterThanOrEqual(reach.south);
        expect(p.lat).toBeLessThanOrEqual(reach.north);
        expect(p.lon).toBeGreaterThanOrEqual(reach.west);
        expect(p.lon).toBeLessThanOrEqual(reach.east);
      }
    }
    // Test Street crosses the whole tile: its piece here runs from one side of the margin to the other.
    const street = roads.find((road) => road.id === "way/1001");
    expect(street?.line[0]?.lon).toBe(reach.west);
    expect(street?.line[street.line.length - 1]?.lon).toBe(reach.east);
  });

  it("remembers mapped points just outside the tile, and none of its own", () => {
    const outside = { lat: 43.5330705, lon: tileBounds(TILE).east + 0.0001 };
    const far = { lat: 43.5330705, lon: tileBounds(TILE).east + 0.002 };
    const more: TileData = {
      ...data,
      elements: [
        ...data.elements,
        { type: "node", id: 91, tags: { shop: "books", name: "Next Door" }, ...outside },
        { type: "node", id: 92, tags: { shop: "books", name: "Far Away" }, ...far },
      ],
    };
    const tile = prepareTile(more, "t");
    const nearby = tile.context?.points.map((point) => point.id) ?? [];
    expect(nearby).toContain("node/91");
    expect(nearby).not.toContain("node/92");
    // None of them is also one of the tile's own features.
    for (const id of nearby) expect(tile.features.some((f) => f.id === id)).toBe(false);
  });
});

describe("ringTouchesBox", () => {
  const box = { south: 0, west: 0, north: 1, east: 1 };
  const ring = (...points: [number, number][]) => points.map(([lon, lat]) => ({ lat, lon }));

  it("is true for a ring inside, across an edge, or wrapped around the whole box", () => {
    expect(ringTouchesBox(ring([0.2, 0.2], [0.4, 0.2], [0.3, 0.4]), box)).toBe(true);
    expect(ringTouchesBox(ring([0.8, 0.5], [1.5, 0.5], [1.5, 0.7]), box)).toBe(true);
    // No corner of this ring is inside the box, but its edge cuts across the box's corner.
    expect(ringTouchesBox(ring([0.5, -0.5], [1.5, 0.5], [1.5, -0.5]), box)).toBe(true);
    expect(ringTouchesBox(ring([-1, -1], [2, -1], [2, 2], [-1, 2]), box)).toBe(true);
  });

  it("is false for a ring that stays outside", () => {
    expect(ringTouchesBox(ring([1.2, 0.2], [1.4, 0.2], [1.3, 0.4]), box)).toBe(false);
  });
});
