# 03 — Architecture

## Workspace layout (pnpm workspace)

```
somewhere/
  apps/
    web/                 @somewhere/web: Vite + TypeScript + Three.js + Rapier
      src/main.ts        wires ui, worker and render together
      src/ui/            coordinate input + map-link parser, status panel, map data credits
      src/worker/        Web Worker running @somewhere/world off the main thread
      src/cache/         tile cache storage (IndexedDB)
      src/render/        the ONLY place that imports three.js (view, meshes, assets, instances, sky, lighting)
      src/physics/       Rapier world + colliders from generator data
      src/player/        first-person camera, controls, player capsule
      public/assets/     .glb asset kit + catalog.json + palette.json
    server/              (later) Colyseus rooms + server-side fetch, decisions, tile storage
  packages/
    world/               plain TypeScript, NO three.js, NO DOM
      src/data/          tiling, lat/lon -> metres, parsing, clipping, gap-filling, cache interface
        sources/         map data sources (saved files, Overpass for OSM, Overture for buildings)
        fixtures/        test tile + the saved Albertson Crescent tiles
      src/decide/        rule engine + rules/*.json (tag rules as data); later: trained model, LLM
      src/generator/     roads, ground + areas, buildings, roofs, placements -> plain mesh data + placements
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
// Buildings from Overture Maps keep Overture's own stable id (GERS).
type OvertureId = `overture/${string}`; // e.g. "overture/9bada6c0-13fb-..."
// Every feature id says which source it came from, so ids never clash between sources.
type FeatureId = OsmId | OvertureId;

type Tags = Record<string, string>;

// One feature shape, two coordinate types:
//   GeoFeature = FeatureOf<LatLon>  stored and cached (region-independent)
//   Feature    = FeatureOf<Vec2>    projected to local metres when generating; never stored
type FeatureOf<P> =
  | { kind: "building"; id: FeatureId; footprint: P[]; tags: Tags }
  | { kind: "road"; id: FeatureId; line: P[]; tags: Tags }
  | { kind: "area"; id: FeatureId; outline: P[]; holes?: P[][]; tags: Tags }
  | { kind: "point"; id: FeatureId; at: P; tags: Tags };
type GeoFeature = FeatureOf<LatLon>;
type Feature = FeatureOf<Vec2>;

// One decision per feature id. Never stored per tile.
// MVP: recomputed from tags + rules on load. Later: shared table keyed by feature id.
// Each decision lists the rules that produced it and where the answer came from.
// "osm": a real OSM tag. "overture": a value Overture measured for one of its buildings (its height).
type DecisionSource = "osm" | "overture" | "rule" | "model" | "llm" | "default";
type BuildingDecision = {
  kind: "building";
  id: FeatureId;
  type: string; // "house", "retail", "apartments", "shed", ...
  storeys: number;
  heightM: number; // height of the walls, up to the eaves (the height tag, else storeys x 3 m); a pitched roof rises above it
  roof: "flat" | "gabled" | "hipped" | "pyramidal";
  colour: ColorName; // wall colour: picked from the rule's list, seeded by the feature id
  roofColour: ColorName; // picked the same way from the rule's roofColour list
  shopSigns: boolean;
  frontBearing?: number; // degrees clockwise from north; region-independent
  rules: string[]; // ids of the rules that matched, in the order applied
  source: DecisionSource;
};
type RoadDecision = {
  kind: "road" | "driveway" | "path";
  id: FeatureId;
  widthM: number; // the width tag, else lanes x lane width
  sidewalks: "both" | "left" | "right" | "none";
  curbs: boolean;
  markings: "none" | "centre";
  surface: ColorName;
  rules: string[];
  source: DecisionSource;
};
type AreaDecision = {
  kind: "area";
  id: FeatureId;
  surface: ColorName;
  layer: number; // drawing order where areas overlap: 1 land use, 2 green, 3 hard or sandy, 4 water
  scatter: { asset: AssetRequest; perM2: number }[]; // what seeded scatter plants on it
  rules: string[];
  source: DecisionSource;
};
type ObjectDecision = {
  kind: "object"; // a mapped point that becomes a model: hydrant, stop sign, mapped tree
  id: FeatureId;
  asset: AssetRequest;
  rules: string[];
  source: DecisionSource;
};
type Decision = BuildingDecision | RoadDecision | AreaDecision | ObjectDecision;
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

// Selector (packages/world/src/assets/select.ts): `new AssetSelector(catalog).select(request, seed)`.
//   1. entries in the category that match every `want` and aren't deprecated: a seeded pick
//      (seed = feature id, or the scatter cell for scattered models)
//   2. else entries matching the first `want` that matches anything (wants are listed most
//      important first: leaf type before genus, so an unknown spruce still becomes a conifer)
//   3. else the category default; else a seeded pick from the whole category
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
// Geometry facts for buildings: footprintM2, rectangularity (share of the tightest surrounding
// rectangle the outline fills, 0-1), shopNodesInside, insideLanduse.
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
// A building from a source other than OSM (MVP: Overture Maps), used only where OSM has none.
// Its fields are already turned into OSM-style tags, so the same rules apply.
type ExtraBuilding = {
  id: OvertureId;
  dataset: string; // who traced the outline, e.g. "Microsoft ML Buildings"
  footprint: LatLon[]; // outer outline, first point not repeated
  tags: Tags; // building (the source's class, else "yes"), height, building:levels, name
};
type TileData = {
  id: TileId;
  version: number; // tile format version (2: can carry `buildings`); pre-built paths use it (tiles/v2/...)
  source: string; // "overpass" | "prebuilt": where the OSM data first came from (a saved file keeps it)
  fetchedAt: string;
  elements: OsmElement[]; // OSM data; only the fields above are kept
  // Gap-fill buildings that touch the tile. Whoever saved or built the tile already removed
  // every one that overlaps an OSM building (fillBuildingGaps), so OSM always wins.
  buildings?: ExtraBuilding[];
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
// so saved and live tiles always hold the same kinds of OSM things.
// Overture is not a tile source of its own: it is files, read when a tile is saved or built.
//   overtureBuildings(geojson)          Overture's download -> candidates (skips its copies of OSM buildings)
//   fillBuildingGaps(candidates, osm)   keeps those that do not overlap an OSM building
//   buildingsTouching(buildings, box)   the ones to store in one tile's `buildings`
// OverpassTileSource returns OSM only, so live development places have no gap-fill buildings.

// What the cache stores: parsed features for one tile, in lat/lon.
type WorldTile = {
  id: TileId;
  version: number; // bump when parsing or the format changes
  generatedAt: string;
  features: GeoFeature[];
  // Outlines of neighbours' buildings that reach into this tile. Not built here; they only
  // keep scattered trees and props out of those buildings.
  blockers?: LatLon[][];
};
// Decisions are looked up by feature id (see Decision). Meshes, placements and
// colliders are generated each time a tile loads and are never stored.

// The two steps the worker runs for each tile:
declare function prepareTile(data: TileData, generatedAt: string): WorldTile; // parse (OSM, then gap-fill buildings) + own/clip
// With a selector (made from the asset catalog) buildTile also places models.
declare function buildTile(
  tile: WorldTile,
  region: Region,
  engine: RuleEngine,
  selector?: AssetSelector,
): TileMeshes;
type TileMeshes = {
  id: TileId;
  key: string; // "17/x/y"
  meshes: MeshData[]; // one per palette colour; the renderer joins them into one mesh per tile
  placements: Placement[]; // models: asset id, position, turn, size
  counts: {
    buildings: number;
    roads: number;
    areas: number;
    placements: number;
    triangles: number;
  };
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
- Anything stored or shared (tiles, decisions) uses lat/lon, feature IDs or bearings, never local x/z.
- Later, when players can travel beyond one region (tile streaming), the world re-centres on the new region (an origin shift). Not needed in the MVP.
- Seeded random only, seeded from stable **global** values (feature id, tile id, or global Web Mercator coordinates rounded to a grid), never from local x/z. Never `Math.random()` in generation.
- Same `WorldTile` in → same geometry out, on every machine. Tests should check this.

## Later: server/client split

- **Server**: tile lookup, fetching, decisions, profiles (AI) → saves `WorldTile` files plus shared decision/profile tables.
- **Browser**: generates geometry from `WorldTile`, renders, runs physics, syncs players.
- Only player movement and changed objects travel over the network, never the world itself.

## How a tile is built (steps 1 and 2)

For each feature of the tile, `generator/tile.ts` asks the decide layer what it is and hands the answer to one builder:

| Feature              | Decision         | Builder                     | Result                                                            |
| -------------------- | ---------------- | --------------------------- | ----------------------------------------------------------------- |
| (the tile itself)    | none             | `ground.ts`                 | one flat rectangle in the default ground colour                   |
| area                 | `decideArea`     | `ground.ts` (`addArea`)     | the real shape, holes cut out, on its layer                       |
| road                 | `decideRoad`     | `roads.ts`                  | a flat ribbon of the decided width                                |
| building             | `decideBuilding` | `buildings.ts` + `roofs.ts` | walls with a base band, then a flat cap or a pitched roof         |
| point                | `decideObject`   | `placements.ts`             | a model at that spot                                              |
| (areas with scatter) | their `scatter`  | `placements.ts`             | models on a fixed world grid, kept off roads and out of buildings |

- **Roofs.** Flat: the footprint as the top plus a darker band around the walls. Pitched (hipped, gabled, pyramidal): built on the tightest rectangle around the footprint, ridge along the long side, with an overhang, a cream strip around the eaves and a closed underside. Sizes (overhang, pitch, band heights) are constants in `roofs.ts`; which roof and which colour come from the rules.
- **Scatter.** The world is covered by a fixed grid in global Web Mercator metres (cells about 4.3 m near Toronto). Each cell has one candidate spot, placed and rolled with a seed made from the cell's own numbers. The topmost area at that spot decides what, if anything, grows there. A spot belongs to the one tile that contains it. So the same tree stands in the same place for everyone, whichever tile or region it loads through.
- **Clearance.** A model must keep a share of its own half-width away from walls and road edges (canopies may overhang; trunks may not stand in the road).
- **Mapped signs** are stored as a point on the road line. They are moved to the roadside and turned to face back along the road.

## Saved tiles (MVP step 1)

- `pnpm fixtures` runs `scripts/fetch-fixture-tiles.ts`:
  1. finds Albertson Crescent on Overpass by name and fetches the OSM data of every zoom-17 tile that a 300 m circle around it touches
  2. downloads Overture's buildings for the box around those tiles (Overture's own tool, through `uvx`)
  3. drops every Overture outline that overlaps an OSM building, across the whole area
  4. writes one `TileData` JSON per tile to `packages/world/src/data/fixtures/tiles/`, plus a generated `index.ts` (the centre point, the tile keys, and a loader that imports one tile at a time).
- `pnpm fixtures --buildings-only` keeps the saved OSM data and redoes only steps 2–4. Nothing is written unless every step worked.
- The web worker reads them through `FileTileSource(loadFixtureTile)` and falls back to `OverpassTileSource` for any other place. Vite splits each tile into its own file, so only the tiles in view are downloaded.
- The same files are test fixtures (`fixtures/tiles.test.ts`). `fixtures/test-tile.json` is a separate hand-made tile for exact-value tests.
- Scalable replacement: these files are the smallest version of "pre-built tiles in storage". At launch the loader points at object storage instead of the bundle; nothing else changes.

## Known limits of the first pass (and where they get fixed)

- **Relations:** the Overpass query fetches multipolygon relations for buildings only. Big relations (lakes, forests) can be huge, so they wait for clipped fetching in roadmap item 2.2.
- **Lines that place things** (`barrier=hedge`, `natural=tree_row`) are fetched but not parsed yet; roadmap item 2.5.
- **Road joins** are simple overlaps with round ends; clean intersections come with curbs and sidewalks (roadmap step 4).
- **Pitched roofs** only fit near-rectangular outlines; others are flat until the straight-skeleton roofs of v0.2.
- **Streams and railway tracks** are not fetched or drawn; they are later extras (see [12-roadmap.md](12-roadmap.md)).
- **Sign direction** is a guess (the right-hand side of the road's drawn direction).
- **Geometry facts** see one tile at a time (see the rule engine note above).
- **Gap-fill buildings** are only in saved tiles. A place loaded live from Overpass has OSM's buildings only, until the server-side tile builder exists (see [05-data-sources.md](05-data-sources.md), "Plan by phase").
