// Builds one tile: stored features (lat/lon) -> decisions -> local metres -> plain mesh data.
// The same tile, region and rules always give exactly the same output.

import { project } from "../data/project.ts";
import { tileBounds, tileKey } from "../data/tiles.ts";
import { decideBuilding, decideRoad } from "../decide/decisions.ts";
import type { RuleEngine } from "../decide/engine.ts";
import { FactFinder } from "../decide/facts.ts";
import type { ColorName, LatLon, MeshData, Region, TileId, Vec2, WorldTile } from "../types.ts";
import { addBuilding } from "./buildings.ts";
import { addGround } from "./ground.ts";
import { MeshSet } from "./mesh.ts";
import { addRoad } from "./roads.ts";

// First pass: everything in plain greys from the palette. The style pass replaces these
// with each building's own colour and real ground surfaces.
export const GROUND_COLOUR: ColorName = "wall.base";
export const BUILDING_COLOUR: ColorName = "house.grey";

export type TileMeshes = {
  id: TileId;
  /** "17/x/y" */
  key: string;
  /** One mesh per material; a material is a palette colour name. */
  meshes: MeshData[];
  counts: { buildings: number; roads: number; triangles: number };
};

export function buildTile(tile: WorldTile, region: Region, engine: RuleEngine): TileMeshes {
  const meshes = new MeshSet();
  const local = (p: LatLon): Vec2 => project(region, p);
  const box = tileBounds(tile.id);
  addGround(
    meshes,
    [
      local({ lat: box.north, lon: box.west }),
      local({ lat: box.north, lon: box.east }),
      local({ lat: box.south, lon: box.east }),
      local({ lat: box.south, lon: box.west }),
    ],
    GROUND_COLOUR,
  );

  const facts = new FactFinder(tile.features);
  let buildings = 0;
  let roads = 0;
  for (const feature of tile.features) {
    if (feature.kind === "building") {
      const decision = decideBuilding(engine, feature, facts.forBuilding(feature));
      if (addBuilding(meshes, feature.footprint.map(local), decision, BUILDING_COLOUR)) buildings++;
    } else if (feature.kind === "road") {
      const decision = decideRoad(engine, feature);
      if (!decision) continue;
      addRoad(meshes, feature.line.map(local), decision);
      roads++;
    }
  }

  const data = meshes.toMeshData();
  const triangles = data.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0);
  return {
    id: tile.id,
    key: tileKey(tile.id),
    meshes: data,
    counts: { buildings, roads, triangles },
  };
}
