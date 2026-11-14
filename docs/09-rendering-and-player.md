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

- Camera at **1.7 m** eye height; an invisible **capsule** collider (Rapier).
- Controls:
  - WASD to move, mouse to look (Pointer Lock: click to capture, Esc to release)
  - Shift to run, Space to jump.
- Start from the official Three.js `games_fps` example for the controls pattern; use Rapier for physics.
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

| Thing     | Collider                                                     |
| --------- | ------------------------------------------------------------ |
| Buildings | Box (or convex hull of the footprint, extruded)              |
| Trees     | Cylinder around the trunk only, so you can walk under leaves |
| Ground    | Flat plane in the MVP; heightfield with terrain              |
| Props     | Simple box or cylinder per asset                             |

Build colliders from the generator output (plain data), not from Three.js meshes.

## What the MVP renderer does (step 2)

- **One mesh per tile.** The world package sends one mesh per palette colour; `render/meshes.ts` joins them and writes each colour into the corners (vertex colours). A tile's ground, roads and buildings are one draw call.
- **Models.** `render/assets.ts` loads only the `.glb` files a tile uses, flattens each into one piece of geometry and turns its `pal:` materials into vertex colours. `render/instances.ts` draws every copy of a model in a tile as one instanced mesh. Everything shares one material.
- **Cost on the Albertson Crescent area (14 tiles):** about 17,000 generated triangles and about 800,000 model triangles (1,783 trees, bushes and props), in roughly 130 draw calls. That is inside the desktop budget; the mobile budget needs fewer or simpler trees (see "LOD" above).
- **Sky and light** (`render/sky.ts`, `render/lighting.ts`): a gradient sky dome, one warm sun that casts the shadows, a sky-blue fill light. The numbers live in the `art-style` skill.
- **Shadows** use one 4096 px map stretched over the whole loaded area, about 30 cm per pixel. Fine from above; when walking (step 3) the shadow area should follow the player so nearby shadows are sharp.
- **Haze** is set for the fly-around camera (far away). Step 3 switches to the walking values in the skill.

Not done yet, by choice: clouds, grass tufts and flower details, level-of-detail for far trees.
