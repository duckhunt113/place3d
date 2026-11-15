# 02 — MVP (single player, first person)

## Goal

Enter coordinates → a 300 m area appears in our stylized look → you can walk around it in first person.

## In the MVP

1. **Location input**: latitude/longitude box, or paste a Google Maps link. We only read the coordinates out of the URL and never use Google's map data. Every map tile within 300 m of that point is loaded, and you can walk wherever a tile is loaded.
2. **Map data**: through the tile source: saved Albertson Crescent tiles first, then live Overpass for any other place. OpenStreetMap supplies everything it has; Overture Maps supplies building outlines where OpenStreetMap has none (most houses around Albertson Crescent). Flat ground (no terrain yet).
3. **Tiles and caching**: fetch and build the area tile by tile from the start; tiles fetched from the map server are saved on the device (IndexedDB), so an area loads without the network the second time (see [04-pipeline.md](04-pipeline.md)). A loading card shows progress tile by tile; a tile that fails shows as plain ground and is tried again.
4. **Decisions**: OSM tags + simple rules + safe defaults. No AI.
5. **Generated in code**:
   - roads, curbs, sidewalks, lawns, parks, water
   - parking lots with painted stall lines
   - **buildings as simple boxes** from real footprints (OSM's, else Overture's): the mapped or measured height when there is one, else 2 storeys for houses and 1 for shops
   - roofs: a simple pitched (hipped) roof on houses whose outline is close to a rectangle; a flat roof with a darker cap on everything else
   - colour by building type
6. **Pre-made kit (small)**: about 5 trees, a bush, a few street props and a blank shop-sign board, in the `art-style` look, all listed in the asset catalog.
7. **Placement**: trees from OSM points plus a scattered fill in yards and parks; a shop-sign board on each retail building with the real shop name drawn on it.
8. **Player**: first-person camera at 1.7 m eye height; WASD + mouse look (pointer lock); Shift to run; Space to jump. Capsule collisions with buildings and trees (Rapier). A free view (button or F key) flies above the area instead.
9. **Look**: bright sky, soft shadows, warm sunlight.
10. **Credit**: "© OpenStreetMap contributors, Overture Maps Foundation" visible on screen.

## Not in the MVP

- Multiplayer, and player avatar models (only needed once others can see you)
- Terrain and hills
- Any AI: decisions, profiles, restyles, characters
- Mapillary / street photos
- Building kit pieces (storefront bays, windows, doors, pillars, awnings)
- Complex roofs (following L-shapes and other irregular outlines)
- Streams, creeks and railway tracks
- Utility poles, wires, cars, extra props
- Bigger areas loading as you walk
- Mobile controls

## Build order

| Step | Result                                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1    | Projection + tile grid; tile source with saved Albertson tiles, then Overpass; coordinates in → plain grey roads and building boxes appear |
| 2    | Style pass: colours, roofs, grass, trees, sky, shadows                                                                                     |
| 3    | First-person controls + Rapier physics                                                                                                     |
| 4    | Shop name signs, parking lines, sidewalks                                                                                                  |
| 5    | Saved tile cache (IndexedDB), so revisited areas load instantly                                                                            |
| 6    | Finish line: performance budgets, credits, repo audit                                                                                      |

All six steps are done. The item-by-item plan for each step, with checkboxes, is in [14-mvp-roadmap.md](14-mvp-roadmap.md).

## Done when

You enter the coordinates for Albertson Crescent in Lorne Park (Mississauga), recognise the street and the nearby plaza, and walk to the plaza.

## Earlier MVP draft (original notes)

The first MVP list was bigger. The current scope above replaced it after deciding on "no multiplayer for the MVP" and "first person". Differences from the current scope:

- **Pre-made kit:** the draft had 5 trees and a few street props, **plus a basic building kit**: walls, windows, doors, storefront bay, sign board.
- **Placement:** the draft had storefronts and signs with real shop names, trees from OSM plus scattered fill, **and kit pieces on walls**.
- **Player:** the draft had a **first-person avatar**: walk, run, jump, and collisions with buildings and trees (Rapier).
- **AI roadmap:** the draft described the MVP as "no AI (prove the world **and multiplayer** work)".

If step 4 goes quickly, the basic building kit is the first thing to pull back into the MVP.

## Keep it multiplayer-ready

- The world must build **identically** from the same data every time: seeded randomness only, never `Math.random()`.
- Keep data fetching and caching as a separate piece; it becomes the server later.
- Keep player code separate from world code.
- The `packages/world` package never imports Three.js (see [03-architecture.md](03-architecture.md)).
