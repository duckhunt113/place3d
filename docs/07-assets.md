# 07 — Assets: generated vs pre-made

**Rule:** if the shape comes from the map, generate it in code. If it's the same object everywhere, use a pre-made `.glb` model and reuse it everywhere.

So the project needs both:

- a **generator** that builds map-shaped models on the fly
- a **pre-made kit** that placement code drops into the world.

## Generated in code (`packages/world/src/generator`)

**Ground**

- Terrain from elevation (later).
- Lawns, parks, fields, forest floor, sand, water: filled to their real outlines.

**Roads and paths**

- Roads following the real lines and curves; width from tags or road type.
- Intersections. One of the hard parts; it needs clean joins.
- Curbs (raised edges, about 15 cm), sidewalks, footpaths, driveways (each house connected to the road).
- Road paint by road type: centre lines, edge lines, crosswalks, stop lines.

**Buildings (the shell)**

- Walls raised from the real footprint to the tagged or default height.
- Roofs: flat with a darker cap; hipped, gabled and pyramidal built on the tightest rectangle around the footprint (MVP, `generator/roofs.ts`). Roofs that follow complex footprints need a straight-skeleton algorithm, another hard part (after the MVP).
- Wall sections 3–4 m wide, ready for kit pieces. Fitting pieces to odd wall lengths and angles is the third hard part.
- Storey bands.

**Areas with markings**

- Parking lot surfaces with painted stalls.
- Court and field surfaces with real colours and lines (basketball, tennis, soccer).
- Playground ground surfaces.

**Lines**

- Fences, walls, hedges and guardrails along mapped lines.
- Power wires (sagging curves) between poles.
- Railways, bridges.

**Text and colour**

- Shop names drawn onto blank sign boards; street names onto blank street signs.
- Profile colours applied to kit pieces.

## Pre-made models (`apps/web/public/assets/*.glb`)

The `.glb` files are the source of truth; no source art is kept in the repo. They can come from anywhere (made or tweaked in Blender, free CC0 packs, AI-drafted and cleaned up) as long as they follow the style rules below and their licence allows use in the game. Every model gets an entry in the asset catalog (below), including its source and licence.

Starter kit, about 30 pieces:

**Nature (8)**

- Leafy tree in S, M and L
- Pine/conifer
- Birch
- Bush
- Hedge segment (2 m, tiles along a line)
- Flower patch
- Rock cluster

**Street furniture (8)**

- Utility pole (plus a transformer/crossarm version)
- Street light (arm style, plus a pole-mounted version)
- Stop sign
- Street-name sign (blank board)
- Fire hydrant
- Mailbox
- Bench
- Trash/recycling bin

**Building kit (12)** — 3 m × 3 m wall pieces so they tile:

- Plain wall
- House window
- Front door, garage door
- Storefront bay with door; storefront window bay
- Sign board (blank)
- Awning (colour set in code)
- Pillar/column
- Corner trim
- Chimney
- Rooftop AC unit

**Ground details (3)**

- Grass tuft
- Fence sections (wood, chain-link)
- Bollard / curb stop

**Sports and park**

- Basketball hoop, tennis net, soccer goal, baseball backstop
- Slide, swings, climber
- Picnic table

**Player**

- A player avatar with animations: walk, run, jump, idle.
- The first-person MVP can skip it. It's needed once friends can see each other.

**Later**

- Cars (optional; the data never includes cars, so they're a rule choice)
- Landmarks
- Seasonal variants (bare trees, snow)
- Apartment and office kits
- **Style kits:** suburban house, modern box, estate/classical, strip plaza, and more. The profile picks the style; the kit carries the look.

MVP subset: about 5 trees and a few props. Buildings are plain boxes plus a name sign.

## Asset catalog: assets are data, not code

`apps/web/public/assets/catalog.json` lists every model with an ID, file, category, attributes (e.g. `leafType`, `genus`, `size`, `heightM`, `climate`, `style`), footprint, collider, triangle count, source and licence. Types are in [03-architecture.md](03-architecture.md).

- **Decisions ask, the catalog answers.** Decision code (and AI, later) outputs requirements, e.g. category `tree` + `leafType: needleleaved`. The selector in `packages/world/src/assets` filters the catalog and picks one with the seeded RNG. Code never names a file.
- **More assets = more variety, no code changes.** Adding a model means adding a file and a catalog entry.
- **Stable worlds.** Asset IDs are never renamed or deleted (mark them `deprecated`). The catalog has a `version`, and a world or room uses one version for everyone, so new assets don't change existing worlds or split multiplayer views.
- **Built for 10,000+ assets.** The selector indexes the catalog by category (then attributes), so choosing stays instant. Rich attributes (`climate`, `region`, `season`, `style`, `size`, …) are what let a request like "tall tree, temperate, autumn" pick the right model among thousands. Rules never name models, so adding models never needs rule changes.
- **Load only what's used.** A tile's placements list asset IDs; the browser loads just those and caches them. When the kit grows large, models move to object storage + CDN with versioned URLs, compressed (Draco/meshopt, KTX2) and with LOD versions.
- **Variety budget.** Each distinct model costs draw calls, so cap the number of different models per tile (e.g. 8 tree types, 20 prop types) and keep the shared palette material.
- **Automatic checks.** Before the kit grows past the starter set, add an asset-check script (run in CI) that compares each `.glb` with its catalog entry: scale, origin, +Z facing, triangle budget, palette, licence.

MVP: a small catalog (about 5 trees, a few props, a blank shop sign) and the selector from day one.

**Model concepts:** each pre-made model can have a concept image at `docs/concepts/<catalog ID>.png` (e.g. `docs/concepts/prop.bench.png`). When making a model, open only its own concept. It guides shape and proportions; the rules (palette names, real size, triangle budget, art style) win if they disagree.

## Palette: colours by name

`apps/web/public/assets/palette.json` lists every colour by **name** (e.g. `foliage.light`, `asphalt`, `house.beige`) with its hex value and its cell on the palette grid. It is the single source of truth.

- **Models refer to colours by name.** Each face uses a material named `pal:<colour name>`. Models never depend on where a colour sits on the image.
- **`palette.png` is generated** from `palette.json` by `pnpm palette` (`scripts/build-palette.mjs`): pure colour squares, no labels or grid lines (anything drawn there would show up on models). The script refuses bad names, bad hex values and clashing cells, and also writes `docs/palette-preview.html`, a labelled view for people that is not a game asset. `pnpm palette:check` (also run in CI) validates and compares pixels without writing anything.
- **Layout:** 512×512 px, a 16×16 grid of 32 px cells, one category per row (foliage, nature, streets, house walls, roofs and trim, signs, props), spare slots in every row and empty rows for the future. Models sample cell centres so colours don't bleed.
- **MVP:** the renderer swaps each `pal:` material for its palette colour at load time. Simple, and fine for a small kit.
- **When the kit grows:** an asset build step (`gltf-transform`) bakes each `pal:` name into UVs on the single shared palette material. To add colours, grow the grid or rearrange it, update `palette.json` and re-run the step; every model is re-mapped automatically.
- **Generated surfaces** (roads, lawns, walls) take vertex colours from the same names.
- **Special materials:** `sign:face` is the only non-palette material: the face of a sign board where the game draws text (a shop name). The renderer replaces it with a generated texture.
- **Never rename or remove a colour name.** Changing a colour's shade is fine.
- **Restyles:** variant palettes (e.g. `palette.winter.json`) use the same names and layout, so every model works with any of them. The palette has a `version`; a world or room uses one version for everyone.
- **Variation without new colours:** use the placement `tint` before adding near-duplicate colours, and keep the palette limited so the look stays cohesive.

## Placement: code decides where pre-made items go

- **Kit pieces onto wall sections**, chosen using the facade and court profiles.
- **Mapped items at their exact spots**: trees, signs, benches and the like from OSM.
- **Rule-based items**, seeded by global position (not local x/z) so they line up across tiles:
  - poles every 40 m
  - a mailbox per driveway
  - scattered trees in yards and parks.
- **Everything is checked** so it doesn't land on a road or inside a building.

## Style rules

- **Two kinds of surface:** tree canopies, bushes, hedges and clouds are faceted low-poly (flat-shaded); buildings, roads, signs and props are smooth and simplified. Full rules, palette and reference images: `.claude/skills/art-style/`.
- **Colours come from the palette, by name** (see "Palette" below). Everything matches, and nearly everything shares one material.
- **Low-poly budgets:** trees 300–800 triangles; props 50–300; wall pieces under 200.
- **Real scale:** 1 unit = 1 metre; origin at the base centre; all assets face +Z (the glTF default).
- **Reference sizes:** lane 3.5 m, curb 0.15 m, door 2.1 m, one storey 3 m, eye height 1.7 m.
- **Collision:** each asset has a simple matching shape (box or cylinder) for physics.
- **Naming:** files like `tree_leafy_m.glb`, `prop_hydrant.glb`, `kit_storefront_bay.glb`; catalog IDs lowercase and dotted, like `tree.leafy.oak.m`.
- **Format:** `.glb` (glTF binary). It loads directly in Three.js and imports into any other engine later.
- **Ground materials (generated surfaces):**
  - asphalt, concrete, paving stones, grass, sand, water, glass
  - roof tile, shingle, brick/siding
  - about 8 house colours and 6 shop accent colours.
- First person means things are seen up close: give ground surfaces subtle texture or colour variation, not flat fills.

## Tools

- Any modelling tool; Blender (with the Blender MCP for AI-assisted modelling) works well.
- Optional: text-to-3D to draft props, then clean them up.
- Optional skill: `arjun988/blender-skills` for procedural/parametric kit pieces (see [13-references.md](13-references.md)).
