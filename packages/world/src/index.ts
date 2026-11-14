// Public API of @somewhere/world. Plain data and logic only: no three.js, no Rapier, no DOM.

export const WORLD_VERSION = "0.0.1";

export {
  mercator,
  project,
  REGION_ZOOM,
  regionFor,
  regionFromTile,
  unproject,
} from "./data/project";
export type * from "./types";
export type { Rng } from "./util/rng";
export { createRng } from "./util/rng";
