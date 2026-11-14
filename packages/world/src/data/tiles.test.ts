import { describe, expect, it } from "vitest";
import type { LatLon } from "../types.ts";
import {
  parseTileKey,
  sameTile,
  TILE_ZOOM,
  tileAt,
  tileBounds,
  tileKey,
  tilesInRadius,
} from "./tiles.ts";

const LORNE_PARK: LatLon = { lat: 43.533, lon: -79.62 };

describe("tileAt", () => {
  it("finds the zoom-17 tile of a point", () => {
    // 17/36547/47895 by the standard slippy-map formula, worked out separately.
    expect(TILE_ZOOM).toBe(17);
    expect(tileAt(LORNE_PARK)).toEqual({ z: 17, x: 36547, y: 47895 });
  });

  it("puts the centre of a tile's bounds back in that tile", () => {
    const id = tileAt(LORNE_PARK);
    const box = tileBounds(id);
    const middle = { lat: (box.south + box.north) / 2, lon: (box.west + box.east) / 2 };
    expect(tileAt(middle)).toEqual(id);
  });

  it("moves one tile east and one tile south across the edges", () => {
    const id = tileAt(LORNE_PARK);
    const box = tileBounds(id);
    const step = 1e-6;
    expect(tileAt({ lat: LORNE_PARK.lat, lon: box.east + step }).x).toBe(id.x + 1);
    expect(tileAt({ lat: LORNE_PARK.lat, lon: box.west - step }).x).toBe(id.x - 1);
    expect(tileAt({ lat: box.south - step, lon: LORNE_PARK.lon }).y).toBe(id.y + 1);
    expect(tileAt({ lat: box.north + step, lon: LORNE_PARK.lon }).y).toBe(id.y - 1);
  });
});

describe("tileBounds", () => {
  it("is about 222 m wide and tall at this latitude", () => {
    const box = tileBounds(tileAt(LORNE_PARK));
    // Real metres per degree here: 80,833 east-west and 111,103 north-south.
    expect((box.east - box.west) * 80833).toBeCloseTo(222, 0);
    expect((box.north - box.south) * 111103).toBeCloseTo(221.2, 0);
  });

  it("shares exactly the same edge values with its neighbours", () => {
    const id = tileAt(LORNE_PARK);
    const box = tileBounds(id);
    expect(tileBounds({ ...id, x: id.x + 1 }).west).toBe(box.east);
    expect(tileBounds({ ...id, y: id.y + 1 }).north).toBe(box.south);
  });
});

describe("tileKey", () => {
  it("round-trips through parseTileKey", () => {
    const id = tileAt(LORNE_PARK);
    expect(tileKey(id)).toBe("17/36547/47895");
    expect(parseTileKey("17/36547/47895")).toEqual(id);
    expect(sameTile(parseTileKey(tileKey(id)), id)).toBe(true);
  });

  it("rejects keys that are not zoom-17 tiles", () => {
    expect(() => parseTileKey("16/1/2")).toThrow(RangeError);
    expect(() => parseTileKey("17/abc/2")).toThrow(RangeError);
    expect(() => parseTileKey("17/999999/2")).toThrow(RangeError);
  });
});

describe("tilesInRadius", () => {
  it("returns just the centre tile for a zero radius", () => {
    expect(tilesInRadius(LORNE_PARK, 0)).toEqual([tileAt(LORNE_PARK)]);
  });

  it("returns between 9 and 16 tiles for a 300 m radius", () => {
    const tiles = tilesInRadius(LORNE_PARK, 300);
    expect(tiles.length).toBeGreaterThanOrEqual(9);
    expect(tiles.length).toBeLessThanOrEqual(16);
    expect(tiles).toContainEqual(tileAt(LORNE_PARK));
  });

  it("includes the tile 250 m east but not the one 600 m east", () => {
    const keys = tilesInRadius(LORNE_PARK, 300).map(tileKey);
    const east = (metres: number) =>
      tileKey(tileAt({ lat: LORNE_PARK.lat, lon: LORNE_PARK.lon + metres / 80833 }));
    expect(keys).toContain(east(250));
    expect(keys).not.toContain(east(600));
  });

  it("leaves out corner tiles the circle does not reach", () => {
    // From the middle of a tile, the four side neighbours are 111 m away and the four
    // diagonal ones 157 m away (their nearest corner).
    const box = tileBounds(tileAt(LORNE_PARK));
    const middle = { lat: (box.south + box.north) / 2, lon: (box.west + box.east) / 2 };
    expect(tilesInRadius(middle, 150)).toHaveLength(5);
    expect(tilesInRadius(middle, 160)).toHaveLength(9);
  });

  it("lists tiles in a stable order: north to south, then west to east", () => {
    const tiles = tilesInRadius(LORNE_PARK, 300);
    const sorted = [...tiles].sort((a, b) => a.y - b.y || a.x - b.x);
    expect(tiles).toEqual(sorted);
    expect(tilesInRadius(LORNE_PARK, 300)).toEqual(tiles);
  });

  it("rejects a negative radius", () => {
    expect(() => tilesInRadius(LORNE_PARK, -1)).toThrow(RangeError);
  });
});
