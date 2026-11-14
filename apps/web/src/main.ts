import "./style.css";
import {
  type AssetCatalog,
  FIXTURE_CENTRE,
  type Palette,
  project,
  regionFor,
} from "@somewhere/world";
import { createWorldView } from "./render/view.ts";
import { formatLocation, parseLocation } from "./ui/location.ts";
import { createPanel } from "./ui/panel.ts";
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
  const [palette, catalog] = await Promise.all([
    load<Palette>("palette.json"),
    load<AssetCatalog>("catalog.json"),
  ]);

  const view = createWorldView(app, palette, catalog, assetsUrl);
  const panel = createPanel(app);
  const world = createWorldClient();
  let latest = 0;

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
    view.clear();
    view.lookAt(project(regionFor(centre), centre), RADIUS_M);
    panel.setBusy(true);
    panel.setStatus("Loading the map...");
    let done = 0;
    try {
      const summary = await world.loadArea(centre, RADIUS_M, (result) => {
        if (request !== latest) return;
        done++;
        if (result.ok) view.addTile(result.tile);
        else console.warn(`Tile ${result.key} failed: ${result.error}`);
        panel.setStatus(`Building tile ${done}...`);
      });
      if (request !== latest || !summary.finished) return;
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
