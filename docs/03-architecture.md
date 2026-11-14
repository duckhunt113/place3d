# 03 — Architecture

## Workspace layout (pnpm workspace)

```
somewhere/
  apps/
    web/                 @somewhere/web: Vite + TypeScript + Three.js + Rapier
      src/main.ts        wires ui, worker and render together
      src/ui/            coordinate input + map-link parser, status panel, OSM credit
      src/worker/        Web Worker running @somewhere/world off the main thread
      src/cache/         tile cache storage (IndexedDB)
      src/render/        the ONLY place that imports three.js
      src/physics/       Rapier world + colliders from generator data
      src/player/        first-person camera, controls, player capsule
      public/assets/     .glb asset kit + catalog.json + palette.json
    server/              (later) Colyseus rooms + server-side fetch, decisions, tile storage
  packages/
    world/               plain TypeScript, NO three.js, NO DOM
      src/data/          tiling, lat/lon -> metres, parsing, clipping, cache interface
        sources/         tile sources (saved files, Overpass)
        fixtures/        test tile + the saved Albertson Crescent tiles
      src/decide/        rule engine + rules/*.json (tag rules as data); later: trained model, LLM
      src/generator/     roads, ground, buildings -> plain mesh data + placements
      src/assets/        asset catalog types + selector
      src/util/          seeded random, geometry helpers
  scripts/               build-palette.mjs, fetch-fixture-tiles.ts
  docs/                  these docs
```

## Layers

```
1. Data          OSM fetch, caching, parsing            -> packages/world (plain TS)
2. Decide        what is each feature                    -> packages/world (plain TS)
3. Generator     geometry + placements as plain data     -> packages/world (plain TS)
4. Game logic    rules, (later) rooms, quests            -> plain TS
5. Physics       Rapier                                  -> engine-independent
6. Networking    (later) Colyseus                        -> engine-independent
7. Renderer      plain data -> Three.js objects          -> apps/web/src/render ONLY
```

## The engine-free rule

`packages/world` must never create Three.js objects. It outputs plain data:

- **Generated meshes**: positions, indices, normals, UVs, colours (typed arrays) per material, per tile.
- **Placements**: "asset `tree_leafy_m` at (x, y, z), rotation r, scale s, tint c".
- **Colliders**: simple shapes (boxes, cylinders, heightfield) built from the same data.

A thin renderer in `apps/web/src/render` turns that into Three.js meshes and instanced meshes.

Why:

1. The same generator runs on the server later, for multiplayer.
2. It's testable with Vitest without a browser.
3. Swapping Three.js for Babylon.js or PlayCanvas later costs weeks, not a rewrite. Unity or Godot is bigger but still keeps the design and assets.

## Data contracts (sketch, refine in code)

```ts
// packages/world
type LatLon = { lat: number; lon: number };
type Vec2 = [number, number]; // local metres [x, z]: x east, z south (north is -z; y is up)
type TileId = { z: 17; x: number; y: number }; // slippy-map tile, about 220 m in southern Ontario
// The zoom-10 tile local coordinates are measured from. originX/originY = Web Mercator metres of its
// north-west corner; k = cos(latitude at the middle of the tile, in Mercator metres).
type Region = { z: 10; x: number; y: number; originX: number; originY: number; k: number };

// OSM numbers nodes, ways and relations separately, so IDs are always type-qualified.
type OsmId = `${"node" | "way" | "relation"}/${number}`; // e.g. "way/123"

type Tags = Record<string, string>;

// One feature shape, two coordinate types:
//   GeoFeature = FeatureOf<LatLon>  stored and cached (region-independent)
//   Feature    = FeatureOf<Vec2>    projected to local metres when generating; never stored
type FeatureOf<P> =
  | { kind: "building"; osmId: OsmId; footprint: P[]; tags: Tags }
  | { kind: "road"; osmId: OsmId; line: P[]; tags: Tags }
  | { kind: "area"; osmId: OsmId; outline: P[]; holes?: P[][]; tags: Tags }
  | { kind: "point"; osmId: OsmId; at: P; tags: Tags };
type GeoFeature = FeatureOf<LatLon>;
type Feature = FeatureOf<Vec2>;

// One decision per osmId. Never stored per tile.
// MVP: recomputed from tags + rules on load. Later: shared table keyed by osmId.
// Each decision lists the rules that produced it and where the answer came from.
type DecisionSource = "osm" | "rule" | "model" | "llm" | "default";
type BuildingDecision = {
  kind: "building";
  osmId: OsmId;
  type: string; // "house", "retail", "apartments", "shed", ...
  storeys: number;
  heightM: number; // the height tag if present, else storeys x 3 m
  roof: "flat" | "gabled" | "hipped" | "pyramidal";
  colour: ColorName; // picked from the rule's colour list, seeded by the OSM id
  shopSigns: boolean;
  frontBearing?: number; // degrees clockwise from north; region-independent
  rules: string[]; // ids of the rules that matched, in the order applied
  source: DecisionSource;
};
type RoadDecision = {
  kind: "road" | "driveway" | "path";
  osmId: OsmId;
  widthM: number; // the width tag, else lanes x lane width
  sidewalks: "both" | "left" | "right" | "none";
  curbs: boolean;
  markings: "none" | "centre";
  surface: ColorName;
  rules: string[];
  source: DecisionSource;
};
type Decision = BuildingDecision | RoadDecision; // areas and objects join in step 2
// A rule can also answer `kind: "none"`: build nothing (e.g. highway=proposed). Then there is no decision.

type Placement = {
  asset: AssetId; // from the catalog, never a file name
  pos: [number, number, number]; // local metres
  rotY: number;
  scale: number;
  tint?: string;
};

type MeshData = {
  material: string; // a palette colour name; one mesh per tile and material
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors?: Float32Array; // vertex colours (rgb), e.g. foliage shading
  indices: Uint32Array;
};

// Palette (apps/web/public/assets/palette.json): the single source of truth for colours.
// Models use materials named "pal:<ColorName>"; generated meshes use the same names
// for vertex colours. palette.png is generated from this file.
type ColorName = string; // stable, e.g. "foliage.light"; never renamed or removed
type Palette = {
  version: number;
  grid: { cols: number; rows: number; cellPx: number }; // start: 16 x 16, 32 px = 512 x 512
  colors: Record<ColorName, { hex: string; cell: [number, number] }>; // cell = [col, row]; may move
};

// Asset catalog (apps/web/public/assets/catalog.json). Assets are data, not code:
// decisions ask for requirements; the selector picks an ID.
type AssetId = string; // stable, e.g. "tree.leafy.oak.m"; never renamed or deleted
type AssetEntry = {
  id: AssetId;
  file: string; // relative to the assets folder, e.g. "nature/tree_oak_m.glb"
  category: string; // "tree", "bush", "prop.hydrant", "sign.shop", ...
  attributes: Record<string, string | number>; // leafType, genus, size, heightM, climate, style, ...
  default?: boolean; // the category's fallback when nothing else matches
  footprintM: [number, number];
  collider:
    | { type: "box"; size: [number, number, number] }
    | { type: "cylinder"; radius: number; height: number }
    | { type: "none" }; // e.g. grass tufts and flowers you walk through
  triangles: number;
  source: string;
  licence: string; // CC0 preferred
  deprecated?: boolean; // kept so old worlds still resolve; never picked for new choices
};
type AssetCatalog = { version: number; assets: AssetEntry[] };

// What decisions and AI ask for: requirements, never a file.
type AssetRequest = { category: string; want?: Record<string, string | number> };

// Selector (packages/world/src/assets): keep entries in the category that match every
// `want` and aren't deprecated, sort by id, pick one with the seeded RNG
// (seed = OSM id or rounded global position). Nothing matches -> the category default.
declare function selectAsset(catalog: AssetCatalog, req: AssetRequest, seed: string): AssetId;
// The selector indexes the catalog by category (then attributes) once per catalog version,
// so picking among 10,000+ assets stays instant.

// OSM tag rules (packages/world/src/decide/rules/*.json): data, not code.
// Values in `when`: an exact value, a list of values, or "*" (tag present, any value).
// Values in `then` starting with "@" copy that OSM tag's value (e.g. "@building:levels");
// if the tag is missing the field is left out. Rules output requests, never asset IDs.
type Rule = {
  id: string; // stable, e.g. "building.retail"; never renamed
  when: Record<string, string | string[]>; // all must match
  where?: Record<string, string | { lt?: number; lte?: number; gt?: number; gte?: number }>; // geometry facts
  priority?: number; // 100 = copy a real OSM tag; default 0
  then: Record<string, unknown>; // decision fields, palette names, asset requests
};
type RuleSet = {
  version: number;
  domain: "buildings" | "roads" | "areas" | "objects";
  rules: Rule[];
};
// Engine: index rules by tag key; for a feature, collect rules whose keys it has, keep those whose
// `when` and `where` match, and apply them in order: priority (low first), then how specific
// (exact value 2, "*" 1, each `where` fact 2), then id. Later fields override earlier ones.
// A copied tag ("@key") replaces a number only if it parses as a number (levels "2" yes, "two" no).
// Tag values with several entries ("bakery;cafe") match if any entry matches.
// Same input + same rules version = same decision.
// Geometry facts (MVP) look only at features in the same tile; a shop node just across a tile
// edge is not counted. Fix when it matters: compute facts from the tile plus its neighbours.

// Tile source: the ONLY way map data enters the pipeline.
// Every source returns the same format and includes everything that
// touches the tile (roads crossing the edge, buildings sticking out).
type OsmElement = {
  // Overpass `out geom` JSON shape
  type: "node" | "way" | "relation";
  id: number; // combine with type for an OsmId
  tags?: Tags;
  lat?: number; // nodes
  lon?: number;
  geometry?: LatLon[]; // ways
  members?: { type: string; ref: number; role: string; geometry?: LatLon[] }[]; // relations
};
type TileData = {
  id: TileId;
  version: number; // tile format version; pre-built paths use it (tiles/v1/...)
  source: string; // "overpass" | "prebuilt": where the data first came from (a saved file keeps it)
  fetchedAt: string;
  elements: OsmElement[]; // only the fields above are kept; the rest of the response is dropped
};
interface TileSource {
  getTile(id: TileId): Promise<TileData>;
}
// Implementations, by phase:
//   FileTileSource      saved tiles (MVP step 1, and test fixtures). Takes a loader function, so the
//                       world package touches neither the file system nor the DOM.
//   OverpassTileSource  live public Overpass (development, any location). Takes `now` and `fetch`
//                       as options, so tests never use the clock or the network.
//   FallbackTileSource  tries sources in order; moves on only when a tile is "not found"
//                       (MVP: saved tiles first, then Overpass)
//   PrebuiltTileSource  our pre-built tiles from object storage + CDN (launch)
// One Overpass query text (overpassQuery) serves both the live source and `pnpm fixtures`,
// so saved and live tiles always hold the same kinds of things.

// What the cache stores: parsed features for one tile, in lat/lon.
type WorldTile = {
  id: TileId;
  version: number; // bump when parsing or the format changes
  generatedAt: string;
  features: GeoFeature[];
};
// Decisions are looked up by osmId (see Decision). Meshes, placements and
// colliders are generated each time a tile loads and are never stored.

// The two steps the worker runs for each tile:
declare function prepareTile(data: TileData, generatedAt: string): WorldTile; // parse + own/clip
declare function buildTile(tile: WorldTile, region: Region, engine: RuleEngine): TileMeshes;
type TileMeshes = {
  id: TileId;
  key: string; // "17/x/y"
  meshes: MeshData[];
  counts: { buildings: number; roads: number; triangles: number };
};

// Cache interface: defined here, implemented per platform
// (IndexedDB in apps/web/src/cache, files/database in apps/server later).
interface TileCache {
  get(id: TileId): Promise<WorldTile | undefined>;
  put(tile: WorldTile): Promise<void>;
}
```

## Determinism

- One world coordinate system per **region** (the zoom-10 tile containing the entered point): Web Mercator in float64, minus the region's north-west corner, scaled by `cos(latitude of the region centre)` to real metres (formula in `CLAUDE.md`, hard rule 3). The same place always gets the same region, so every machine gets the same positions, and local numbers stay small enough for float32.
- Axes follow Three.js (y up, right-handed): x = east, z = south, so north is −z. Getting this wrong mirrors the map.
- Anything stored or shared (tiles, decisions) uses lat/lon, OSM IDs or bearings, never local x/z.
- Later, when players can travel beyond one region (tile streaming), the world re-centres on the new region (an origin shift). Not needed in the MVP.
- Seeded random only, seeded from stable **global** values (OSM id, tile id, or global Web Mercator coordinates rounded to a grid), never from local x/z. Never `Math.random()` in generation.
- Same `WorldTile` in → same geometry out, on every machine. Tests should check this.

## Later: server/client split

- **Server**: tile lookup, fetching, decisions, profiles (AI) → saves `WorldTile` files plus shared decision/profile tables.
- **Browser**: generates geometry from `WorldTile`, renders, runs physics, syncs players.
- Only player movement and changed objects travel over the network, never the world itself.

## Saved tiles (MVP step 1)

- `pnpm fixtures` runs `scripts/fetch-fixture-tiles.ts`: it finds Albertson Crescent on Overpass by name, fetches every zoom-17 tile that a 300 m circle around it touches, and writes one `TileData` JSON per tile to `packages/world/src/data/fixtures/tiles/`, plus a generated `index.ts` (the centre point, the tile keys, and a loader that imports one tile at a time).
- The web worker reads them through `FileTileSource(loadFixtureTile)` and falls back to `OverpassTileSource` for any other place. Vite splits each tile into its own file, so only the tiles in view are downloaded.
- The same files are test fixtures (`fixtures/tiles.test.ts`). `fixtures/test-tile.json` is a separate hand-made tile for exact-value tests.
- Scalable replacement: these files are the smallest version of "pre-built tiles in storage". At launch the loader points at object storage instead of the bundle; nothing else changes.

## Known limits of the first pass (and where they get fixed)

- **Relations:** the Overpass query fetches multipolygon relations for buildings only. Big relations (lakes, forests) can be huge, so they wait for clipped fetching in roadmap item 2.2.
- **Lines that place things** (`barrier=hedge`, `natural=tree_row`) are fetched but not parsed yet; roadmap item 2.5.
- **Road joins** are simple overlaps with round ends; clean intersections come with curbs and sidewalks (roadmap step 4).
- **Geometry facts** see one tile at a time (see the rule engine note above).
