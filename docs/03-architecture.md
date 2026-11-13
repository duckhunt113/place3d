# 03 — Architecture

## Workspace layout (pnpm workspace)

```
somewhere/
  apps/
    web/                 browser app: Vite + TypeScript + Three.js + Rapier
      src/render/        the ONLY place that imports three.js
      src/player/        first-person camera, controls, physics capsule
      public/assets/     .glb asset kit exported from Blender
    server/              (later) multiplayer + tile generation/caching server
  packages/
    world/               plain TypeScript, NO three.js, NO DOM
      src/data/          Overpass fetch, tile cache, lat/lon -> metres
      src/decide/        tag rules + defaults (later: trained model, LLM)
      src/generator/     roads, ground, buildings -> plain mesh data + placements
      src/util/          seeded random, maths helpers
  docs/                  these docs
  assets/                source art (.blend files, palette texture)
```

## Layers

```
1. Data          OSM fetch, caching, parsing            -> packages/world (plain TS)
2. Decide        what is each feature                    -> packages/world (plain TS)
3. Generator     geometry + placements as plain data     -> packages/world (plain TS)
4. Game logic    rules, (later) rooms, quests            -> plain TS
5. Physics       Rapier                                  -> engine-independent
6. Networking    (later) Colyseus or Socket.IO           -> engine-independent
7. Renderer      plain data -> Three.js objects          -> apps/web/src/render ONLY
```

## The engine-free rule

`packages/world` must never create Three.js objects. It outputs plain data:

- **Generated meshes**: positions, indices, normals, UVs, colours (typed arrays) per material, per tile.
- **Placements**: "asset `tree_leafy_m` at (x, y, z), rotation r, scale s, tint c".
- **Colliders**: simple shapes (boxes, cylinders, heightfield) built from the same data.

A thin renderer in `apps/web/src/render` turns that into Three.js meshes and instanced meshes.

Why:
1. The same generator runs on the server later, for multiplayer.
2. It's testable with Vitest without a browser.
3. Swapping Three.js for Babylon.js or PlayCanvas later costs weeks, not a rewrite. Unity or Godot is bigger but still keeps the design and assets.

## Data contracts (sketch, refine in code)

```ts
// packages/world
type LatLon = { lat: number; lon: number };
type Vec2 = [number, number];               // local metres [x, z]: x east, z south (north is -z; y is up)
type TileId = { z: 17; x: number; y: number }; // slippy-map tile, about 220 m in southern Ontario

type Feature =
  | { kind: "building"; osmId: string; footprint: Vec2[]; tags: Record<string, string> }
  | { kind: "road"; osmId: string; line: Vec2[]; tags: Record<string, string> }
  | { kind: "area"; osmId: string; outline: Vec2[]; holes?: Vec2[][]; tags: Record<string, string> }
  | { kind: "point"; osmId: string; at: Vec2; tags: Record<string, string> };

type Decision = {                           // stored by osmId in a shared table
  osmId: string;
  type: string;                             // "house", "retail", "court_basketball", ...
  storeys?: number;
  roof?: "flat" | "gabled" | "hipped" | "pyramidal";
  front?: Vec2;                             // facing direction
  source: "osm" | "rule" | "model" | "llm" | "default";
};

type Placement = { asset: string; pos: [number, number, number]; rotY: number; scale: number; tint?: string };

type MeshData = { material: string; positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices: Uint32Array };

type WorldTile = {
  id: TileId;
  version: number;                          // bump when the generator changes
  generatedAt: string;
  features: Feature[];
  decisions: Decision[];
  // Generated in the browser from the above. Not stored.
};
```

## Determinism

- One world coordinate system: project lat/lon to local metres from a fixed origin per region (never per session or per player), so tiles line up and every machine gets the same positions.
- Axes follow Three.js (y up, right-handed): x = east, z = south, so north is −z. Getting this wrong mirrors the map.
- Seeded random only, seeded from stable values (OSM id, world position, tile id). Never `Math.random()` in generation.
- Same `WorldTile` in → same geometry out, on every machine. Tests should check this.

## Later: server/client split

- **Server**: tile lookup, fetching, decisions, profiles (AI) → saves `WorldTile` files plus shared decision/profile tables.
- **Browser**: generates geometry from `WorldTile`, renders, runs physics, syncs players.
- Only player movement and changed objects travel over the network, never the world itself.
