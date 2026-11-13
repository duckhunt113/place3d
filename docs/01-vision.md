# 01 — Vision

## What it is

A web app where you:

1. Enter coordinates (or paste a map link) and a radius.
2. Watch that real area get rebuilt as a 3D world: your actual streets, buildings, plazas, parks and courts.
3. Jump in and explore it in first person, in a physics-simulated world.
4. (Later) Do it together with friends.

It is **not** photorealistic. It is a stylized, recognisable version of the real place.

## The look

- Bright, cheerful, kid-friendly low-poly style: chunky trees, clean shapes, warm sunlight, soft shadows, blue sky with fluffy clouds.
- Recognisable: right street layout, right building shapes, real shop names on signs, real colours where we can get them.
- Reference images from planning: a stylized strip plaza with tile roofs and shop signs; a stylized suburban street with poles, wires, curbs, lawns and big trees; a stylized estate house with gates. These are the art-direction target.

Most of the visual "wow" comes from art direction (a small, consistent asset kit + good lighting), not from data.

## The experience we want

- "That's my street!": people instantly recognise their own neighbourhood and nearby plaza.
- Playful physics: bump into things, knock things over, jump around.
- Later: hang out with friends, restyle the world ("make it winter"), quests built from real places.

## What already exists (and how we differ)

Checked in November 2026:

| Project | What it does | Gap we fill |
|---|---|---|
| World Explorer 3D | Browser multiplayer sandbox on real geography, rooms tied to locations | Rough, learning-project quality |
| OpenWorld3D | OSM city in 3D, walk into buildings, drive, NPCs | Multiplayer unclear; not our style |
| Hop.Earth | Drive any OSM road; multiplayer races; buildings simplified | Driving only |
| Arnis / Map2Minecraft | Any address to a Minecraft world | Blocky, needs Minecraft |
| Google Project Genie | AI-generated walkable video of real places | Not real 3D, US-only, $200/mo, single player |
| Wandering Around | Walk any town in the browser from OSM | Walking only |

**Our edge is quality and fun, not the concept:**
- a polished stylized look
- playful physics
- recognisable details (real shop names, real colours)
- (later) easy hanging out with friends.

## Core choices (from the original notes)

1. The code is written so Three.js can be swapped for another renderer later (see [03-architecture.md](03-architecture.md)).
2. OpenStreetMap is the data source.
3. Main tools:
   - OpenStreetMap: map data
   - Mapillary: street photos, after the MVP
   - Three.js: rendering.

## Principles

1. The map decides where things go; code builds; AI only describes (later).
2. Same input → same world, every time, for everyone.
3. Recognisable beats exact. Stylized beats photoreal.
4. Ship small: MVP first, then add layers without rewrites.
5. Respect data licences, privacy and kids' safety from day one.
