# 06 — Decisions, profiles and AI

## The decision layer

One module (`packages/world/src/decide`) answers: *what is this feature, how big, which side is the front, what goes here?*
Input: a feature plus its context. Output: a `Decision` (see [03-architecture.md](03-architecture.md)).

For every question, take the first answer available:

```
1. Real OSM tag        always wins
2. Rules               cover most cases
3. Trained model       fills common gaps (later)
4. LLM                 rare or weird cases (later)
5. Safe default        house, 2 storeys, gabled (flat in the MVP). Never fails
```

Every decision is saved by OSM ID: made once, the same for everyone.

### Rules (MVP)

```
building=retail                  -> shop look, 1 storey, flat roof, storefronts face road/parking
building=house                   -> house look, 2 storeys, gabled roof (MVP: flat unless gabled is easy), door faces road
building=apartments              -> apartment look, building:levels or 4 storeys, flat roof
building=yes + shop node inside  -> retail
building=yes + small + residential area -> house
building=yes + < 30 m2 behind a house   -> shed/garage
no height tag                    -> default for type
```

### Clues for unlabelled buildings (`building=yes`)

| Clue | Suggests |
|---|---|
| Shop/amenity points inside the footprint | Retail (strongest clue) |
| Large footprint (500+ m2), long rectangle | Plaza, store or warehouse |
| Next to a parking lot | Commercial |
| Small footprint (100–250 m2) | House |
| Many similar small neighbours on a residential street | House |
| Inside `landuse=residential` / `landuse=retail` | Matches the area |
| Tiny (< 30 m2) behind a house | Shed or garage |

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

| Detail | Source |
|---|---|
| Shape, size, angle | OSM outline (exact) |
| Names (sign text) | OSM shop points inside the building |
| Which shop is in which unit | Shop point positions along the storefront wall |
| Roof shape and colour | OSM tags, otherwise aerial photos |
| Wall colour, material | OSM tags, otherwise street photos |
| Doors, windows, pillars, awnings, sign colours, hoop style | Street photos (Mapillary) read by vision AI |
| Court surface colours, line layout, hoop count | Aerial photos read by vision AI |

## Where AI is used (and isn't)

| Step | AI? |
|---|---|
| Fetching map data | No |
| Deciding building types when tags are missing | Rules first; small trained model later |
| **Profiles: colours, layout, signs** | **Yes: vision AI on street and aerial photos** |
| Building the 3D geometry | **No**: plain code |
| Placing pre-made assets | No: rules |
| Fun extras (restyles, quests, characters) | Yes, later |

**AI describes; code builds.** AI-generated geometry is imprecise, inconsistent and costly. The generator takes AI output as *parameters*.

### Rules for any AI feature

1. Run it once per feature, ahead of time, never while a player waits.
2. Save every result by OSM ID; reuse it forever.
3. Force a strict output format; reject nonsense (allowed colours, sane bay counts).
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
