import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TODO_ACTIONS, TODO_INVARIANT_NAMES } from "../src/formal/model.ts";

/** The TLA+ `Next` action list must equal the executable action alphabet. */
function tlaActions(): string[] {
  const path = fileURLToPath(new URL("../spec/TodoSystem.tla", import.meta.url));
  const text = readFileSync(path, "utf8");
  const start = text.indexOf("Next ==");
  const end = text.indexOf("Spec ==");
  const block = text.slice(start, end);
  const names: string[] = [];
  for (const match of block.matchAll(/:\s*(\w+)\(/g)) {
    names.push(match[1]!.toLowerCase());
  }
  return [...new Set(names)];
}

describe("TLA+ / TypeScript parity", () => {
  const text = readFileSync(fileURLToPath(new URL("../spec/TodoSystem.tla", import.meta.url)), "utf8");
  const view = readFileSync(fileURLToPath(new URL("../spec/TodoView.tla", import.meta.url)), "utf8");

  it("the spec's Next lists exactly the model actions", () => {
    expect(tlaActions().sort()).toEqual([...TODO_ACTIONS].sort());
  });

  it("every action has a guard in the spec", () => {
    const guardName: Record<string, string> = {
      add: "GuardAdd",
      remove: "GuardRemove",
      reprioritize: "GuardReprioritize",
      rewire: "GuardRewire",
      mark: "GuardMark",
      reopen: "GuardReopen",
    };
    for (const action of TODO_ACTIONS) {
      expect(text, `missing ${guardName[action]}`).toContain(`${guardName[action]}(`);
    }
  });

  it("every invariant is defined in the spec", () => {
    for (const invariant of TODO_INVARIANT_NAMES) {
      expect(`${text}\n${view}`, `missing ${invariant}`).toContain(`${invariant} ==`);
    }
  });

  it("the executable model and the spec name the same statuses", () => {
    for (const status of [
      "absent",
      "pending",
      "in_progress",
      "blocked",
      "failed",
      "completed_with_errors",
      "completed",
    ]) {
      expect(text).toContain(`"${status}"`);
    }
  });
});
