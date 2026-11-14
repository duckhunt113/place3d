import { describe, expect, it } from "vitest";
import type { Rule, RuleSet } from "../types.ts";
import { RuleEngine } from "./engine.ts";
import { parseMetres, parseNumber } from "./units.ts";

/** Builds a rule. The rule format calls its output field `then`; it is plain data, never awaited. */
function rule(
  id: string,
  when: Rule["when"],
  output: Rule["then"],
  extra: Partial<Rule> = {},
): Rule {
  // biome-ignore lint/suspicious/noThenProperty: `then` is the rule format's field name, not a promise
  return { id, when, then: output, ...extra };
}

const rules: RuleSet = {
  version: 1,
  domain: "buildings",
  rules: [
    rule("any", { building: "*" }, { type: "house", storeys: 2, extra: "kept" }),
    rule("shop", { building: ["retail", "commercial"] }, { type: "retail", storeys: 1 }),
    rule(
      "big-shop",
      { building: "retail" },
      { type: "plaza" },
      { where: { areaM2: { gte: 500 } } },
    ),
    rule("named", { building: "*", name: "*" }, { label: "@name" }),
    rule("levels", { building: "*", levels: "*" }, { storeys: "@levels" }, { priority: 100 }),
    rule("zone", { building: "yes" }, { type: "retail" }, { where: { zone: "retail" } }),
    rule(
      "nested",
      { building: "nested" },
      {
        asset: { category: "tree", want: { leafType: "@leaf_type", genus: "@genus" } },
        list: ["a", "@name"],
      },
    ),
  ],
};
const engine = new RuleEngine([rules]);
const decide = (tags: Record<string, string>, facts = {}) =>
  engine.decide("buildings", tags, facts);

describe("RuleEngine", () => {
  it("returns nothing when no rule matches", () => {
    expect(decide({ highway: "residential" })).toBeUndefined();
    expect(engine.decide("roads", { building: "yes" })).toBeUndefined();
  });

  it("applies the catch-all when nothing narrower matches", () => {
    const result = decide({ building: "cathedral" });
    expect(result?.values).toEqual({ type: "house", storeys: 2, extra: "kept" });
    expect(result?.rules).toEqual(["any"]);
    expect(result?.onlyDefaults).toBe(true);
    expect(result?.usedTag).toBe(false);
  });

  it("lets a narrower rule override the catch-all, field by field", () => {
    const result = decide({ building: "commercial" });
    expect(result?.values).toEqual({ type: "retail", storeys: 1, extra: "kept" });
    expect(result?.rules).toEqual(["any", "shop"]);
    expect(result?.onlyDefaults).toBe(false);
  });

  it("uses geometry facts, with thresholds from the rule", () => {
    expect(decide({ building: "retail" }, { areaM2: 800 })?.values.type).toBe("plaza");
    expect(decide({ building: "retail" }, { areaM2: 499 })?.values.type).toBe("retail");
    expect(decide({ building: "retail" })?.values.type).toBe("retail");
    expect(decide({ building: "yes" }, { zone: "retail" })?.values.type).toBe("retail");
    expect(decide({ building: "yes" }, { zone: "residential" })?.values.type).toBe("house");
  });

  it("lets a real tag win over every rule", () => {
    const result = decide({ building: "retail", levels: "3" }, { areaM2: 800 });
    expect(result?.values.storeys).toBe(3);
    expect(result?.usedTag).toBe(true);
    expect(result?.rules.at(-1)).toBe("levels");
  });

  it("ignores a copied tag that is not a number when the field is a number", () => {
    expect(decide({ building: "retail", levels: "lots" })?.values.storeys).toBe(1);
    expect(decide({ building: "retail", levels: "2;3" })?.values.storeys).toBe(2);
  });

  it("copies tag values with @ and leaves the field out when the tag is missing", () => {
    expect(decide({ building: "yes", name: "Test Plaza" })?.values.label).toBe("Test Plaza");
    expect(decide({ building: "nested", leaf_type: "needleleaved" })?.values).toMatchObject({
      asset: { category: "tree", want: { leafType: "needleleaved" } },
      list: ["a"],
    });
  });

  it("matches any one of several values in a tag", () => {
    expect(decide({ building: "office;retail" })?.values.type).toBe("retail");
  });

  it("gives the same answer whatever order the tags are in", () => {
    const a = decide({ building: "retail", name: "A", levels: "2" });
    const b = decide({ levels: "2", name: "A", building: "retail" });
    expect(a).toEqual(b);
  });

  it("refuses a rule with no conditions", () => {
    const bad: RuleSet = { version: 1, domain: "roads", rules: [rule("bad", {}, {})] };
    expect(() => new RuleEngine([bad])).toThrow(/bad/);
  });
});

describe("parseMetres", () => {
  it("reads metres, with or without a unit", () => {
    expect(parseMetres("12")).toBe(12);
    expect(parseMetres("12 m")).toBe(12);
    expect(parseMetres("3.5m")).toBe(3.5);
    expect(parseMetres("3,5")).toBe(3.5);
    expect(parseMetres(7)).toBe(7);
  });

  it("converts feet", () => {
    expect(parseMetres("40'")).toBeCloseTo(12.192, 3);
    expect(parseMetres("40 ft")).toBeCloseTo(12.192, 3);
  });

  it("gives up on anything else", () => {
    for (const value of ["tall", "", "12 storeys", "-3", undefined, null, Number.NaN]) {
      expect(parseMetres(value)).toBeUndefined();
    }
  });
});

describe("parseNumber", () => {
  it("reads the leading number", () => {
    expect(parseNumber("2")).toBe(2);
    expect(parseNumber("2.5")).toBe(2.5);
    expect(parseNumber("2;3")).toBe(2);
    expect(parseNumber(4)).toBe(4);
  });

  it("gives up on anything else", () => {
    expect(parseNumber("two")).toBeUndefined();
    expect(parseNumber(undefined)).toBeUndefined();
  });
});
