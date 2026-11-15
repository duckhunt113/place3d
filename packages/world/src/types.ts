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

// ---------- Map features ----------

/** OSM numbers nodes, ways and relations separately, so ids are always type-qualified, e.g. "way/123". */
export type OsmId = `${"node" | "way" | "relation"}/${number}`;

/** A building from Overture Maps, by its stable id (GERS), e.g. "overture/9bada6c0-13fb-...". */
export type OvertureId = `overture/${string}`;

/**
 * Every feature id says which source it came from, so ids never clash between sources.
 * Seeds and decisions are keyed by it.
 */
export type FeatureId = OsmId | OvertureId;

export type Tags = Record<string, string>;

/**
 * One feature shape, two coordinate types:
 * GeoFeature (lat/lon) is stored and cached; Feature (local metres) is made when generating.
 */
export type FeatureOf<P> =
  | { kind: "building"; id: FeatureId; footprint: P[]; tags: Tags }
  | {
      kind: "road";
      id: FeatureId;
      line: P[];
      tags: Tags;
      /**
       * Metres along the whole mapped road from its first point to this piece's first point.
       * Every tile measures it on the same whole road, so things spaced along a road
       * (parking stalls, sidewalk joints) line up across tile edges.
       */
      offsetM?: number;
    }
  | { kind: "area"; id: FeatureId; outline: P[]; holes?: P[][]; tags: Tags }
  | { kind: "point"; id: FeatureId; at: P; tags: Tags };
export type GeoFeature = FeatureOf<LatLon>;
export type Feature = FeatureOf<Vec2>;

// ---------- Decisions ----------

/**
 * Where a decision's answer came from: a real OSM tag, a value measured by Overture
 * (e.g. a building's height), a rule, later a model or an LLM, or the safe default.
 */
export type DecisionSource = "osm" | "overture" | "rule" | "model" | "llm" | "default";

export type RoofShape = "flat" | "gabled" | "hipped" | "pyramidal";

/**
 * Decisions: one per feature id, never stored per tile.
 * MVP: recomputed from tags and rules on load. Later: a shared table keyed by feature id.
 * Each records which rules produced it and where the answer came from.
 */
export type BuildingDecision = {
  kind: "building";
  id: FeatureId;
  /** "house", "retail", "apartments", "shed", ... */
  type: string;
  storeys: number;
  /** Height of the walls, up to the eaves. A pitched roof rises above this. */
  heightM: number;
  roof: RoofShape;
  /** Wall colour: a palette colour name, picked with the building's own seed. */
  colour: ColorName;
  /** Roof colour, picked the same way. */
  roofColour: ColorName;
  shopSigns: boolean;
  /** Degrees clockwise from north, so it means the same in every region. */
  frontBearing?: number;
  rules: string[];
  source: DecisionSource;
};

export type RoadDecision = {
  kind: "road" | "driveway" | "path";
  id: FeatureId;
  widthM: number;
  sidewalks: "both" | "left" | "right" | "none";
  curbs: boolean;
  markings: "none" | "centre";
  /** True for a parking aisle: stalls are painted along both of its sides inside a parking lot. */
  stalls: boolean;
  /** A palette colour name. */
  surface: ColorName;
  rules: string[];
  source: DecisionSource;
};

/** "This many of this kind of thing per square metre", filled in by seeded scatter. */
export type ScatterRule = { asset: AssetRequest; perM2: number };

export type AreaDecision = {
  kind: "area";
  id: FeatureId;
  /** A palette colour name. */
  surface: ColorName;
  /** Drawing order where areas overlap: higher is drawn on top. */
  layer: number;
  /** "stalls": a parking lot, painted with stall lines. */
  markings: "none" | "stalls";
  scatter: ScatterRule[];
  rules: string[];
  source: DecisionSource;
};

/**
 * A single mapped thing that becomes a model: a hydrant, a stop sign, a mapped tree
 * (place "point": it stands at its mapped spot), or a shop's name sign (place "wall": it
 * hangs on the nearest building's front wall).
 */
export type ObjectDecision = {
  kind: "object";
  id: FeatureId;
  place: "point" | "wall";
  asset: AssetRequest;
  /** What a sign says: the place's real name. */
  text?: string;
  /** A palette colour name for the sign's face, picked with the feature's own seed. */
  colour?: ColorName;
  rules: string[];
  source: DecisionSource;
};

export type Decision = BuildingDecision | RoadDecision | AreaDecision | ObjectDecision;

// ---------- Generator output ----------

export type Placement = {
  /** A catalog id, never a file name. */
  asset: AssetId;
  /** Local metres. */
  pos: [number, number, number];
  rotY: number;
  scale: number;
  /** A palette colour name for the model's text face (a sign's background). */
  tint?: ColorName;
  /** Words to draw on the model's text face (a shop's name). */
  text?: string;
};

/**
 * A simple solid shape for the physics, never a visual mesh. Local metres; `centre` is the
 * middle of the shape. Boxes may be turned around the upright axis (`rotY`, as for placements).
 */
export type Collider =
  | { shape: "box"; centre: [number, number, number]; half: [number, number, number]; rotY: number }
  | { shape: "cylinder"; centre: [number, number, number]; radius: number; halfHeight: number };

/**
 * The solid ground under one tile: a square grid of heights the player stands on. Local
 * metres. Flat for now; terrain later only changes the heights.
 */
export type GroundGrid = {
  /** The middle of the grid, as [x, z]. */
  centre: Vec2;
  /** Its full width (x) and depth (z). */
  size: Vec2;
  /** How many cells along each side. There is one more height than cells each way. */
  cells: number;
  /**
   * Height at every grid corner, row by row: rows run north to south (growing z), and within
   * a row west to east (growing x). Corner (row, column) is at `row * (cells + 1) + column`.
   */
  heights: Float32Array;
};

/** A road's centre line and width, for things that need to know where the streets are (spawning). */
export type RoadPath = { line: Vec2[]; widthM: number };

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
  /** `size` is [width (x), depth (z), height (y)] of the unturned model, in metres. */
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
  /** Why the rule exists, when it is not obvious (e.g. an unusual priority). Not used by the engine. */
  note?: string;
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

/**
 * A building from a source other than OSM, used only where OSM has no building.
 * Its fields are turned into OSM-style tags, so the same rules decide what it becomes.
 */
export type ExtraBuilding = {
  id: OvertureId;
  /** Who traced the outline, e.g. "Microsoft ML Buildings". Kept for credits and debugging. */
  dataset: string;
  /** The outer outline, without repeating the first point at the end. */
  footprint: LatLon[];
  /** `building` (the source's class, else "yes"), plus `height`, `building:levels`, `roof:shape` and `name` when known. */
  tags: Tags;
};

export type TileData = {
  id: TileId;
  /** Tile format version; pre-built paths use it (tiles/v3/...). */
  version: number;
  /** Where the OSM elements came from: "overpass" | "prebuilt". A saved file keeps the original. */
  source: string;
  fetchedAt: string;
  /** OSM data: everything that touches the tile or the margin around it, as whole shapes. */
  elements: OsmElement[];
  /**
   * Gap-fill buildings that touch the tile (MVP: from Overture Maps). The source has already
   * removed any that overlap an OSM building, so OSM always wins. Missing means none.
   */
  buildings?: ExtraBuilding[];
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
  /** What belongs to this tile and is built here. */
  features: GeoFeature[];
  /**
   * What surrounds the tile's own features. Nothing in here is built as such; it only
   * shapes what is built, so that neighbouring tiles agree along their shared edge.
   */
  context?: TileContext;
};

export type TileContext = {
  /**
   * Buildings that reach into this tile but belong to a neighbour. They keep scattered trees
   * out, and a shop inside this tile can hang its sign on one.
   */
  buildings: Extract<GeoFeature, { kind: "building" }>[];
  /**
   * Every road piece within the tile margin (the tile's own included), cut at the margin's
   * edge. Junctions, curbs and sidewalks are shaped from these and then cut at the tile edge.
   */
  roads: Extract<GeoFeature, { kind: "road" }>[];
  /**
   * Mapped points in the margin that belong to a neighbour. A shop just across the edge
   * may want the same spot on a shared wall for its sign; both tiles then agree who gets it.
   */
  points: Extract<GeoFeature, { kind: "point" }>[];
};

/** Defined here, implemented per platform (IndexedDB in the web app, files or a database on the server). */
export interface TileCache {
  get(id: TileId): Promise<WorldTile | undefined>;
  put(tile: WorldTile): Promise<void>;
}
