// Turns raw rule results into typed decisions the generator can rely on.
// Anything unreadable falls back to a safe value, so a decision never fails.

import type {
  AreaDecision,
  AssetRequest,
  BuildingDecision,
  ColorName,
  DecisionSource,
  FeatureId,
  GeoFeature,
  ObjectDecision,
  RoadDecision,
  RoofShape,
  ScatterRule,
} from "../types.ts";
import { createRng } from "../util/rng.ts";
import type { Facts, RuleEngine, RuleResult } from "./engine.ts";
import { parseMetres, parseNumber } from "./units.ts";

type Building = Extract<GeoFeature, { kind: "building" }>;
type Road = Extract<GeoFeature, { kind: "road" }>;
type Area = Extract<GeoFeature, { kind: "area" }>;
type Point = Extract<GeoFeature, { kind: "point" }>;

const STOREY_HEIGHT_M = 3;
const ROOFS: readonly RoofShape[] = ["flat", "gabled", "hipped", "pyramidal"];

/** A copied tag is a real mapped value: from OSM, or measured by Overture for its buildings. */
function sourceOf(result: RuleResult, id: FeatureId): DecisionSource {
  if (result.usedTag) return id.startsWith("overture/") ? "overture" : "osm";
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
  // The same building always gets the same colour: the pick is seeded by its feature id.
  const colour =
    colours.length > 0 ? createRng(`${building.id}/colour`).pick(colours) : "house.grey";
  const roof = ROOFS.find((shape) => shape === v.roof) ?? "flat";
  const roofColours = Array.isArray(v.roofColour)
    ? v.roofColour.filter((c): c is ColorName => typeof c === "string")
    : [];
  const roofColour =
    roofColours.length > 0 ? createRng(`${building.id}/roof`).pick(roofColours) : "roof.dark";
  return {
    kind: "building",
    id: building.id,
    type: text(v.type, "house"),
    storeys,
    heightM: taggedHeight && taggedHeight > 0 ? taggedHeight : storeys * STOREY_HEIGHT_M,
    roof,
    colour,
    roofColour,
    shopSigns: v.shopSigns === true,
    rules: result.rules,
    source: sourceOf(result, building.id),
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
    id: road.id,
    widthM: width && width > 0 ? width : lanes * laneWidth,
    sidewalks: sidewalks(v.sidewalks),
    curbs: v.curbs === true,
    markings: v.markings === "centre" ? "centre" : "none",
    stalls: v.stalls === true,
    surface: text(v.surface, "asphalt"),
    rules: result.rules,
    source: sourceOf(result, road.id),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Reads `{ category, want }`, keeping only plain text and number wants (a missing tag leaves a want out). */
export function toAssetRequest(value: unknown): AssetRequest | undefined {
  if (!isRecord(value) || typeof value.category !== "string" || value.category === "") {
    return undefined;
  }
  const request: AssetRequest = { category: value.category };
  if (isRecord(value.want)) {
    const want: Record<string, string | number> = {};
    for (const [key, wanted] of Object.entries(value.want)) {
      if (typeof wanted === "string" || typeof wanted === "number") want[key] = wanted;
    }
    if (Object.keys(want).length > 0) request.want = want;
  }
  return request;
}

function toScatter(value: unknown): ScatterRule[] {
  if (!Array.isArray(value)) return [];
  const out: ScatterRule[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const asset = toAssetRequest(item.asset);
    const perM2 = parseNumber(item.perM2);
    if (asset && perM2 !== undefined && perM2 > 0) out.push({ asset, perM2 });
  }
  return out;
}

/** What surface an area gets, how it stacks with other areas, and what is scattered on it. */
export function decideArea(engine: RuleEngine, area: Area): AreaDecision | undefined {
  const result = engine.decide("areas", area.tags);
  if (!result) return undefined;
  const v = result.values;
  if (typeof v.surface !== "string" || v.surface === "") return undefined;
  return {
    kind: "area",
    id: area.id,
    surface: v.surface,
    layer: Math.max(0, parseNumber(v.layer) ?? 1),
    markings: v.markings === "stalls" ? "stalls" : "none",
    scatter: toScatter(v.scatter),
    rules: result.rules,
    source: sourceOf(result, area.id),
  };
}

/** Names longer than this are cut short on signs. */
const MAX_SIGN_TEXT = 48;

/**
 * Which kind of model a mapped point becomes: a model at its own spot, or a name sign on a
 * wall. Undefined for points no rule turns into a model, for rules that place things along
 * a line, and for signs with nothing to say.
 */
export function decideObject(
  engine: RuleEngine,
  point: Pick<Point, "id" | "tags">,
): ObjectDecision | undefined {
  const result = engine.decide("objects", point.tags);
  const place = result?.values.place;
  if (!result || (place !== "point" && place !== "wall")) return undefined;
  const asset = toAssetRequest(result.values.asset);
  if (!asset) return undefined;
  const decision: ObjectDecision = {
    kind: "object",
    id: point.id,
    place,
    asset,
    rules: result.rules,
    source: sourceOf(result, point.id),
  };
  const colours = Array.isArray(result.values.colour)
    ? result.values.colour.filter((c): c is ColorName => typeof c === "string")
    : [];
  if (colours.length > 0) decision.colour = createRng(`${point.id}/colour`).pick(colours);
  if (place === "wall") {
    const words = text(result.values.text, "").replace(/\s+/g, " ").trim();
    if (words === "") return undefined;
    decision.text =
      words.length > MAX_SIGN_TEXT ? `${words.slice(0, MAX_SIGN_TEXT - 1).trim()}…` : words;
  }
  return decision;
}
