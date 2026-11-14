# Somewhere — project docs

**Somewhere** (working title) turns any real place into a bright, stylized 3D world you can walk around.
You type coordinates, and everything inside a radius around them is rebuilt in 3D from open map data
(OpenStreetMap, plus Overture Maps for buildings it lacks): roads, buildings with real shop names, parks, trees. You explore it in first person in your web
browser. Exploring with friends comes after the MVP.

Status: **MVP in progress.** Steps 1 to 3 are built (the area appears with coloured houses, roofs, ground, trees, sky and shadows, and you can walk around it in first person); next is step 4, details, in [14-mvp-roadmap.md](14-mvp-roadmap.md).

## Contents

| #   | Doc                                                  | What's in it                                                             |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------ |
| 01  | [Vision](01-vision.md)                               | What we're building, the look, what makes it different                   |
| 02  | [MVP](02-mvp.md)                                     | Exact MVP scope, build order, "done when"                                |
| 03  | [Architecture](03-architecture.md)                   | Workspace layout, layers, the engine-free rule, data contracts           |
| 04  | [Generation pipeline](04-pipeline.md)                | Step-by-step from coordinates to playable world, tile caching            |
| 05  | [Data sources](05-data-sources.md)                   | OpenStreetMap and Overture explained, Overpass, other sources, limits    |
| 06  | [Decisions, profiles and AI](06-decisions-and-ai.md) | How the program decides what things are and how they look; where AI fits |
| 07  | [Assets](07-assets.md)                               | Generated vs pre-made, starter asset kit, style rules                    |
| 08  | [Missing data](08-missing-data.md)                   | What to do when the map has nothing (e.g. an unmapped basketball court)  |
| 09  | [Rendering and player](09-rendering-and-player.md)   | Three.js, performance budgets, first-person controls, physics            |
| 10  | [Tech stack](10-tech-stack.md)                       | Every tool, library and service, MVP vs later                            |
| 11  | [Legal, privacy and safety](11-legal-and-privacy.md) | Licences, attribution, Google data, logos, private homes, kid safety     |
| 12  | [Roadmap](12-roadmap.md)                             | Phases after the MVP                                                     |
| 13  | [References](13-references.md)                       | Similar projects, useful repos, docs, skills                             |
| 14  | [MVP roadmap](14-mvp-roadmap.md)                     | The MVP build plan, item by item, with checkboxes and "Next up"          |

## The idea in one diagram

```
coordinates + radius
  -> get the map data for the tiles in that circle (OpenStreetMap; Overture for missing buildings)
  -> decide what every feature is (tags > rules > defaults; AI later)
  -> generate roads, ground, buildings in code
  -> place pre-made assets (trees, signs, kit pieces)
  -> walk around in first person
```
