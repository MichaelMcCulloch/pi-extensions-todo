import { describe, expect, it } from "vitest";
import {
  canPlaceAfter,
  canPlaceBefore,
  heaps,
  presentation,
  renderList,
  resolveTheme,
  statusGlyph,
  waitingDeps,
} from "../src/engine/projection.ts";
import { memoryTodo } from "../src/extension/store.ts";
import type { TodoCommand } from "../src/engine/reducer.ts";

const add = (id: string, text: string, deps: readonly string[] = []): TodoCommand => ({ type: "add", id, text, deps });

function run(commands: readonly TodoCommand[]) {
  const store = memoryTodo();
  for (const command of commands) store.apply(command);
  return store;
}

describe("presentation", () => {
  it("resolves the theme: explicit wins, then the terminal background", () => {
    expect(resolveTheme({ PI_TODO_THEME: "dark" })).toBe("dark");
    expect(resolveTheme({ PI_TODO_THEME: "LIGHT", COLORFGBG: "15;0" })).toBe("light");
    expect(resolveTheme({ COLORFGBG: "15;0" })).toBe("dark");
    expect(resolveTheme({ COLORFGBG: "0;15" })).toBe("light");
    expect(resolveTheme({})).toBe("light");
  });

  it("swaps only the pending glyph per theme", () => {
    expect(statusGlyph("pending", "dark")).toBe("⚪");
    expect(statusGlyph("pending", "light")).toBe("⚫");
    expect(statusGlyph("in_progress", "dark")).toBe("🔵");
    expect(statusGlyph("blocked", "light")).toBe("⛔");
    expect(statusGlyph("failed", "dark")).toBe("🔴");
    expect(statusGlyph("completed_with_errors", "light")).toBe("🟡");
    expect(statusGlyph("completed", "dark")).toBe("🟢");
  });

  it("splits disconnected heaps and merges them on a rewire", () => {
    const store = run([add("i1", "a"), add("i2", "b", ["i1"]), add("i3", "c")]);
    expect(heaps(store.state).map((heap) => heap.join("+")).sort()).toEqual(["i1+i2", "i3"]);
    store.apply({ type: "edit", id: "i3", deps: ["i2"] });
    expect(heaps(store.state).map((heap) => heap.join("+"))).toEqual(["i1+i2+i3"]);
  });

  it("mirrors the forest veto as reachability predicates", () => {
    const store = run([add("i1", "a"), add("i2", "b", ["i1"]), add("i3", "c")]);
    expect(canPlaceBefore(store.state, "i2", "i1")).toBe(false);
    expect(canPlaceBefore(store.state, "i1", "i2")).toBe(true);
    expect(canPlaceAfter(store.state, "i1", "i2")).toBe(false);
    expect(canPlaceAfter(store.state, "i2", "i1")).toBe(true);
    expect(canPlaceBefore(store.state, "i3", "i1")).toBe(true);
  });

  it("reports the unsatisfied dependencies of a waiting item", () => {
    const store = run([add("i1", "a"), add("i2", "b", ["i1"]), add("i3", "c", ["i1", "i2"])]);
    expect(waitingDeps(store.state, "i2")).toEqual(["i1"]);
    expect(waitingDeps(store.state, "i3")).toEqual(["i1", "i2"]);
    store.apply({ type: "mark", id: "i1", status: "completed" });
    expect(waitingDeps(store.state, "i2")).toEqual([]);
    expect(waitingDeps(store.state, "i3")).toEqual(["i2"]);
  });

  it("renders one linear list with positions, glyphs, and heap tags", () => {
    const store = run([add("i1", "design"), add("i2", "build", ["i1"]), add("i3", "docs")]);
    const text = renderList(store.state, "dark");
    expect(text).toContain("1. ⚪ i1 design  [heap 1]");
    expect(text).toContain("2. ⚪ i2 build  [heap 1]  (deps: i1; waiting on i1)");
    expect(text).toContain("3. ⚪ i3 docs  [heap 2]");
    expect(presentation(store.state)).toEqual(["i1", "i2", "i3"]);
  });

  it("renders terminal items in a done section", () => {
    const store = run([add("i1", "shipped"), { type: "mark", id: "i1", status: "completed" }]);
    const text = renderList(store.state, "light");
    expect(text).toContain("done:");
    expect(text).toContain("🟢 i1 shipped");
  });
});
