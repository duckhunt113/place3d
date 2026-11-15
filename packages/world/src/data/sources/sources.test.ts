import { describe, expect, it } from "vitest";
import type { TileData, TileId, TileSource } from "../../types.ts";
import testTile from "../fixtures/test-tile.json" with { type: "json" };
import { tileBounds, tileReach } from "../tiles.ts";
import { FallbackTileSource, FileTileSource, TileNotFoundError } from "./file.ts";
import {
  OverpassError,
  OverpassTileSource,
  overpassQuery,
  TILE_FORMAT_VERSION,
  tileDataFromOverpass,
  tileQuery,
} from "./overpass.ts";
import { overtureBuildings } from "./overture.ts";

const saved = testTile as unknown as TileData;
const TILE: TileId = { z: 17, x: 36547, y: 47895 };
const OTHER: TileId = { z: 17, x: 1, y: 2 };
const NOW = "2026-11-13T12:00:00.000Z";

/** A stand-in for fetch that records the request and answers with fixed JSON. No network. */
function fakeFetch(answer: unknown, status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const send = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(answer), { status });
  }) as typeof fetch;
  return { send, calls };
}

describe("FileTileSource", () => {
  const source = new FileTileSource(async (key) => (key === "17/36547/47895" ? saved : undefined));

  it("returns a saved tile", async () => {
    const data = await source.getTile(TILE);
    expect(data.id).toEqual(TILE);
    expect(data.elements.length).toBe(22);
  });

  it("says clearly when a tile is not saved", async () => {
    await expect(source.getTile(OTHER)).rejects.toBeInstanceOf(TileNotFoundError);
  });

  it("refuses a file that holds a different tile", async () => {
    const wrong = new FileTileSource(async () => saved);
    await expect(wrong.getTile(OTHER)).rejects.toThrow(/contains data for 17\/36547\/47895/);
  });
});

describe("FallbackTileSource", () => {
  const missing: TileSource = {
    getTile: async (id) => {
      throw new TileNotFoundError(id, "test");
    },
  };
  const broken: TileSource = {
    getTile: async () => {
      throw new Error("server on fire");
    },
  };
  const working: TileSource = { getTile: async () => saved };

  it("uses the first source that has the tile", async () => {
    expect(await new FallbackTileSource([missing, working]).getTile(TILE)).toBe(saved);
  });

  it("fails with not-found when no source has the tile", async () => {
    const source = new FallbackTileSource([missing, missing]);
    await expect(source.getTile(TILE)).rejects.toBeInstanceOf(TileNotFoundError);
  });

  it("does not hide real errors behind the next source", async () => {
    const source = new FallbackTileSource([broken, working]);
    await expect(source.getTile(TILE)).rejects.toThrow("server on fire");
  });
});

describe("overpassQuery", () => {
  const query = overpassQuery(tileBounds(TILE));

  it("asks for JSON, limited to the tile's box, with full shapes", () => {
    expect(query).toContain("[out:json]");
    expect(query).toContain(
      "[bbox:43.5326204268101,-79.62066650390625,43.534611617432816,-79.617919921875]",
    );
    expect(query.trimEnd().endsWith("out geom;")).toBe(true);
  });

  it("asks for roads, buildings, areas, trees and shops", () => {
    for (const part of ['way["highway"]', 'way["building"]', 'way["landuse"]', 'node["shop"]']) {
      expect(query).toContain(part);
    }
    expect(query).toMatch(/node\["natural"~"\^\(tree\|shrub\)\$"\]/);
  });
});

describe("tileDataFromOverpass", () => {
  const answer = {
    version: 0.6,
    elements: [
      { type: "node", id: 1, lat: 43.5, lon: -79.6, tags: { natural: "tree" }, uid: 99 },
      {
        type: "way",
        id: 2,
        nodes: [10, 11],
        bounds: { minlat: 1 },
        tags: { highway: "residential" },
        geometry: [
          { lat: 43.5, lon: -79.6 },
          { lat: 43.6, lon: -79.5 },
        ],
      },
      { type: "banana", id: 3 },
    ],
  };

  it("keeps only the fields the game uses", () => {
    const data = tileDataFromOverpass(TILE, answer, NOW);
    expect(data).toEqual({
      id: TILE,
      version: TILE_FORMAT_VERSION,
      source: "overpass",
      fetchedAt: NOW,
      elements: [
        { type: "node", id: 1, lat: 43.5, lon: -79.6, tags: { natural: "tree" } },
        {
          type: "way",
          id: 2,
          tags: { highway: "residential" },
          geometry: [
            { lat: 43.5, lon: -79.6 },
            { lat: 43.6, lon: -79.5 },
          ],
        },
      ],
    });
  });

  it("rejects answers that are not usable", () => {
    expect(() => tileDataFromOverpass(TILE, { nope: true }, NOW)).toThrow(OverpassError);
    const timedOut = { elements: [], remark: "runtime error: Query timed out in ..." };
    expect(() => tileDataFromOverpass(TILE, timedOut, NOW)).toThrow(/could not finish/);
  });
});

describe("OverpassTileSource", () => {
  it("posts the tile's query and returns tile data, without touching the network", async () => {
    const { send, calls } = fakeFetch({ elements: [{ type: "node", id: 7, lat: 1, lon: 2 }] });
    const source = new OverpassTileSource({ now: () => NOW, fetch: send, userAgent: "test-agent" });
    const data = await source.getTile(TILE);

    expect(data.elements).toEqual([{ type: "node", id: 7, lat: 1, lon: 2 }]);
    expect(data.fetchedAt).toBe(NOW);
    expect(calls).toHaveLength(1);
    const call = calls[0];
    if (!call?.init) throw new Error("fetch was not called with options");
    expect(call.url).toBe("https://overpass-api.de/api/interpreter");
    expect(call.init.method).toBe("POST");
    // The query covers the tile and the margin around it.
    expect(decodeURIComponent(String(call.init.body))).toBe(`data=${tileQuery(TILE)}`);
    expect(tileQuery(TILE)).toBe(overpassQuery(tileReach(TILE)));
    expect(tileQuery(TILE)).not.toBe(overpassQuery(tileBounds(TILE)));
    expect((call.init.headers as Record<string, string>)["User-Agent"]).toBe("test-agent");
  });

  it("reports the status when Overpass refuses", async () => {
    const { send } = fakeFetch({}, 429);
    const source = new OverpassTileSource({ now: () => NOW, fetch: send });
    await expect(source.getTile(TILE)).rejects.toMatchObject({
      name: "OverpassError",
      status: 429,
    });
  });
});

describe("overtureBuildings", () => {
  // The shape Overture's own download tool writes: the id at the top of each feature,
  // everything else in properties, missing values left out.
  const ring = (lat: number, lon: number, size = 0.0001) => [
    [lon, lat],
    [lon + size, lat],
    [lon + size, lat + size],
    [lon, lat + size],
    [lon, lat],
  ];
  const feature = (
    id: string,
    properties: Record<string, unknown>,
    coordinates = [ring(43.53, -79.61)],
  ) => ({
    id,
    type: "Feature",
    geometry: { type: "Polygon", coordinates },
    properties: { version: 1, is_underground: false, has_parts: false, ...properties },
  });
  const traced = {
    sources: [{ property: "", dataset: "Microsoft ML Buildings", confidence: 0.9 }],
  };
  const collection = (...features: unknown[]) => ({ type: "FeatureCollection", features });

  it("reads a machine-traced house: id, who traced it, outline and height", () => {
    const [house] = overtureBuildings(
      collection(feature("9bada6c0-13fb-4b83-b893-6db1713667e0", { ...traced, height: 6.367762 })),
    );
    expect(house).toEqual({
      id: "overture/9bada6c0-13fb-4b83-b893-6db1713667e0",
      dataset: "Microsoft ML Buildings",
      footprint: [
        { lat: 43.53, lon: -79.61 },
        { lat: 43.53, lon: -79.6099 },
        { lat: 43.5301, lon: -79.6099 },
        { lat: 43.5301, lon: -79.61 },
      ],
      tags: { building: "yes", height: "6.4" },
    });
  });

  it("turns Overture's fields into OSM-style tags", () => {
    const [shop] = overtureBuildings(
      collection(
        feature("a", {
          sources: [{ property: "", dataset: "Esri Community Maps" }],
          class: "retail",
          subtype: "commercial",
          num_floors: 2,
          roof_shape: "gabled",
          names: { primary: "Corner Shop" },
        }),
      ),
    );
    expect(shop?.dataset).toBe("Esri Community Maps");
    expect(shop?.tags).toEqual({
      building: "retail",
      "building:levels": "2",
      "roof:shape": "gabled",
      name: "Corner Shop",
    });
  });

  it("skips outlines that came from OSM: those are read from OSM itself", () => {
    const fromOsm = feature("osm", {
      sources: [
        { property: "", dataset: "OpenStreetMap", record_id: "w123@4" },
        { property: "/properties/height", dataset: "Microsoft ML Buildings" },
      ],
      height: 5,
    });
    expect(overtureBuildings(collection(fromOsm))).toEqual([]);
  });

  it("skips underground buildings, broken outlines and features without an id", () => {
    const underground = feature("u", { ...traced, is_underground: true });
    const line = feature("l", traced, [ring(43.53, -79.61).slice(0, 2)]);
    const point = {
      id: "p",
      type: "Feature",
      geometry: { type: "Point", coordinates: [-79.61, 43.53] },
      properties: traced,
    };
    const nameless = { ...feature("x", traced), id: undefined };
    expect(overtureBuildings(collection(underground, line, point, nameless, null, "junk"))).toEqual(
      [],
    );
  });

  it("takes the largest part of a building made of several outlines", () => {
    const multi = {
      id: "m",
      type: "Feature",
      geometry: {
        type: "MultiPolygon",
        coordinates: [[ring(43.53, -79.61, 0.0001)], [ring(43.54, -79.62, 0.0003)]],
      },
      properties: traced,
    };
    const [building] = overtureBuildings(collection(multi));
    expect(building?.footprint[0]).toEqual({ lat: 43.54, lon: -79.62 });
  });

  it("finds who traced the outline even when the whole-feature entry is not first", () => {
    const mixed = feature("mix", {
      sources: [
        { property: "/properties/height", dataset: "USGS Lidar" },
        { property: null, dataset: "Google Open Buildings" },
      ],
    });
    expect(overtureBuildings(collection(mixed))[0]?.dataset).toBe("Google Open Buildings");
    const none = feature("none", {});
    expect(overtureBuildings(collection(none))[0]?.dataset).toBe("Overture");
  });

  it("accepts the id inside properties, as older versions of the tool wrote it", () => {
    const old = {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring(43.53, -79.61)] },
      properties: { ...traced, id: "old" },
    };
    expect(overtureBuildings(collection(old)).map((b) => b.id)).toEqual(["overture/old"]);
  });

  it("rounds coordinates to about a centimetre", () => {
    const [building] = overtureBuildings(
      collection(feature("r", traced, [ring(43.530000004, -79.610000004)])),
    );
    expect(building?.footprint[0]).toEqual({ lat: 43.53, lon: -79.61 });
  });

  it("returns each building once, in id order", () => {
    const list = overtureBuildings(
      collection(feature("b", traced), feature("a", traced), feature("b", traced)),
    );
    expect(list.map((b) => b.id)).toEqual(["overture/a", "overture/b"]);
  });

  it("refuses something that is not a feature collection", () => {
    expect(() => overtureBuildings({ elements: [] })).toThrow(TypeError);
    expect(() => overtureBuildings(null)).toThrow(TypeError);
  });
});
