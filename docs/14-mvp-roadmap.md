# 14 — MVP roadmap (start to finish)

The build plan for the MVP (v0.1), in the order to build it. What the MVP includes is in [02-mvp.md](02-mvp.md); what comes after it is in [12-roadmap.md](12-roadmap.md).

**Next up:** 1.1 Shared types.

How to use this file:

- Work on one item at a time, top to bottom. Each item is small enough to finish and commit on its own.
- Tick an item only when it works and `pnpm lint && pnpm typecheck && pnpm test` pass.
- Update the "Next up" line in the same change.
- Every `packages/world` module gets its `*.test.ts` next to it (see `CLAUDE.md`, Testing).

## Overview

| Step | Result                                               | Status      |
| ---- | ---------------------------------------------------- | ----------- |
| 0    | Foundations: workspace, rules, art, models           | Done        |
| 1    | Coordinates in → grey roads and building boxes       | Not started |
| 2    | Style pass: colours, ground, trees, sky, shadows     | Not started |
| 3    | Walking: first-person controls and collisions        | Not started |
| 4    | Details: sidewalks, curbs, parking lines, shop signs | Not started |
| 5    | Saved tile cache: revisited areas load instantly     | Not started |
| 6    | Finish line: checks and the "done when" walk         | Not started |

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

- [ ] 1.1 Shared types: `types.ts` with the contracts from [03-architecture.md](03-architecture.md) (`LatLon`, `Vec2`, `TileId`, `OsmId`, `GeoFeature`/`Feature`, `Decision`, `MeshData`, `Placement`, `TileData`, `TileSource`, `WorldTile`, `TileCache`, catalog, palette and rule types)
- [ ] 1.2 Seeded RNG: `util/rng.ts`. Same seed string (e.g. `way/123`) → same numbers, on every machine
- [ ] 1.3 Projection: `data/project.ts`. Region = zoom-10 tile of the entered point; lat/lon → local metres with the formula in `CLAUDE.md` hard rule 3. Tests: north is −z, east is +x, a known distance comes out in true metres
- [ ] 1.4 Tile grid: `data/tiles.ts`. Lat/lon → zoom-17 tile id, a tile's bounding box, and the tiles a 300 m circle touches
- [ ] 1.5 Saved tiles: `scripts/fetch-fixture-tiles.mjs` fetches the Albertson Crescent tiles from Overpass once (with a `User-Agent`) and writes them to `data/fixtures/`, one `TileData` JSON per tile
- [ ] 1.6 Tile sources: `data/sources/file.ts` (`FileTileSource`, reads the saved tiles through a loader function, so the world package touches neither the file system nor the DOM) and `data/sources/overpass.ts` (`OverpassTileSource`: one `out geom` query per tile box, everything that touches the tile). Tests use saved responses only, never the network
- [ ] 1.7 Parsing: `data/parse.ts`. `OsmElement` → `GeoFeature` (buildings, roads, areas, points) with type-qualified ids; drop duplicates and broken shapes
- [ ] 1.8 Tile ownership and clipping: `data/clip.ts`. Each building belongs to the tile holding its centroid; roads and areas are clipped at tile edges, and the two halves line up
- [ ] 1.9 Rule engine: `decide/engine.ts` and `decide/facts.ts`. Applies `rules/*.json` (indexed by tag key; precedence as in hard rule 12) and computes the geometry facts (`footprintM2`, `insideLanduse`, `shopNodesInside`). First use: building and road decisions
- [ ] 1.10 Generator, first pass: `generator/roads.ts` (flat ribbons along each road, width from its decision, simple overlapping joins), `generator/buildings.ts` (walls raised from the footprint, flat roof via `earcut`), `generator/ground.ts` (flat ground per tile), `generator/merge.ts` (one mesh per tile and material). Test: same input twice → identical output
- [ ] 1.11 Public API: `index.ts` exports one entry point that takes tile data and returns meshes for a tile

**Web app (`apps/web/src`)**

- [ ] 1.12 Location input: `ui/` with a latitude/longitude box and a Google Maps link parser (coordinates only). The parser gets the first web test, so add Vitest to the web app in the same change
- [ ] 1.13 Worker: `worker/world.worker.ts` runs the world package off the main thread, called through `comlink`
- [ ] 1.14 Renderer, first pass: `render/scene.ts` and `render/meshes.ts` turn `MeshData` into Three.js meshes; a simple fly-around debug camera; an FPS counter; the OSM credit on screen

**Done when:** you enter Albertson Crescent's coordinates and see grey roads and building boxes that match the street layout on openstreetmap.org, with north the right way round.

## Step 2 — Style pass

Goal: the area looks like the `art-style` references.

- [ ] 2.1 Colours by name: the generator tags surfaces with palette names; the renderer resolves them from `palette.json`
- [ ] 2.2 Ground areas: `generator/ground.ts` fills lawns, parks, water, sand and parking surfaces to their real outlines, using `rules/areas.json`
- [ ] 2.3 Building look: colour from the rule's colour list (seeded pick by OSM id), flat roofs with a darker cap; a simple gabled roof on small houses only if it's easy
- [ ] 2.4 Asset selector: `assets/select.ts`. Indexes the catalog by category, matches the request's `want`, picks with the seeded RNG, skips `deprecated`, falls back to the category default
- [ ] 2.5 Placements: `generator/placements.ts`. Mapped trees, tree rows, hedges and props from `rules/objects.json`; seeded scatter in parks and lawns (seeded by global position); nothing lands on a road or inside a building
- [ ] 2.6 Model rendering: `render/assets.ts` loads only the `.glb` files a tile uses and swaps each `pal:` material for its palette colour; `render/instances.ts` draws repeats as instanced meshes
- [ ] 2.7 Sky and light: `render/sky.ts` and `render/lighting.ts` with the starting values in the `art-style` skill (warm sun, one shadow-casting light, soft shadows, light fog)
- [ ] 2.8 Compare screenshots with the reference images and tune; update the numbers in the skill if they change

**Done when:** Albertson Crescent shows coloured houses, grass, water, trees where the map has them, a blue sky and soft shadows, and it reads as the same world as the reference images.

## Step 3 — Walking

Goal: explore the area on foot, in first person.

- [ ] 3.1 Collider data: `generator/colliders.ts`. Boxes for buildings, trunk cylinders from each asset's catalog collider, flat ground
- [ ] 3.2 Physics world: `physics/` starts Rapier and builds the colliders from that data, never from visual meshes
- [ ] 3.3 Player: `player/` with a capsule, eye height 1.7 m, WASD, mouse look with pointer lock, Shift to run, Space to jump
- [ ] 3.4 Spawn: start at the entered coordinates on clear ground; the debug camera becomes a development-only toggle

**Done when:** you can walk along Albertson Crescent, buildings and tree trunks stop you, and you can walk under the leaves.

## Step 4 — Details

Goal: the details that make the place recognisable up close.

- [ ] 4.1 Curbs and sidewalks: `generator/sidewalks.ts`. 15 cm curbs and sidewalk strips with panel joints, where the road rules say so
- [ ] 4.2 Road markings: centre lines on main roads, slightly above the road surface
- [ ] 4.3 Parking: `generator/parking.ts` paints stall lines inside parking areas
- [ ] 4.4 Shop signs: one sign board per shop found inside a retail building, on the wall facing the road or parking; `render/signs.ts` draws the shop's name on the `sign:face` material in our own font (names only, no logos)
- [ ] 4.5 Small details (optional): grass tufts and flower patches along curbs and in lawns

**Done when:** at the Lorne Park plaza you can read the shop names from across the parking lot, the lot has stalls, and the streets have curbs and sidewalks.

## Step 5 — Saved tile cache

Goal: an area you've visited loads instantly the next time.

- [ ] 5.1 Storage: `cache/` implements `TileCache` with `idb-keyval`, keyed by tile id and tile version
- [ ] 5.2 Loading flow: cache first, then the tile source, then save; a request already in flight for a tile is shared, not repeated
- [ ] 5.3 Loading screen with per-tile progress; a failed tile shows as plain ground and is retried
- [ ] 5.4 Old tiles: a tile saved with an older version is fetched again

**Done when:** reloading the same location makes no map requests (check the browser's Network tab), and a location outside the saved tiles loads through Overpass and is instant on the second visit.

## Step 6 — Finish line

- [ ] 6.1 Performance: within the budgets in `CLAUDE.md` hard rule 7 (draw calls, triangles, one shadow light, capped pixel ratio)
- [ ] 6.2 Credit and data rules: "© OpenStreetMap contributors" is always visible; nothing uses Google data
- [ ] 6.3 Run the `repo-audit` skill and fix what it finds
- [ ] 6.4 Update the status lines in `CLAUDE.md` and `docs/README.md`
- [ ] 6.5 **The MVP test:** enter the coordinates for Albertson Crescent, recognise the street and the nearby plaza, and walk to the plaza
- [ ] 6.6 Tag the commit `v0.1`

## Not in this roadmap

Everything in the "Not in the MVP" list of [02-mvp.md](02-mvp.md): multiplayer, terrain, AI, Mapillary, building kit pieces, complex roofs, poles and cars, tile streaming and mobile controls. Putting the game online is also after the MVP; the build is static files, so it can be hosted whenever you choose.
