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
import { createPlayer } from "./player/player.ts";
import { createWorldView } from "./render/view.ts";
import { formatLocation, parseLocation } from "./ui/location.ts";
import { createPanel, type ViewChoice } from "./ui/panel.ts";
import { createWorldClient } from "./worker/client.ts";

/** MVP: a fixed radius around the entered point. */
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
    // Show the area filling in from above; walking starts when everything is there.
    ready = false;
    showView();
    view.clear();
    physics.clear();
    view.lookAt(middle, RADIUS_M);
    panel.setBusy(true);
    panel.setStatus("Loading the map...");
    let done = 0;
    try {
      const summary = await world.loadArea(centre, RADIUS_M, (result) => {
        if (request !== latest) return;
        done++;
        if (result.ok) {
          view.addTile(result.tile);
          physics.setTile(result.key, result.tile.colliders, result.tile.ground);
          streets.push(...result.tile.roads);
        } else console.warn(`Tile ${result.key} failed: ${result.error}`);
        panel.setStatus(`Building tile ${done}...`);
      });
      if (request !== latest || !summary.finished) return;
      // Start on the street nearest to the place asked for, and stay inside the loaded circle.
      player.spawn(findSpawn(middle, streets));
      player.setBounds({ centre: middle, radiusM: RADIUS_M });
      ready = true;
      showView();
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      const failed =
        summary.failed > 0
          ? ` ${summary.failed} of ${summary.tiles} tiles could not be loaded.`
          : "";
      panel.setStatus(
        `${summary.buildings} buildings, ${summary.roads} road pieces and ${summary.placements} trees and props in ${summary.tiles} tiles (${seconds} s).${failed}`,
        summary.failed > 0 ? "error" : "info",
      );
    } catch (error) {
      if (request === latest) panel.setStatus(`Something went wrong: ${String(error)}`, "error");
    } finally {
      if (request === latest) panel.setBusy(false);
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
