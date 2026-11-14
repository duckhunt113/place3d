# 12 — Roadmap

Suggested order. Each phase builds on the last without rewrites. Adjust as you learn from playtests.

## v0.1: MVP (single player)

See [02-mvp.md](02-mvp.md) for the scope and [14-mvp-roadmap.md](14-mvp-roadmap.md) for the build plan.

Coordinates in, a 300 m stylized area out, walking around it in first person. OpenStreetMap data, with Overture Maps buildings where it has none. Tags + rules only. Tile cache.

## v0.2: World quality

- Terrain from elevation.
- Building kit pieces: storefront bays, windows, doors, pillars, awnings.
- Roofs for any outline (straight skeleton), so L-shaped and irregular houses get pitched roofs too; gabled ends where they fit.
- Utility poles and wires, street lights, street-name signs, more props.
- Courts, fields and playgrounds: coloured surfaces, lines and kit pieces (hoops, nets, goals, play equipment), with their colours added to the palette.
- Tile streaming as you walk (bigger areas), with an origin shift when crossing into a new region.
- Quality presets; phone testing.
- The later extras below.

### Later extras (small additions, any time after the MVP)

These were left out of the MVP on purpose. Each reuses existing pieces; none needs its own generator file.

- **Streams and creeks.** Fetch `waterway` lines, draw them as a ribbon like a road in the water colour, just below road level; skip sections mapped as tunnels or pipes. Later: gentle movement on the surface, generated banks, and rocks, reeds and small bridges as models along the edges. A creek's shape comes from the map, so it is never one pre-made model.
- **Railway tracks.** Fetch `railway` lines. First version: a gravel-coloured track bed with two thin rails, all ribbons (one new palette colour). Later: sleepers and other repeated details as models placed along the line, plus stations, signals and crossing gates as ordinary placed models. Rails and bed stay generated so they bend smoothly.
- **How both get in:** a general "line" kind in the parser (hedges and tree rows need it too), a `rules/lines.json` file for width and colour, the ribbon code moved out of `generator/roads.ts` into a shared helper, a tile format bump and a full `pnpm fixtures` run.
- **Hedges and tree rows** along mapped lines (the rules exist; they wait for the same "line" kind).
- **Signs that face the right way.** Stop signs now stand on the right of the road's drawn direction; use the `direction` tag and the nearest junction to pick the correct side.
- **Clouds, grass tufts and flower patches** from the art style.

## v0.3: Multiplayer

- `apps/server`: Node + Colyseus. Tile generation and caching move server-side.
- Share link → friends join the same room and location.
- Simple avatar model (others see you); name tags.
- Sync player movement and changed objects only.
- Friends-only rooms, reporting.

## v0.4: AI realism ("it looks like my street")

- Mapillary + vision AI → facade and court profiles (public places first).
- Trained model for unlabelled buildings.
- Real tree positions: the global canopy-height map first (worldwide), city tree inventories for species where a city has one, LiDAR where it is published.
- Real roof shapes and colours per house, from LiDAR and photos, placed above the rule guesses (see [06-decisions-and-ai.md](06-decisions-and-ai.md)).
- Style kits: suburban, modern, estate, plaza.

## v0.5: Prompt the world

- Restyles: "make it winter", "candy world", "zombie apocalypse".
- Add things: "skate park in this lot".
- Text-to-3D props, generated once and saved.
- Content filtering and per-room limits.

## v0.6: Alive

- Quests from real shops and streets.
- AI shopkeepers and a local guide.
- AI game master events.
- Real sun position, real weather, seasons.

## Launch readiness (in parallel from v0.3)

- Beta: the server fetches each missing tile from public Overpass once, adds the Overture buildings for it, and stores it. From here on, any place has its houses, not only the saved test area.
- Launch: a builder server with the OSM planet data (self-hosted Overpass or PostGIS) and Overture's building files builds missing tiles; popular regions pre-built; tiles in object storage behind a CDN, refreshed weekly (see [05-data-sources.md](05-data-sources.md)).
- Hosting: static web app plus game/tile server plus storage.
- Attribution screen (OSM, Overture and the building datasets behind it, Mapillary, others).
- Mobile controls.
- Legal review of licences (see [11-legal-and-privacy.md](11-legal-and-privacy.md)).
