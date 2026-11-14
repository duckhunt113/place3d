// Live OSM data from the public Overpass API: one query per tile.
// For development only; players never depend on it at launch (docs/05-data-sources.md).
// It returns OSM data only: gap-fill buildings (Overture) are added when tiles are saved or built.

import type { LatLon, OsmElement, TileData, TileId, TileSource } from "../../types.ts";
import { type LatLonBox, tileBounds } from "../tiles.ts";

export const OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";

/**
 * Bump when the saved tile format changes (pre-built tile paths use it: tiles/v2/...).
 * 2: tiles can carry gap-fill buildings (`buildings`).
 */
export const TILE_FORMAT_VERSION = 2;

// What the game reads from the map. Relations are fetched for buildings only: a big water
// relation such as a lake would pull in megabytes of outline for one tile.
const SELECTORS = [
  'way["highway"]',
  'way["building"]',
  'relation["building"]["type"="multipolygon"]',
  'way["landuse"]',
  'way["leisure"]',
  'way["natural"~"^(water|wood|scrub|sand|beach|tree_row)$"]',
  'way["amenity"="parking"]',
  'way["barrier"="hedge"]',
  'node["natural"~"^(tree|shrub)$"]',
  'node["shop"]',
  'node["amenity"]',
  'node["emergency"="fire_hydrant"]',
  'node["highway"="stop"]',
];

/** The Overpass QL query for everything that touches a box. `out geom` returns full shapes. */
export function overpassQuery(box: LatLonBox): string {
  const bbox = [box.south, box.west, box.north, box.east].join(",");
  return `[out:json][timeout:25][bbox:${bbox}];\n(\n${SELECTORS.map((s) => `  ${s};`).join("\n")}\n);\nout geom;`;
}

export class OverpassError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OverpassError";
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toPoints(value: unknown): LatLon[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const points: LatLon[] = [];
  for (const item of value) {
    if (isRecord(item) && typeof item.lat === "number" && typeof item.lon === "number") {
      points.push({ lat: item.lat, lon: item.lon });
    }
  }
  return points;
}

function toTags(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const tags: Record<string, string> = {};
  for (const [key, tag] of Object.entries(value)) {
    if (typeof tag === "string") tags[key] = tag;
  }
  return tags;
}

/** Keeps only the fields the game uses, so every source returns the same shape. */
function toElement(raw: unknown): OsmElement | undefined {
  if (!isRecord(raw) || typeof raw.id !== "number") return undefined;
  if (raw.type !== "node" && raw.type !== "way" && raw.type !== "relation") return undefined;
  const element: OsmElement = { type: raw.type, id: raw.id };
  const tags = toTags(raw.tags);
  if (tags) element.tags = tags;
  if (typeof raw.lat === "number" && typeof raw.lon === "number") {
    element.lat = raw.lat;
    element.lon = raw.lon;
  }
  const geometry = toPoints(raw.geometry);
  if (geometry) element.geometry = geometry;
  if (Array.isArray(raw.members)) {
    element.members = [];
    for (const member of raw.members) {
      if (!isRecord(member) || typeof member.ref !== "number") continue;
      const points = toPoints(member.geometry);
      element.members.push({
        type: String(member.type),
        ref: member.ref,
        role: typeof member.role === "string" ? member.role : "",
        ...(points ? { geometry: points } : {}),
      });
    }
  }
  return element;
}

/** Turns an Overpass JSON answer into tile data. Throws if the answer is not usable. */
export function tileDataFromOverpass(id: TileId, json: unknown, fetchedAt: string): TileData {
  if (!isRecord(json) || !Array.isArray(json.elements)) {
    throw new OverpassError("Overpass answer has no elements list", 200);
  }
  if (typeof json.remark === "string" && /error|timed out/i.test(json.remark)) {
    throw new OverpassError(`Overpass could not finish the query: ${json.remark}`, 200);
  }
  const elements: OsmElement[] = [];
  for (const raw of json.elements) {
    const element = toElement(raw);
    if (element) elements.push(element);
  }
  return { id, version: TILE_FORMAT_VERSION, source: "overpass", fetchedAt, elements };
}

export type OverpassOptions = {
  /** Returns the current time as an ISO string. Passed in so tests never use the real clock. */
  now: () => string;
  endpoint?: string;
  fetch?: typeof fetch;
  /** Scripts and servers set this to identify the app. Browsers cannot (they send a Referer instead). */
  userAgent?: string;
};

/** Runs one Overpass query and returns the parsed JSON. */
export async function runOverpassQuery(query: string, options: OverpassOptions): Promise<unknown> {
  const send = options.fetch ?? fetch;
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  };
  if (options.userAgent) headers["User-Agent"] = options.userAgent;
  const response = await send(options.endpoint ?? OVERPASS_ENDPOINT, {
    method: "POST",
    headers,
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!response.ok) {
    throw new OverpassError(`Overpass answered ${response.status}`, response.status);
  }
  return response.json();
}

export class OverpassTileSource implements TileSource {
  readonly #options: OverpassOptions;

  constructor(options: OverpassOptions) {
    this.#options = options;
  }

  async getTile(id: TileId): Promise<TileData> {
    const json = await runOverpassQuery(overpassQuery(tileBounds(id)), this.#options);
    return tileDataFromOverpass(id, json, this.#options.now());
  }
}
