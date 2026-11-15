// Builds one tile: stored features (lat/lon) -> decisions -> local metres -> plain mesh data,
// model placements and collider shapes. The same tile, region, rules and catalog always give
// the same output.

import type { AssetSelector } from "../assets/select.ts";
import { fromMercator, project } from "../data/project.ts";
import { type LatLonBox, tileBounds, tileKey, tileReach } from "../data/tiles.ts";
import { decideArea, decideBuilding, decideObject, decideRoad } from "../decide/decisions.ts";
import type { RuleEngine } from "../decide/engine.ts";
import { FactFinder } from "../decide/facts.ts";
import type {
  Collider,
  ColorName,
  FeatureId,
  GeoFeature,
  GroundGrid,
  LatLon,
  MeshData,
  ObjectDecision,
  Placement,
  Region,
  RoadPath,
  TileId,
  Vec2,
  WorldTile,
} from "../types.ts";
import { centroid, type Pair } from "../util/geometry.ts";
import { boxShape, pointInShape } from "../util/shapes.ts";
import { addBuilding } from "./buildings.ts";
import { buildingColliders, groundCollider, placementColliders } from "./colliders.ts";
import { addArea, addGround } from "./ground.ts";
import { MeshSet } from "./mesh.ts";
import { addStalls, type ParkingLot } from "./parking.ts";
import { type MappedObject, placeAssets, type ScatterArea } from "./placements.ts";
import { addStreets, CURB_HEIGHT_M, planStreets, type RoadPiece } from "./roads.ts";
import { addSidewalks, type TileBox } from "./sidewalks.ts";
import { placeSigns, type SignBuilding, type SignRequest } from "./signs.ts";

/** Land the map says nothing about. Most of it is grass in the places the game is made for. */
export const GROUND_COLOUR: ColorName = "grass";

export type TileMeshes = {
  id: TileId;
  /** "17/x/y" */
  key: string;
  /** One mesh per material; a material is a palette colour name. */
  meshes: MeshData[];
  /**
   * Where pre-made models go (asset ids from the catalog), shop signs with their names
   * included. Empty when no catalog was given.
   */
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
    /** Shop name signs (they are also counted in `placements`). */
    signs: number;
    triangles: number;
  };
};

type Road = Extract<GeoFeature, { kind: "road" }>;
type Building = Extract<GeoFeature, { kind: "building" }>;

/** True if the point sits exactly on an edge of the box: the mark of a cut made there. */
function onEdge(p: LatLon, box: LatLonBox): boolean {
  return p.lat === box.south || p.lat === box.north || p.lon === box.west || p.lon === box.east;
}

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
  const bounds = tileBounds(tile.id);
  const reach = tileReach(tile.id);
  const corners: [Vec2, Vec2, Vec2, Vec2] = [
    local({ lat: bounds.north, lon: bounds.west }),
    local({ lat: bounds.north, lon: bounds.east }),
    local({ lat: bounds.south, lon: bounds.east }),
    local({ lat: bounds.south, lon: bounds.west }),
  ];
  addGround(meshes, corners, GROUND_COLOUR);
  const box: TileBox = {
    minX: Math.min(corners[0][0], corners[3][0]),
    maxX: Math.max(corners[1][0], corners[2][0]),
    minZ: Math.min(corners[0][1], corners[1][1]),
    maxZ: Math.max(corners[2][1], corners[3][1]),
  };
  const tileShape = boxShape(box.minX, box.minZ, box.maxX, box.maxZ);

  // Streets are shaped from every road piece in and around the tile, so they line up with
  // the neighbouring tiles; a tile stored without its surroundings uses its own roads.
  const own = tile.features.filter((feature): feature is Road => feature.kind === "road");
  const pieces: RoadPiece[] = [];
  for (const road of tile.context?.roads ?? own) {
    const decision = decideRoad(engine, road);
    const first = road.line[0];
    const last = road.line[road.line.length - 1];
    if (!decision || !first || !last) continue;
    pieces.push({
      decision,
      line: road.line.map(local),
      offsetM: road.offsetM ?? 0,
      cutStart: onEdge(first, reach) || onEdge(first, bounds),
      cutEnd: onEdge(last, reach) || onEdge(last, bounds),
    });
  }
  const plan = planStreets(pieces);
  addStreets(meshes, plan, tileShape);
  addSidewalks(meshes, plan, pieces, tileShape, box);

  const facts = new FactFinder(tile.features);
  let buildings = 0;
  const areas: ScatterArea[] = [];
  const lots: ParkingLot[] = [];
  const streets: RoadPath[] = [];
  const objects: MappedObject[] = [];
  const signRequests: SignRequest[] = [];
  const signBuildings: SignBuilding[] = [];
  const colliders: Collider[] = [];
  const wantSign = (id: FeatureId, at: Vec2, decision: ObjectDecision, owned: boolean) => {
    if (decision.place !== "wall" || !decision.text) return;
    const request: SignRequest = { id, at, text: decision.text, asset: decision.asset, owned };
    if (decision.colour) request.colour = decision.colour;
    signRequests.push(request);
  };
  // A building that carries a shop's tags itself gets a sign too, as if the shop were a point at its centre.
  const noteBuilding = (feature: Building, footprint: Vec2[], heightM: number, owned: boolean) => {
    signBuildings.push({ id: feature.id, footprint, heightM });
    const decision = decideObject(engine, feature);
    if (decision) wantSign(feature.id, centroid(footprint as Pair[]), decision, owned);
  };

  for (const feature of tile.features) {
    if (feature.kind === "area") {
      const decision = decideArea(engine, feature);
      if (!decision) continue;
      const outline = feature.outline.map(local);
      const holes = (feature.holes ?? []).map((hole) => hole.map(local));
      if (addArea(meshes, outline, holes, decision.layer, decision.surface) > 0) {
        areas.push({ decision, outline, holes });
        if (decision.markings === "stalls") {
          const whole = !feature.outline.some((p) => onEdge(p, bounds));
          lots.push({ outline, holes, whole });
        }
      }
    } else if (feature.kind === "building") {
      const decision = decideBuilding(engine, feature, facts.forBuilding(feature));
      const footprint = feature.footprint.map(local);
      noteBuilding(feature, footprint, decision.heightM, true);
      if (addBuilding(meshes, footprint, decision)) {
        buildings++;
        colliders.push(...buildingColliders(footprint, decision.heightM));
      }
    } else if (feature.kind === "road") {
      const decision = decideRoad(engine, feature);
      if (decision && decision.kind !== "path") {
        streets.push({ line: feature.line.map(local), widthM: decision.widthM });
      }
    } else {
      const decision = decideObject(engine, feature);
      if (!decision) continue;
      const at = local(feature.at);
      if (decision.place === "point") objects.push({ decision, at });
      else wantSign(feature.id, at, decision, true);
    }
  }
  // Neighbours' buildings that reach in: trees keep out of them, and a shop in this tile may
  // hang its sign on one.
  for (const feature of tile.context?.buildings ?? []) {
    const decision = decideBuilding(engine, feature, facts.forBuilding(feature));
    noteBuilding(feature, feature.footprint.map(local), decision.heightM, false);
  }
  // Neighbours' shops close by: they hang their own signs, but may want the same spot as ours.
  for (const feature of tile.context?.points ?? []) {
    const decision = decideObject(engine, feature);
    if (decision) wantSign(feature.id, local(feature.at), decision, false);
  }

  addStalls(meshes, lots, pieces, plan.driving, tileShape);

  let placements: Placement[] = [];
  let signs = 0;
  if (selector) {
    const placed = placeAssets(
      {
        id: tile.id,
        toLocal: (m) => fromMercator(region, m),
        scale: region.k,
        areas,
        roads: pieces,
        buildings: signBuildings.map((building) => building.footprint),
        objects,
      },
      selector,
    );
    // Whatever stands on a curb or a sidewalk stands on top of it, not sunk into it.
    for (const placement of placed) {
      if (pointInShape([placement.pos[0], placement.pos[2]], plan.raised)) {
        placement.pos[1] += CURB_HEIGHT_M;
      }
    }
    const boards = placeSigns(
      signRequests,
      signBuildings,
      { roads: pieces, lots: lots.map((lot) => lot.outline) },
      selector,
    );
    signs = boards.length;
    placements = [...placed, ...boards];
    colliders.push(...placementColliders(placed, selector));
  }

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
      roads: own.length,
      areas: areas.length,
      placements: placements.length,
      signs,
      triangles,
    },
  };
}
