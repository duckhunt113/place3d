// Saved tiles: MVP step 1's map data, and the test fixtures.
// The loader is passed in, so this file touches neither the file system nor the DOM.

import type { TileData, TileId, TileSource } from "../../types.ts";
import { tileKey } from "../tiles.ts";

/** Returns the saved tile for a key like "17/36612/47851", or undefined if there isn't one. */
export type TileLoader = (key: string) => Promise<TileData | undefined>;

export class TileNotFoundError extends Error {
  readonly tile: TileId;
  constructor(tile: TileId, where: string) {
    super(`No tile ${tileKey(tile)} in ${where}`);
    this.name = "TileNotFoundError";
    this.tile = tile;
  }
}

export class FileTileSource implements TileSource {
  readonly #load: TileLoader;

  constructor(load: TileLoader) {
    this.#load = load;
  }

  async getTile(id: TileId): Promise<TileData> {
    const key = tileKey(id);
    const data = await this.#load(key);
    if (!data) throw new TileNotFoundError(id, "the saved tiles");
    if (tileKey(data.id) !== key) {
      throw new Error(`Saved tile ${key} contains data for ${tileKey(data.id)}`);
    }
    return data;
  }
}

/** Tries each source in turn; moves on only when a source does not have the tile. */
export class FallbackTileSource implements TileSource {
  readonly #sources: readonly TileSource[];

  constructor(sources: readonly TileSource[]) {
    if (sources.length === 0) throw new RangeError("FallbackTileSource needs at least one source");
    this.#sources = sources;
  }

  async getTile(id: TileId): Promise<TileData> {
    for (const source of this.#sources) {
      try {
        return await source.getTile(id);
      } catch (error) {
        if (!(error instanceof TileNotFoundError)) throw error;
      }
    }
    throw new TileNotFoundError(id, "any tile source");
  }
}
