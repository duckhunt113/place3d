---

name: art-style
description: Use for anything visual in Somewhere - making or editing .glb assets, choosing colours or materials for generated roads, ground and buildings, setting up lighting, sky, shadows or fog, styling trees, signs or props, or checking whether a screenshot matches the target look.
---

# Somewhere art style

The target look is in `reference/` next to this file. **Look at those images before any visual work**, and compare every screenshot against them.

- `reference/plaza-corner.jpg`: strip plaza seen from a side street; curbs, lawn strip, parking stalls, stop sign.
- `reference/plaza-street.jpg`: plaza frontage along a main road; storefronts, sign boards, sidewalk, street lights, tree-lined road.
- `reference/residential-crossing.jpg`: narrow street between stucco buildings; dappled tree shadows, sidewalks, crosswalk, painted STOP.

## The look in one line

Sunny, clean, cheerful **stylized realism**: chunky faceted low-poly trees, smooth simplified buildings and streets, warm late-afternoon sun with soft dappled shadows, saturated blue sky. Toy-like but recognisable as a real place.

## Two kinds of surface

This is the most important rule. Get it wrong and the style falls apart.

| Kind        | What                                                                            | How it looks                                                                                |
| ----------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Faceted** | Tree canopies, bushes, hedges, clouds                                           | Clearly low-poly: flat-shaded facets, chunky clustered blobs, 2–3 green tones per canopy    |
| **Smooth**  | Everything else: buildings, roofs, roads, curbs, sidewalks, poles, signs, props | Simple clean shapes with smooth shading, small bevels on edges, no visible facets, no grime |

Do **not** facet buildings or roads, and do **not** make trees smooth.

## Trees and plants

- **Canopy:** a cluster of 4–8 rounded faceted blobs (icosphere detail 1–2, slightly squashed and jittered), merged into one mesh. Lighter green on top and sun side, darker underneath. Vertex colours, `flatShading: true`.
- **Trunk:** smooth, brown, gently tapering; on large trees, 2–3 visible branches splitting into the canopy. The trunk shows clearly below the canopy so you can walk under it.
- **Shapes:** leafy round (most common), tall narrow, umbrella pine (flat wide top on a tall bare trunk), small ornamental. Vary size, rotation and tint per tree using the seeded RNG.
- **Bushes and hedges:** same faceted blobs; hedges are long rounded boxes of blobs, darker green.
- **Grass:** flat bright yellow-green ground with sparse low-poly tufts (a few triangles each) near curbs and edges. No grass textures with visible blades.
- **Budgets:** trees 300–800 triangles, bushes under 150, tufts under 10.

## Ground and streets

- **Asphalt:** dark warm grey, very subtle noise or colour variation so it doesn't look flat up close. No cracks or potholes in the MVP.
- **Markings:** crisp clean white (lane edges, parking stalls, crosswalk zebras, painted STOP), warm yellow centre lines. Slightly raised above the road to avoid z-fighting.
- **Curbs:** about 0.15 m high, light grey, rounded top edge. Always present where a road meets lawn or sidewalk.
- **Sidewalks:** light warm concrete with visible panel joints every 1.5–2 m (a slightly darker line).
- **Parking lots:** same asphalt as roads with white stall lines; lawn islands with curbs at the ends.

## Buildings

- **Walls:** smooth flat colour, light stucco feel. Light **base band** (concrete/stone, 0.6–1 m) at ground level on most buildings.
- **Roofs:** strong **terracotta clay tile** for plazas and many houses (ridged tile rows), or flat roofs with a dark parapet cap. Generous overhangs with a cream fascia.
- **Plazas:** long single-storey strip, pillars between bays, a raised **gabled pediment** over the main entrance or anchor shop, a covered walkway, big dark-glass storefronts with navy or dark frames.
- **Windows:** set back into the wall with a light sill or frame; dark glass with a hint of sky reflection. Houses may have roller shutters.
- **Details that sell it** (later, as kit pieces): wall lamps, downpipes, AC units, meter boxes, flower carts, hanging baskets, awnings.
- **Proportions:** slightly chunky and simplified: thicker frames, deeper recesses and bigger sign boards than real life, so they read at a distance.

## Signs

- Big, bold, high-contrast **sign boards** with the real shop **name**, in our own clean sans-serif or slab font. Readable from across the parking lot.
- Board colours from the palette (cream, navy, red, green, teal) with white or dark text.
- **Never copy real logos.** Names only, plus at most a simple generic icon (a leaf, a cart) drawn in our style.
- Street furniture signs (stop, street names) are standard shapes with clean flat colours.

## Sky, light and atmosphere

- **Time of day:** warm late afternoon. Sun about 35–45° up, slightly from the side, so buildings get a lit face and a shaded face.
- **Shadows:** clearly visible, soft-edged, slightly blue-grey (not black). Tree shadows on roads and walls should read as **dappled** blobs; this is a signature of the style.
- **Sky:** saturated blue at the top fading to a paler blue at the horizon, with a few puffy white clouds (soft or lightly faceted, shaded light blue underneath).
- **Haze:** light blue distance fog so far trees and buildings fade softly.
- **Overall:** bright, warm, clean. No grime, litter, graffiti, rust or night scenes by default.

### Three.js starting values (`apps/web/src/render` only)

```ts
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const sun = new THREE.DirectionalLight(0xffe6c0, 3.0); // warm sun; the ONE shadow caster
const sky = new THREE.HemisphereLight(0xbfd9f5, 0x8a9a5b, 1.0); // sky blue above, grassy bounce below
scene.fog = new THREE.Fog(0xcfe3f5, 120, 450);
```

Tune by eye against the reference images, then update these numbers here.

## Palette (starting hex values)

Put these on the shared `palette.png` and use them for generated surfaces. Pick from the palette instead of inventing colours.

| Use                                     | Hex                                           |
| --------------------------------------- | --------------------------------------------- |
| Sky top / horizon                       | `#5B9BE6` / `#A9CDF2`                         |
| Cloud / cloud shade                     | `#FFFFFF` / `#DCE6F5`                         |
| Foliage light / mid / dark              | `#9BC34A` / `#6E9E2E` / `#4A7A22`             |
| Hedge                                   | `#4F8A2A`                                     |
| Trunk / trunk shade                     | `#7A4E2D` / `#5A3820`                         |
| Grass / grass shade                     | `#7DB83A` / `#5E9A2A`                         |
| Asphalt                                 | `#55545A`                                     |
| Road white / centre yellow              | `#F2F2EE` / `#F2B530`                         |
| Sidewalk / joints                       | `#D9D2C5` / `#BDB5A8`                         |
| Curb / wall base band                   | `#CFCAC0` / `#BEB8AC`                         |
| Roof terracotta / shade                 | `#D9622B` / `#B44A20`                         |
| Stucco beige / tan                      | `#D8C29A` / `#C9A878`                         |
| Ochre wall / white render               | `#E6B85C` / `#F1EFEA`                         |
| Cream trim                              | `#EFE6D2`                                     |
| Charcoal (caps, frames, poles)          | `#3A3B3F`                                     |
| Storefront navy                         | `#23397A`                                     |
| Window glass                            | `#2E3B47`                                     |
| Sign accents: red / green / teal / navy | `#C8372D` / `#6FA83A` / `#2F7F8C` / `#1F3F8F` |

## Scope reminder

The references also show cars, utility poles with wires, street lights and detailed facades. Those match the style but are **not in the MVP** (see `CLAUDE.md`). Don't add them unless asked. In the MVP, apply this style to: roads, curbs, sidewalks, lawns, parking lots, box buildings with flat (or simple gabled) roofs, sign boards, trees, a few props, sky and lighting.

## Checklist before calling visual work done

1. Trees faceted, everything else smooth?
2. Colours taken from the palette?
3. Warm sun, soft blue-grey shadows, dappled tree shadows visible?
4. Curbs, sidewalk joints and road markings present and crisp?
5. Signs readable, names only, no real logos?
6. Real scale (1 unit = 1 m, eye height 1.7 m) and within triangle budgets?
7. Side by side with `reference/`: does it feel like the same world?
