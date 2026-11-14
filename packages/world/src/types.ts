// Shared data contracts for the world package. Plain data only: no three.js, no Rapier, no DOM.
// Kept in step with docs/03-architecture.md ("Data contracts").

// ---------- Coordinates ----------

export type LatLon = { lat: number; lon: number };

/** Local metres [x, z]: x east, z south (north is -z; y is up). Never stored or shared. */
export type Vec2 = [number, number];

/** Slippy-map tile at zoom 17, about 220 m across in southern Ontario. The unit of fetching and caching. */
export type TileId = { z: 17; x: number; y: number };

/**
 * The zoom-10 tile that local coordinates are measured from (about 28 km across in southern Ontario).
 * `originX`/`originY` are the Web Mercator metres of its north-west corner; `k` is
 * cos(latitude at the middle of the tile), which turns Mercator metres into real metres.
 */
export type Region = {
  z: 10;
  x: number;
  y: number;
  originX: number;
  originY: number;
  k: number;
};

// ---------- OSM features ----------

/** OSM numbers nodes, ways and relations separately, so ids are always type-qualified, e.g. "way/123". */
export type OsmId = `${"node" | "way" | "relation"}/${number}`;

export type Tags = Record<string, string>;

/**
 * One feature shape, two coordinate types:
 * GeoFeature (lat/lon) is stored and cached; Feature (local metres) is made when generating.
 */
export type FeatureOf<P> =
  | { kind: "building"; osmId: OsmId; footprint: P[]; tags: Tags }
  | { kind: "road"; osmId: OsmId; line: P[]; tags: Tags }
  | { kind: "area"; osmId: OsmId; outline: P[]; holes?: P[][]; tags: Tags }
  | { kind: "point"; osmId: OsmId; at: P; tags: Tags };
export type GeoFeature = FeatureOf<LatLon>;
export type Feature = FeatureOf<Vec2>;

// ---------- Decisions ----------

export type DecisionSource = "osm" | "rule" | "model" | "llm" | "default";

export type RoofShape = "flat" | "gabled" | "hipped" | "pyramidal";

/**
 * Decisions: one per osmId, never stored per tile.
 * MVP: recomputed from tags and rules on load. Later: a shared table keyed by osmId.
 * Each records which rules produced it and where the answer came from.
 */
export type BuildingDecision = {
  kind: "building";
  osmId: OsmId;
  /** "house", "retail", "apartments", "shed", ... */
  type: string;
  storeys: number;
  heightM: number;
  roof: RoofShape;
  /** A palette colour name, picked with the building's own seed. */
  colour: ColorName;
  shopSigns: boolean;
  /** Degrees clockwise from north, so it means the same in every region. */
  frontBearing?: number;
  rules: string[];
  source: DecisionSource;
};

export type RoadDecision = {
  kind: "road" | "driveway" | "path";
  osmId: OsmId;
  widthM: number;
  sidewalks: "both" | "left" | "right" | "none";
  curbs: boolean;
  markings: "none" | "centre";
  /** A palette colour name. */
  surface: ColorName;
  rules: string[];
  source: DecisionSource;
};

export type Decision = BuildingDecision | RoadDecision;

// ---------- Generator output ----------

export type Placement = {
  /** A catalog id, never a file name. */
  asset: AssetId;
  /** Local metres. */
  pos: [number, number, number];
  rotY: number;
  scale: number;
  tint?: string;
};

export type MeshData = {
  material: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  /** Vertex colours (rgb). */
  colors?: Float32Array;
  indices: Uint32Array;
};

// ---------- Palette (apps/web/public/assets/palette.json) ----------

/** Stable colour name, e.g. "foliage.light". Never renamed or removed. */
export type ColorName = string;

export type Palette = {
  version: number;
  grid: { cols: number; rows: number; cellPx: number };
  /** cell = [col, row] on the generated palette image; it may move. */
  colors: Record<ColorName, { hex: string; cell: [number, number] }>;
};

// ---------- Asset catalog (apps/web/public/assets/catalog.json) ----------

/** Stable asset id, e.g. "tree.leafy.m". Never renamed or deleted. */
export type AssetId = string;

export type AssetCollider =
  | { type: "box"; size: [number, number, number] }
  | { type: "cylinder"; radius: number; height: number }
  | { type: "none" };

export type AssetEntry = {
  id: AssetId;
  /** Path relative to the assets folder, e.g. "nature/tree_leafy_m.glb". */
  file: string;
  category: string;
  attributes: Record<string, string | number>;
  /** The category's fallback when nothing else matches. */
  default?: boolean;
  footprintM: [number, number];
  collider: AssetCollider;
  triangles: number;
  source: string;
  licence: string;
  /** Kept so old worlds still resolve; never picked for new choices. */
  deprecated?: boolean;
};

export type AssetCatalog = { version: number; assets: AssetEntry[] };

/** What decisions (and later AI) ask for: requirements, never a file or an id. */
export type AssetRequest = { category: string; want?: Record<string, string | number> };

// ---------- OSM tag rules (packages/world/src/decide/rules/*.json) ----------

export type RuleComparison = { lt?: number; lte?: number; gt?: number; gte?: number };

export type Rule = {
  /** Stable, e.g. "building.retail". Never renamed. */
  id: string;
  /** All must match. A value is an exact string, a list of strings, or "*" (tag present). */
  when: Record<string, string | string[]>;
  /** Geometry facts computed in code; thresholds live here. */
  where?: Record<string, string | RuleComparison>;
  /** 100 = copy a real OSM tag. Default 0. */
  priority?: number;
  /** Decision fields, palette names and asset requests. "@key" copies that tag's value. */
  then: Record<string, unknown>;
};

export type RuleDomain = "buildings" | "roads" | "areas" | "objects";

export type RuleSet = { version: number; domain: RuleDomain; rules: Rule[] };

// ---------- Tile data: the only way map data enters the pipeline ----------

/** One element in Overpass `out geom` JSON shape. Combine `type` and `id` for an OsmId. */
export type OsmElement = {
  type: "node" | "way" | "relation";
  id: number;
  tags?: Tags;
  lat?: number;
  lon?: number;
  geometry?: LatLon[];
  members?: { type: string; ref: number; role: string; geometry?: LatLon[] }[];
};

export type TileData = {
  id: TileId;
  /** Tile format version; pre-built paths use it (tiles/v1/...). */
  version: number;
  /** "file" | "overpass" | "prebuilt" */
  source: string;
  fetchedAt: string;
  /** Everything that touches the tile, not only what lies inside it. */
  elements: OsmElement[];
};

export interface TileSource {
  getTile(id: TileId): Promise<TileData>;
}

// ---------- Tile cache ----------

/** What the cache stores: parsed features for one tile, in lat/lon. */
export type WorldTile = {
  id: TileId;
  /** Bump when parsing or the format changes. */
  version: number;
  generatedAt: string;
  features: GeoFeature[];
};

/** Defined here, implemented per platform (IndexedDB in the web app, files or a database on the server). */
export interface TileCache {
  get(id: TileId): Promise<WorldTile | undefined>;
  put(tile: WorldTile): Promise<void>;
}
