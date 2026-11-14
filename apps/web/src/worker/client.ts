// The main thread's handle on the world worker.

import type { LatLon } from "@somewhere/world";
import { proxy, type Remote, wrap } from "comlink";
import type { AreaSummary, TileResult, WorldWorkerApi } from "./world.worker.ts";

export type { AreaSummary, TileResult };

export type WorldClient = {
  loadArea(
    centre: LatLon,
    radiusM: number,
    onTile: (result: TileResult) => void,
  ): Promise<AreaSummary>;
};

export function createWorldClient(): WorldClient {
  const worker = new Worker(new URL("./world.worker.ts", import.meta.url), { type: "module" });
  const remote: Remote<WorldWorkerApi> = wrap<WorldWorkerApi>(worker);
  return {
    loadArea: (centre, radiusM, onTile) => remote.loadArea(centre, radiusM, proxy(onTile)),
  };
}
