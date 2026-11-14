# 10 — Tech stack

## Language and tools

| Thing                            | What it does                                                                                                                                                                                | When |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| **TypeScript**                   | All code. JavaScript plus types; catches mistakes early                                                                                                                                     | MVP  |
| **Node.js** (LTS, 22.6 or newer) | Runs the tooling now; the game server later. Runs the TypeScript scripts in `scripts/` directly (type stripping), so `packages/world` uses `.ts` import extensions and erasable syntax only | MVP  |
| **pnpm**                         | Package manager plus workspace (links `apps/*` and `packages/*`). Don't mix it with npm or yarn                                                                                             | MVP  |
| **Vite**                         | Dev server with instant reload; production build                                                                                                                                            | MVP  |
| **Git + GitHub**                 | Version history and backup                                                                                                                                                                  | MVP  |
| **VS Code**                      | Editor with the best TypeScript support                                                                                                                                                     | MVP  |
| **Biome**                        | Linter + formatter in one (`pnpm lint`, `pnpm fix`); config in `biome.json`                                                                                                                 | MVP  |
| **Vitest**                       | Tests in both packages, especially "same input gives the same world". Test files sit next to the code as `*.test.ts`; rules in `CLAUDE.md`                                                  | MVP  |

## Libraries

| Library                       | Where                                                                                          | When  |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ----- |
| **three** (+ `@types/three`)  | `apps/web/src/render` only (includes its `MapControls` and `Stats` add-ons for the debug view) | MVP   |
| **@dimforge/rapier3d-compat** | `apps/web` (and the server later)                                                              | MVP   |
| **Colyseus**                  | Multiplayer rooms and sync                                                                     | Later |
| **earcut**                    | `packages/world`: triangulate outlines (buildings, lawns, lots)                                | MVP   |
| **polygon-clipping**          | `packages/world`: clip shapes at tile edges, overlap checks                                    | MVP   |
| **comlink**                   | `apps/web`: call the world Web Worker like normal functions                                    | MVP   |
| **idb-keyval**                | `apps/web`: IndexedDB storage for the tile cache                                               | MVP   |

## Data

| Source                                                                                                                                                                                     | When          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Saved tiles (Albertson Crescent), then OpenStreetMap via Overpass API, through the `TileSource` interface                                                                                  | MVP           |
| Tile cache: interface in `@somewhere/world`, IndexedDB in the browser (server storage later)                                                                                               | MVP           |
| Elevation tiles                                                                                                                                                                            | Later         |
| Mapillary (+ Mapilio / KartaView / Panoramax)                                                                                                                                              | Later         |
| Licensed aerial imagery, city tree data, LiDAR                                                                                                                                             | Later         |
| Open-Meteo weather                                                                                                                                                                         | Optional      |
| Beta: server caches tiles fetched once from Overpass. Launch: builder (self-hosted Overpass or PostGIS from the OSM planet) + pre-built tiles in object storage (e.g. Cloudflare R2) + CDN | Beta / launch |

## World building

| Part                                                         | When  |
| ------------------------------------------------------------ | ----- |
| Tile system (zoom-17 tiles, about 220 m in southern Ontario) | MVP   |
| Decision layer: tags + rules + defaults                      | MVP   |
| Generator (roads, ground, buildings)                         | MVP   |
| Placement rules                                              | MVP   |
| Seeded randomness                                            | MVP   |
| Profiles (facades, courts, ...)                              | Later |
| Trained decision model, LLM fallback                         | Later |

## Assets

| Thing                                                                                      | When                                     |
| ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| Blender (+ Blender MCP), or ready-made CC0 models                                          | Optional, for making or tweaking the kit |
| `.glb` models                                                                              | MVP                                      |
| Asset catalog (`catalog.json`) + selector in `@somewhere/world`                            | MVP                                      |
| Palette (`palette.json`, generates `palette.png`); colours by name                         | MVP                                      |
| Asset build step (`gltf-transform`): bakes `pal:` colours into the shared palette material | When the kit grows                       |
| Style kits (suburban, estate, plaza, ...)                                                  | Later                                    |

## AI (later, never required to build a world)

| Use                     | What                                                 |
| ----------------------- | ---------------------------------------------------- |
| Vision AI (e.g. Claude) | Street and aerial photos → profiles                  |
| Small trained model     | Unlabelled building types                            |
| LLM                     | Odd cases, restyles, quests, characters              |
| Text-to-3D              | Landmarks, player-requested props (made once, saved) |

## Hosting (later)

| Thing              | Options                                 |
| ------------------ | --------------------------------------- |
| Web app (static)   | Vercel, Netlify, Render                 |
| Game + tile server | Node on Render or similar               |
| Storage / database | Tiles, shared decisions table, profiles |
| Docker             | Tile build script, game server          |

## Package manager alternatives (for reference)

npm (default), **pnpm** (chosen), Yarn, Bun. Pick one and never mix them.
