// The rule data, loaded as one list. Add a domain here when a new rules file is added.

import type { RuleSet } from "../../types.ts";
import { RuleEngine } from "../engine.ts";
import areas from "./areas.json" with { type: "json" };
import buildings from "./buildings.json" with { type: "json" };
import objects from "./objects.json" with { type: "json" };
import roads from "./roads.json" with { type: "json" };

export const RULE_SETS = [buildings, roads, areas, objects] as unknown as readonly RuleSet[];

/** The engine with the project's own rules. */
export function createRuleEngine(): RuleEngine {
  return new RuleEngine(RULE_SETS);
}
