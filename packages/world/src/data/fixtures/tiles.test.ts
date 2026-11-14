import { describe, expect, it } from "vitest";
import { createRuleEngine } from "../../decide/rules/index.ts";
import { buildTile } from "../../generator/tile.ts";
import { prepareTile } from "../prepare.ts";
import { regionFor } from "../project.ts";
import { parseTileKey, tileAt, tileKey, tilesInRadius } from "../tiles.ts";
import { FIXTURE_CENTRE, fixtureTileKeys, loadFixtureTile } from "./tiles/index.ts";

// The saved map tiles of the MVP test area (fetched once with `pnpm fixtures`).
describe("saved tiles", () => {
  it("exist: run `pnpm fixtures` once to fetch them", () => {
    expect(fixtureTileKeys.length).toBeGreaterThan(0);
    expect(FIXTURE_CENTRE).toBeDefined();
  });

  it("cover a 300 m circle around the saved centre", () => {
    if (!FIXTURE_CENTRE) throw new Error("no saved tiles yet: run `pnpm fixtures`");
    const needed = tilesInRadius(FIXTURE_CENTRE, 300).map(tileKey);
    expect([...fixtureTileKeys].sort()).toEqual([...needed].sort());
    expect(fixtureTileKeys).toContain(tileKey(tileAt(FIXTURE_CENTRE)));
  });

  it("each hold the tile their name says, in the saved-tile format", async () => {
    for (const key of fixtureTileKeys) {
      const data = await loadFixtureTile(key);
      expect(data?.id).toEqual(parseTileKey(key));
      expect(data?.version).toBe(1);
      expect(Array.isArray(data?.elements)).toBe(true);
    }
    expect(await loadFixtureTile("17/0/0")).toBeUndefined();
  });

  it("build into roads and buildings, the same way every time", async () => {
    if (!FIXTURE_CENTRE) throw new Error("no saved tiles yet: run `pnpm fixtures`");
    const region = regionFor(FIXTURE_CENTRE);
    const engine = createRuleEngine();
    let roads = 0;
    let buildings = 0;
    for (const key of fixtureTileKeys) {
      const data = await loadFixtureTile(key);
      if (!data) throw new Error(`saved tile ${key} did not load`);
      const first = buildTile(prepareTile(data, data.fetchedAt), region, engine);
      const second = buildTile(prepareTile(data, data.fetchedAt), region, engine);
      expect(second).toEqual(first);
      roads += first.counts.roads;
      buildings += first.counts.buildings;
    }
    expect(roads).toBeGreaterThan(0);
    expect(buildings).toBeGreaterThan(0);
  });
});
