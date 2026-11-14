import { describe, expect, it } from "vitest";
import catalog from "../../../../apps/web/public/assets/catalog.json";
import palette from "../../../../apps/web/public/assets/palette.json";
import areas from "./rules/areas.json";
import buildings from "./rules/buildings.json";
import objects from "./rules/objects.json";
import roads from "./rules/roads.json";

type RuleJson = {
  id: string;
  when: Record<string, string | string[]>;
  where?: Record<string, unknown>;
  priority?: number;
  then: Record<string, unknown>;
};
type RuleSetJson = { version: number; domain: string; rules: RuleJson[] };

const ruleSets = [buildings, roads, areas, objects] as unknown as RuleSetJson[];
const allRules = ruleSets.flatMap((set) => set.rules);
const colours = new Set(Object.keys(palette.colors));
const categories = new Set(catalog.assets.map((asset) => asset.category));

// Collects palette names (surface, colour) and asset categories referenced anywhere in a rule's output.
function collect(value: unknown, found: { colours: string[]; categories: string[] }): void {
  if (Array.isArray(value)) {
    for (const item of value) collect(item, found);
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, inner] of Object.entries(value)) {
    if (key === "surface" && typeof inner === "string") found.colours.push(inner);
    if (key === "colour" && Array.isArray(inner)) found.colours.push(...(inner as string[]));
    if (key === "category" && typeof inner === "string") found.categories.push(inner);
    collect(inner, found);
  }
}

describe("OSM tag rules (data files)", () => {
  it("each file has a positive version and the expected domain", () => {
    expect(ruleSets.map((set) => set.domain)).toEqual(["buildings", "roads", "areas", "objects"]);
    for (const set of ruleSets) {
      expect(Number.isInteger(set.version) && set.version >= 1).toBe(true);
    }
  });

  it("rule ids are unique and lowercase with dots or dashes", () => {
    const ids = allRules.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+([.-][a-z0-9]+)*$/);
  });

  it("every rule matches on at least one tag, with string or list values", () => {
    for (const rule of allRules) {
      expect(Object.keys(rule.when).length).toBeGreaterThan(0);
      for (const value of Object.values(rule.when)) {
        const ok = typeof value === "string" || (Array.isArray(value) && value.length > 0);
        expect(ok).toBe(true);
      }
    }
  });

  it("no two rules in a domain have the same conditions and priority", () => {
    for (const set of ruleSets) {
      const keys = set.rules.map((rule) =>
        JSON.stringify([rule.when, rule.where ?? null, rule.priority ?? 0]),
      );
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("only uses colours that exist in palette.json", () => {
    for (const rule of allRules) {
      const found = { colours: [] as string[], categories: [] as string[] };
      collect(rule.then, found);
      for (const name of found.colours) expect(colours.has(name), `${rule.id}: ${name}`).toBe(true);
    }
  });

  it("only requests asset categories that exist in catalog.json (never asset ids)", () => {
    for (const rule of allRules) {
      const found = { colours: [] as string[], categories: [] as string[] };
      collect(rule.then, found);
      for (const name of found.categories)
        expect(categories.has(name), `${rule.id}: ${name}`).toBe(true);
      expect(JSON.stringify(rule.then)).not.toMatch(/\.glb|"assetId"|"id":/);
    }
  });
});
