# 06 — Decisions, profiles and AI

## The decision layer

One module (`packages/world/src/decide`) answers: _what is this feature, how big, which side is the front, what goes here?_
Input: a feature plus its context. Output: a `Decision` (see [03-architecture.md](03-architecture.md)).

For every question, take the first answer available:

```
1. Real OSM tag        always wins
2. Rules               cover most cases
3. Trained model       fills common gaps (later)
4. LLM                 rare or weird cases (later)
5. Safe default        house, 2 storeys, gabled (flat in the MVP). Never fails
```

Buildings that come from Overture Maps (where OSM has none) go through the same list. Overture's fields arrive as OSM-style tags (`building=yes`, `height=6.4`; see [05-data-sources.md](05-data-sources.md)), so a measured height wins like a real tag, and rules such as "small `building=yes` on residential land is a house" do the rest. The decision's `source` says `overture` when a measured value was used.

Every decision is keyed by feature ID (an OSM id such as `way/123`, or `overture/<id>` for a gap-fill building), the same for everyone (MVP: recomputed from tags and rules on load; later: saved once in a shared table). When something pre-made goes in the world, the decision includes an **asset request** (category + attributes), never a file name; the asset catalog's selector picks the model (see [07-assets.md](07-assets.md)).

### What is a guess, and what replaces it later

Some things the map almost never says. The MVP guesses them from rules, in a way that is stable (the same building always gets the same answer) and believable:

| Thing               | MVP: how it is decided                                                                              | Later: what overrides the guess                                               |
| ------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Wall colour**     | A seeded pick from the rule's list for that building type                                           | A `building:colour` tag; then colours read from photos by a vision model      |
| **Roof colour**     | A seeded pick from the rule's `roofColour` list                                                     | A roof colour tag; then photos                                                |
| **Roof shape**      | Houses that are close to a rectangle: hipped. Shops, apartments, sheds and irregular outlines: flat | A `roof:shape` tag (OSM, or Overture's `roof_shape`); then LiDAR or photos    |
| **Ridge direction** | Along the building's long side                                                                      | A roof direction tag; then LiDAR or photos                                    |
| **Tree positions**  | Seeded scatter inside parks, woods and yards                                                        | Mapped trees in OSM; then a city tree inventory, a canopy-height map or LiDAR |

The guesses are never removed. When a better source arrives it goes **above** the guess, and the guess stays as the fallback for every building or place the better source does not cover (no photos, low confidence, not processed yet). For roofs the order becomes:

```
1. A real roof tag on the map
2. A measured or photo-derived result, where one exists and is confident   (later)
3. The rule's guess from building type and shape
4. Flat
```

"How rectangular is it" is a geometry fact (`rectangularity`: the share of its tightest surrounding rectangle a footprint fills). The threshold lives in a rule (`building.irregular.flat-roof`), so tuning it is a data change. On the real Albertson Crescent tiles, 300 of the 318 Overture houses pass at 0.75.

### Rules are data

All tag rules live in `packages/world/src/decide/rules/` as JSON, one file per domain: `buildings.json`, `roads.json`, `areas.json`, `objects.json` (trees, hedges, hydrants, benches, signs). A small engine applies them; code never contains tag-specific `if/else`. Format and engine behaviour: [03-architecture.md](03-architecture.md). How to write rules: the `osm-tag-rules` skill.

A few examples from the MVP rules:

```
building=retail | commercial          -> retail, 1 storey, flat roof, shop colours, shop signs
building=house | detached | ...       -> house, 2 storeys, flat roof (MVP), one of 8 house colours
building=yes + shop nodes inside      -> retail                      (geometry fact: shopNodesInside >= 1)
building=yes + < 30 m2                -> shed                         (geometry fact: footprintM2 < 30)
building:levels=<n>                   -> storeys = n                  (real tag, priority 100: tags win)
highway=residential                   -> 2 lanes x 3.5 m, curbs, sidewalks both sides
lanes=<n> / width=<m>                 -> copied from the tag          (priority 100)
amenity=parking                       -> asphalt surface, painted stalls
service=parking_aisle                 -> stalls along both sides of the aisle
shop=* + name=*                       -> a name sign on the building's front wall
amenity=restaurant|cafe|... + name=*  -> the same (places people walk into)
leisure=park                          -> grass + seeded trees and benches (asset requests)
natural=tree                          -> tree request: leafType/genus from tags, height from tag
barrier=hedge                         -> hedge segments every 2 m along the line
```

**Why data, at scale:** rules grow with the _kinds_ of things OSM describes (hundreds), while the asset catalog grows with _variety_ (thousands of models). Rules only ever output requests (category + attributes); the catalog selector picks the model. Adding 500 new trees means 500 catalog entries and zero new rules. Rules are indexed by tag key, versioned, and validated by tests.

### Where trees go

```
natural=tree (node)              -> one tree at that exact spot
natural=tree_row (way)           -> trees every ~10 m along the line
natural=wood / landuse=forest    -> filled with trees (seeded scatter)
parks, residential lawns         -> sparse seeded scatter (fill)
every spot                       -> skipped if on a road, sidewalk or inside a building
```

### Clues for unlabelled buildings (`building=yes`)

| Clue                                                  | Suggests                  |
| ----------------------------------------------------- | ------------------------- |
| Shop/amenity points inside the footprint              | Retail (strongest clue)   |
| Large footprint (500+ m2), long rectangle             | Plaza, store or warehouse |
| Next to a parking lot                                 | Commercial                |
| Small footprint (100–250 m2)                          | House                     |
| Many similar small neighbours on a residential street | House                     |
| Inside `landuse=residential` / `landuse=retail`       | Matches the area          |
| Tiny (< 30 m2) behind a house                         | Shed or garage            |

### Trained model (later)

- Train on the millions of properly labelled OSM buildings: hide the label, predict it from clues like area, shape, neighbours, nearby parking and land use.
- A small model (decision tree or gradient-boosted trees) is enough: fast, cheap, consistent.
- Output comes with a confidence, e.g. `house 92%`. Use it if confidence is at least 70%; otherwise fall through to the LLM, then the safe default.

## Profiles: making things look like the real one

The goal is no copy-pasted "retail shop" model. Each real building, court or playground gets a **profile**, and the generator assembles it from kit pieces to match.

Example facade profile:

```
building #123456 "Lorne Park Plaza"
  wall colour: beige        roof: orange tile, hipped
  storefront bays: 6        bays: [door+window, window, door+window, window, door+window, window]
  pillars: yes              awning: none
  signs: "<shop name>" (white board, black text), ...
```

Example court profile:

```
court #88213 (basketball)
  shape/size/orientation: from OSM outline
  type: half court          surface: green, red key areas, white lines
  hoops: 1, glass backboard, red rim       fence: chain-link 3 m on 3 sides
  extras: 2 benches south side, 1 light pole
```

The same pattern works for any place type: playgrounds (equipment, colours, surface), parks (paths, benches, fountains), gas stations (canopy colour, number of pumps), sports fields, and houses (siding colour, roof colour, garage, porch; kept generic, see [11-legal-and-privacy.md](11-legal-and-privacy.md)).

Where each detail comes from:

| Detail                                                     | Source                                         |
| ---------------------------------------------------------- | ---------------------------------------------- |
| Shape, size, angle                                         | OSM outline (exact)                            |
| Names (sign text)                                          | OSM shop points inside the building            |
| Which shop is in which unit                                | Shop point positions along the storefront wall |
| Roof shape and colour                                      | OSM tags, otherwise aerial photos              |
| Wall colour, material                                      | OSM tags, otherwise street photos              |
| Doors, windows, pillars, awnings, sign colours, hoop style | Street photos (Mapillary) read by vision AI    |
| Court surface colours, line layout, hoop count             | Aerial photos read by vision AI                |

## Where AI is used (and isn't)

| Step                                          | AI?                                            |
| --------------------------------------------- | ---------------------------------------------- |
| Fetching map data                             | No                                             |
| Deciding building types when tags are missing | Rules first; small trained model later         |
| **Profiles: colours, layout, signs**          | **Yes: vision AI on street and aerial photos** |
| Building the 3D geometry                      | **No**: plain code                             |
| Placing pre-made assets                       | No: rules                                      |
| Fun extras (restyles, quests, characters)     | Yes, later                                     |

**AI describes; code builds.** AI-generated geometry is imprecise, inconsistent and costly. The generator takes AI output as _parameters_.

### Rules for any AI feature

1. Run it once per feature, ahead of time, never while a player waits.
2. Save every result by feature ID; reuse it forever.
3. Force a strict output format; reject nonsense (allowed colours, sane bay counts). When AI chooses assets, it may only return asset requests or IDs that exist in the asset catalog (see [07-assets.md](07-assets.md)); anything else is rejected.
4. OSM tags beat AI guesses.
5. Always have a non-AI fallback.
6. Watch cost: pay once per feature, start with storefronts and plazas.
7. Kid-safe: filter anything players type and anything AI says.
8. Anything that changes the world is decided once and synced to everyone.

### AI roadmap ("the magic")

The plan above is the foundation. AI goes on top as the layer that makes people say "how did it know that?". Here it is in a sensible order.

**Phase 1: "It looks like my street"** (the biggest wow)

- **Profiles from photos:** AI reads street and aerial photos, so your plaza gets its real colours, layout and shop signs, and your local court gets its real green surface and red keys.
- **Gap filling:** AI decides what unlabelled buildings are, so no area looks unfinished.
- **Real trees:** AI finds tree canopies in aerial photos, so the big trees on Albertson Crescent are where they really are.

This is the moment someone enters their address and gasps.

**Phase 2: "I can change the world by talking"**

- **Restyle:** "make it winter", "turn it into a candy world", "zombie apocalypse". AI swaps materials, sky, weather and kit variants, and keeps the real layout.
- **Add things:** "put a skate park in this parking lot", "build a treehouse here". AI picks and places kit pieces.
- **Spawn props:** "giant rubber duck". Text-to-3D creates it once and saves it, and it drops into the physics world.

These are the moments people clip and share.

**Phase 3: "The world is alive"**

- **Quests from real places:** e.g. "deliver flowers from Berkshire Flowers to a house on Albertson Crescent".
- **AI characters:** shopkeepers and a guide who know real facts about the area.
- **Game master:** AI invents events while you play ("an ice cream truck just pulled into the plaza!").

This is what keeps people coming back.

**How it fits without breaking anything**

AI only ever produces descriptions or decisions. The generator code and the kit still build everything:

```
AI -> "beige, 6 bays, orange roof"    -> code builds it
AI -> "winter style"                  -> code swaps materials and adds snow
AI -> "skate park, here, this size"   -> code places kit pieces
```

- **Saved and shared:** every AI result is saved and synced, so friends see the same magic.
- **Run once:** fast for players, and you pay once.
- **Kid-safe:** filter what players type and what AI says.

**Order**

1. MVP: no AI. Prove the world works. A world-quality pass (v0.2) and multiplayer (v0.3) come before any AI (see [12-roadmap.md](12-roadmap.md)).
2. Phase 1: profiles, gap filling and trees, for realism.
3. Phase 2: restyles and "add things", which are fun and shareable.
4. Phase 3: quests and characters, which keep people coming back.

The pipeline already separates "describe" (AI-friendly) from "build" (code), so each layer can be added without rewriting the foundation.

**Behind the scenes:** AI also helps write generator code, draft assets, and flag ugly spots in screenshots.
