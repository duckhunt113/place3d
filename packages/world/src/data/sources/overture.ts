// Building outlines from Overture Maps, used only to fill the gaps where OSM has no buildings
// (docs/05-data-sources.md). Overture publishes files, not a query service, so this module
// only reads an extract that was already downloaded (GeoJSON from Overture's own tool);
// the fixture script and, later, the tile builder do the downloading.

import type { ExtraBuilding, LatLon, OvertureId, Tags } from "../../types.ts";
import { type Pair, signedArea } from "../../util/geometry.ts";
import { closedLineToRing } from "../parse.ts";

/** Overture's name for outlines that come from OSM itself. OSM data is read from OSM, with all its tags. */
const OSM_DATASET = "OpenStreetMap";

/** Seven decimals of a degree is about a centimetre: plenty, and it keeps saved tiles small. */
const DECIMALS = 1e7;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function round(value: number): number {
  return Math.round(value * DECIMALS) / DECIMALS;
}

/** A GeoJSON ring ([lon, lat] pairs, closed) as a usable outline, or undefined. */
function toRing(raw: unknown): LatLon[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const points: LatLon[] = [];
  for (const pair of raw) {
    if (!Array.isArray(pair)) return undefined;
    const [lon, lat] = pair;
    if (typeof lon !== "number" || typeof lat !== "number") return undefined;
    points.push({ lat: round(lat), lon: round(lon) });
  }
  return closedLineToRing(points);
}

function area(ring: LatLon[]): number {
  return Math.abs(signedArea(ring.map((p): Pair => [p.lon, p.lat])));
}

/** The outer outline of a Polygon, or the largest one of a MultiPolygon (as for OSM relations). */
function outline(geometry: unknown): LatLon[] | undefined {
  if (!isRecord(geometry) || !Array.isArray(geometry.coordinates)) return undefined;
  if (geometry.type === "Polygon") return toRing(geometry.coordinates[0]);
  if (geometry.type !== "MultiPolygon") return undefined;
  let best: LatLon[] | undefined;
  for (const polygon of geometry.coordinates) {
    const ring = Array.isArray(polygon) ? toRing(polygon[0]) : undefined;
    if (ring && (!best || area(ring) > area(best))) best = ring;
  }
  return best;
}

/** Who the outline itself came from: the source entry that covers the whole feature. */
function datasetOf(sources: unknown): string {
  if (!Array.isArray(sources)) return "Overture";
  const records = sources.filter(isRecord);
  // The entry with an empty `property` covers the whole feature; the others cover single fields.
  const whole = records.find((s) => s.property === "" || s.property == null) ?? records[0];
  return typeof whole?.dataset === "string" && whole.dataset !== "" ? whole.dataset : "Overture";
}

/**
 * Overture's fields as OSM-style tags, so the same rules decide what the building becomes:
 * class -> building (else "yes"), height -> height, num_floors -> building:levels,
 * roof_shape -> roof:shape, name -> name.
 */
function tagsOf(properties: Record<string, unknown>): Tags {
  const kind = properties.class;
  const tags: Tags = { building: typeof kind === "string" && kind !== "" ? kind : "yes" };
  const { height, num_floors: floors, names } = properties;
  if (typeof height === "number" && height > 0) tags.height = String(Math.round(height * 10) / 10);
  if (typeof floors === "number" && floors >= 1)
    tags["building:levels"] = String(Math.round(floors));
  // Overture uses OSM's own words for roof shapes (flat, gabled, hipped, ...). Rarely filled in.
  const roof = properties.roof_shape;
  if (typeof roof === "string" && roof !== "") tags["roof:shape"] = roof;
  const name = isRecord(names) ? names.primary : undefined;
  if (typeof name === "string" && name !== "") tags.name = name;
  return tags;
}

/**
 * Reads an Overture buildings extract (a GeoJSON FeatureCollection) into gap-fill candidates,
 * in id order. Skipped: outlines that came from OSM, underground buildings, broken shapes.
 * The result still has to go through `fillBuildingGaps` before it is saved in a tile.
 */
export function overtureBuildings(collection: unknown): ExtraBuilding[] {
  if (!isRecord(collection) || !Array.isArray(collection.features)) {
    throw new TypeError("Overture extract is not a GeoJSON FeatureCollection");
  }
  const byId = new Map<OvertureId, ExtraBuilding>();
  for (const feature of collection.features) {
    if (!isRecord(feature)) continue;
    const properties = isRecord(feature.properties) ? feature.properties : {};
    // Overture's tool writes the id at the top of the feature; older versions put it in properties.
    const rawId = feature.id ?? properties.id;
    if (typeof rawId !== "string" || rawId === "") continue;
    if (properties.is_underground === true) continue;
    const dataset = datasetOf(properties.sources);
    if (dataset === OSM_DATASET) continue;
    const footprint = outline(feature.geometry);
    if (!footprint) continue;
    const id: OvertureId = `overture/${rawId}`;
    byId.set(id, { id, dataset, footprint, tags: tagsOf(properties) });
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
