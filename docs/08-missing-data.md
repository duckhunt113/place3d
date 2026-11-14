# 08 — When the map has nothing

Some things will never be in OpenStreetMap (examples: a basketball court nobody mapped, or the houses of a whole suburb). Handle it in layers, best first.

## 1. Check it's really missing

Many features _are_ mapped; the generator just has to support the tag:

- Courts and fields: `leisure=pitch` + `sport=basketball|tennis|soccer|baseball`. Generated surface with real-shape lines, plus hoop, net or goal kit pieces.
- `leisure=playground`: filled with slide, swings and climber kit pieces.
- Pools, tracks, skate parks: the same approach.

## 2. Fill missing buildings from Overture Maps

The biggest gap by far is houses: OSM has them in some cities and not in many suburbs. Around Albertson Crescent it has 14 buildings and none of the houses.

- Overture Maps publishes open building outlines for the whole world, including machine-traced ones where OSM has nothing. We use them **only** where OSM has no building.
- This is automatic and needs no AI of our own: the outlines are merged in when a tile is saved or built.
- Details, the OSM-first rule and the licence: [05-data-sources.md](05-data-sources.md), "Overture Maps".

## 3. Guess sensibly, and keep the guess as the fallback

Trees, roof shapes and house colours are almost never mapped. Rules fill them in with stable, believable guesses: seeded tree scatter in parks, woods and yards; pitched roofs on rectangular houses; a seeded colour per building. Better sources go above the guesses later, never instead of them. The table of guesses and what overrides each is in [06-decisions-and-ai.md](06-decisions-and-ai.md).

Sources for real tree positions later (see [05-data-sources.md](05-data-sources.md), "Other sources"): city tree inventories, the global canopy-height map, LiDAR.

## 4. Detect from imagery (AI, later)

- Courts, pools, playgrounds, driveways and tree canopies are very visible from above.
- A detection model runs on aerial imagery once per tile; results go into the shared table.
- Only use imagery whose licence allows deriving data. Some providers only allow viewing or OSM tracing.

## 5. Fix it at the source: OSM

- You: add missing things on openstreetmap.org. It takes a minute and helps everyone.
- Players: a "something's missing here" button. Reports go to a list that gets turned into OSM edits.
- The tile picks the change up on its next refresh.
- A building added to OSM replaces its Overture outline the next time the tile is rebuilt.

## 6. Game layer (instant, app-only)

- A separate database of additions on top of OSM ("basketball court here, this size and rotation"), added by you or trusted players.
- Applied on top of generated tiles immediately. Keep it clearly separate from OSM data.

## 7. Generic filler (always works)

- An empty `leisure=park` gets grass, paths, trees and benches, so nothing looks like a void.
- **Don't invent specific real-looking features** (a court or building that doesn't exist). Keep fillers generic.

## Merge order

```
OSM  >  game-layer additions  >  Overture buildings  >  our own imagery detections  >  generic filler
```

## Making it look like the real one

Supporting the tag gives _a_ basketball court. Making it look like _that_ court needs a court profile from aerial and street photos (see [06-decisions-and-ai.md](06-decisions-and-ai.md)).

## MVP

- Courts, fields and playgrounds are **not** in the MVP; they come in v0.2 (coloured surfaces, lines and kit pieces). In the MVP they show as plain ground.
- Generic filler in empty parks.
- Missing houses come from Overture (in the saved Albertson Crescent tiles).
- Anything else missing in your test area: fix it by editing OSM directly, then run `pnpm fixtures` again.
