// The main thread's handle on the world worker.

import type { LatLon } from "@somewhere/world";
import { proxy, type Remote, wrap } from "comlink";
import type { AreaSummary, TileResult, WorldWorkerApi } from "./world.worker.ts";

export type { AreaSummary, TileResult };

export type WorldClient = {
  /**
   * Loads the area around a point. `onTile` gets each tile as it is ready, and again later
   * for a tile that failed at first and was tried again. `onStart` is told how many tiles
   * the area has, before the first one arrives.
   */
  loadArea(
    centre: LatLon,
    radiusM: number,
    onTile: (result: TileResult) => void,
    onStart: (tiles: number) => void,
  ): Promise<AreaSummary>;
};

export function createWorldClient(): WorldClient {
  const worker = new Worker(new URL("./world.worker.ts", import.meta.url), { type: "module" });
  const remote: Remote<WorldWorkerApi> = wrap<WorldWorkerApi>(worker);
  return {
    loadArea: (centre, radiusM, onTile, onStart) =>
      remote.loadArea(centre, radiusM, proxy(onTile), proxy(onStart)),
  };
}
