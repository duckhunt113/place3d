# CLAUDE.md — Somewhere

Somewhere is a web app. You enter coordinates and a radius, and the real area inside that radius is rebuilt from OpenStreetMap as a bright, kid-friendly, low-poly 3D world. You then explore it in first person in the browser. Multiplayer and AI features come after the MVP.

**Status:** planning / pre-MVP. Full project details live in `docs/` (start at `docs/README.md`). If the workspace isn't scaffolded yet, create it to match the structure below (pnpm workspace, Vite + TypeScript web app, engine-free `@somewhere/world` package).

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
apps/web/            Vite + TypeScript + three + @dimforge/rapier3d-compat
  src/render/        the ONLY place allowed to import three
  src/player/        first-person controls, camera, physics capsule
  public/assets/     .glb asset kit
packages/world/      @somewhere/world: plain TypeScript, engine-free
  src/data/          Overpass fetch, tile cache, lat/lon -> metres
  src/decide/        tags > rules > defaults
  src/generator/     roads, ground, buildings -> plain mesh data + placements + colliders
  src/util/          seeded RNG, maths
apps/server/         (later) Colyseus + tile generation
docs/                design docs: read the relevant one before big changes
```

## Commands

```bash
pnpm install
pnpm dev                                   # run the web app (http://localhost:5173)
pnpm test                                  # Vitest in all packages
pnpm build
pnpm --filter web add <lib>
pnpm --filter @somewhere/world add <lib>
```

Use **pnpm only**. Never use npm or yarn to install or add packages (use `pnpm dlx` instead of `npx`), and never create a `package-lock.json` or `yarn.lock`.

## Hard rules

1. **`packages/world` never imports three.js, Rapier or DOM APIs.** It outputs plain data: typed-array meshes, placements and collider shapes. Only `apps/web/src/render` turns that data into Three.js objects. This keeps generation testable, lets it run on the server later, and makes the renderer swappable.
2. **Deterministic generation.** Never use `Math.random()` in generation code. Use the seeded RNG from `packages/world/src/util`, seeded from stable values (OSM id, world position, tile id). The same input must give the same world on every machine. Add or keep tests for this.
3. **Real units.** 1 unit = 1 metre; local metres from lat/lon on one shared world grid with a fixed per-region origin (never per session or per player), so tiles line up. Axes match Three.js (y up, right-handed): x = east, z = south, so north is −z. Reference sizes:
   - lane 3.5 m, curb 0.15 m
   - door 2.1 m, storey 3 m
   - eye height 1.7 m.
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
    - `.glb`, one shared palette texture, low-poly
    - origin at base centre, consistent forward axis
    - names like `tree_leafy_m.glb`, `prop_hydrant.glb`, `kit_storefront_bay.glb`.

## Working style

- TypeScript `strict`. Keep modules small and data-oriented; put types for world data in `packages/world`.
- Write Vitest tests for world-package logic (projection, tiling, decisions, determinism).
- Keep the docs in `docs/` in sync when a design decision changes.
- Don't commit secrets or API keys. Use `.env.local` (gitignored).
