// Public API of @somewhere/world. Plain data and logic only: no three.js, no Rapier, no DOM.

export const WORLD_VERSION = "0.1.0";

export { AssetSelector } from "./assets/select.ts";
export { FIXTURE_CENTRE, fixtureTileKeys, loadFixtureTile } from "./data/fixtures/tiles/index.ts";
export { buildingsTouching, fillBuildingGaps, OVERLAP_SHARE } from "./data/gaps.ts";
export {
  createTileLoader,
  DEFAULT_MAX_AGE_MS,
  type LoadedTile,
  type TileLoaderOptions,
  type TileOrigin,
  type WorldTileLoader,
} from "./data/loader.ts";
export { parseElements, parseTile } from "./data/parse.ts";
export { prepareTile, WORLD_TILE_VERSION } from "./data/prepare.ts";
export {
  mercator,
  project,
  REGION_ZOOM,
  regionFor,
  regionFromTile,
  unproject,
} from "./data/project.ts";
export {
  FallbackTileSource,
  FileTileSource,
  type TileLoader,
  TileNotFoundError,
} from "./data/sources/file.ts";
export {
  OVERPASS_ENDPOINT,
  OverpassError,
  type OverpassOptions,
  OverpassTileSource,
  overpassQuery,
  TILE_FORMAT_VERSION,
} from "./data/sources/overpass.ts";
export { overtureBuildings } from "./data/sources/overture.ts";
export {
  expandBox,
  type LatLonBox,
  parseTileKey,
  sameTile,
  TILE_MARGIN_M,
  TILE_ZOOM,
  tileAt,
  tileBounds,
  tileKey,
  tileReach,
  tilesInRadius,
} from "./data/tiles.ts";
export { RuleEngine } from "./decide/engine.ts";
export { createRuleEngine } from "./decide/rules/index.ts";
export {
  buildingColliders,
  GROUND_CELLS,
  groundCollider,
  placementColliders,
} from "./generator/colliders.ts";
export { groundHeightAt } from "./generator/ground.ts";
export { findSpawn, type Spawn } from "./generator/spawn.ts";
export { buildTile, type TileMeshes } from "./generator/tile.ts";
export type * from "./types.ts";
export { createRng, type Rng } from "./util/rng.ts";
