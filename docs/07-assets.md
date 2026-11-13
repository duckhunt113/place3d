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
- Roofs fitted to the footprint: flat, gabled, hipped, pyramidal. Complex footprints need a straight-skeleton algorithm, another hard part.
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

The `.glb` files are the source of truth; no source art is kept in the repo. They can come from anywhere (made or tweaked in Blender, free CC0 packs, AI-drafted and cleaned up) as long as they follow the style rules below and their licence allows use in the game. Record each third-party model's source and licence in `apps/web/public/assets/CREDITS.md`.

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
- **One shared colour palette texture (atlas)** for all assets. Everything matches, and nearly everything shares one material.
- **Low-poly budgets:** trees 300–800 triangles; props 50–300; wall pieces under 200.
- **Real scale:** 1 unit = 1 metre; origin at the base centre; all assets face +Z (the glTF default).
- **Reference sizes:** lane 3.5 m, curb 0.15 m, door 2.1 m, one storey 3 m, eye height 1.7 m.
- **Collision:** each asset has a simple matching shape (box or cylinder) for physics.
- **Naming:** `tree_leafy_m.glb`, `prop_hydrant.glb`, `kit_storefront_bay.glb`, `kit_wall_plain.glb`.
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
