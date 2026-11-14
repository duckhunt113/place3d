---
name: osm-tag-rules
description: Use when writing, changing or reviewing how OpenStreetMap tags become decisions in Somewhere - the rules in packages/world/src/decide/rules/*.json, the rule engine in packages/world/src/decide, or anything about building types, storeys, roads, lanes, sidewalks, surfaces, scattered trees or which kind of object goes where.
---

# OSM tag rules for Somewhere

OSM tags say *what* something is. Rules decide *what the game builds for it*. Rules are **data**, not code (`CLAUDE.md`, hard rule 12): JSON files in `packages/world/src/decide/rules/`, applied by one small generic engine in `packages/world/src/decide`. Format and engine behaviour are in `docs/03-architecture.md` (`Rule`, `RuleSet`).

## Never

- Never write tag-specific `if/else` in code. Add or change a rule instead.
- Never put an asset ID or file name in a rule. Rules output **requests** (`{ "category": "tree", "want": { "leafType": "needleleaved" } }`); the catalog selector picks the model.
- Never invent a colour. `surface` and `colour` values are palette names from `apps/web/public/assets/palette.json`.
- Never rename or delete a rule `id` once worlds may depend on it. Change its contents, or add a more specific rule.
- Never put geometry thresholds in code. Put them in the rule's `where`.

## Files (one per domain)

| File | Covers | Typical output |
|---|---|---|
| `buildings.json` | `building=*` and building tags | `type`, `storeys`, `roof`, `colour` (list of palette names, seeded pick), `shopSigns` |
| `roads.json` | `highway=*` lines | `kind`, `lanes`, `laneWidthM` or `widthM`, `sidewalks`, `curbs`, `markings`, `surface` |
| `areas.json` | landuse, leisure, natural, amenity areas | `surface`, `markings`, `scatter` (asset requests per m²) |
| `objects.json` | points and lines that place models | `place` (`point` or `along`), `spacingM`, `asset` request, `heightM` |

## Rule format

```json
{ "id": "building.retail",
  "when":  { "building": ["retail", "commercial"] },
  "where": { "footprintM2": { "gte": 30 } },
  "priority": 0,
  "then":  { "type": "retail", "storeys": 1, "colour": ["house.beige", "cream"] } }
```

- `when`: every key must match. Value = exact string, a list of strings, or `"*"` (tag present, any value).
- `where` (optional): geometry facts computed in code, with thresholds here. Available facts: `footprintM2`, `insideLanduse`, `shopNodesInside`. Adding a new fact is a code change (with tests) plus a doc update.
- `then`: decision fields. A string starting with `@` copies that tag's value (`"@building:levels"`, `"@lanes"`, `"@leaf_type"`). If the tag is missing, the field is left out.
- `priority`: `100` for rules that copy a real OSM tag (tags always win). Leave it out (0) otherwise.

## How rules combine

1. Collect rules whose `when` keys the feature has (the engine indexes by tag key).
2. Keep those whose `when` and `where` match.
3. Apply from least to most specific (fewer → more `when` keys), then by `priority`, then by `id`. Later rules override earlier fields.
4. Each domain has a catch-all (`"*"`) rule so something sensible always comes out.

So: `building=*` catch-all → `building=house` → `building:levels` tag copy (priority 100).

## Adding or changing a rule

1. **Check OSM usage first:** the tag's wiki page (wiki.openstreetmap.org) and how it's really used (taginfo.openstreetmap.org). Prefer common tags and values.
2. Pick the domain file. Give the rule a stable id: `<domain-ish>.<what>`, lowercase with dots or dashes (`road.driveway`, `building.yes.tiny`).
3. Write the most general rule that does the job. Add a more specific rule only for a real difference.
4. Output palette names and asset **requests** only. If the catalog lacks a category or attribute you need, add catalog entries rather than naming a model.
5. If the change alters existing worlds, bump the file's `version`.
6. Run `pnpm test` (rules are validated in `packages/world/src/decide/rules.test.ts`), and add an engine test with a fixture when behaviour changes.
7. If the rule reflects a new design decision, update `docs/06-decisions-and-ai.md`.

## OSM gotchas

- **Several values:** `shop=bakery;cafe`. Split on `;` and match any.
- **Units:** `height=12`, `height=12 m`, `width=3.5` are metres; `height=40'` is feet. Parse safely; ignore anything you can't parse.
- **`building:levels`** counts floors above ground; storeys × 3 m unless `height` exists (`height` wins).
- **`lanes`** is the total for both directions unless `lanes:forward`/`lanes:backward` exist. One-way roads (`oneway=yes`) still use `lanes` as given.
- **`sidewalk`** values: `both`, `left`, `right`, `no`/`none`, `separate` (drawn as its own footway, so don't add one).
- **`building=yes`** means "a building, type unknown". Use the geometry facts and nearby tags, then the catch-all.
- **Case and spaces:** tag values are case-sensitive and usually lowercase with underscores. Don't normalise silently; add the variant to the rule's list if it's common.
- **Missing tags are normal.** Never require a tag that's often absent; give a safe default.

## Before calling a rules change done

1. No tag-specific code; rules only in JSON.
2. No asset IDs or file names in rules; categories exist in the catalog.
3. Colours and surfaces are palette names.
4. Ids unique and stable; version bumped if worlds change.
5. `pnpm test` passes; docs updated if the design changed.
