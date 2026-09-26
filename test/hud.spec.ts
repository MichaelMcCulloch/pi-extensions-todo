import { describe, expect, it } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { memoryTodo } from "../src/extension/store.ts";
import { TodoWidget, isTodoEmpty, renderTodoBoard, renderTodoDetail } from "../src/extension/hud.ts";
import { initTodoState } from "../src/engine/state.ts";

function withItems(): ReturnType<typeof memoryTodo> {
  const store = memoryTodo();
  store.apply({ type: "add", id: "a", text: "first" });
  store.apply({ type: "add", id: "b", text: "second", deps: ["a"] });
  return store;
}

describe("todo hud renderers", () => {
  it("treats a fresh list as empty", () => {
    expect(isTodoEmpty(initTodoState())).toBe(true);
  });

  it("shows the live list in the compact board", () => {
    const lines = renderTodoBoard(withItems().state, "dark");
    expect(lines[0]).toContain("2 live");
    expect(lines.some((line) => line.includes("first"))).toBe(true);
  });

  it("includes terminal history only in the detail view", () => {
    const store = withItems();
    store.apply({ type: "mark", id: "a", status: "completed" });
    const board = renderTodoBoard(store.state, "dark").join("\n");
    const detail = renderTodoDetail(store.state, "dark").join("\n");
    expect(detail).toContain("done:");
    expect(detail).toContain("first");
    // The widget omits the terminal section header entirely.
    expect(board).not.toContain("done:");
  });
});

describe("TodoWidget", () => {
  it("fits every line and caps with a hint", () => {
    const widget = new TodoWidget(() => ["one", "two", "three", "four"], 2);
    const lines = widget.render(30);
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(visibleWidth(line)).toBe(30);
    expect(lines[2]).toContain("+2 more");
  });

  it("renders nothing when empty", () => {
    expect(new TodoWidget(() => []).render(30)).toEqual([]);
  });
});
