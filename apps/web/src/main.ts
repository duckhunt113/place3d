import "./style.css";
import {
  type AssetCatalog,
  FIXTURE_CENTRE,
  findSpawn,
  type Palette,
  project,
  type RoadPath,
  regionFor,
} from "@somewhere/world";
import { createPhysics } from "./physics/world.ts";
import { insideBoxes } from "./player/area.ts";
import { createPlayer } from "./player/player.ts";
import { createWorldView } from "./render/view.ts";
import { createLoading } from "./ui/loading.ts";
import { formatLocation, parseLocation } from "./ui/location.ts";
import { createPanel, type ViewChoice } from "./ui/panel.ts";
import { createWorldClient, type TileResult } from "./worker/client.ts";

/** MVP: every tile within this distance of the entered point is loaded. */
const RADIUS_M = 300;

async function start(): Promise<void> {
  const app = document.querySelector<HTMLDivElement>("#app");
  if (!app) throw new Error("#app element not found");

  const assetsUrl = `${import.meta.env.BASE_URL}assets/`;
  const load = async <T>(file: string): Promise<T> => {
    const response = await fetch(`${assetsUrl}${file}`);
    if (!response.ok) throw new Error(`Could not load ${file} (${response.status})`);
    return (await response.json()) as T;
  };
  const [palette, catalog, physics] = await Promise.all([
    load<Palette>("palette.json"),
    load<AssetCatalog>("catalog.json"),
    createPhysics(),
  ]);

  const view = createWorldView(app, palette, catalog, assetsUrl);
  const panel = createPanel(app);
  const loading = createLoading(app);
  const world = createWorldClient();
  const player = createPlayer(physics, view.canvas);
  let latest = 0;

  /** The view the player chose. Walking only starts once the area is loaded and they have a place to stand. */
  let wanted: ViewChoice = "walk";
  let ready = false;
  const showView = (): void => {
    const walking = ready && wanted === "walk";
    view.setMode(walking ? "walk" : "free");
    player.setActive(walking);
    panel.setView(walking ? "walk" : "free");
  };
  panel.onToggleView(() => {
    wanted = wanted === "walk" ? "free" : "walk";
    showView();
  });
  view.onFrame((seconds) => {
    if (!ready) return;
    // The player only moves while walking, but their eyes stay where they are in the free view.
    if (wanted === "walk") player.update(seconds);
    const eye = player.eye();
    view.setEye(eye.pos, eye.yaw, eye.pitch);
  });
  showView();

  const go = async (text: string): Promise<void> => {
    const centre = parseLocation(text);
    if (!centre) {
      panel.setStatus(
        'No coordinates found. Type them like "43.5245, -79.6190", or paste a full map link (short links do not contain coordinates).',
        "error",
      );
      return;
    }
    const request = ++latest;
    const started = performance.now();
    const middle = project(regionFor(centre), centre);
    const streets: RoadPath[] = [];
    /** What each tile holds, where its data came from, and the ground it covers. */
    const tiles = new Map<string, TileResult>();
    let seconds = "";

    /** The status line: what the area holds, where it came from, and what is still missing. */
    const report = (): void => {
      const all = [...tiles.values()];
      const sum = (pick: (counts: TileResult["tile"]["counts"]) => number) =>
        all.reduce((total, result) => total + pick(result.tile.counts), 0);
      const from = (origin: TileResult["from"]) => all.filter((r) => r.from === origin).length;
      const signs = sum((c) => c.signs);
      const parts = [
        `${sum((c) => c.buildings)} buildings, ${sum((c) => c.roads)} road pieces, ${sum((c) => c.placements) - signs} trees and props and ${signs} shop signs in ${all.length} tiles (${seconds} s).`,
      ];
      // Where the map data came from, when any of it came over the network or from the cache.
      const origins = [
        from("network") > 0 ? `${from("network")} fetched from the map server` : "",
        from("cache") > 0 ? `${from("cache")} from this device's cache` : "",
      ].filter((part) => part !== "");
      if (origins.length > 0) parts.push(`${origins.join(", ")}.`);
      const missing = all.filter((r) => r.from === "failed");
      if (missing.length > 0) {
        parts.push(
          missing.some((r) => r.retrying)
            ? `${missing.length} could not be loaded yet; trying again...`
            : `${missing.length} could not be loaded.`,
        );
      }
      panel.setStatus(parts.join(" "), missing.length > 0 ? "error" : "info");
    };

    // Show the area filling in from above; walking starts when everything is there.
    ready = false;
    showView();
    view.clear();
    physics.clear();
    view.lookAt(middle, RADIUS_M);
    panel.setBusy(true);
    panel.setStatus("Loading the map...");
    loading.show(0, 0);
    let total = 0;
    try {
      const summary = await world.loadArea(
        centre,
        RADIUS_M,
        (result) => {
          if (request !== latest) return;
          // Also called later, when a tile that failed at first has been tried again.
          tiles.set(result.key, result);
          view.addTile(result.tile);
          physics.setTile(result.key, result.tile.colliders, result.tile.ground);
          if (result.from === "failed") console.warn(`Tile ${result.key} failed: ${result.error}`);
          else streets.push(...result.tile.roads);
          if (ready) report();
          else loading.show(tiles.size, total);
        },
        (count) => {
          total = count;
          if (request === latest) loading.show(tiles.size, total);
        },
      );
      if (request !== latest || !summary.finished) return;
      // Start on the street nearest to the place asked for. The player can walk wherever
      // a tile is loaded: each tile's ground says what it covers.
      player.spawn(findSpawn(middle, streets));
      player.setBounds(
        insideBoxes(
          [...tiles.values()].map(({ tile }) => {
            const { centre: at, size } = tile.ground;
            return {
              minX: at[0] - size[0] / 2,
              maxX: at[0] + size[0] / 2,
              minZ: at[1] - size[1] / 2,
              maxZ: at[1] + size[1] / 2,
            };
          }),
        ),
      );
      ready = true;
      showView();
      seconds = ((performance.now() - started) / 1000).toFixed(1);
      report();
    } catch (error) {
      if (request === latest) panel.setStatus(`Something went wrong: ${String(error)}`, "error");
    } finally {
      if (request === latest) {
        panel.setBusy(false);
        loading.hide();
      }
    }
  };

  panel.onGo((text) => void go(text));
  // Start in the saved test area, if its tiles have been fetched.
  if (FIXTURE_CENTRE) {
    panel.setText(formatLocation(FIXTURE_CENTRE));
    void go(formatLocation(FIXTURE_CENTRE));
  } else {
    panel.setStatus("Enter coordinates and press Go.");
  }
}

start().catch((error) => {
  console.error(error);
  document.body.textContent = `Somewhere could not start: ${String(error)}`;
});
