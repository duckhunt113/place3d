# 09 — Rendering, performance and the player

## Why Three.js

- **Three.js** is a library on top of WebGL (and WebGPU). Raw WebGL would mean writing an engine from scratch, which took Streets GL's author years. Not worth it.
- It's great at code-generated geometry (most of this project), lightweight to load, very widely used (lots of examples, and AI assistants know it well), and loads `.glb` directly.
- **It's a renderer, not a game engine.** We add Rapier (physics), our own controls, and later Colyseus (multiplayer).
- Proof it works:
  - Krunker.io: a multiplayer FPS built on Three.js that runs on low-end hardware
  - Hop.Earth: OSM roads generated in real time on a WebGL/Three.js client
  - the official Three.js `games_fps` example.

| Option                   | Good                                         | Less good for us                                                |
| ------------------------ | -------------------------------------------- | --------------------------------------------------------------- |
| **Three.js** (chosen)    | Lightweight, flexible, huge community        | We assemble physics and networking                              |
| Babylon.js (runner-up)   | More of a full engine: physics, editor, docs | Heavier, smaller community                                      |
| PlayCanvas               | Web engine + editor + multiplayer examples   | Editor-centric; awkward for fully generated worlds              |
| Unity / Godot web export | Full engines                                 | Big downloads, slow to load, awkward to stream generated worlds |

Switching later is cheap **only** if Three.js stays inside `apps/web/src/render` (see [03-architecture.md](03-architecture.md)).

## Performance

Target: 60 fps on a normal laptop, 30–60 fps on decent phones. A 300 m suburb is small: roughly 100–300 buildings and a few hundred to a few thousand trees.

The main cost is **draw calls**, not triangles.

1. **Instancing** for repeated assets: 2,000 trees of 5 types = 5 draw calls.
2. **Merge generated geometry per chunk** (one chunk per tile) and per material.
3. **One shared texture atlas**, so nearly everything shares one material.
4. **LOD**: simpler distant trees (or flat "impostor" pictures); distant buildings drop details.
5. **Culling + fog**: skip chunks behind the camera or too far away.
6. **Shadows**: one sun light; real-time shadows only near the player; ambient occlusion baked into vertex colours.

Keep the rest light:

- Generate tiles in a Web Worker so the game doesn't freeze.
- Simple physics colliders, never the visual mesh.
- Cap pixel ratio at 1.5–2.
- Offer quality presets (low/medium/high).

Budget per frame:

| Item                  | Target                                 |
| --------------------- | -------------------------------------- |
| Draw calls            | under 200 desktop / 100 mobile         |
| Triangles on screen   | under 1–2 M desktop / 300–500 k mobile |
| Shadow-casting lights | 1 (the sun)                            |
| Textures              | 1–3 shared atlases                     |

Add an FPS counter (Three.js `stats` addon) from day one, and test on a real phone early.

Bigger areas later: stream tiles as the player walks and unload those behind (Hop.Earth already does this).

## First-person player

- Camera at **1.7 m** eye height; an invisible **capsule** collider (Rapier), 1.8 m tall and 0.6 m wide.
- Controls:
  - WASD or the arrow keys to move, mouse to look (Pointer Lock: click to capture, Esc to release; dragging with the button held also works)
  - Shift to run, Space to jump
  - F, or the button in the panel, switches to the **free view** and back.
- Speeds: walking 4 m/s, running 8 m/s, a jump of about 0.9 m. A real walk is about 1.4 m/s; games walk faster so a street does not feel endless. All of these are the `PLAYER` settings in `player/walker.ts`.
- Rapier's character controller moves the capsule: it slides along walls, climbs steps up to 0.3 m and stays on the ground on slopes. (Curbs are drawn but not solid yet: the walking ground is still flat.)
- First person makes these matter more:
  - **Scale**: real metres everywhere (see reference sizes in [07-assets.md](07-assets.md)).
  - **Close-up surfaces**: textured or colour-varied asphalt, grass and sidewalk.
  - **Tree trunks and canopies** at eye level.
  - **Readable signs**: real shop names pay off.
- Later:
  - an optional viewmodel (hands)
  - an avatar model, so friends can see each other in multiplayer
  - mobile on-screen joystick plus drag-to-look.

## Physics colliders

| Thing     | Collider                                                                                   |
| --------- | ------------------------------------------------------------------------------------------ |
| Buildings | One turned box when the outline nearly fills its rectangle; otherwise a thin box per wall  |
| Trees     | Cylinder around the trunk only, so you can walk under leaves                               |
| Ground    | A grid of heights per tile (32 by 32 cells, about 7 m each); all zero until terrain exists |
| Props     | Simple box or cylinder per asset, from the catalog                                         |

Build colliders from the generator output (plain data), not from Three.js meshes.

Why the ground is a grid and not one big flat slab: a slab several kilometres wide made the player sink a few centimetres into it and then fall through, because physics engines lose precision on very large shapes. Small cells fix that, and terrain needs the same grid later.

## What the MVP renderer does (step 2)

- **One mesh per tile.** The world package sends one mesh per palette colour; `render/meshes.ts` joins them and writes each colour into the corners (vertex colours). A tile's ground, roads and buildings are one draw call.
- **Models.** `render/assets.ts` loads only the `.glb` files a tile uses, flattens each into one piece of geometry and turns its `pal:` materials into vertex colours. `render/instances.ts` draws every copy of a model in a tile as one instanced mesh. Everything shares one material.
- **Cost on the Albertson Crescent area (14 tiles):** about 17,000 generated triangles and about 800,000 model triangles (1,783 trees, bushes and props), in roughly 130 draw calls. That is inside the desktop budget; the mobile budget needs fewer or simpler trees (see "LOD" above).
- **Sky and light** (`render/sky.ts`, `render/lighting.ts`): a gradient sky dome, one warm sun that casts the shadows, a sky-blue fill light. The numbers live in the `art-style` skill.
- **Shadows** use one 4096 px map. In the free view it is stretched over the whole loaded area, about 30 cm per pixel. While walking it covers only 120 m around the player, about 6 cm per pixel, and moves along in 16 m steps.
- **Haze** has two settings: close and light while walking, far away for the free view.

Not done yet, by choice: clouds, grass tufts and flower details, level-of-detail for far trees.

## Performance, measured (step 6)

Next to the FPS counter the game shows how many draw calls and triangles each frame uses, the shadow pass included. On the Albertson Crescent area (14 tiles, 319 buildings, about 1,840 models):

| View                  | Draw calls | Triangles | Budget (desktop)    |
| --------------------- | ---------- | --------- | ------------------- |
| Walking               | about 120  | 0.85 M    | under 200, 1 to 2 M |
| Free view, whole area | about 190  | 1.15 M    | under 200, 1 to 2 M |

- One shadow-casting light; pixel ratio capped at 2.
- Most triangles are tree models. Level-of-detail for far trees is the first thing to add when areas grow.
- The mobile budgets (100 draw calls, 300 to 500 thousand triangles) are **not** met; mobile is not in the MVP.

## Street details and signs (step 4)

- **Streets, curbs, sidewalks, markings and parking stalls** are ordinary generated geometry: they arrive in the tile's one mesh and cost no extra draw calls. On the Albertson Crescent area they add about 14,000 triangles.
- **Shop signs** are the blank board model (instanced like any model) plus the name. `render/signs.ts` draws every name of a tile into one canvas picture, 768 by 128 pixels per name, and lays one flat piece over each board's face: **one extra draw call per tile that has signs**. The board's face is found in the model itself (the `sign:face` material), so a new board model needs no code.
- **Lettering:** Fredoka (bundled, weight 600), white on coloured boards and dark on cream. A name is written on one line if it fits, shrunk a little if needed, split in two lines if not, and cut short with "…" as a last resort (`render/sign-text.ts`, tested).
- **Sharpness:** the sign picture uses the best texture filtering the machine offers (anisotropy), so names stay readable at an angle.

## How walking works (step 3)

1. **Collider data** (`packages/world/src/generator/colliders.ts`): each built tile carries its solid shapes and its ground grid as plain numbers, next to its meshes.
2. **Physics world** (`apps/web/src/physics/world.ts`): turns those numbers into Rapier shapes, tile by tile. The only file that imports Rapier. Rapier is a big download (about 1.7 MB compressed), so it loads as its own file, side by side with the rest.
3. **Walker** (`player/walker.ts`): turns "forwards, run, jump, facing this way" into a position. Fixed 1/60 s steps, its own gravity, kept inside the loaded circle. No keyboard and no camera in it, so it has tests.
4. **Input** (`player/input.ts`): keyboard and mouse. **Player** (`player/player.ts`): ties input and walker together and gives the camera its eye position. If the player ever falls off the world they return to the start.
5. **Spawn** (`generator/spawn.ts`): the player starts on the street nearest to the entered coordinates, looking along it. A street is always clear ground.
6. **Two views** (`render/view.ts`): the player's eyes, and the free view, which starts behind and above the player. While an area loads you watch it fill in from above, with a loading card counting tiles; walking starts when every tile has arrived (a tile that failed arrives as plain ground).
7. **Where you can walk** (`player/area.ts`): anywhere a tile is loaded. At the edge of the loaded tiles the player slides along it.
