# 04 — World generation pipeline

Input: **coordinates + radius**

## Server side (only for tiles not cached yet)

> In the MVP these steps run in the browser or a tiny local script. They move to `apps/server` later.

**1. Tile lookup**

- Work out which grid tiles (zoom-17 map tiles, about 220 m each in southern Ontario) the circle touches. A 300 m radius touches roughly 9–16 tiles.
- Load cached tiles instantly.
- Only missing or outdated tiles continue to step 2.
- If another request is already generating a tile, wait for it instead of generating it twice. With multiplayer, that request can come from another room.

**2. Fetch data (per missing tile)**

All map data comes through the `TileSource` interface (see [03-architecture.md](03-architecture.md)): saved files in MVP step 1, live Overpass during development, pre-built tiles from storage at launch. The rest of the pipeline never knows which one answered.

- OSM: roads, buildings, shops, areas, trees, poles, fences, courts.
- Elevation tiles for terrain height (later).
- Mapillary photos facing buildings, plus detected signs and poles (later).
- Optional extras (later):
  - a city tree inventory, LiDAR
  - licensed aerial imagery
  - your own game-layer additions.

**3. Prepare**

- Keep coordinates as lat/lon: stored tiles never contain local metres (see `CLAUDE.md`, hard rule 3).
- Fix broken shapes and remove duplicates.
- Sort features into roads, buildings, areas, points and lines.
- Assign each building to one **owner tile**: the tile containing its centre.
- Clip roads and long lines at tile edges.

**4. Decide** (shared table, keyed by OSM feature ID)

- Reuse a saved decision if the feature already has one.
- Otherwise take the first available: **OSM tag > rules > trained model > LLM > safe default**.
- Decides building type, storeys, roof, front side, and which shop sits in which unit.
- MVP: tags + rules + defaults only.

**5. Facades / profiles** (shared table, keyed by OSM feature ID; later, not in MVP)

Facade profiles for buildings come first; the same idea then extends to courts, playgrounds and other places.

- Reuse a saved profile if one exists.
- Otherwise vision AI reads street and aerial photos into a profile:
  - facades: wall colour, roof, number of bays, doors, pillars, awnings, sign text
  - courts: surface colours, lines, hoops, fences
- OSM tags override AI guesses.
- No photos → seeded variation from the feature ID.

**6. Save**

- Each tile is saved as its own `WorldTile` JSON, with a version and timestamp.
- Decisions and profiles stay in the shared tables.
- If a tile fails, mark it for retry; still send the other tiles.

The tiles are sent to every player in the room. Everyone gets the same files, so everyone builds the identical world.

## Browser side (every player, takes seconds)

**7. Generate base** (per tile)

- Terrain from elevation (later).
- Project the tile's features from lat/lon to local metres, using the region origin.
- Ground areas: lawns, parks, parking lots, water.
- Roads, intersections, curbs, sidewalks, driveways.
- Building walls and roofs from footprints.

**8. Place assets**

- Split walls into 3–4 m sections and fill them with kit pieces using the facade profile: storefronts, doors, windows, pillars, signs with real names. This comes later; the MVP uses plain boxes plus a name sign.
- Every pre-made item is chosen through the **asset catalog**: decisions produce requirements (an `AssetRequest`, e.g. a needleleaved tree about 12 m tall), and the selector picks an asset ID with the seeded RNG. Code never names a model file (see [07-assets.md](07-assets.md)).
- Put mapped items at their exact spots: trees, signs, benches.
- Rule-based items are **seeded by global position** (rounded Web Mercator coordinates, not local x/z), so they line up across tiles:
  - poles every 40 m
  - a mailbox per driveway
  - scattered trees.
- Every placement is checked so it doesn't land on a road or inside a building.

**9. Finish**

- Wires between poles (later).
- Parking stalls, crosswalks, stop lines.
- Small details: grass tufts, flowers, rocks.

**10. Optimise**

- One chunk per tile; merge generated meshes per chunk and material.
- Instancing for repeated assets.
- LOD for distant trees and buildings.
- Fog and culling.

**11. Physics**

- Simple colliders: boxes for buildings, cylinders for trees, flat ground in the MVP. Once there's terrain, the ground becomes a heightmap.

**12. Play**

- Render the world and spawn the player(s).
- With multiplayer, sync movement and changed objects with friends.
- Failed tiles show as plain ground with a loading note until the retry finishes.
- Show credits: OpenStreetMap contributors (plus Mapillary and others once used).

## Partial caching: recap

**Problem:** caching by "circle around a point" fails. Different coordinates make overlapping circles, so the same streets get regenerated.

**Solution:** cache by a fixed grid of tiles.

- Divide the world into fixed squares: zoom-17 map tiles (306 m × cos(latitude), so about 220 m in southern Ontario).
- Each tile is generated and cached on its own.
- A request:
  1. find which tiles the circle touches
  2. load the cached tiles
  3. generate only the missing tiles and save them
  4. send all tiles to the player.
- If half an area is cached, only the other half gets generated.
- Popular areas fill in over time and then load instantly.

**Features that cross tile edges**

- Decisions and facade profiles are stored by OSM feature ID in one shared table, not per tile. Tiles never contradict each other, and you never pay for AI twice.
- Each building belongs to one owner tile (the tile containing its centre), so it is generated once.
- Roads and long lines are clipped at tile edges. Both halves line up because they come from the same line.
- Rule-based items (scattered trees, poles every 40 m) are seeded by global position, not by tile or local x/z, so they line up across edges.

**Freshness and safety**

- Each tile has a version and a timestamp. Rebuild a tile when its OSM data changes (pre-built tiles are refreshed weekly; see [05-data-sources.md](05-data-sources.md)) or when the tile format or generator version changes.
- If two rooms or requests ask for the same missing tile at once, generate it once and make the other wait.
- If one tile fails, still send the rest. Show the failed tile as plain ground with a loading note, and retry.

**Pipeline changes versus the original, untiled pipeline**

- Step 1 becomes: check which tiles are cached, and generate only the missing ones.
- Step 6 becomes: save per tile, plus a shared decisions table keyed by feature ID.

## MVP subset

- Steps 1–3.
- Step 4 with rules and defaults only.
- Skip step 5.
- Steps 7–12 without terrain, poles, wires or kit pieces.
