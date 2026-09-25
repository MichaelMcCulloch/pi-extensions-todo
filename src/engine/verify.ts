/**
 * Production invariant diagnostics.
 *
 * The structural core is exactly `todoInvariantViolations` — the same checks
 * TLC proves over the fixture. Two production-strength invariants are added:
 * dependency arrays are sets, and live priorities are canonical (priority
 * equals the item's position in the verified presentation). The store refuses
 * to persist any state that violates them.
 */

import { TODO_INVARIANT_NAMES, todoInvariantViolations, type TodoViolation } from "../formal/model.ts";
import { presentation } from "./projection.ts";
import { abstractTodoState, todoModelConfig, type TodoState } from "./state.ts";

/** Check every safety invariant of the durable todo state. */
export function verifyTodoState(state: TodoState): TodoViolation[] {
  const violations = [...todoInvariantViolations(abstractTodoState(state), todoModelConfig(state))];
  const push = (invariant: string, detail: string): void => {
    violations.push({ invariant, detail });
  };
  for (const item of Object.keys(state.deps)) {
    const deps = state.deps[item] ?? [];
    if (new Set(deps).size !== deps.length) push("DepsUnique", `${item} has duplicate dependencies`);
    if (deps.includes(item)) push("DepsIrreflexive", `${item} depends on itself`);
  }
  presentation(state).forEach((item, index) => {
    if ((state.priority[item] ?? 0) !== index) {
      push("CanonicalPriority", `${item} has priority ${state.priority[item]} at presentation index ${index}`);
    }
  });
  return violations;
}

/** Every invariant name enforced in production. */
export const TODO_PRODUCTION_INVARIANTS: readonly string[] = [
  ...TODO_INVARIANT_NAMES,
  "DepsUnique",
  "DepsIrreflexive",
  "CanonicalPriority",
];
