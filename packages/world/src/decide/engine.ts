// The rule engine: applies the OSM tag rules in decide/rules/*.json (CLAUDE.md, hard rule 12).
// It knows nothing about buildings or roads; all of that lives in the rule data.

import type { Rule, RuleComparison, RuleDomain, RuleSet, Tags } from "../types.ts";
import { parseNumber } from "./units.ts";

/** Geometry facts computed in code for a feature, e.g. { footprintM2: 120 }. */
export type Facts = Record<string, string | number | undefined>;

export type RuleResult = {
  /** The merged `then` fields of every matching rule; more specific rules override. */
  values: Record<string, unknown>;
  /** Ids of the rules that matched, in the order they were applied. */
  rules: string[];
  /** True if a rule copying a real OSM tag (priority 100 or more) took part. */
  usedTag: boolean;
  /** True if only catch-all rules matched. */
  onlyDefaults: boolean;
};

type Indexed = { rule: Rule; specificity: number };

const TAG_PRIORITY = 100;

/** How narrow a rule is: exact values count more than "*", and each geometry condition counts too. */
function specificity(rule: Rule): number {
  let score = 0;
  for (const value of Object.values(rule.when)) score += value === "*" ? 1 : 2;
  return score + 2 * Object.keys(rule.where ?? {}).length;
}

function tagMatches(tag: string | undefined, wanted: string | string[]): boolean {
  if (tag === undefined) return false;
  if (wanted === "*") return true;
  // OSM allows several values in one tag, separated by semicolons: "bakery;cafe".
  const have = tag.includes(";") ? tag.split(";").map((part) => part.trim()) : [tag];
  const want = Array.isArray(wanted) ? wanted : [wanted];
  return want.some((value) => have.includes(value));
}

function factMatches(fact: string | number | undefined, wanted: string | RuleComparison): boolean {
  if (fact === undefined) return false;
  if (typeof wanted === "string") return fact === wanted;
  if (typeof fact !== "number") return false;
  if (wanted.lt !== undefined && !(fact < wanted.lt)) return false;
  if (wanted.lte !== undefined && !(fact <= wanted.lte)) return false;
  if (wanted.gt !== undefined && !(fact > wanted.gt)) return false;
  if (wanted.gte !== undefined && !(fact >= wanted.gte)) return false;
  return true;
}

/** Replaces "@key" with that tag's value, all the way down. Missing tags leave the field out. */
function resolve(value: unknown, tags: Tags): unknown {
  if (typeof value === "string") return value.startsWith("@") ? tags[value.slice(1)] : value;
  if (Array.isArray(value)) {
    return value.map((item) => resolve(item, tags)).filter((item) => item !== undefined);
  }
  if (typeof value === "object" && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value)) {
      const resolved = resolve(inner, tags);
      if (resolved !== undefined) out[key] = resolved;
    }
    return out;
  }
  return value;
}

export class RuleEngine {
  /** domain -> tag key -> rules that need that key. Looked up by key, never scanned. */
  readonly #index = new Map<RuleDomain, Map<string, Indexed[]>>();

  constructor(ruleSets: readonly RuleSet[]) {
    for (const set of ruleSets) {
      const byKey = this.#index.get(set.domain) ?? new Map<string, Indexed[]>();
      this.#index.set(set.domain, byKey);
      for (const rule of set.rules) {
        // A rule can only match a feature that has all its keys, so one key is enough to find it.
        const key = Object.keys(rule.when).sort()[0];
        if (key === undefined) throw new Error(`Rule ${rule.id} has no "when" conditions`);
        const list = byKey.get(key) ?? [];
        list.push({ rule, specificity: specificity(rule) });
        byKey.set(key, list);
      }
    }
  }

  /** The decision for one feature in a domain, or undefined if no rule matches its tags. */
  decide(domain: RuleDomain, tags: Tags, facts: Facts = {}): RuleResult | undefined {
    const byKey = this.#index.get(domain);
    if (!byKey) return undefined;
    const matched: Indexed[] = [];
    for (const key of Object.keys(tags)) {
      for (const candidate of byKey.get(key) ?? []) {
        const { when, where } = candidate.rule;
        const tagsOk = Object.entries(when).every(([k, wanted]) => tagMatches(tags[k], wanted));
        const factsOk = Object.entries(where ?? {}).every(([k, wanted]) =>
          factMatches(facts[k], wanted),
        );
        if (tagsOk && factsOk) matched.push(candidate);
      }
    }
    if (matched.length === 0) return undefined;

    // Least important first, so later rules override: priority, then how narrow, then id.
    matched.sort(
      (a, b) =>
        (a.rule.priority ?? 0) - (b.rule.priority ?? 0) ||
        a.specificity - b.specificity ||
        (a.rule.id < b.rule.id ? -1 : a.rule.id > b.rule.id ? 1 : 0),
    );

    const values: Record<string, unknown> = {};
    for (const { rule } of matched) {
      for (const [field, raw] of Object.entries(rule.then)) {
        let value = resolve(raw, tags);
        if (value === undefined) continue;
        // A copied tag may only replace a number with a number; unreadable text is ignored.
        if (typeof values[field] === "number" && typeof value === "string") {
          value = parseNumber(value);
          if (value === undefined) continue;
        }
        values[field] = value;
      }
    }
    return {
      values,
      rules: matched.map(({ rule }) => rule.id),
      usedTag: matched.some(({ rule }) => (rule.priority ?? 0) >= TAG_PRIORITY),
      onlyDefaults: matched.every((m) => m.specificity <= 1),
    };
  }
}
