# 05 — Data sources

## OpenStreetMap (OSM): the backbone

OSM is a free, volunteer-built map of the world. Anyone can edit it; anyone can use the data, including in games, under the Open Database License (ODbL).

**Where the data comes from:**

- volunteers tracing satellite imagery and adding local knowledge
- imports from governments (Mississauga's building outlines, for example)
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
| **Saved tiles**                                | A few tiles fetched once and kept in the repo. MVP step 1 and test fixtures                                      |
| **Overpass API**                               | Query one tile live. Use during development for any location                                                     |
| **Geofabrik extracts** (download.geofabrik.de) | Download a region (Ontario, Canada) and cut it into our own pre-built tiles. Use at launch                       |
| **planet.openstreetmap.org**                   | The whole world, about 80 GB compressed, updated weekly                                                          |
| **Third-party vector tiles**                   | Pre-cut tiles for 2D maps (OpenFreeMap, Protomaps). Not used: they drop tags we need (shop names, levels, roofs) |

### Overpass fair use (public instances)

- One-off use: you won't disturb others under about **10,000 queries/day and 1 GB/day**.
- Anything that runs regularly: **divide by 100**, so under about 100 queries and 10 MB/day.
- Limits count per **application**: all your users added together.
- Identify the app. Browsers can't set `User-Agent`, so the game relies on the `Referer` the browser sends; scripts and the server set a `User-Agent` naming the app.
- The public servers are volunteer-run and sometimes slow or down. Fine for development; at launch, switch to pre-built tiles.

### Plan by phase

1. **MVP step 1:** saved Albertson Crescent tiles. No network needed; the same files are the test fixtures.
2. **Development:** live Overpass for any other location, per zoom-17 tile, through the same `TileSource` interface.
3. **Launch:** pre-built tiles. A script cuts a Geofabrik extract into our zoom-17 tile format (keeping every tag we need), stored as files or PMTiles in object storage (e.g. Cloudflare R2) behind a CDN, rebuilt regularly; tiles nobody has visited are built the first time they're requested. Paths are versioned (`tiles/v1/…`) so a format change can roll out without breaking old clients.

We don't self-host Overpass: our game only ever asks "what's in tile X?", and static files answer that faster, cheaper and more reliably.

### Reliability

| Data                                       | How reliable                                          |
| ------------------------------------------ | ----------------------------------------------------- |
| Roads                                      | Very good in Canada, the US and Europe                |
| Building outlines                          | Good in cities (Mississauga is well covered)          |
| Heights, roofs, colours, shop names, trees | Patchy; depends on local mappers                      |
| Freshness                                  | Popular areas update fast; quiet areas can lag months |
| Vandalism                                  | Rare and usually reverted quickly                     |

Plan for missing details with defaults. Never rely on the public servers once real players arrive.

The OSM GitHub org (`openstreetmap-website`, `iD`) is the code for running openstreetmap.org itself, not the data. We don't need it.

## Other sources

| Source                                                | Gives                                                                                                          | When             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| Elevation tiles (AWS Terrain Tiles, as used by Arnis) | Ground height                                                                                                  | After MVP        |
| **Mapillary**                                         | Crowdsourced street photos (CC BY-SA 4.0), auto-blurred faces and plates, detected signs and poles, API access | Later (profiles) |
| Mapilio, KartaView, Panoramax                         | Other open street-photo services to fill gaps                                                                  | Later            |
| Licensed aerial imagery                               | Tree canopies, court colours, roof colours (check the licence allows derived data)                             | Later            |
| City open data, LiDAR                                 | Street-tree inventories; tree positions and heights (Ontario publishes some LiDAR)                             | Later            |
| Open-Meteo                                            | Real weather                                                                                                   | Optional         |
| Sun position                                          | Calculated from coordinates and time                                                                           | Optional         |

### Mapillary notes

- Owned by Meta since 2020. Over 2 billion images in 190+ countries. Coverage is uneven: best on main roads and plazas.
- Attribution: "Images from Mapillary, CC BY-SA, by @username".
- ShareAlike has rules for derived works. If the app makes money, read the terms or get a commercial licence before relying on it.
- API rate limits apply.

## Not allowed

- **Google** Street View, Google Maps and Photorealistic 3D Tiles: their terms forbid extracting, scraping, caching or offline use of their content. Don't use them as data sources. Looking at them by eye for comparison during development is fine.
- See [11-legal-and-privacy.md](11-legal-and-privacy.md).
