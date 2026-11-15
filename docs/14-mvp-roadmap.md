# 14 — MVP roadmap (start to finish)

The build plan for the MVP (v0.1), in the order to build it. What the MVP includes is in [02-mvp.md](02-mvp.md); what comes after it is in [12-roadmap.md](12-roadmap.md).

**Next up:** nothing is left to build. Two things are yours to do: 6.5 (walk to the plaza yourself) and 6.6 (tag the commit).

How to use this file:

- Work on one item at a time, top to bottom. Each item is small enough to finish and commit on its own.
- Tick an item only when it works and `pnpm lint && pnpm typecheck && pnpm test` pass.
- Update the "Next up" line in the same change.
- Every `packages/world` module gets its `*.test.ts` next to it (see `CLAUDE.md`, Testing).

## Overview

| Step | Result                                               | Status |
| ---- | ---------------------------------------------------- | ------ |
| 0    | Foundations: workspace, rules, art, models           | Done   |
| 1    | Coordinates in → grey roads and building boxes       | Done   |
| 2    | Style pass: colours, ground, trees, sky, shadows     | Done   |
| 3    | Walking: first-person controls and collisions        | Done   |
| 4    | Details: sidewalks, curbs, parking lines, shop signs | Done   |
| 5    | Saved tile cache: revisited areas load instantly     | Done   |
| 6    | Finish line: checks and the "done when" walk         | Done   |

## Step 0 — Foundations (done)

- [x] pnpm workspace: `@somewhere/web` (Vite + TypeScript + three + Rapier) and `@somewhere/world` (engine-free)
- [x] Checks: Biome, TypeScript, Vitest, `palette:check`, GitHub CI
- [x] Rules and design docs: `CLAUDE.md`, docs 01–13
- [x] Palette: `palette.json` (colours by name), generated `palette.png`
- [x] Asset kit: 14 models in `apps/web/public/assets/`, each with a `catalog.json` entry and a concept image
- [x] OSM tag rules as data: `packages/world/src/decide/rules/*.json`, validated by `rules.test.ts`
- [x] Skills: `art-style`, `osm-tag-rules`, `repo-audit`

## Step 1 — Roads and boxes

Goal: enter coordinates and see plain grey roads and building boxes in the right places.

**World package (`packages/world/src`)**

- [x] 1.1 Shared types: `types.ts` with the contracts from [03-architecture.md](03-architecture.md) (`LatLon`, `Vec2`, `TileId`, `OsmId`, `GeoFeature`/`Feature`, `Decision`, `MeshData`, `Placement`, `TileData`, `TileSource`, `WorldTile`, `TileCache`, catalog, palette and rule types)
- [x] 1.2 Seeded RNG: `util/rng.ts`. Same seed string (e.g. `way/123`) → same numbers, on every machine
- [x] 1.3 Projection: `data/project.ts`. Region = zoom-10 tile of the entered point; lat/lon → local metres with the formula in `CLAUDE.md` hard rule 3. Tests: north is −z, east is +x, a known distance comes out in true metres
- [x] 1.4 Tile grid: `data/tiles.ts`. Lat/lon → zoom-17 tile id, a tile's bounding box, and the tiles a 300 m circle touches
- [x] 1.5 Saved tiles: `scripts/fetch-fixture-tiles.ts` (`pnpm fixtures`) fetches the Albertson Crescent tiles from Overpass once (with a `User-Agent`) and writes them to `data/fixtures/tiles/`, one `TileData` JSON per tile, plus a generated `index.ts` that loads them
- [x] 1.6 Tile sources: `data/sources/file.ts` (`FileTileSource`, reads the saved tiles through a loader function, so the world package touches neither the file system nor the DOM; `FallbackTileSource` tries saved tiles first, then Overpass) and `data/sources/overpass.ts` (`OverpassTileSource`: one `out geom` query per tile box, everything that touches the tile). Tests use saved responses only, never the network
- [x] 1.7 Parsing: `data/parse.ts`. `OsmElement` → `GeoFeature` (buildings, roads, areas, points) with type-qualified ids; drop duplicates and broken shapes
- [x] 1.8 Tile ownership and clipping: `data/clip.ts`. Each building belongs to the tile holding its centroid; roads and areas are clipped at tile edges, and the two halves line up
- [x] 1.9 Rule engine: `decide/engine.ts` and `decide/facts.ts`. Applies `rules/*.json` (indexed by tag key; precedence as in hard rule 11) and computes the geometry facts (`footprintM2`, `insideLanduse`, `shopNodesInside`). First use: building and road decisions (`decide/decisions.ts`)
- [x] 1.10 Generator, first pass: `generator/roads.ts` (flat ribbons along each road, width from its decision, simple overlapping joins with round ends), `generator/buildings.ts` (walls raised from the footprint, flat roof via `earcut`), `generator/ground.ts` (flat ground per tile), `generator/mesh.ts` (one mesh per tile and material). Test: same input twice → identical output
- [x] 1.11 Public API: `index.ts` exports `prepareTile` (tile data → parsed, clipped features) and `buildTile` (features → meshes for a tile), plus the tile sources and tile grid

**Web app (`apps/web/src`)**

- [x] 1.12 Location input: `ui/` with a latitude/longitude box and a map-link parser (Google Maps and OpenStreetMap links; coordinates are read from the link's text only, nothing is fetched). The parser has the first web test, so Vitest is added to the web app
- [x] 1.13 Worker: `worker/world.worker.ts` runs the world package off the main thread, called through `comlink`
- [x] 1.14 Renderer, first pass: `render/view.ts` and `render/meshes.ts` turn `MeshData` into Three.js meshes; a simple fly-around debug camera (north up); an FPS counter; the OSM credit on screen

**Gap-fill buildings (added after the first real run showed OpenStreetMap has no houses here)**

- [x] 1.15 Overture buildings in code: `data/sources/overture.ts` reads Overture's download, `data/gaps.ts` keeps only outlines that don't overlap an OSM building, tiles carry them as `buildings` (tile format 2), features have source-qualified ids (`way/123`, `overture/<id>`), and `pnpm fixtures` downloads and merges them. Tested against a stand-in download
- [x] 1.16 Saved Overture buildings: `pnpm fixtures --buildings-only` was run; the saved tiles hold 318 Overture houses (all traced by Microsoft, almost all with a measured height)

**Done when:** you enter Albertson Crescent's coordinates and see grey roads and building boxes, houses included, that match the street layout on openstreetmap.org, with north the right way round. (Streets, the plaza and the houses: checked.)

## Step 2 — Style pass

Goal: the area looks like the `art-style` references.

- [x] 2.1 Colours by name: the generator tags surfaces with palette names; the renderer resolves them from `palette.json`
- [x] 2.2 Ground areas: `generator/ground.ts` fills lawns, parks, woods, parking and other mapped surfaces to their real outlines, using `rules/areas.json`. Each rule gives a `layer`, so overlapping areas stack in a fixed order (land use, green, hard surfaces, water). Still to come with the first lake: fetching water and wood relations clipped to the tile
- [x] 2.3 Building look: wall and roof colours from the rules' lists (seeded pick by feature id), a light band at the foot of the walls, flat roofs with a darker cap, and a hipped roof with an overhang on houses that are close to a rectangle (`generator/roofs.ts`; the `rectangularity` fact and a rule decide)
- [x] 2.4 Asset selector: `assets/select.ts`. Indexes the catalog by category, matches the request's `want`, picks with the seeded RNG, skips `deprecated`, falls back to the category default
- [x] 2.5 Placements: `generator/placements.ts`. Mapped points from `rules/objects.json` (hydrants, stop signs, bins, benches, mapped trees) and seeded scatter in parks, woods and yards on a fixed world grid; nothing lands on a road or inside a building. Hedges and tree rows along lines wait for the "line" kind (a later extra)
- [x] 2.6 Model rendering: `render/assets.ts` loads only the `.glb` files a tile uses and turns each `pal:` material into its palette colour; `render/instances.ts` draws repeats as instanced meshes
- [x] 2.7 Sky and light: `render/sky.ts` and `render/lighting.ts` (warm sun, one shadow-casting light, soft shadows, light haze)
- [x] 2.8 Compare screenshots with the reference images and tune; the numbers in the `art-style` skill are updated

**Done when:** Albertson Crescent shows coloured houses with roofs, grass, woods, scattered trees, a blue sky and soft shadows, and it reads as the same world as the reference images. (Checked in a test browser with the real tiles; look at it yourself with `pnpm dev`.)

## Step 3 — Walking

Goal: explore the area on foot, in first person.

- [x] 3.1 Collider data: `generator/colliders.ts`. Boxes for buildings (one box, or one per wall for L-shapes), trunk cylinders and prop boxes from each asset's catalog collider, and a flat grid of ground heights per tile
- [x] 3.2 Physics world: `physics/` starts Rapier and builds the colliders from that data, never from visual meshes
- [x] 3.3 Player: `player/` with a capsule, eye height 1.7 m, WASD, mouse look with pointer lock, Shift to run, Space to jump. Walking 4 m/s, running 8 m/s
- [x] 3.4 Spawn: `generator/spawn.ts` starts the player on the street nearest to the entered coordinates. The fly-around camera stays as the **free view** (panel button or F). Walking uses the close haze, and the shadow area follows the player so nearby shadows are sharp

Left for later, by choice: house walls stay blank (no painted windows or doors).

**Done when:** you can walk along Albertson Crescent, buildings and tree trunks stop you, and you can walk under the leaves.

## Step 4 — Details

Goal: the details that make the place recognisable up close.

- [x] 4.1 Curbs and sidewalks: `generator/roads.ts` works out all streets of a tile together as flat shapes (clean junctions, no overlapping pieces); `generator/sidewalks.ts` raises 15 cm curbs and sidewalk strips with panel joints, where the road rules say so. Tiles now fetch a 30 m margin around themselves and keep it as `context`, so curbs and sidewalks line up across tile edges
- [x] 4.2 Road markings: centre lines on main roads, slightly above the road surface, with a gap at junctions
- [x] 4.3 Parking: `generator/parking.ts` paints stall lines along parking aisles, and along the long sides of small lots with no mapped aisle
- [x] 4.4 Shop signs: one sign board per named shop, on the wall of its building that faces the parking lot or the street (`generator/signs.ts`); `render/signs.ts` draws the shop's name on the board's `sign:face` in our own font (names only, no logos)
- [ ] 4.5 Small details (optional, left for later): grass tufts and flower patches along curbs and in lawns

Left for later, by choice: curbs you can bump into (the walking ground is still flat), rounded street corners, crosswalks and stop lines.

**Done when:** at the Lorne Park plaza you can read the shop names from across the parking lot, the lot has stalls, and the streets have curbs and sidewalks.

## Step 5 — Saved tile cache

Goal: an area you've visited loads instantly the next time.

- [x] 5.1 Storage: `cache/tiles.ts` implements `TileCache` with `idb-keyval`, keyed by tile version and tile id
- [x] 5.2 Loading flow: `data/loader.ts` in the world package. Tiles that ship with the app first (never cached), then the cache, then the tile source, then save; a request already in flight for a tile is shared, not repeated
- [x] 5.3 Loading card with per-tile progress; a failed tile shows as plain ground and is retried after 5, 20 and 60 seconds
- [x] 5.4 Old tiles: a tile saved with an older version is fetched again (and deleted from storage); so is one older than 30 days

**Done when:** reloading the same location makes no map requests (check the browser's Network tab), and a location outside the saved tiles loads through Overpass and is instant on the second visit.

## Step 6 — Finish line

- [x] 6.1 Performance: within the desktop budgets in `CLAUDE.md` hard rule 7. Measured: about 120 draw calls and 0.85 M triangles on foot, 190 and 1.15 M with the whole area in the free view; one shadow light; pixel ratio capped at 2. The counts are shown on screen next to the FPS counter
- [x] 6.2 Credit and data rules: the map data credits (OpenStreetMap, Overture Maps) are always visible; nothing uses Google Maps or Street View data (a pasted Google Maps link is only read for its coordinates)
- [x] 6.3 Run the `repo-audit` skill and fix what it finds
- [x] 6.4 Update the status lines in `CLAUDE.md` and `docs/README.md`
- [ ] 6.5 **The MVP test** (yours): enter the coordinates for Albertson Crescent, recognise the street and the nearby plaza, and walk to the plaza. The walkable area is now every loaded tile, so the plaza is reachable on foot
- [ ] 6.6 Tag the commit `v0.1` (yours): `git tag v0.1` after committing

## Not in this roadmap

Everything in the "Not in the MVP" list of [02-mvp.md](02-mvp.md): multiplayer, terrain, AI, Mapillary, building kit pieces, complex roofs, streams and railway tracks, poles and cars, tile streaming and mobile controls. The small additions left out on purpose are listed as "Later extras" in [12-roadmap.md](12-roadmap.md). Putting the game online is also after the MVP; the build is static files, so it can be hosted whenever you choose.
