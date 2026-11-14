// The asset selector: decisions ask for a kind of thing ("a tree, needle-leaved"); this picks
// which catalog entry to use. Nothing outside this file chooses a model, so adding models to
// the catalog needs no code or rule changes (CLAUDE.md, hard rules 9 and 11).

import type { AssetCatalog, AssetEntry, AssetId, AssetRequest } from "../types.ts";
import { createRng } from "../util/rng.ts";

type Category = { entries: AssetEntry[]; fallback: AssetEntry | undefined };

export class AssetSelector {
  /** category -> its usable entries, sorted by id. Built once; lookups never scan the catalog. */
  readonly #categories = new Map<string, Category>();
  readonly #byId = new Map<AssetId, AssetEntry>();
  readonly version: number;

  constructor(catalog: AssetCatalog) {
    this.version = catalog.version;
    const sorted = [...catalog.assets].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const entry of sorted) {
      // Deprecated entries still resolve by id (old worlds), but are never picked again.
      this.#byId.set(entry.id, entry);
      if (entry.deprecated) continue;
      const category = this.#categories.get(entry.category) ?? { entries: [], fallback: undefined };
      category.entries.push(entry);
      if (entry.default && !category.fallback) category.fallback = entry;
      this.#categories.set(entry.category, category);
    }
  }

  /** The catalog entry for an id, including deprecated ones. */
  entry(id: AssetId): AssetEntry | undefined {
    return this.#byId.get(id);
  }

  /**
   * Picks an asset for a request. The same request and seed always give the same asset.
   *   1. entries in the category that match every `want`: a seeded pick among them
   *   2. else entries that match the first `want` that matches anything (wants are listed most
   *      important first, e.g. leaf type before genus)
   *   3. else the category's default; else a seeded pick from the whole category
   * Undefined only when the catalog has nothing in the category.
   */
  select(request: AssetRequest, seed: string): AssetId | undefined {
    const category = this.#categories.get(request.category);
    if (!category || category.entries.length === 0) return undefined;
    const wants = Object.entries(request.want ?? {});
    const matching = (list: [string, string | number][]) =>
      category.entries.filter((entry) =>
        list.every(([key, wanted]) => String(entry.attributes[key]) === String(wanted)),
      );
    let pool = matching(wants);
    if (pool.length === 0) {
      for (const want of wants) {
        pool = matching([want]);
        if (pool.length > 0) break;
      }
    }
    if (pool.length === 0) {
      if (category.fallback) return category.fallback.id;
      pool = category.entries;
    }
    return createRng(`${seed}/asset`).pick(pool).id;
  }
}
