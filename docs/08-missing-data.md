# 08 — When the map has nothing

Some things will never be in the data (example: a basketball court nobody mapped). Handle it in layers, best first.

## 1. Check it's really missing

Many features *are* mapped; the generator just has to support the tag:
- Courts and fields: `leisure=pitch` + `sport=basketball|tennis|soccer|baseball`. Generated surface with real-shape lines, plus hoop, net or goal kit pieces.
- `leisure=playground`: filled with slide, swings and climber kit pieces.
- Pools, tracks, skate parks: the same approach.

## 2. Detect from imagery (AI, later)

- Courts, pools, playgrounds, driveways and tree canopies are very visible from above.
- A detection model runs on aerial imagery once per tile; results go into the shared table.
- Only use imagery whose licence allows deriving data. Some providers only allow viewing or OSM tracing.

## 3. Fix it at the source: OSM

- You: add missing things on openstreetmap.org. It takes a minute and helps everyone.
- Players: a "something's missing here" button. Reports go to a list that gets turned into OSM edits.
- The tile picks the change up on its next refresh.

## 4. Game layer (instant, app-only)

- A separate database of additions on top of OSM ("basketball court here, this size and rotation"), added by you or trusted players.
- Applied on top of generated tiles immediately. Keep it clearly separate from OSM data.

## 5. Generic filler (always works)

- An empty `leisure=park` gets grass, paths, trees and benches, so nothing looks like a void.
- **Don't invent specific real-looking features** (a court or building that doesn't exist). Keep fillers generic.

## Merge order

```
OSM  >  game-layer additions  >  imagery detections  >  generic filler
```

## Making it look like the real one

Supporting the tag gives *a* basketball court. Making it look like *that* court needs a court profile from aerial and street photos (see [06-decisions-and-ai.md](06-decisions-and-ai.md)).

## MVP

- Support the common tags as plain generated surfaces: courts and fields (coloured surface, lines if easy), playgrounds (ground surface only). Hoops, nets, goals and play equipment are kit pieces and come in v0.2.
- Generic filler in empty parks.
- Fix your test area by editing OSM directly.
