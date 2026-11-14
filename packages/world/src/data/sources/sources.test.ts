import { describe, expect, it } from "vitest";
import type { TileData, TileId, TileSource } from "../../types.ts";
import testTile from "../fixtures/test-tile.json" with { type: "json" };
import { tileBounds } from "../tiles.ts";
import { FallbackTileSource, FileTileSource, TileNotFoundError } from "./file.ts";
import {
  OverpassError,
  OverpassTileSource,
  overpassQuery,
  TILE_FORMAT_VERSION,
  tileDataFromOverpass,
} from "./overpass.ts";

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
    expect(decodeURIComponent(String(call.init.body))).toBe(
      `data=${overpassQuery(tileBounds(TILE))}`,
    );
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
