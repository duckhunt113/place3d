// Builds one tile: stored features (lat/lon) -> decisions -> local metres -> plain mesh data
// and model placements. The same tile, region, rules and catalog always give the same output.

import type { AssetSelector } from "../assets/select.ts";
import { fromMercator, project } from "../data/project.ts";
import { tileBounds, tileKey } from "../data/tiles.ts";
import { decideArea, decideBuilding, decideObject, decideRoad } from "../decide/decisions.ts";
import type { RuleEngine } from "../decide/engine.ts";
import { FactFinder } from "../decide/facts.ts";
import type {
  Collider,
  ColorName,
  GroundGrid,
  LatLon,
  MeshData,
  Placement,
  Region,
  RoadPath,
  TileId,
  Vec2,
  WorldTile,
} from "../types.ts";
import { addBuilding } from "./buildings.ts";
import { buildingColliders, groundCollider, placementColliders } from "./colliders.ts";
import { addArea, addGround } from "./ground.ts";
import { MeshSet } from "./mesh.ts";
import { type MappedObject, placeAssets, type RoadShape, type ScatterArea } from "./placements.ts";
import { addRoad } from "./roads.ts";

/** Land the map says nothing about. Most of it is grass in the places the game is made for. */
export const GROUND_COLOUR: ColorName = "grass";

export type TileMeshes = {
  id: TileId;
  /** "17/x/y" */
  key: string;
  /** One mesh per material; a material is a palette colour name. */
  meshes: MeshData[];
  /** Where pre-made models go (asset ids from the catalog). Empty when no catalog was given. */
  placements: Placement[];
  /** Solid shapes for the physics: buildings, tree trunks, props. */
  colliders: Collider[];
  /** The solid ground under the tile. */
  ground: GroundGrid;
  /** Streets a player can stand on (not footpaths), cut at the tile's edges. */
  roads: RoadPath[];
  counts: {
    buildings: number;
    roads: number;
    areas: number;
    placements: number;
    triangles: number;
  };
};

/**
 * Builds one tile. With a `selector` (made from the asset catalog) it also places models;
 * without one it only generates the surfaces.
 */
export function buildTile(
  tile: WorldTile,
  region: Region,
  engine: RuleEngine,
  selector?: AssetSelector,
): TileMeshes {
  const meshes = new MeshSet();
  const local = (p: LatLon): Vec2 => project(region, p);
  const box = tileBounds(tile.id);
  const corners: [Vec2, Vec2, Vec2, Vec2] = [
    local({ lat: box.north, lon: box.west }),
    local({ lat: box.north, lon: box.east }),
    local({ lat: box.south, lon: box.east }),
    local({ lat: box.south, lon: box.west }),
  ];
  addGround(meshes, corners, GROUND_COLOUR);

  const facts = new FactFinder(tile.features);
  let buildings = 0;
  let roads = 0;
  const areas: ScatterArea[] = [];
  const roadShapes: RoadShape[] = [];
  // Every building outline that touches the tile, including neighbours' buildings that reach in.
  const outlines: Vec2[][] = (tile.blockers ?? []).map((ring) => ring.map(local));
  const objects: MappedObject[] = [];
  const colliders: Collider[] = [];
  for (const feature of tile.features) {
    if (feature.kind === "area") {
      const decision = decideArea(engine, feature);
      if (!decision) continue;
      const outline = feature.outline.map(local);
      const holes = (feature.holes ?? []).map((hole) => hole.map(local));
      if (addArea(meshes, outline, holes, decision.layer, decision.surface) > 0) {
        areas.push({ decision, outline, holes });
      }
    } else if (feature.kind === "building") {
      const decision = decideBuilding(engine, feature, facts.forBuilding(feature));
      const footprint = feature.footprint.map(local);
      outlines.push(footprint);
      if (addBuilding(meshes, footprint, decision)) {
        buildings++;
        colliders.push(...buildingColliders(footprint, decision.heightM));
      }
    } else if (feature.kind === "road") {
      const decision = decideRoad(engine, feature);
      if (!decision) continue;
      const line = feature.line.map(local);
      addRoad(meshes, line, decision);
      roadShapes.push({ decision, line });
      roads++;
    } else {
      const decision = decideObject(engine, feature);
      if (decision) objects.push({ decision, at: local(feature.at) });
    }
  }

  const placements = selector
    ? placeAssets(
        {
          id: tile.id,
          toLocal: (m) => fromMercator(region, m),
          scale: region.k,
          areas,
          roads: roadShapes,
          buildings: outlines,
          objects,
        },
        selector,
      )
    : [];

  if (selector) colliders.push(...placementColliders(placements, selector));
  const streets: RoadPath[] = roadShapes
    .filter((road) => road.decision.kind !== "path")
    .map((road) => ({ line: road.line, widthM: road.decision.widthM }));

  const data = meshes.toMeshData();
  const triangles = data.reduce((sum, mesh) => sum + mesh.indices.length / 3, 0);
  return {
    id: tile.id,
    key: tileKey(tile.id),
    meshes: data,
    placements,
    colliders,
    ground: groundCollider(corners),
    roads: streets,
    counts: {
      buildings,
      roads,
      areas: areas.length,
      placements: placements.length,
      triangles,
    },
  };
}
