import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  TODO_MODEL,
  enabledEvents,
  initAbstractTodoState,
  linearize,
  referenceReduceTodoState,
  todoInvariantViolations,
  type AbstractTodoState,
} from "../src/formal/model.ts";

/**
 * Exhaustive exploration of the same relation TLC checks; the reachable-set
 * size is asserted equal to TLC's, so the spec and this transcription cannot
 * drift apart silently.
 */

const MAX_STATES = 2_000_000;

function key(state: AbstractTodoState): string {
  const items = [...TODO_MODEL.items];
  return JSON.stringify([
    items.map((i) => state.status[i]),
    items.map((i) => [...(state.deps[i] ?? [])].sort()),
    items.map((i) => state.priority[i]),
    items.map((i) => state.seq[i]),
    state.next,
  ]);
}

function explore(): { visited: Map<string, AbstractTodoState>; actions: Set<string>; states: AbstractTodoState[] } {
  const start = initAbstractTodoState(TODO_MODEL);
  const queue: AbstractTodoState[] = [start];
  const visited = new Map<string, AbstractTodoState>([[key(start), start]]);
  const states: AbstractTodoState[] = [start];
  const actions = new Set<string>();
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const state = queue[cursor]!;
    if (visited.size > MAX_STATES) throw new Error("state cap exceeded");
    expect(todoInvariantViolations(state, TODO_MODEL), `invariant at ${key(state)}`).toEqual([]);
    for (const event of enabledEvents(state, TODO_MODEL)) {
      actions.add(event.type);
      const next = referenceReduceTodoState(state, event, TODO_MODEL);
      const k = key(next);
      if (!visited.has(k)) {
        visited.set(k, next);
        states.push(next);
        queue.push(next);
      }
    }
  }
  return { visited, actions, states };
}

const exploration = explore();

/** Drive a sequence of events from a fresh model. */
function run(events: Parameters<typeof referenceReduceTodoState>[1][]): AbstractTodoState {
  let state = initAbstractTodoState(TODO_MODEL);
  for (const event of events) state = referenceReduceTodoState(state, event, TODO_MODEL);
  return state;
}

describe("abstract todo list (priority forest)", () => {
  it("never leaves the invariant", () => {
    for (const state of exploration.visited.values()) {
      expect(todoInvariantViolations(state, TODO_MODEL)).toEqual([]);
    }
  });

  it("reaches every action", () => {
    expect([...exploration.actions].sort()).toEqual(
      ["add", "mark", "remove", "reopen", "reprioritize", "rewire"].sort(),
    );
  });

  it("reaches exactly the state set TLC model-checked", () => {
    const countPath = fileURLToPath(new URL("../spec/.tlc-state-count.json", import.meta.url));
    if (!existsSync(countPath)) {
      // The TLC count is produced by `pnpm run verify:model`; report the
      // executable count so a failing pipeline still shows the number.
      console.log(`executable reachable states: ${exploration.visited.size} (run pnpm verify:model for the TLC count)`);
      return;
    }
    const { distinctStates } = JSON.parse(readFileSync(countPath, "utf8")) as { distinctStates: number };
    expect(exploration.visited.size).toBe(distinctStates);
  });

  it("presents dependencies before dependents and keeps one deterministic list", () => {
    const state = run([
      { type: "add", item: "i1", deps: [] },
      { type: "add", item: "i2", deps: ["i1"] },
      { type: "add", item: "i3", deps: [] },
    ]);
    expect(linearize(state, TODO_MODEL)).toEqual(["i1", "i2", "i3"]);
    // Priority refines only incomparable items; it can never jump a dependency.
    const prioritized = referenceReduceTodoState(state, { type: "reprioritize", item: "i2", priority: 0 }, TODO_MODEL);
    expect(linearize(prioritized, TODO_MODEL)).toEqual(["i1", "i2", "i3"]);
    // Once i1 finishes, i2 becomes eligible and leads its own heap.
    const finished = referenceReduceTodoState(state, { type: "mark", item: "i1", status: "completed" }, TODO_MODEL);
    expect(linearize(finished, TODO_MODEL)).toEqual(["i2", "i3"]);
    const later = referenceReduceTodoState(finished, { type: "reprioritize", item: "i2", priority: 1 }, TODO_MODEL);
    expect(linearize(later, TODO_MODEL)).toEqual(["i3", "i2"]);
    const tie = referenceReduceTodoState(later, { type: "reprioritize", item: "i3", priority: 1 }, TODO_MODEL);
    expect(linearize(tie, TODO_MODEL)).toEqual(["i2", "i3"]);
  });

  it("refuses completion while a dependency is unsatisfied", () => {
    const state = run([
      { type: "add", item: "i1", deps: [] },
      { type: "add", item: "i2", deps: ["i1"] },
    ]);
    expect(() => referenceReduceTodoState(state, { type: "mark", item: "i2", status: "completed" }, TODO_MODEL)).toThrow(
      "mark-not-enabled",
    );
    expect(() => referenceReduceTodoState(state, { type: "mark", item: "i2", status: "in_progress" }, TODO_MODEL)).toThrow(
      "mark-not-enabled",
    );
  });

  it("vetoes a rewire that would create a dependency cycle", () => {
    const state = run([
      { type: "add", item: "i1", deps: [] },
      { type: "add", item: "i2", deps: ["i1"] },
    ]);
    expect(() => referenceReduceTodoState(state, { type: "rewire", item: "i1", deps: ["i2"] }, TODO_MODEL)).toThrow(
      "rewire-not-enabled",
    );
  });

  it("keeps a terminal item immutable except by reopen", () => {
    const state = run([
      { type: "add", item: "i1", deps: [] },
      { type: "mark", item: "i1", status: "failed" },
    ]);
    expect(() => referenceReduceTodoState(state, { type: "mark", item: "i1", status: "completed" }, TODO_MODEL)).toThrow(
      "mark-not-enabled",
    );
    expect(() => referenceReduceTodoState(state, { type: "reprioritize", item: "i1", priority: 1 }, TODO_MODEL)).toThrow(
      "reprioritize-not-enabled",
    );
    const reopened = referenceReduceTodoState(state, { type: "reopen", item: "i1" }, TODO_MODEL);
    expect(reopened.status["i1"]).toBe("pending");
  });

  it("removes a dependency only after its live dependents are gone", () => {
    const state = run([
      { type: "add", item: "i1", deps: [] },
      { type: "add", item: "i2", deps: ["i1"] },
    ]);
    expect(() => referenceReduceTodoState(state, { type: "remove", item: "i1" }, TODO_MODEL)).toThrow(
      "remove-not-enabled",
    );
    const cleared = run([
      { type: "add", item: "i1", deps: [] },
      { type: "add", item: "i2", deps: ["i1"] },
      { type: "mark", item: "i1", status: "completed" },
      { type: "mark", item: "i2", status: "completed" },
      { type: "remove", item: "i2" },
      { type: "remove", item: "i1" },
    ]);
    expect(cleared.status["i1"]).toBe("absent");
    expect(cleared.status["i2"]).toBe("absent");
  });

  it("treats disconnected heaps as independently completable", () => {
    const state = run([
      { type: "add", item: "i1", deps: [] },
      { type: "add", item: "i2", deps: ["i1"] },
      { type: "add", item: "i3", deps: [] },
    ]);
    const second = referenceReduceTodoState(state, { type: "mark", item: "i3", status: "completed" }, TODO_MODEL);
    expect(second.status["i3"]).toBe("completed");
    expect(second.status["i1"]).toBe("pending");
  });

  it("carries a failed dependency's unsatisfied contingent through reopen", () => {
    const state = run([
      { type: "add", item: "i1", deps: [] },
      { type: "add", item: "i2", deps: ["i1"] },
      { type: "mark", item: "i1", status: "failed" },
    ]);
    expect(state.status["i2"]).toBe("pending");
    expect(() => referenceReduceTodoState(state, { type: "remove", item: "i1" }, TODO_MODEL)).toThrow(
      "remove-not-enabled",
    );
    const reopened = referenceReduceTodoState(state, { type: "reopen", item: "i1" }, TODO_MODEL);
    expect(reopened.status["i1"]).toBe("pending");
  });
});
