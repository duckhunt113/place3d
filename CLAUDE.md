# CLAUDE.md — Somewhere

Somewhere is a web app. You enter coordinates and a radius, and the real area inside that radius is rebuilt from open map data (OpenStreetMap, plus Overture Maps building outlines where OpenStreetMap has none) as a bright, kid-friendly, stylized 3D world (faceted low-poly trees, smooth simplified buildings and streets; see the `art-style` skill). You then explore it in first person in the browser. Multiplayer and AI features come after the MVP.

**Status:** the MVP (v0.1) is built. Enter coordinates and walk around Albertson Crescent in first person, with coloured houses and pitched roofs, real ground surfaces, trees and street props, a blue sky and shadows. Streets have clean junctions, curbs, sidewalks and centre lines; parking lots have stalls; shops carry their real names on sign boards. Buildings, tree trunks and props are solid, and a free view (the F key) flies above the area. Tiles fetched from the map server are kept on the device, so a place loads without the network the second time. What comes next is in `docs/12-roadmap.md` (the MVP's build plan: `docs/14-mvp-roadmap.md`). Full project details live in `docs/` (start at `docs/README.md`).

## Current scope: MVP only

These are in scope (see `docs/02-mvp.md`):

- single player, first person, flat ground, every map tile within 300 m of the entered point (you can walk wherever a tile is loaded)
- map data through a tile source (saved Albertson Crescent tiles first, then live Overpass), with a tile cache: OSM for everything, plus Overture Maps building outlines where OSM has no building
- decisions from tags, rules and defaults
- generated roads, curbs, sidewalks, lawns, parks, water, and parking lots with stall lines
- box buildings in their own colours: a simple pitched (hipped) roof on houses whose outline is close to a rectangle, flat roofs with a darker cap on everything else, plain name signs on shops
- about 5 trees and a few props
- Rapier collisions, bright lighting, and the map data credits on screen (OpenStreetMap, Overture Maps)

Do **not** add any of these unless asked:

- multiplayer or an avatar
- terrain
- AI of any kind
- Mapillary
- building kit pieces or complex roofs (roofs that follow L-shapes and other irregular outlines)
- streams, creeks and railway tracks (planned as later extras; see `docs/12-roadmap.md`)
- poles, wires or cars
- tile streaming
- mobile controls

The MVP is done when you can recognise Albertson Crescent and the nearby Lorne Park plaza (Mississauga) and walk to the plaza.

## Structure (pnpm workspace)

```
apps/web/            @somewhere/web: Vite + TypeScript + three + @dimforge/rapier3d-compat
  src/main.ts        wires ui, worker and render together; never imports three itself
  src/ui/            coordinate input + map-link parser, status panel, loading card, map data credits (plain DOM)
  src/worker/        Web Worker that runs @somewhere/world off the main thread (through comlink)
  src/cache/         tile cache storage (IndexedDB through idb-keyval), implements the world package's cache interface
  src/render/        the ONLY place allowed to import three: view (walking + free cameras), meshes (one mesh per tile), assets + instances (models), signs (shop names), sky, lighting
  src/physics/       the ONLY place allowed to import Rapier: the physics world, built from the world package's collider data
  src/player/        walker (movement logic, tested), area (where the player may walk), input (keyboard + mouse), player (ties them to the eyes)
  public/assets/     .glb asset kit + catalog.json (asset catalog) + palette.json (colours)
packages/world/      @somewhere/world: plain TypeScript, engine-free
  src/data/          tiling (and the tile margin), lat/lon -> metres, parsing, clipping, gap-filling, the tile loader (shipped tiles -> cache -> network), cache interface (no storage code)
    sources/         map data sources: saved files, Overpass (OSM), Overture (buildings)
    fixtures/        test-tile.json (small hand-made test tile); tiles/ = the saved Albertson Crescent tiles (generated)
  src/decide/        rule engine, geometry facts; rules/*.json = OSM tag rules as data (buildings, roads, areas, objects)
  src/generator/     roads (the street plan), sidewalks, parking, ground and areas, buildings, roofs, placements, signs, colliders, spawn -> plain mesh data + placements + collider shapes
  src/assets/        asset catalog types + selector (requirements -> asset ID)
  src/util/          seeded RNG, geometry maths, flat shapes (join, cut away, overlap, thick lines)
apps/server/         (later) Colyseus rooms + server-side fetch, decisions and tile storage
scripts/             project scripts (build-palette.mjs, fetch-fixture-tiles.ts)
docs/                design docs: read the relevant one before big changes
```

## Commands

```bash
pnpm install
pnpm dev                                   # run the web app (http://localhost:5173)
pnpm test                                  # Vitest in all packages
pnpm typecheck                             # TypeScript checks, each package with its own settings
pnpm lint                                  # Biome: lint + format check (no changes)
pnpm fix                                   # Biome: auto-fix lint issues and format files
pnpm palette                               # regenerate palette.png + docs/palette-preview.html from palette.json
pnpm palette:check                         # validate palette.json and check palette.png is up to date (writes nothing)
pnpm fixtures                              # fetch the saved Albertson Crescent tiles: OSM from Overpass + Overture buildings (needs internet and uv; run rarely)
pnpm fixtures --buildings-only             # keep the saved OSM data, refresh only the Overture buildings
pnpm build
pnpm --filter @somewhere/web add <lib>
pnpm --filter @somewhere/world add <lib>
```

Use **pnpm only**. Never use npm or yarn to install or add packages (use `pnpm dlx` instead of `npx`), and never create a `package-lock.json` or `yarn.lock`.

## Hard rules

1. **`packages/world` never imports three.js, Rapier or DOM APIs.** It outputs plain data: typed-array meshes, placements and collider shapes. Only `apps/web/src/render` turns that data into Three.js objects, and only `apps/web/src/physics` imports Rapier (`src/player` talks to it through the small `Character` interface). This keeps generation testable, lets it run on the server later, and makes the renderer swappable.
2. **Deterministic generation.** Never use `Math.random()` in generation code. Use the seeded RNG from `packages/world/src/util`, seeded from stable **global** values (feature id such as `way/123` or `overture/<id>`, tile id, or global Web Mercator coordinates rounded to a grid), never from local x/z, which depend on the region origin. The same input must give the same world on every machine. Add or keep tests for this.
3. **Real units and projection.** 1 unit = 1 metre. Axes match Three.js (y up, right-handed): x = east, z = south, so north is −z.
   - **Region:** the zoom-10 map tile containing the entered point (about 28 km across in southern Ontario). The same place always gets the same region; never derive it from the player's position, the session or the device.
   - **Projection:** compute Web Mercator (EPSG:3857) coordinates `X, Y` in float64, then `x = (X − X0) · k` and `z = −(Y − Y0) · k`, where `(X0, Y0)` is the region's north-west corner and `k = cos(latitude of the region's centre)` corrects Mercator stretch to real metres. Everyone in a world or room uses the same region.
   - Keep local coordinates small (within one region) so float32 GPU positions stay precise.
   - **Anything stored or shared** (tiles, decisions) uses lat/lon, feature IDs or bearings, never local x/z; project when generating.
   - Later, travel beyond one region needs an origin shift (re-centre on the new region). Not in the MVP.
   - **Reference sizes:** lane 3.5 m, curb 0.15 m, door 2.1 m, storey 3 m, eye height 1.7 m.
4. **Tiles.**
   - Cache by fixed zoom-17 map tiles (about 220 m across in southern Ontario; 306 m × cos(latitude)), never by "circle around a point".
   - Each building belongs to one owner tile, chosen by its centroid.
   - Lines are clipped at tile edges.
   - **A tile knows its close surroundings.** Its map data reaches `TILE_MARGIN_M` (30 m) past its edges, and the stored tile keeps a `context`: every road piece inside that margin, neighbours' buildings that reach in, and neighbours' points close by. Context is never built as such; it shapes what is built (junctions, curbs, sidewalks, sign spots) so neighbouring tiles agree along their shared edge. Everything drawn is then cut exactly at the tile's edge. Anything spaced along a road (sidewalk joints, parking stalls) is counted from the start of the whole road (`offsetM`), never from where a tile happens to cut it.
   - Decisions are keyed by feature ID, never stored per tile. Feature IDs always say their source, so they never clash: OSM IDs are type-qualified (`node/1`, `way/123`, `relation/9`, because OSM numbers each type separately) and Overture buildings are `overture/<GERS id>`.
   - Saved tiles carry a `version` and a timestamp.
   - **How a tile is found** (`createTileLoader`, `packages/world/src/data/loader.ts`): tiles that ship with the app first, then the device's cache, then the network; what the network returns is saved. Shipped tiles are never cached, so changing them always shows at once. A cached tile in an older format, or older than 30 days, is fetched again; if that fails the old one is still used. Two requests for the same tile at the same time share one fetch. Bump `WORLD_TILE_VERSION` when the stored tile's shape changes and `TILE_FORMAT_VERSION` when the fetched data's does.
   - **A tile that cannot be loaded is still a tile:** plain ground, solid to walk on, replaced when a retry succeeds. Nothing may depend on every tile loading.
   - **Map data only comes through the `TileSource` interface** (`packages/world/src/data`). `getTile(id)` returns that tile's data in one normalized format: its OSM elements (Overpass `out geom` JSON), including everything that _touches_ the tile, not only what lies inside, plus any gap-fill buildings, the source name and the fetch time. Nothing else calls Overpass or any other map service.
   - **Two map data sources, OSM first.** OSM supplies everything it has. Overture Maps supplies building outlines only, and only where OSM has no building: an outline that overlaps an OSM building (shared part at least 20% of the smaller one) is dropped. This is done once, when a tile is saved or built (`fillBuildingGaps`), never at play time. See `docs/05-data-sources.md`.
   - **Other sources speak OSM.** A source other than OSM turns its fields into OSM-style tags in its own module under `data/sources/` (Overture: `building`, `height`, `building:levels`, `name`), so the same rules decide what things become. Add any future source the same way: its own module, source-qualified IDs, OSM-style tags, OSM wins on overlap.
   - **Overture is files, not a service.** Scripts and (later) the tile builder download an area with Overture's own tool; the browser never contacts Overture.
   - **Sources by phase:** saved files (MVP step 1; the same files are the test fixtures; OSM + Overture buildings) → live Overpass (development; OSM only, so places whose houses are missing from OSM show without them) → beta: the server fetches each missing tile from Overpass **once**, adds Overture buildings for it, and stores it → launch: pre-built tiles in object storage behind a CDN, with a builder for tiles that don't exist yet (OSM planet file + Overture building files).
   - **Never put Overpass or any live query service in front of players.** A self-hosted query service (Overpass, or PostGIS loaded from the OSM planet file) is allowed only as the back-end builder for missing tiles; its load grows with new places visited, not with players.
   - Everyone in a room gets tiles from the same source and version.
5. **Decision order:** OSM tag > rules > (later: trained model > LLM) > safe default. OSM tags always win. For a gap-fill building, Overture's measured values (such as height) arrive as tags and count the same way; its decision records `overture` as the source.
6. **If the shape comes from the map, generate it. If it's the same everywhere, use a pre-made `.glb` asset.** AI (later) only describes things as parameters; code always builds the geometry.
7. **Performance budgets:**
   - draw calls under 200 (desktop) / 100 (mobile)
   - triangles under 1–2 M / 300–500 k
   - one shadow-casting light, pixel ratio capped at 1.5–2.
   - Merge generated geometry per tile chunk and material, and instance repeated assets. In practice: the world package outputs one mesh per tile and palette colour; the renderer joins them into **one mesh per tile** with the colour written into each corner (vertex colours), and flattens each model the same way so every kind of model is one instanced draw per tile. Everything shares one material.
   - Do heavy generation in a Web Worker.
   - Physics uses simple colliders, never visual meshes: a box (or a box per wall) for a building, the catalog's box or cylinder for a model, and a grid of ground heights per tile. Never one huge shape: physics loses precision on shapes kilometres wide.
8. **Kid-safe.** Anything user-typed or AI-generated must be filtered (relevant once prompts or chat exist).
9. **Asset conventions:**
   - `.glb`; follow the `art-style` skill (faceted foliage, smooth everything else)
   - **Colours by name:** `apps/web/public/assets/palette.json` is the single source of truth for colours (name → hex + grid cell, plus a `version`). Models colour their faces with materials named `pal:<colour name>` (e.g. `pal:foliage.light`), never by a fixed position on the palette image. Generated surfaces take their vertex colours from the same names. Colour names are never renamed or removed; positions may move.
   - `palette.png` is **generated** from `palette.json` by `pnpm palette` (pure colour squares, no labels or lines; 512×512, a 16×16 grid of 32 px cells, one category per row with spare slots). Never edit it by hand; change `palette.json` and re-run. The script also validates names, hex values and cells, and writes a labelled `docs/palette-preview.html`.
   - **Special materials:** the only non-`pal:` material allowed is `sign:face`, the face of a sign board where the game draws text (e.g. a shop name); the renderer replaces it with a generated texture. Add new special materials only by recording them here.
   - **MVP:** the renderer swaps each `pal:` material for its palette colour at load time. **When the kit grows:** an asset build step (`gltf-transform`) bakes `pal:` names into UVs on the one shared palette material, so the palette can grow or be rearranged by re-running it. Restyle palettes (e.g. winter) keep the same names. A world or room uses one palette version for everyone.
   - origin at base centre, facing +Z (glTF default), 1 unit = 1 m
   - `.glb` files in `apps/web/public/assets/` are the source of truth; no source art (`.blend` etc.) in the repo
   - only use third-party models with a licence that allows use in the game (CC0 preferred)
   - file names like `tree_leafy_m.glb`, `prop_hydrant.glb`, `kit_storefront_bay.glb`
   - **Model concepts:** `docs/concepts/<catalog ID>.png` (one per model). When making a model, open only its own concept; the rules win if they disagree.
   - **Asset catalog:** every `.glb` has one entry in `apps/web/public/assets/catalog.json` (ID, file, category, attributes, footprint, collider, triangles, source, licence). Generator, decision and AI code **never hard-code file names**: they ask for requirements (`AssetRequest`, e.g. category `tree`, `leafType: needleleaved`) and the selector in `packages/world/src/assets` picks a matching asset ID with the seeded RNG.
   - **Asset IDs are stable** (lowercase, dotted, e.g. `tree.leafy.oak.m`): never rename or delete one; mark it `deprecated` instead. The catalog has a `version`; a world or room uses one catalog version for everyone, so adding assets never changes existing worlds.
10. **Scalable by default.** Every design choice (library, data format, storage, API, architecture) must keep working as the project grows: many players, any location worldwide, the server running the same code, and the planned AI prompts, objectives and multiplayer, without a rewrite. Before choosing, ask: does this still work at 1,000× the players or data, for the whole world, and on the server? Shortcuts are fine for the MVP only if they sit behind an interface that can be swapped later, and the matching doc names the scalable replacement. "Scalable" means _can grow without a rewrite_, not _built for scale now_: don't add infrastructure before it's needed.
11. **Data, not code: rules ask, the catalog answers.** Built to scale to thousands of rules and 10,000+ assets without code changes.
    - **OSM tag rules are data** in `packages/world/src/decide/rules/*.json` (one file per domain). A small generic engine applies them. Never write tag-specific `if/else` in code; add or change a rule instead. The `osm-tag-rules` skill explains the format.
    - **Rules output requests, never assets:** a rule says _what kind of thing_ (e.g. `{ category: "tree", want: { leafType: "needleleaved" } }`); the catalog selector picks _which model_. Rules grow with the kinds of things OSM describes (hundreds); the catalog grows with variety (thousands). Adding models never needs new rules.
    - **Precedence:** a real OSM tag copied with `"@key"` (priority 100) > the most specific matching rule > less specific rules > the domain's catch-all (`"*"`). The engine orders matching rules by `priority` (default 0), then by how specific they are (an exact value counts 2, `"*"` counts 1, each `where` fact counts 2), then by rule `id`; later rules override earlier fields. Use a priority between 1 and 99 only when a rule must beat another equally specific one, and say why in the rule's `note`.
    - **Not drawn:** a rule whose `then` sets `kind: "none"` means "build nothing for this" (e.g. proposed roads). Leaving things out is also data, never an `if` in code.
    - **Geometry-based rules** use named facts computed in code (`footprintM2`, `rectangularity`, `insideLanduse`, `shopNodesInside`, …) with thresholds kept in the rule's `where`, never in code.
    - **Look is data too:** wall and roof colour lists (`colour`, `roofColour`), roof shape (`roof`), ground surface and stacking order (`surface`, `layer`) and scatter densities (`scatter`) all live in the rules. Generator files hold only shape-building code and its fixed sizes (overhang, roof pitch, band heights).
    - **Indexed, never scanned:** the engine indexes rules by tag key; the selector indexes the catalog by category (then attributes).
    - **Versioned and pinned:** rules, catalog and palette each have a `version`; a world or room uses one version of each for everyone.
    - **Validated by tests:** every rules file is checked (unique ids, known palette names, known catalog categories, no two rules with the same `when` and priority).

## Testing (Vitest)

- **Where:** put tests next to the code they test, named `<file>.test.ts` (e.g. `src/util/rng.ts` → `src/util/rng.test.ts`). No separate `test/` folders. A few small modules in one folder may share one test file named after the folder (`data/sources/sources.test.ts`, `generator/generator.test.ts`).
- **What must have tests:** every module in `packages/world` (projection, tiling, clipping, decisions, generators, seeded RNG). Rendering, player controls and visuals in `apps/web` are checked by eye; test only plain logic there (e.g. parsing a Google Maps link).
- **Determinism:** generators get a test that runs the same input twice and expects identical output (`toEqual`). Never use `Math.random()`, `Date.now()` or the real clock in code under test; pass seeds and timestamps in.
- **No network:** tests never call Overpass or any other service; code that fetches takes its `fetch` function as an option, and tests pass a fake one. Use saved tiles in a `fixtures/` folder next to the code (e.g. `src/data/fixtures/`), in the same format the saved-file tile source reads, and keep them small (one tile per file). Scripts that run an outside download tool also accept an already-downloaded file (`pnpm fixtures --overture-file <file>`), so they can be tried without the network.
- **Two kinds of fixtures:** `src/data/fixtures/test-tile.json` is a small hand-made tile for exact-value tests; change it only together with the tests that use it. `src/data/fixtures/tiles/` holds the real saved tiles and its `index.ts`, all written by `pnpm fixtures`: never edit them by hand (Biome skips the folder), and tests on them check general things only (they load, cover the area, build the same way twice), because real map data changes when it's re-fetched.
- **Bugs:** every bug fix adds a test that fails without the fix.
- **Assertions:** check real values with tolerances where maths is involved (`toBeCloseTo`), not just "is defined" or "doesn't throw".
- **Speed:** the whole suite should run in a few seconds; no sleeps or timers.
- **Web tests:** `apps/web` uses Vitest too, for plain logic only (`src/ui/location.test.ts`, `src/player/walker.test.ts`, `src/cache/tiles.test.ts`, `src/render/sign-text.test.ts`). Keep that logic in files that don't import three or touch the DOM, so the tests need no browser. Anything that needs the browser takes it as a parameter (the cache takes its storage, sign text takes its measuring function). Walking is tested against the real physics engine, which runs in Node: speeds, walls, tree trunks, jumping, slopes.
- **Done means green:** before calling any change finished, run `pnpm lint && pnpm typecheck && pnpm test` and fix any failure. Never delete, skip (`.skip`) or weaken a failing test to make it pass unless the behaviour was intentionally changed, and say so when you do.

## Working style

- TypeScript `strict`. Keep modules small and data-oriented; put types for world data in `packages/world`.
- **Rules and catalog changes** need no code: edit `decide/rules/*.json` or `catalog.json`, keep ids stable, run the tests.
- **Approved libraries for these jobs** (use them; don't hand-roll or add alternatives without recording the reason here):
  - `earcut` (world): triangulate outlines (buildings, lawns, parking lots)
  - `polygon-clipping` (world): clip shapes at tile edges, unions/intersections, overlap checks. Use it through `util/shapes.ts` (`unite`, `join`, `cutAway`, `overlap`), which retries when the library gives up. Never round coordinates before handing shapes to it: rounding turns edges that match exactly into edges that almost match, which is what makes it fail.
  - `@fontsource/fredoka` (web): the lettering for shop signs, bundled so every machine draws the same letters (SIL Open Font License)
  - `comlink` (web): call the world Web Worker like normal async functions
  - `idb-keyval` (web): IndexedDB storage behind the tile cache
- **New dependencies:** must suit their package (in `packages/world`: no DOM, three.js or Rapier) and pass hard rule 10; add them to `docs/10-tech-stack.md` in the same change.
- **Imports in `packages/world`:** relative imports end in `.ts`, JSON imports use `with { type: "json" }`, and only erasable TypeScript syntax is allowed (no `enum`, `namespace` or constructor parameter properties; `erasableSyntaxOnly` enforces it). This lets plain Node run the world code without a build step (scripts now, the server later).
- **Scripts** live in `scripts/` as ES modules (the root `package.json` has `"type": "module"`). Scripts that use world code are TypeScript, run with `node --experimental-strip-types`, and import the world package's own functions rather than copying them (the fixture fetch uses the game's own Overpass query). The fixture script needs `uv` installed, because it runs Overture's download tool through `uvx`; nothing else in the project needs Python.
- **Generated files** are never edited by hand; change their source and re-run the command: `palette.png` and `docs/palette-preview.html` (`pnpm palette`), `packages/world/src/data/fixtures/tiles/` (`pnpm fixtures`). When `TILE_FORMAT_VERSION` goes up, the saved tiles must be fetched again with `pnpm fixtures` (the tests say so).
- **One generator file per kind of shape, not per kind of thing.** New geometry gets a file (`roofs.ts` for roofs); a new thing that reuses existing geometry gets a rule instead (a stream is a ribbon like a road, so it needs no `water.ts`).
- **Streets are worked out together, as flat shapes.** `generator/roads.ts` thickens every road line into a ribbon (`ribbonPieces`), joins them into one driving surface, and cuts that out of wider ribbons to get the curb and the sidewalk. Never draw one road at a time: overlapping pieces flicker and junctions come out wrong. New things along a road (a bike lane, a verge) are one more ribbon width in that plan.
- **Where roads meet is found by shared points.** Two road lines meet where they have the same point (to the centimetre), as in OSM. A road end's roundness, and the gap in a centre line, come from what else passes through that point.
- **Signs hang in bays.** A wall is divided into equal bays that depend only on the wall; a sign goes in the bay nearest its shop, and the smallest id wins a bay two shops want. Because bays never depend on which signs exist, two tiles sharing a building agree without talking to each other.
- **Scatter is seeded by a fixed world grid.** Scattered models use one candidate spot per cell of a global Web Mercator grid, seeded by the cell's numbers, and each spot belongs to the one tile that contains it. Never scatter from local x/z or per tile.
- **Three.js stays in `apps/web/src/render`:** `main.ts`, `ui/`, `worker/` and `player/` talk to the renderer through the small interface `createWorldView` returns (the player hands over an eye position and two angles, nothing more).
- **Directions are measured clockwise from north.** A yaw or bearing of 0 looks north (−z) and a quarter turn looks east (+x), everywhere: spawn points, the player, the sun. Only `render/` converts to three.js's own angles.
- **Ground height comes from one function.** Anything that stands on the ground asks `groundHeightAt(x, z)` in `generator/ground.ts` (flat for now). Terrain later changes that one answer and the ground grid's heights, not the callers.
- **Two views.** Walking is the game; the free view is the fly-around camera for looking at the area from above. `main.ts` owns which one is on (the panel button or the F key). The player stays where they are while the free view is on.
- **The walkable area is the loaded tiles**, not a circle: `player/area.ts` keeps the player on the rectangles of ground the loaded tiles cover.
- **Draw calls and triangles are shown on screen** next to the FPS counter (shadow pass included). Check them against hard rule 7 after any change that adds geometry or models. Measured on the Albertson Crescent area: about 120 draw calls and 0.85 M triangles on foot, 190 and 1.15 M with the whole area in the free view.
- **Another Overpass server:** set `VITE_OVERPASS_URL` when starting or building the web app (for example a self-hosted one). Without it the public server is used.
- **How walking feels is data in one place:** the `PLAYER` settings in `apps/web/src/player/walker.ts` (speeds, jump, sizes). Movement runs in fixed 1/60 s steps, so it is the same at any frame rate.
- **Biome** is the only linter and formatter (config in `biome.json`: 2 spaces, double quotes, semicolons, 100-char lines). Don't add ESLint or Prettier. Run `pnpm fix` before committing; don't silence a lint rule without a short comment saying why (`// biome-ignore lint/<rule>: <reason>`).
- **Build plan:** `docs/14-mvp-roadmap.md` lists the MVP work in order. Unless asked otherwise, work on its "Next up" item; when an item is done and green, tick it and update "Next up" in the same change.
- **Skill hand-over folder:** a Claude session that can't write into `.claude/` puts updated skills in `claude-skill-updates/<skill>/SKILL.md` at the repo root. It is gitignored (so Biome skips it too) and temporary: copy each file into `.claude/skills/<skill>/`, then delete the folder.
- **New conventions go in the rules.** When we adopt a new convention (naming, folder layout, tooling, workflow), add it to this file in the same change, and update the matching doc in `docs/`.
- Keep the docs in `docs/` in sync when a design decision changes.
- Multiplayer (later) uses **Colyseus**.
- Don't commit secrets or API keys. Use `.env.local` (gitignored).
