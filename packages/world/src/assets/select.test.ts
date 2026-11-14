import { describe, expect, it } from "vitest";
import realCatalog from "../../../../apps/web/public/assets/catalog.json";
import type { AssetCatalog, AssetEntry } from "../types.ts";
import { AssetSelector } from "./select.ts";

const entry = (
  id: string,
  category: string,
  attributes: AssetEntry["attributes"],
  extra = {},
): AssetEntry => ({
  id,
  file: `${id}.glb`,
  category,
  attributes,
  footprintM: [1, 1],
  collider: { type: "none" },
  triangles: 10,
  source: "test",
  licence: "CC0",
  ...extra,
});
const catalog: AssetCatalog = {
  version: 7,
  assets: [
    entry("tree.oak", "tree", { leafType: "broadleaved", genus: "Quercus" }),
    entry("tree.maple", "tree", { leafType: "broadleaved", genus: "Acer" }, { default: true }),
    entry("tree.pine", "tree", { leafType: "needleleaved", genus: "Pinus" }),
    entry("tree.old", "tree", { leafType: "needleleaved", genus: "Picea" }, { deprecated: true }),
    entry("rock.a", "rock", {}),
    entry("rock.b", "rock", {}),
  ],
};
const selector = new AssetSelector(catalog);
const picks = (request: Parameters<AssetSelector["select"]>[0], count = 60) =>
  new Set(Array.from({ length: count }, (_, i) => selector.select(request, `seed-${i}`)));

describe("AssetSelector", () => {
  it("gives the same asset for the same request and seed", () => {
    expect(selector.select({ category: "tree" }, "way/1")).toBe(
      selector.select({ category: "tree" }, "way/1"),
    );
  });

  it("picks among everything usable in the category when nothing particular is wanted", () => {
    expect(picks({ category: "tree" })).toEqual(new Set(["tree.oak", "tree.maple", "tree.pine"]));
  });

  it("keeps only entries that match every want", () => {
    expect(picks({ category: "tree", want: { leafType: "broadleaved" } })).toEqual(
      new Set(["tree.oak", "tree.maple"]),
    );
    expect(
      picks({ category: "tree", want: { leafType: "broadleaved", genus: "Quercus" } }),
    ).toEqual(new Set(["tree.oak"]));
  });

  it("falls back to the most important want when no entry matches them all", () => {
    // No spruce in the catalog: a needle-leaved tree is still the right answer.
    expect(picks({ category: "tree", want: { leafType: "needleleaved", genus: "Picea" } })).toEqual(
      new Set(["tree.pine"]),
    );
  });

  it("uses the category default when no want matches anything", () => {
    expect(picks({ category: "tree", want: { leafType: "palm" } })).toEqual(
      new Set(["tree.maple"]),
    );
  });

  it("picks from the whole category when nothing matches and there is no default", () => {
    expect(picks({ category: "rock", want: { colour: "pink" } })).toEqual(
      new Set(["rock.a", "rock.b"]),
    );
  });

  it("never picks a deprecated asset, but still knows it by id", () => {
    expect(picks({ category: "tree", want: { genus: "Picea" } })).not.toContain("tree.old");
    expect(selector.entry("tree.old")?.deprecated).toBe(true);
  });

  it("returns undefined for a category the catalog does not have", () => {
    expect(selector.select({ category: "dragon" }, "x")).toBeUndefined();
    expect(selector.entry("nope")).toBeUndefined();
  });

  it("does not depend on the order of the catalog file", () => {
    const shuffled = new AssetSelector({ ...catalog, assets: [...catalog.assets].reverse() });
    for (let i = 0; i < 20; i++) {
      const seed = `s${i}`;
      expect(shuffled.select({ category: "tree" }, seed)).toBe(
        selector.select({ category: "tree" }, seed),
      );
    }
  });

  it("works on the real catalog: a needle-leaved tree is the pine, an unknown genus still a tree", () => {
    const real = new AssetSelector(realCatalog as unknown as AssetCatalog);
    expect(real.version).toBe(realCatalog.version);
    expect(real.select({ category: "tree", want: { leafType: "needleleaved" } }, "a")).toBe(
      "tree.pine.m",
    );
    expect(
      real.select({ category: "tree", want: { leafType: "broadleaved", genus: "Betula" } }, "a"),
    ).toBe("tree.birch.m");
    expect(real.select({ category: "prop.hydrant" }, "a")).toBe("prop.hydrant");
  });
});
