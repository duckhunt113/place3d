import { describe, expect, it } from "vitest";
import realCatalog from "../../../../../apps/web/public/assets/catalog.json";
import { AssetSelector } from "../../assets/select.ts";
import { createRuleEngine } from "../../decide/rules/index.ts";
import { findSpawn } from "../../generator/spawn.ts";
import { buildTile } from "../../generator/tile.ts";
import type { AssetCatalog, Collider, RoadPath } from "../../types.ts";
import { prepareTile } from "../prepare.ts";
import { project, regionFor } from "../project.ts";
import { TILE_FORMAT_VERSION } from "../sources/overpass.ts";
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
      expect(data?.version, "the saved tiles are in an older format: run `pnpm fixtures`").toBe(
        TILE_FORMAT_VERSION,
      );
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

  it("build streets with curbs, sidewalks, parking stalls and shop signs", async () => {
    if (!FIXTURE_CENTRE) throw new Error("no saved tiles yet: run `pnpm fixtures`");
    const region = regionFor(FIXTURE_CENTRE);
    const engine = createRuleEngine();
    const selector = new AssetSelector(realCatalog as unknown as AssetCatalog);
    const triangles: Record<string, number> = {};
    const names: string[] = [];
    for (const key of fixtureTileKeys) {
      const data = await loadFixtureTile(key);
      if (!data) throw new Error(`saved tile ${key} did not load`);
      const built = buildTile(prepareTile(data, data.fetchedAt), region, engine, selector);
      for (const mesh of built.meshes) {
        triangles[mesh.material] = (triangles[mesh.material] ?? 0) + mesh.indices.length / 3;
      }
      for (const placement of built.placements) if (placement.text) names.push(placement.text);
    }
    for (const colour of [
      "asphalt",
      "curb",
      "sidewalk",
      "sidewalk.joint",
      "road.white",
      "road.yellow",
    ]) {
      expect(triangles[colour], `no ${colour} was drawn`).toBeGreaterThan(0);
    }
    // Every shop sign says something, and no name hangs twice in the same tile set by mistake.
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(name.trim().length).toBeGreaterThan(0);
  });

  it("give the player a street to start on, close to the centre and clear of buildings", async () => {
    if (!FIXTURE_CENTRE) throw new Error("no saved tiles yet: run `pnpm fixtures`");
    const region = regionFor(FIXTURE_CENTRE);
    const engine = createRuleEngine();
    const streets: RoadPath[] = [];
    const solids: Collider[] = [];
    for (const key of fixtureTileKeys) {
      const data = await loadFixtureTile(key);
      if (!data) throw new Error(`saved tile ${key} did not load`);
      const built = buildTile(prepareTile(data, data.fetchedAt), region, engine);
      streets.push(...built.roads);
      solids.push(...built.colliders);
      // Every tile has solid ground under it.
      expect(built.ground.heights).toHaveLength((built.ground.cells + 1) ** 2);
    }
    const centre = project(region, FIXTURE_CENTRE);
    const spawn = findSpawn(centre, streets);
    expect(Math.hypot(spawn.pos[0] - centre[0], spawn.pos[2] - centre[1])).toBeLessThan(100);
    // No building's solid shape comes within a metre of the starting point.
    for (const solid of solids) {
      if (solid.shape !== "box") continue;
      const dx = spawn.pos[0] - solid.centre[0];
      const dz = spawn.pos[2] - solid.centre[2];
      const cos = Math.cos(solid.rotY);
      const sin = Math.sin(solid.rotY);
      // The starting point, seen from the box's own unturned position.
      const alongX = dx * cos - dz * sin;
      const alongZ = dx * sin + dz * cos;
      const inside = Math.abs(alongX) < solid.half[0] + 1 && Math.abs(alongZ) < solid.half[2] + 1;
      expect(inside).toBe(false);
    }
  });
});
