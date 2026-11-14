# 12 — Roadmap

Suggested order. Each phase builds on the last without rewrites. Adjust as you learn from playtests.

## v0.1: MVP (single player)

See [02-mvp.md](02-mvp.md).

Coordinates in, a 300 m stylized area out, walking around it in first person. Tags + rules only. Tile cache.

## v0.2: World quality

- Terrain from elevation.
- Building kit pieces: storefront bays, windows, doors, pillars, awnings, proper roofs (straight skeleton).
- Utility poles and wires, street lights, street-name signs, more props.
- Courts, fields and playgrounds: coloured surfaces, lines and kit pieces (hoops, nets, goals, play equipment), with their colours added to the palette.
- Tile streaming as you walk (bigger areas), with an origin shift when crossing into a new region.
- Quality presets; phone testing.

## v0.3: Multiplayer

- `apps/server`: Node + Colyseus. Tile generation and caching move server-side.
- Share link → friends join the same room and location.
- Simple avatar model (others see you); name tags.
- Sync player movement and changed objects only.
- Friends-only rooms, reporting.

## v0.4: AI realism ("it looks like my street")

- Mapillary + vision AI → facade and court profiles (public places first).
- Trained model for unlabelled buildings.
- Real tree positions (city data, LiDAR, or aerial detection).
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

- Beta: the server fetches each missing tile from public Overpass once and stores it.
- Launch: a builder server with the OSM planet data (self-hosted Overpass or PostGIS) builds missing tiles; popular regions pre-built; tiles in object storage behind a CDN, refreshed weekly (see [05-data-sources.md](05-data-sources.md)).
- Hosting: static web app plus game/tile server plus storage.
- Attribution screen (OSM, Mapillary, others).
- Mobile controls.
- Legal review of licences (see [11-legal-and-privacy.md](11-legal-and-privacy.md)).
