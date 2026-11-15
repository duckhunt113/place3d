// Fetches the map tiles for the MVP test area ONCE and saves them in the repo:
//   packages/world/src/data/fixtures/tiles/17-<x>-<y>.json   one saved tile each
//   packages/world/src/data/fixtures/tiles/index.ts          the list the game and tests load from
//
// Two sources (docs/05-data-sources.md):
//   OSM, through Overpass: roads, areas, points and the buildings OSM has.
//   Overture Maps: building outlines for the gaps, downloaded with Overture's own tool
//   (`overturemaps`, run through `uvx`). Outlines that overlap an OSM building are dropped.
//
// Usage:  pnpm fixtures
//         pnpm fixtures --buildings-only             keep the saved OSM data, refresh only the Overture buildings
//         pnpm fixtures --no-overture                OSM only
//         pnpm fixtures --overture-file area.geojson use an Overture extract that was already downloaded
//         pnpm fixtures --lat 43.52 --lon -79.62     use these coordinates instead of looking up the street
//         pnpm fixtures --name "Some Street" --near 43.45,-79.75,43.65,-79.50
//         pnpm fixtures --dry-run                    show what would be fetched, fetch nothing
//
// It uses the same tile grid, Overpass query and gap-filling code as the game, so saved tiles
// and built tiles always have the same shape. Each tile's data reaches a little past its
// edges (the tile margin), so curbs and sidewalks line up between tiles.
// Be kind to the public servers: run this rarely.

import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildingsTouching, fillBuildingGaps } from "../packages/world/src/data/gaps.ts";
import { parseElements } from "../packages/world/src/data/parse.ts";
import {
  OVERPASS_ENDPOINT,
  runOverpassQuery,
  TILE_FORMAT_VERSION,
  tileDataFromOverpass,
  tileQuery,
} from "../packages/world/src/data/sources/overpass.ts";
import { overtureBuildings } from "../packages/world/src/data/sources/overture.ts";
import {
  type LatLonBox,
  tileBounds,
  tileKey,
  tilesInRadius,
} from "../packages/world/src/data/tiles.ts";
import type { ExtraBuilding, LatLon, TileData } from "../packages/world/src/types.ts";

const OUT_DIR = "packages/world/src/data/fixtures/tiles";
const USER_AGENT = "Somewhere/0.1 (MVP fixture fetch; run by a developer, a few requests)";
const FALLBACK_ENDPOINT = "https://overpass.kumi.systems/api/interpreter";

function option(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const name = option("name") ?? "Albertson Crescent";
// South, west, north, east of the area to search for the street: Mississauga by default.
const near = option("near") ?? "43.45,-79.75,43.65,-79.50";
const radius = Number(option("radius") ?? 300);
const dryRun = process.argv.includes("--dry-run");
const buildingsOnly = process.argv.includes("--buildings-only");
const useOverture = !process.argv.includes("--no-overture");
const overtureFile = option("overture-file");
const endpoints = option("endpoint")
  ? [option("endpoint") as string]
  : [OVERPASS_ENDPOINT, FALLBACK_ENDPOINT];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => new Date().toISOString();

/** Runs a query, trying each server and waiting between attempts when a server is busy. */
async function ask(query: string): Promise<unknown> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    for (const endpoint of endpoints) {
      try {
        return await runOverpassQuery(query, { endpoint, userAgent: USER_AGENT, now });
      } catch (error) {
        lastError = error;
        console.warn(`  ${endpoint} failed (${error instanceof Error ? error.message : error})`);
      }
    }
    if (attempt < 3) {
      console.warn(`  waiting ${attempt * 10} s before trying again...`);
      await sleep(attempt * 10_000);
    }
  }
  throw lastError;
}

/** The middle of a named street, found on the map itself. */
async function findStreet(): Promise<LatLon> {
  const query = `[out:json][timeout:25];\nway["highway"]["name"="${name.replaceAll('"', "")}"](${near});\nout geom;`;
  const answer = (await ask(query)) as { elements?: { geometry?: LatLon[] }[] };
  const points = (answer.elements ?? []).flatMap((way) => way.geometry ?? []);
  if (points.length === 0) {
    throw new Error(
      `Could not find a street named "${name}" inside ${near}.\n` +
        "Pass coordinates instead: pnpm fixtures --lat <latitude> --lon <longitude>",
    );
  }
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  return {
    lat: round((Math.min(...lats) + Math.max(...lats)) / 2),
    lon: round((Math.min(...lons) + Math.max(...lons)) / 2),
  };
}

function indexFile(centre: LatLon, keys: string[]): string {
  const loaders = keys
    .map(
      (key) =>
        `  "${key}": () => import("./${key.replaceAll("/", "-")}.json").then((m) => m.default),`,
    )
    .join("\n");
  return `// Generated by scripts/fetch-fixture-tiles.ts. Do not edit by hand; run \`pnpm fixtures\`.
// The saved map tiles for the MVP test area, loaded one at a time when asked for.

import type { LatLon, TileData } from "../../../types.ts";

/** The centre of the saved area, or undefined until the tiles have been fetched. */
export const FIXTURE_CENTRE: LatLon | undefined = { lat: ${centre.lat}, lon: ${centre.lon} };

const loaders: Record<string, () => Promise<unknown>> = {
${loaders}
};

/** Keys ("17/x/y") of the saved tiles. */
export const fixtureTileKeys: readonly string[] = Object.keys(loaders);

/** Loads one saved tile, or undefined if that tile is not saved. */
export async function loadFixtureTile(key: string): Promise<TileData | undefined> {
  const load = loaders[key];
  return load ? ((await load()) as TileData) : undefined;
}
`;
}

/** The box around every tile: the one area to ask Overture for. */
function boxAround(tiles: readonly TileData["id"][]): LatLonBox {
  const boxes = tiles.map(tileBounds);
  return {
    south: Math.min(...boxes.map((b) => b.south)),
    west: Math.min(...boxes.map((b) => b.west)),
    north: Math.max(...boxes.map((b) => b.north)),
    east: Math.max(...boxes.map((b) => b.east)),
  };
}

/** Overture's download tool: through `uvx` (nothing to install but uv), or installed directly. */
function findOvertureTool(): string[] {
  const works = (command: string, args: string[]) => spawnSync(command, args).status === 0;
  if (works("uvx", ["--version"])) return ["uvx", "overturemaps"];
  if (works("overturemaps", ["--help"])) return ["overturemaps"];
  throw new Error(
    "Overture's download tool was not found. Install uv (one command), open a new terminal\n" +
      "window, and run this again:\n" +
      "  curl -LsSf https://astral.sh/uv/install.sh | sh\n" +
      "To save OSM data only, without the gap-fill buildings: pnpm fixtures --no-overture",
  );
}

function overtureArgs(box: LatLonBox, output: string): string[] {
  const bbox = [box.west, box.south, box.east, box.north].join(",");
  return ["download", `--bbox=${bbox}`, "-f", "geojson", "--type=building", "-o", output];
}

/** Downloads (or reads) Overture's buildings for the box, as gap-fill candidates. */
function overtureCandidates(tool: string[] | undefined, box: LatLonBox): ExtraBuilding[] {
  let file = overtureFile;
  if (!file) {
    if (!tool) throw new Error("no Overture tool");
    file = join(tmpdir(), `somewhere-overture-${process.pid}.geojson`);
    const [command, ...first] = tool as [string, ...string[]];
    console.log("Downloading Overture buildings (this can take a minute)...");
    const run = spawnSync(command, [...first, ...overtureArgs(box, file)], {
      stdio: "inherit",
      timeout: 15 * 60_000,
    });
    if (run.status !== 0) {
      throw new Error(
        `Overture download failed (${run.error?.message ?? `exit code ${run.status}`}). Nothing was saved.`,
      );
    }
  }
  try {
    return overtureBuildings(JSON.parse(readFileSync(file, "utf8")));
  } finally {
    if (!overtureFile) rmSync(file, { force: true });
  }
}

/** The tiles already saved in the repo, and the centre they were fetched around. */
function readSaved(): { centre: LatLon; tiles: TileData[] } {
  const none = "No saved tiles yet. Run `pnpm fixtures` without --buildings-only first.";
  let index: string;
  try {
    index = readFileSync(join(OUT_DIR, "index.ts"), "utf8");
  } catch {
    throw new Error(none);
  }
  const match = /FIXTURE_CENTRE[^=]*=\s*\{\s*lat:\s*(-?[\d.]+),\s*lon:\s*(-?[\d.]+)/.exec(index);
  const files = readdirSync(OUT_DIR)
    .filter((file) => file.endsWith(".json"))
    .sort();
  if (!match || files.length === 0) throw new Error(none);
  const tiles = files.map(
    (file) => JSON.parse(readFileSync(join(OUT_DIR, file), "utf8")) as TileData,
  );
  if (tiles.some((tile) => tile.version !== TILE_FORMAT_VERSION)) {
    throw new Error(
      "The saved tiles are in an older format, so their map data has to be fetched again. " +
        "Run `pnpm fixtures` without --buildings-only.",
    );
  }
  return { centre: { lat: Number(match[1]), lon: Number(match[2]) }, tiles };
}

/** Fetches the OSM data of every tile around the centre from Overpass. */
async function fetchOsm(centre: LatLon): Promise<TileData[]> {
  const fetched: TileData[] = [];
  for (const id of tilesInRadius(centre, radius)) {
    // Each tile's data reaches a little past its edges (the tile margin), like the game's own query.
    const json = await ask(tileQuery(id));
    const data = tileDataFromOverpass(id, json, now());
    console.log(`  ${tileKey(id)}: ${data.elements.length} elements`);
    fetched.push(data);
    await sleep(1500);
  }
  return fetched;
}

async function main(): Promise<void> {
  const lat = option("lat");
  const lon = option("lon");
  let centre: LatLon;
  let saved: TileData[] | undefined;
  if (buildingsOnly) {
    ({ centre, tiles: saved } = readSaved());
  } else if (lat !== undefined && lon !== undefined) {
    centre = { lat: Number(lat), lon: Number(lon) };
  } else if (dryRun) {
    throw new Error("--dry-run needs --lat and --lon (it does not contact the map server)");
  } else {
    console.log(`Looking up "${name}"...`);
    centre = await findStreet();
  }
  if (!Number.isFinite(centre.lat) || !Number.isFinite(centre.lon) || !(radius > 0)) {
    throw new Error("Latitude, longitude and radius must be numbers");
  }

  const ids = saved ? saved.map((tile) => tile.id) : tilesInRadius(centre, radius);
  const area = boxAround(ids);
  console.log(`Centre ${centre.lat}, ${centre.lon}; ${ids.length} tiles within ${radius} m.`);
  if (dryRun) {
    for (const id of ids) console.log(`  ${tileKey(id)}`);
    const first = ids[0] as (typeof ids)[number];
    console.log(`\nOverpass query for the first tile:\n${tileQuery(first)}`);
    if (useOverture) {
      console.log(`\nOverture: uvx overturemaps ${overtureArgs(area, "<file>").join(" ")}`);
    }
    return;
  }

  // Check for the Overture tool before anything slow, and fetch everything before writing,
  // so a failure half-way leaves the saved tiles untouched.
  const tool = useOverture && !overtureFile ? findOvertureTool() : undefined;
  const osm = saved ?? (await fetchOsm(centre));
  const total = osm.reduce((sum, data) => sum + data.elements.length, 0);
  if (total === 0)
    throw new Error("The map server returned no data for this area. Nothing was saved.");

  let gaps: ExtraBuilding[] | undefined;
  if (useOverture) {
    const candidates = overtureCandidates(tool, area);
    // OSM first: drop every outline that overlaps a building OSM already has, across the whole area.
    gaps = fillBuildingGaps(candidates, parseElements(osm.flatMap((data) => data.elements)));
    console.log(
      `Overture: ${candidates.length} outlines OSM did not supply; ` +
        `${candidates.length - gaps.length} overlap an OSM building, ${gaps.length} fill gaps.`,
    );
  }

  const tiles = osm.map((data): TileData => {
    const tile: TileData = {
      id: data.id,
      version: TILE_FORMAT_VERSION,
      source: data.source,
      fetchedAt: data.fetchedAt,
      elements: data.elements,
    };
    if (gaps) tile.buildings = buildingsTouching(gaps, tileBounds(data.id));
    return tile;
  });

  mkdirSync(OUT_DIR, { recursive: true });
  for (const file of readdirSync(OUT_DIR)) {
    if (file.endsWith(".json")) rmSync(join(OUT_DIR, file));
  }
  let bytes = 0;
  for (const tile of tiles) {
    const text = `${JSON.stringify(tile)}\n`;
    bytes += text.length;
    writeFileSync(join(OUT_DIR, `${tileKey(tile.id).replaceAll("/", "-")}.json`), text);
  }
  writeFileSync(
    join(OUT_DIR, "index.ts"),
    indexFile(
      centre,
      tiles.map((tile) => tileKey(tile.id)),
    ),
  );
  const savedIds = new Set(tiles.flatMap((tile) => (tile.buildings ?? []).map((b) => b.id)));
  const added = gaps ? `, ${savedIds.size} gap-fill buildings` : "";
  console.log(
    `Saved ${tiles.length} tiles (${total} OSM elements${added}, ${Math.round(bytes / 1024)} KB) to ${OUT_DIR}.`,
  );
}

main().catch((error) => {
  console.error(`\nFailed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
