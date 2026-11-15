# 11 — Legal, privacy and safety

_Practical notes from planning, not legal advice. Check the licences yourself before launching, especially if the app will make money._

## OpenStreetMap (ODbL)

- Free to use, including commercially.
- **Attribution required:** show "© OpenStreetMap contributors" in the app. The app's credit line is "© OpenStreetMap contributors, Overture Maps Foundation".
- If you modify the _data itself_ and share it, those changes must be shared under the same licence. Your code and 3D models stay yours.
- Respect Overpass fair use (see [05-data-sources.md](05-data-sources.md)); switch to our own pre-built tiles at scale.

## Overture Maps buildings (ODbL)

- Used only for building outlines where OpenStreetMap has no building (see [05-data-sources.md](05-data-sources.md)).
- Overture's buildings set is under the **ODbL**, the same licence as OpenStreetMap, because it contains OpenStreetMap data. Free to use, including commercially; the same share-alike rule applies to the _data_.
- The outlines we actually use come from the open datasets Overture merges in: Microsoft's building footprints, Esri Community Maps and Google Open Buildings. Each saved building records which one (`dataset`).
- **Credit:** Overture asks for no fixed wording; we show "Overture Maps Foundation" next to the OpenStreetMap credit. Before launch, add a credits screen that also names Microsoft, Esri Community Maps and Google Open Buildings.

## Mapillary (CC BY-SA 4.0)

- Attribution per image: "Images from Mapillary, CC BY-SA, by @username". Keep an attribution list in the app.
- ShareAlike applies to adaptations. For a paid app, read the terms or get a commercial licence.

## Aerial imagery

Only use imagery whose licence allows deriving data (detections, colours). Some providers allow viewing or OSM tracing only.

## Google: don't use as a source

- Street View, Google Maps and Photorealistic 3D Tiles: their terms forbid exporting, extracting or scraping content, caching beyond what's permitted, and offline use.
- Don't derive models or data from them.
- Comparing your result to Street View by eye during development is fine.
- **Google Open Buildings is different:** it is an openly licensed dataset, not part of Google Maps. Some Overture outlines come from it, and using it through Overture is allowed.

## Brands and logos

Draw **shop names in our own font and colours**. Don't copy real brand logos: they're trademarks. Names alone are recognisable.

The sign lettering is **Fredoka**, under the SIL Open Font License 1.1: free to use and bundle, including commercially. It is bundled with the app through the `@fontsource/fredoka` package.

## Private homes

| Place type                                                           | Detail level                                                                   |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **Public places** (shops, plazas, parks, courts, schools, landmarks) | Full detail from photos                                                        |
| **Private homes**                                                    | Right footprint, roof shape, general colour; the rest from a generic style kit |

Don't replicate specific private homes' detailed look (gates, entrances, security features) from photos.

## Kids' safety

The style is kid-friendly, so:

- Filter anything players type (restyle prompts, chat) and anything AI says.
- When multiplayer arrives: friends-only rooms by default, reporting, no exact personal locations shown.
- Be careful with features that reveal where a player lives. Entering your own address is a private choice; don't broadcast it to other players.

## Missing-data additions

Keep your own game-layer additions separate from OSM and Overture data. Contributions _to_ OSM follow OSM's contributor terms.
