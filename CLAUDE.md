# CLAUDE.md — Somewhere

Somewhere is a web app. You enter coordinates and a radius, and the real area inside that radius is rebuilt from OpenStreetMap as a bright, kid-friendly, stylized 3D world (faceted low-poly trees, smooth simplified buildings and streets; see the `art-style` skill). You then explore it in first person in the browser. Multiplayer and AI features come after the MVP.

**Status:** MVP in progress. The workspace is set up (pnpm, Vite + TypeScript web app, engine-free `@somewhere/world` package); world code starts with MVP step 1. Full project details live in `docs/` (start at `docs/README.md`).

## Current scope: MVP only

These are in scope (see `docs/02-mvp.md`):

- single player, first person, a fixed 300 m radius, flat ground
- OSM data from Overpass, with a tile cache
- decisions from tags, rules and defaults
- generated roads, curbs, sidewalks, lawns, parks, water, and parking lots with stall lines
- box buildings: flat roofs, gabled roofs on small houses only if easy, colour by type, plain name signs on shops
- about 5 trees and a few props
- Rapier collisions, bright lighting, and the OSM credit on screen

Do **not** add any of these unless asked:

- multiplayer or an avatar
- terrain
- AI of any kind
- Mapillary
- building kit pieces or complex roofs
- poles, wires or cars
- tile streaming
- mobile controls

The MVP is done when you can recognise Albertson Crescent and the nearby Lorne Park plaza (Mississauga) and walk to the plaza.

## Structure (pnpm workspace)

```
apps/web/            @somewhere/web: Vite + TypeScript + three + @dimforge/rapier3d-compat
  src/ui/            coordinate input, loading screen, OSM credit (plain DOM)
  src/worker/        Web Worker that runs @somewhere/world off the main thread
  src/cache/         tile cache storage (IndexedDB), implements the world package's cache interface
  src/render/        the ONLY place allowed to import three
  src/physics/       Rapier world + colliders built from generator data
  src/player/        first-person controls, camera, player capsule
  public/assets/     .glb asset kit + CREDITS.md
packages/world/      @somewhere/world: plain TypeScript, engine-free
  src/data/          Overpass fetch, tiling, lat/lon -> metres, cache interface (no storage code)
  src/decide/        tags > rules > defaults
  src/generator/     roads, ground, buildings -> plain mesh data + placements + colliders
  src/util/          seeded RNG, maths
apps/server/         (later) Colyseus rooms + server-side fetch, decisions and tile storage
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
pnpm build
pnpm --filter @somewhere/web add <lib>
pnpm --filter @somewhere/world add <lib>
```

Use **pnpm only**. Never use npm or yarn to install or add packages (use `pnpm dlx` instead of `npx`), and never create a `package-lock.json` or `yarn.lock`.

## Hard rules

1. **`packages/world` never imports three.js, Rapier or DOM APIs.** It outputs plain data: typed-array meshes, placements and collider shapes. Only `apps/web/src/render` turns that data into Three.js objects, and only `apps/web/src/physics` and `src/player` import Rapier. This keeps generation testable, lets it run on the server later, and makes the renderer swappable.
2. **Deterministic generation.** Never use `Math.random()` in generation code. Use the seeded RNG from `packages/world/src/util`, seeded from stable **global** values (OSM id, tile id, or global Web Mercator coordinates rounded to a grid), never from local x/z, which depend on the region origin. The same input must give the same world on every machine. Add or keep tests for this.
3. **Real units and projection.** 1 unit = 1 metre. Axes match Three.js (y up, right-handed): x = east, z = south, so north is −z.
   - **Region:** the zoom-10 map tile containing the entered point (about 28 km across in southern Ontario). The same place always gets the same region; never derive it from the player's position, the session or the device.
   - **Projection:** compute Web Mercator (EPSG:3857) coordinates `X, Y` in float64, then `x = (X − X0) · k` and `z = −(Y − Y0) · k`, where `(X0, Y0)` is the region's north-west corner and `k = cos(latitude of the region's centre)` corrects Mercator stretch to real metres. Everyone in a world or room uses the same region.
   - Keep local coordinates small (within one region) so float32 GPU positions stay precise.
   - **Stored tiles keep lat/lon,** so the cache doesn't depend on the region; project when generating.
   - **Reference sizes:** lane 3.5 m, curb 0.15 m, door 2.1 m, storey 3 m, eye height 1.7 m.
4. **Tiles.**
   - Cache by fixed zoom-17 map tiles (about 220 m across in southern Ontario; 306 m × cos(latitude)), never by "circle around a point".
   - Each building belongs to one owner tile, chosen by its centroid.
   - Lines are clipped at tile edges.
   - Decisions are stored by OSM ID, never per tile.
   - Saved tiles carry a `version` and a timestamp.
5. **Decision order:** OSM tag > rules > (later: trained model > LLM) > safe default. OSM tags always win.
6. **If the shape comes from the map, generate it. If it's the same everywhere, use a pre-made `.glb` asset.** AI (later) only describes things as parameters; code always builds the geometry.
7. **Performance budgets:**
   - draw calls under 200 (desktop) / 100 (mobile)
   - triangles under 1–2 M / 300–500 k
   - one shadow-casting light, pixel ratio capped at 1.5–2.
   - Merge generated geometry per tile chunk and material, and instance repeated assets.
   - Do heavy generation in a Web Worker.
   - Physics uses simple colliders, never visual meshes.
8. **Data and legal:**
   - Never use Google Maps, Street View or 3D Tiles data. Their terms forbid it.
   - Always show "© OpenStreetMap contributors".
   - Identify the app to Overpass and respect its fair-use limits; cache aggressively.
   - Draw shop **names** in our own style, never real logos.
   - Private homes stay generic; only public places get detailed.
9. **Kid-safe.** Anything user-typed or AI-generated must be filtered (relevant once prompts or chat exist).
10. **Asset conventions:**
    - `.glb`, one shared palette texture; follow the `art-style` skill (faceted foliage, smooth everything else)
    - origin at base centre, facing +Z (glTF default), 1 unit = 1 m
    - `.glb` files in `apps/web/public/assets/` are the source of truth; no source art (`.blend` etc.) in the repo
    - only use third-party models with a licence that allows use in the game (CC0 preferred), and record source + licence for each in `apps/web/public/assets/CREDITS.md`
    - names like `tree_leafy_m.glb`, `prop_hydrant.glb`, `kit_storefront_bay.glb`.
11. **Scalable by default.** Every design choice (library, data format, storage, API, architecture) must keep working as the project grows: many players, any location worldwide, the server running the same code, and the planned AI prompts, objectives and multiplayer, without a rewrite. Before choosing, ask: does this still work at 1,000× the players or data, for the whole world, and on the server? Shortcuts are fine for the MVP only if they sit behind an interface that can be swapped later, and the matching doc names the scalable replacement. "Scalable" means _can grow without a rewrite_, not _built for scale now_: don't add infrastructure before it's needed.

## Testing (Vitest)

- **Where:** put tests next to the code they test, named `<file>.test.ts` (e.g. `src/util/rng.ts` → `src/util/rng.test.ts`). No separate `test/` folders.
- **What must have tests:** every module in `packages/world` (projection, tiling, clipping, decisions, generators, seeded RNG). Rendering, player controls and visuals in `apps/web` are checked by eye; test only plain logic there (e.g. parsing a Google Maps link).
- **Determinism:** generators get a test that runs the same input twice and expects identical output (`toEqual`). Never use `Math.random()`, `Date.now()` or the real clock in code under test; pass seeds and timestamps in.
- **No network:** tests never call Overpass or any other service. Use saved responses in a `fixtures/` folder next to the code (e.g. `src/data/fixtures/albertson.json`), and keep fixtures small (one tile).
- **Bugs:** every bug fix adds a test that fails without the fix.
- **Assertions:** check real values with tolerances where maths is involved (`toBeCloseTo`), not just "is defined" or "doesn't throw".
- **Speed:** the whole suite should run in a few seconds; no sleeps or timers.
- **Empty-suite flag:** `packages/world` runs Vitest with `--passWithNoTests` only until its first test exists; remove the flag in the same change that adds that test.
- **Done means green:** before calling any change finished, run `pnpm lint && pnpm typecheck && pnpm test` and fix any failure. Never delete, skip (`.skip`) or weaken a failing test to make it pass unless the behaviour was intentionally changed, and say so when you do.

## Working style

- TypeScript `strict`. Keep modules small and data-oriented; put types for world data in `packages/world`.
- **Approved libraries for these jobs** (use them; don't hand-roll or add alternatives without recording the reason here):
  - `earcut` (world): triangulate outlines (buildings, lawns, parking lots)
  - `polygon-clipping` (world): clip shapes at tile edges, unions/intersections, overlap checks
  - `comlink` (web): call the world Web Worker like normal async functions
  - `idb-keyval` (web): IndexedDB storage behind the tile cache
- **New dependencies:** must suit their package (in `packages/world`: no DOM, three.js or Rapier) and pass hard rule 11; add them to `docs/10-tech-stack.md` in the same change.
- **Biome** is the only linter and formatter (config in `biome.json`: 2 spaces, double quotes, semicolons, 100-char lines). Don't add ESLint or Prettier. Run `pnpm fix` before committing; don't silence a lint rule without a short comment saying why (`// biome-ignore lint/<rule>: <reason>`).
- **New conventions go in the rules.** When we adopt a new convention (naming, folder layout, tooling, workflow), add it to this file in the same change, and update the matching doc in `docs/`.
- Keep the docs in `docs/` in sync when a design decision changes.
- Multiplayer (later) uses **Colyseus**.
- Don't commit secrets or API keys. Use `.env.local` (gitignored).
