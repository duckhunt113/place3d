# 10 — Tech stack

## Language and tools

| Thing | What it does | When |
|---|---|---|
| **TypeScript** | All code. JavaScript plus types; catches mistakes early | MVP |
| **Node.js** (LTS) | Runs the tooling now; the game server later | MVP |
| **pnpm** | Package manager plus workspace (links `apps/*` and `packages/*`). Don't mix it with npm or yarn | MVP |
| **Vite** | Dev server with instant reload; production build | MVP |
| **Git + GitHub** | Version history and backup | MVP |
| **VS Code** | Editor with the best TypeScript support | MVP |
| **Vitest** | Tests, especially "same input gives the same world" | MVP |

## Libraries

| Library | Where | When |
|---|---|---|
| **three** (+ `@types/three`) | `apps/web` only | MVP |
| **@dimforge/rapier3d-compat** | `apps/web` (and the server later) | MVP |
| **Colyseus** (or Socket.IO) | Multiplayer rooms and sync | Later |

## Data

| Source | When |
|---|---|
| OpenStreetMap via Overpass API | MVP |
| Tile cache (local, then server storage) | MVP |
| Elevation tiles | Later |
| Mapillary (+ Mapilio / KartaView / Panoramax) | Later |
| Licensed aerial imagery, city tree data, LiDAR | Later |
| Open-Meteo weather | Optional |
| Geofabrik extracts / self-hosted Overpass (Docker) | At launch |

## World building

| Part | When |
|---|---|
| Tile system (zoom-17 tiles, about 220 m in southern Ontario) | MVP |
| Decision layer: tags + rules + defaults | MVP |
| Generator (roads, ground, buildings) | MVP |
| Placement rules | MVP |
| Seeded randomness | MVP |
| Profiles (facades, courts, ...) | Later |
| Trained decision model, LLM fallback | Later |

## Assets

| Thing | When |
|---|---|
| Blender (+ Blender MCP) | MVP (small kit) |
| `.glb` models | MVP |
| Shared palette texture | MVP |
| Style kits (suburban, estate, plaza, ...) | Later |

## AI (later, never required to build a world)

| Use | What |
|---|---|
| Vision AI (e.g. Claude) | Street and aerial photos → profiles |
| Small trained model | Unlabelled building types |
| LLM | Odd cases, restyles, quests, characters |
| Text-to-3D | Landmarks, player-requested props (made once, saved) |

## Hosting (later)

| Thing | Options |
|---|---|
| Web app (static) | Vercel, Netlify, Render |
| Game + tile server | Node on Render or similar |
| Storage / database | Tiles, shared decisions table, profiles |
| Docker | Self-hosted Overpass, tile server, game server |

## Package manager alternatives (for reference)

npm (default), **pnpm** (chosen), Yarn, Bun. Pick one and never mix them.
