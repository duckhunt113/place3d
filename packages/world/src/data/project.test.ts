import { describe, expect, it } from "vitest";
import type { LatLon } from "../types";
import { mercator, project, REGION_ZOOM, regionFor, regionFromTile, unproject } from "./project";

// A point in Lorne Park, Mississauga (the MVP test neighbourhood).
const LORNE_PARK: LatLon = { lat: 43.533, lon: -79.62 };
const region = regionFor(LORNE_PARK);

// Real ground distances at this latitude on the WGS84 ellipsoid, worked out separately from the code.
const METRES_PER_MILLIDEGREE_LAT = 111.103;
const METRES_PER_MILLIDEGREE_LON = 80.833;

describe("regionFor", () => {
  it("is the zoom-10 tile containing the point", () => {
    expect(REGION_ZOOM).toBe(10);
    expect([region.z, region.x, region.y]).toEqual([10, 285, 374]);
  });

  it("is the same for every point inside that tile", () => {
    // Near the north-west and south-east corners of tile 10/285/374.
    expect(regionFor({ lat: 43.58, lon: -79.8 })).toEqual(region);
    expect(regionFor({ lat: 43.326, lon: -79.454 })).toEqual(region);
    expect(regionFromTile(285, 374)).toEqual(region);
  });

  it("changes just across the tile's edges", () => {
    expect(regionFor({ lat: 43.581, lon: -79.62 }).y).toBe(373);
    expect(regionFor({ lat: 43.533, lon: -79.805 }).x).toBe(284);
  });

  it("rejects tile numbers that don't exist", () => {
    expect(() => regionFromTile(-1, 0)).toThrow(RangeError);
    expect(() => regionFromTile(0, 1024)).toThrow(RangeError);
    expect(() => regionFromTile(1.5, 3)).toThrow(RangeError);
  });
});

describe("project", () => {
  it("puts the region's north-west corner at the origin", () => {
    const [x, z] = project(region, { lat: 43.580390855607845, lon: -79.8046875 });
    expect(x).toBeCloseTo(0, 4);
    expect(z).toBeCloseTo(0, 4);
  });

  it("has east as +x and north as -z", () => {
    const [x0, z0] = project(region, LORNE_PARK);
    const [xEast, zEast] = project(region, { lat: LORNE_PARK.lat, lon: LORNE_PARK.lon + 0.001 });
    const [xNorth, zNorth] = project(region, { lat: LORNE_PARK.lat + 0.001, lon: LORNE_PARK.lon });
    expect(xEast).toBeGreaterThan(x0);
    expect(zEast).toBeCloseTo(z0, 6);
    expect(zNorth).toBeLessThan(z0);
    expect(xNorth).toBeCloseTo(x0, 6);
  });

  it("measures real metres, not stretched Mercator metres", () => {
    const [x0, z0] = project(region, LORNE_PARK);
    const [xEast] = project(region, { lat: LORNE_PARK.lat, lon: LORNE_PARK.lon + 0.001 });
    const [, zNorth] = project(region, { lat: LORNE_PARK.lat + 0.001, lon: LORNE_PARK.lon });
    // Within 0.5% of the real distance. Uncorrected Mercator would be about 38% too big here.
    expect(Math.abs(xEast - x0 - METRES_PER_MILLIDEGREE_LON)).toBeLessThan(
      METRES_PER_MILLIDEGREE_LON * 0.005,
    );
    expect(Math.abs(z0 - zNorth - METRES_PER_MILLIDEGREE_LAT)).toBeLessThan(
      METRES_PER_MILLIDEGREE_LAT * 0.005,
    );
  });

  it("stays within 0.5% of real metres at the region's north and south edges", () => {
    for (const lat of [43.579, 43.327]) {
      const [, zA] = project(region, { lat, lon: -79.62 });
      const [, zB] = project(region, { lat: lat + 0.001, lon: -79.62 });
      const realMetres = lat > 43.5 ? 111.104 : 111.099;
      expect(Math.abs(zA - zB - realMetres)).toBeLessThan(realMetres * 0.005);
    }
  });

  it("keeps local coordinates small and positive inside the region", () => {
    const [x, z] = project(region, LORNE_PARK);
    expect(x).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(0);
    expect(x).toBeLessThan(30000);
    expect(z).toBeLessThan(30000);
  });

  it("gives the same result every time", () => {
    expect(project(region, LORNE_PARK)).toEqual(project(regionFor(LORNE_PARK), { ...LORNE_PARK }));
  });

  it("rejects coordinates that aren't on Earth", () => {
    expect(() => project(region, { lat: 91, lon: 0 })).toThrow(RangeError);
    expect(() => project(region, { lat: 0, lon: 181 })).toThrow(RangeError);
    expect(() => project(region, { lat: Number.NaN, lon: 0 })).toThrow(RangeError);
  });
});

describe("unproject", () => {
  it("reverses project", () => {
    for (const p of [LORNE_PARK, { lat: 43.33, lon: -79.46 }, { lat: 43.5799, lon: -79.8 }]) {
      const back = unproject(region, project(region, p));
      expect(back.lat).toBeCloseTo(p.lat, 9);
      expect(back.lon).toBeCloseTo(p.lon, 9);
    }
  });

  it("turns the origin back into the region's north-west corner", () => {
    const corner = unproject(region, [0, 0]);
    expect(corner.lat).toBeCloseTo(43.580390855607845, 9);
    expect(corner.lon).toBeCloseTo(-79.8046875, 9);
  });
});

describe("mercator", () => {
  it("is zero at lat 0, lon 0 and grows east and north", () => {
    const origin = mercator({ lat: 0, lon: 0 });
    expect(origin.x).toBeCloseTo(0, 6);
    expect(origin.y).toBeCloseTo(0, 6);
    expect(mercator({ lat: 0, lon: 1 }).x).toBeGreaterThan(0);
    expect(mercator({ lat: 1, lon: 0 }).y).toBeGreaterThan(0);
  });

  it("spans the standard Web Mercator width", () => {
    // Half the world's width: 20037508.34 m at lon 180.
    expect(mercator({ lat: 0, lon: 180 }).x).toBeCloseTo(20037508.34, 1);
  });

  it("stays finite at the poles", () => {
    expect(Number.isFinite(mercator({ lat: 90, lon: 0 }).y)).toBe(true);
    expect(Number.isFinite(mercator({ lat: -90, lon: 0 }).y)).toBe(true);
  });
});
