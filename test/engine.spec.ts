import { describe, expect, it } from "vitest";
import { presentation } from "../src/engine/projection.ts";
import type { TodoCommand } from "../src/engine/reducer.ts";
import { memoryTodo, TodoOperationError, TodoStore } from "../src/extension/store.ts";

const add = (id: string, text: string, deps: readonly string[] = []): TodoCommand => ({ type: "add", id, text, deps });

function run(commands: readonly TodoCommand[]): TodoStore {
  const store = memoryTodo();
  for (const command of commands) store.apply(command);
  return store;
}

function refusal(commands: readonly TodoCommand[], failing: TodoCommand): TodoOperationError {
  const store = run(commands);
  try {
    store.apply(failing);
  } catch (error) {
    expect(error).toBeInstanceOf(TodoOperationError);
    return error as TodoOperationError;
  }
  throw new Error("expected the command to be refused");
}

describe("todo engine", () => {
  it("assigns sequential ids and canonical priorities", () => {
    const store = run([{ type: "add", text: "one" }, { type: "add", text: "two" }, { type: "add", text: "three" }]);
    expect(presentation(store.state)).toEqual(["i1", "i2", "i3"]);
    expect(store.state.priority["i1"]).toBe(0);
    expect(store.state.priority["i2"]).toBe(1);
    expect(store.state.priority["i3"]).toBe(2);
    expect(store.violations()).toEqual([]);
  });

  it("orders by position and rebalances every live priority", () => {
    const store = run([add("i1", "a"), add("i2", "b"), add("i3", "c"), { type: "order", id: "i3", position: 1 }]);
    expect(presentation(store.state)).toEqual(["i3", "i1", "i2"]);
    expect(store.violations()).toEqual([]);
  });

  it("refuses to place an item before its live dependency", () => {
    const error = refusal([add("i1", "root"), add("i2", "child", ["i1"])], { type: "order", id: "i2", position: 1 });
    expect(error.code).toBe("todo-order-veto");
    expect(error.message).toContain("i1");
  });

  it("allows a move that respects the dependency order", () => {
    const store = run([add("i1", "root"), add("i2", "child", ["i1"]), add("i3", "other"), { type: "order", id: "i3", before: "i1" }]);
    expect(presentation(store.state)).toEqual(["i3", "i1", "i2"]);
  });

  it("refuses removal while live work depends on the item", () => {
    const error = refusal([add("i1", "root"), add("i2", "child", ["i1"])], { type: "remove", id: "i1" });
    expect(error.code).toBe("todo-remove-veto");
  });

  it("cascades a removal through live dependents in reverse topological order", () => {
    const store = run([add("i1", "root"), add("i2", "child", ["i1"]), { type: "remove", id: "i1", cascade: "remove" }]);
    expect(store.state.status["i1"]).toBe("absent");
    expect(store.state.status["i2"]).toBe("absent");
  });

  it("blocks live dependents on cascade=block", () => {
    const store = run([add("i1", "root"), add("i2", "child", ["i1"]), { type: "remove", id: "i1", cascade: "block" }]);
    expect(store.state.status["i1"]).toBe("absent");
    expect(store.state.status["i2"]).toBe("blocked");
  });

  it("cannot complete work while a dependency is unsatisfied", () => {
    const error = refusal([add("i1", "root"), add("i2", "child", ["i1"])], { type: "mark", id: "i2", status: "completed" });
    expect(error.message).toContain("mark-not-enabled");
  });

  it("vetoes reopen while a successful or in-progress dependent exists", () => {
    const store = run([
      add("i1", "root"),
      add("i2", "child", ["i1"]),
      { type: "mark", id: "i1", status: "completed" },
      { type: "mark", id: "i2", status: "in_progress" },
    ]);
    const error = refusal(
      [
        add("i1", "root"),
        add("i2", "child", ["i1"]),
        { type: "mark", id: "i1", status: "completed" },
        { type: "mark", id: "i2", status: "in_progress" },
      ],
      { type: "reopen", id: "i1" },
    );
    expect(error.message).toContain("reopen-not-enabled");
    // Removing the dependent unlocks the reopen.
    store.apply({ type: "remove", id: "i2" });
    store.apply({ type: "reopen", id: "i1" });
    expect(store.state.status["i1"]).toBe("pending");
  });

  it("keeps a terminal dependency referenced by live work when clearing", () => {
    const store = run([
      add("i1", "finished root"),
      add("i2", "live child", ["i1"]),
      { type: "mark", id: "i1", status: "completed" },
      { type: "clear" },
    ]);
    expect(store.state.status["i1"]).toBe("completed");
    store.apply({ type: "mark", id: "i2", status: "completed" });
    store.apply({ type: "clear" });
    expect(store.state.status["i1"]).toBe("absent");
    expect(store.state.status["i2"]).toBe("absent");
  });

  it("rewires live dependencies and recomputes the forest", () => {
    const store = run([add("i1", "a"), add("i2", "b"), add("i3", "c"), { type: "edit", id: "i2", deps: ["i3"] }]);
    expect(presentation(store.state)).toEqual(["i1", "i3", "i2"]);
    expect(store.state.deps["i2"]).toEqual(["i3"]);
  });

  it("never reuses an explicit id for auto assignment", () => {
    const store = run([add("i1", "explicit")]);
    store.apply({ type: "add", text: "auto" });
    expect(presentation(store.state)).toEqual(["i1", "i2"]);
  });

  it("re-adds a removed id with a fresh sequence number", () => {
    const store = run([add("i1", "a"), add("i2", "b"), { type: "remove", id: "i2" }, add("i2", "b again")]);
    expect(store.state.status["i2"]).toBe("pending");
    expect(store.state.seq["i2"]).toBe(3);
    expect(presentation(store.state)).toEqual(["i1", "i2"]);
  });

  it("realizes every permutation of an independent heap by position moves", () => {
    const permutations = [
      ["i1", "i2", "i3"],
      ["i1", "i3", "i2"],
      ["i2", "i1", "i3"],
      ["i2", "i3", "i1"],
      ["i3", "i1", "i2"],
      ["i3", "i2", "i1"],
    ];
    for (const order of permutations) {
      const store = run([add("i1", "a"), add("i2", "b"), add("i3", "c")]);
      order.forEach((id, index) => store.apply({ type: "order", id, position: index + 1 }));
      expect(presentation(store.state), order.join(" ")).toEqual(order);
      expect(store.violations()).toEqual([]);
    }
  });

  it("writes a durable snapshot per accepted command", () => {
    const snapshots: unknown[] = [];
    const store = new TodoStore({ append: (snapshot) => snapshots.push(snapshot) });
    store.apply({ type: "add", text: "one" });
    store.apply({ type: "mark", id: "i1", status: "in_progress" });
    expect(snapshots.length).toBe(2);
  });
});
