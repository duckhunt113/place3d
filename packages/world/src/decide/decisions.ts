// Turns raw rule results into typed decisions the generator can rely on.
// Anything unreadable falls back to a safe value, so a decision never fails.

import type {
  BuildingDecision,
  ColorName,
  DecisionSource,
  GeoFeature,
  RoadDecision,
  RoofShape,
} from "../types.ts";
import { createRng } from "../util/rng.ts";
import type { Facts, RuleEngine, RuleResult } from "./engine.ts";
import { parseMetres, parseNumber } from "./units.ts";

type Building = Extract<GeoFeature, { kind: "building" }>;
type Road = Extract<GeoFeature, { kind: "road" }>;

const STOREY_HEIGHT_M = 3;
const ROOFS: readonly RoofShape[] = ["flat", "gabled", "hipped", "pyramidal"];

function sourceOf(result: RuleResult): DecisionSource {
  if (result.usedTag) return "osm";
  return result.onlyDefaults ? "default" : "rule";
}

function text(value: unknown, fallback: string): string {
  return typeof value === "string" && value !== "" ? value : fallback;
}

/** What a building is and how big, from its tags, the rules and its geometry facts. */
export function decideBuilding(
  engine: RuleEngine,
  building: Building,
  facts: Facts,
): BuildingDecision {
  const result = engine.decide("buildings", building.tags, facts) ?? {
    values: {},
    rules: [],
    usedTag: false,
    onlyDefaults: true,
  };
  const v = result.values;
  const storeys = Math.max(1, parseNumber(v.storeys) ?? 2);
  const taggedHeight = parseMetres(v.heightM);
  const colours = Array.isArray(v.colour)
    ? v.colour.filter((c): c is ColorName => typeof c === "string")
    : [];
  // The same building always gets the same colour: the pick is seeded by its OSM id.
  const colour =
    colours.length > 0 ? createRng(`${building.osmId}/colour`).pick(colours) : "house.grey";
  const roof = ROOFS.find((shape) => shape === v.roof) ?? "flat";
  return {
    kind: "building",
    osmId: building.osmId,
    type: text(v.type, "house"),
    storeys,
    heightM: taggedHeight && taggedHeight > 0 ? taggedHeight : storeys * STOREY_HEIGHT_M,
    roof,
    colour,
    shopSigns: v.shopSigns === true,
    rules: result.rules,
    source: sourceOf(result),
  };
}

function sidewalks(value: unknown): RoadDecision["sidewalks"] {
  if (value === "both" || value === "yes") return "both";
  if (value === "left" || value === "right") return value;
  return "none";
}

/** How wide a road is and what goes beside it. Undefined for lines no rule covers. */
export function decideRoad(engine: RuleEngine, road: Road): RoadDecision | undefined {
  const result = engine.decide("roads", road.tags);
  if (!result) return undefined;
  const v = result.values;
  const lanes = Math.max(1, parseNumber(v.lanes) ?? 2);
  const laneWidth = parseMetres(v.laneWidthM) ?? 3.5;
  const width = parseMetres(v.widthM);
  // Rules mark roads that should not be drawn (not built yet, platforms) with kind "none".
  if (v.kind === "none") return undefined;
  const kind = v.kind === "driveway" || v.kind === "path" ? v.kind : "road";
  return {
    kind,
    osmId: road.osmId,
    widthM: width && width > 0 ? width : lanes * laneWidth,
    sidewalks: sidewalks(v.sidewalks),
    curbs: v.curbs === true,
    markings: v.markings === "centre" ? "centre" : "none",
    surface: text(v.surface, "asphalt"),
    rules: result.rules,
    source: sourceOf(result),
  };
}
