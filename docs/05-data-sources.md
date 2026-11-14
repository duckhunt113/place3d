# 05 — Data sources

Two sources of map data, both free and open:

| Source                  | Gives                                                                                 | Why                                                   |
| ----------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| **OpenStreetMap (OSM)** | Everything it has: roads, paths, areas, water, trees, shops, and the buildings it has | The richest labels (what a thing is, names, floors)   |
| **Overture Maps**       | Building outlines and heights, **only where OSM has no building**                     | OSM is missing most houses in many suburbs, worldwide |

OSM always wins: if both have a building in the same spot, the OSM one is used. Everything else in this file follows from that.

## OpenStreetMap (OSM): the backbone

OSM is a free, volunteer-built map of the world. Anyone can edit it; anyone can use the data, including in games, under the Open Database License (ODbL).

**Where the data comes from:**

- volunteers tracing satellite imagery and adding local knowledge
- imports from governments (some cities' building outlines, for example)
- company contributors.

### Data model

- **Node**: a single point (tree, bench, shop, stop sign).
- **Way**: an ordered list of nodes, either a line (road, fence) or a closed shape (building, parking lot).
- **Relation**: a group of nodes and ways (a building with a courtyard hole, a route, a boundary).
- **Tags**: `key=value` labels saying what it is. There's no fixed list; conventions live on the OSM wiki.

Example: a plaza building (way) and a shop inside it (node):

```
way  building=retail, building:levels=1, roof:shape=flat, name=Lorne Park Plaza
node shop=dry_cleaning, name=<shop name>
```

Tags we care about most:

- `building=*`, `building:levels`, `height`, `roof:shape`, `roof:colour`, `building:colour`, `building:material`
- `shop=*`, `amenity=*`, `name`
- `highway=*`, `lanes`, `width`, `sidewalk=*`, `surface`
- `landuse=*`, `leisure=*` (parks, pitches, playgrounds), `sport=*`, `natural=tree`, `natural=water`
- `barrier=fence|wall|hedge|gate`, `power=pole|line`
- `amenity=parking`, `service=driveway`

### How to get it

| Method                                         | Use                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Saved tiles**                                | A few tiles fetched once and kept in the repo (with their Overture buildings). MVP step 1 and test fixtures      |
| **Overpass API**                               | Query one tile live. Use during development for any location                                                     |
| **Geofabrik extracts** (download.geofabrik.de) | Per-region downloads (e.g. Ontario). Pre-build tiles for popular regions first                                   |
| **planet.openstreetmap.org**                   | The whole world, about 80 GB compressed, weekly, plus daily/hourly change files. Feeds the builder at launch     |
| **Third-party vector tiles**                   | Pre-cut tiles for 2D maps (OpenFreeMap, Protomaps). Not used: they drop tags we need (shop names, levels, roofs) |

### Overpass fair use (public instances)

- One-off use: you won't disturb others under about **10,000 queries/day and 1 GB/day**.
- Anything that runs regularly: **divide by 100**, so under about 100 queries and 10 MB/day.
- Limits count per **application**: all your users added together.
- Identify the app. Browsers can't set `User-Agent`, so the game relies on the `Referer` the browser sends; scripts and the server set a `User-Agent` naming the app.
- The public servers are volunteer-run and sometimes slow or down. Fine for development; at launch, switch to pre-built tiles.

### What one tile query asks for

One query per zoom-17 tile, built by `overpassQuery` in `packages/world/src/data/sources/overpass.ts` (the only place the query text lives; `pnpm fixtures` uses the same function). It uses the tile's box and `out geom`, so everything that touches the tile comes back with its full shape:

- ways: `highway`, `building`, `landuse`, `leisure`, `amenity=parking`, `barrier=hedge`, and `natural` = water, wood, scrub, sand, beach or tree_row
- relations: `building` multipolygons only (big water and forest relations wait for clipped fetching, roadmap item 2.2)
- nodes: trees and shrubs, `shop`, `amenity`, fire hydrants, stop signs

Only the fields the game uses are kept (`type`, `id`, `tags`, position or geometry, members). Adding a kind of thing to the world means adding a line to this query, a rule, and bumping the tile format version so saved tiles are fetched again.

Overpass returns OSM data only. Buildings from Overture are added afterwards, when a tile is saved or built (see "Overture Maps" below).

### Plan by phase

The game always asks the `TileSource` for "tile X"; only the supplier behind it changes.

1. **MVP step 1:** saved Albertson Crescent tiles, fetched once with `pnpm fixtures` and kept in `packages/world/src/data/fixtures/tiles/`: OSM data from Overpass plus the Overture buildings that fill its gaps. No network needed to play or test; the same files are the test fixtures.
2. **Development:** live public Overpass for any other location, one query per zoom-17 tile. This is OSM only: a place whose houses are missing from OSM shows without them until the server exists.
3. **Beta (first real players):** a small server fetches each **missing** tile from public Overpass once, adds the Overture buildings for that tile (the same gap-filling code the fixture script uses), stores the result in object storage, and serves the stored copy to everyone after that. Thousands of players on one street cause one Overpass request.
4. **Launch (whole world):**
   - **Builder:** one server holds the OSM planet data in a queryable form (self-hosted Overpass, or PostGIS loaded from the planet file) and is kept fresh with OSM's change files. It reads Overture's building files the same way (pulled per area, or a copy kept on its disk if that proves too slow; the worldwide set is hundreds of GB). It only builds tiles that don't exist yet; players never query it directly, and its load grows with new places visited, not with players.
   - **Pre-built tiles:** popular regions are built up front (from Geofabrik extracts or the planet); everywhere else is built on first request and stored from then on.
   - **Storage + CDN:** tiles live as files or PMTiles in object storage (e.g. Cloudflare R2) behind a CDN, under versioned paths (`tiles/v2/…`) so a format change can roll out without breaking old clients.
   - **Freshness:** rebuild tiles whose OSM data changed, weekly; pick up Overture's monthly release when it comes out.

Never put Overpass or any live query service in front of players. Switch from step 3 to step 4 when daily cache misses approach Overpass's fair-use limits.

### Reliability

| Data                                        | How reliable                                                                                                                                          |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Roads                                       | Very good in Canada, the US and Europe                                                                                                                |
| Public buildings (shops, schools, churches) | Good                                                                                                                                                  |
| Houses                                      | Hit and miss: complete in some cities, missing in many suburbs. Around Albertson Crescent OSM has 14 buildings and no houses. Overture fills this gap |
| Heights, roofs, colours, shop names, trees  | Patchy; depends on local mappers                                                                                                                      |
| Freshness                                   | Popular areas update fast; quiet areas can lag months                                                                                                 |
| Vandalism                                   | Rare and usually reverted quickly                                                                                                                     |

Plan for missing details with defaults, and for missing houses with Overture. Never rely on the public servers once real players arrive.

The OSM GitHub org (`openstreetmap-website`, `iD`) is the code for running openstreetmap.org itself, not the data. We don't need it.

## Overture Maps: buildings where OSM has none

Overture Maps (overturemaps.org, a Linux Foundation project backed by Amazon, Meta, Microsoft and TomTom) publishes open map data as files. We use one part of it: the **buildings** set, about 2.3 billion outlines worldwide, merged from OSM, Esri Community Maps, Microsoft's machine-traced building footprints and Google Open Buildings. Machine-traced means a model drew the outline from aerial imagery.

### What we take, and the OSM-first rule

- **Only buildings, only for gaps.** Overture's own copy of OSM buildings is skipped (we read OSM directly, with all its tags). From the rest, any outline that overlaps an OSM building is dropped: two outlines count as the same building when the shared part is at least 20% of the smaller one. Neighbours that merely touch stay.
- **Fields → OSM-style tags**, so the same rules decide what a building becomes:

  | Overture field  | Becomes tag                             |
  | --------------- | --------------------------------------- |
  | `class`         | `building=<class>`, else `building=yes` |
  | `height`        | `height` (metres, one decimal)          |
  | `num_floors`    | `building:levels`                       |
  | `roof_shape`    | `roof:shape` (rarely present)           |
  | `names.primary` | `name`                                  |

  A typical machine-traced house arrives as `building=yes` + `height=6.4`. The rules then call it a house (small, on residential land) or a shed (tiny), and the measured height is used as is.
- **IDs:** `overture/<GERS id>`. GERS is Overture's stable id system, so the same building keeps its id across releases, and its seeded colour and decisions stay the same.
- **Skipped:** underground buildings, broken outlines, and building _parts_ (we build one box per building).

### How we get it

Overture is **files, not a service**: there is no API to ask. Its official tool downloads just an area:

```
uvx overturemaps download --bbox=<west>,<south>,<east>,<north> -f geojson --type=building -o area.geojson
```

- `pnpm fixtures` runs this for the saved area, then merges the result into the saved tiles. `uvx` comes with `uv` (a Python tool runner); it is the only thing to install, and only for this script.
- New data comes out monthly; older releases are removed after about two months, so we keep what we fetched in our own tiles.
- Overture also publishes ready-made map tiles (PMTiles) for its viewer. Not used: Overture says they can change without notice.
- To look at an area by eye: explore.overturemaps.org.

### Where the code lives

| Step                                       | Code                                                                 |
| ------------------------------------------ | -------------------------------------------------------------------- |
| Read Overture's GeoJSON into candidates    | `overtureBuildings` in `packages/world/src/data/sources/overture.ts` |
| Drop the ones that overlap an OSM building | `fillBuildingGaps` in `packages/world/src/data/gaps.ts`              |
| Pick the ones that touch a tile            | `buildingsTouching` (same file)                                      |
| Save them in the tile (`buildings`)        | `scripts/fetch-fixture-tiles.ts` now; the tile builder later         |
| Turn them into building features           | `parseTile` in `packages/world/src/data/parse.ts`                    |

The overlap check runs once, over the whole area, when tiles are saved or built. A stored tile's `buildings` are already clean, so nothing is compared at play time.

### Licence and credit

- The buildings set is under the **ODbL**, the same licence as OSM (it contains OSM data). Free to use, including commercially.
- Credit shown in the app: "© OpenStreetMap contributors, Overture Maps Foundation".
- Not legal advice; see [11-legal-and-privacy.md](11-legal-and-privacy.md).

### Fields we read but rarely get

Overture's buildings can also carry a roof shape, ridge direction, roof height and roof colour. They are filled from OSM tags, so machine-traced houses have none. The reader passes `roof_shape` through as `roof:shape` so a real value wins when one exists; the other fields can be added the same way when they start to matter.

### Limits to know

- Machine-traced outlines are rougher than hand-drawn ones: corners can be off, and two attached houses can come out as one shape. Fine for stylized boxes.
- Sheds and garages are traced too. The rules turn tiny outlines into sheds.
- Places loaded live from Overpass during development get no Overture buildings (see "Plan by phase").
- If someone adds a house to OSM later, the OSM version replaces the Overture one the next time the tile is rebuilt.

## Other sources

| Source                                                    | Gives                                                                                                                                                                            | When             |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Elevation tiles (AWS Terrain Tiles, as used by Arnis)     | Ground height                                                                                                                                                                    | After MVP        |
| **Mapillary**                                             | Crowdsourced street photos (CC BY-SA 4.0), auto-blurred faces and plates, detected signs and poles, API access                                                                   | Later (profiles) |
| Mapilio, KartaView, Panoramax                             | Other open street-photo services to fill gaps                                                                                                                                    | Later            |
| Licensed aerial imagery                                   | Tree canopies, court colours, roof colours (check the licence allows derived data)                                                                                               | Later            |
| City open data (street-tree inventories)                  | Real positions, species and size of city-owned street and park trees (Mississauga publishes one). Not private gardens; a different format per city                               | Later            |
| Global canopy height map (Meta + WRI, 1 m, CC BY 4.0)     | Tree height for every square metre worldwide, from satellite photos (2009–2020). Single trees can be picked out as peaks; no species. The worldwide route to real tree positions | Later            |
| LiDAR surface model (Ontario publishes one, open licence) | Measured heights of everything on the ground: real tree positions and heights, and real roof shapes (flat or pitched, which way the ridge runs). Ontario only; heavy to process  | Later            |
| OSM waterways and railway lines                           | Streams, creeks and tracks. In OSM already; not fetched yet (see "Later extras" in [12-roadmap.md](12-roadmap.md))                                                               | Later            |
| Open-Meteo                                                | Real weather                                                                                                                                                                     | Optional         |
| Sun position                                              | Calculated from coordinates and time                                                                                                                                             | Optional         |

### Mapillary notes

- Owned by Meta since 2020. Over 2 billion images in 190+ countries. Coverage is uneven: best on main roads and plazas.
- Attribution: "Images from Mapillary, CC BY-SA, by @username".
- ShareAlike has rules for derived works. If the app makes money, read the terms or get a commercial licence before relying on it.
- API rate limits apply.

## Not allowed

- **Google** Street View, Google Maps and Photorealistic 3D Tiles: their terms forbid extracting, scraping, caching or offline use of their content. Don't use them as data sources. Looking at them by eye for comparison during development is fine.
- One thing that is _not_ this: **Google Open Buildings** is a separate, openly licensed dataset, and some of Overture's outlines come from it. Using it through Overture is allowed; it has nothing to do with Google Maps' terms.
- See [11-legal-and-privacy.md](11-legal-and-privacy.md).
