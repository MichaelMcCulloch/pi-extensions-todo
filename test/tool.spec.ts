import { Check } from 'typebox/value';
import { describe, expect, it } from "vitest";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import { buildTodoTool } from "../src/extension/tool.ts";
import { memoryTodo } from "../src/extension/store.ts";

const ctx = {} as ExtensionToolContext;

function toolOn(store: ReturnType<typeof memoryTodo>) {
  const tool = buildTodoTool(() => store);
  return async (params: unknown) => {
    const result=await tool.execute!("call", params as never, undefined, undefined, ctx);
    expect(Check(tool.outputSchema!,result.structuredContent)).toBe(true);
    return result;
  };
}

describe("todo tool", () => {
  it("adds items and renders the list", async () => {
    const call = toolOn(memoryTodo());
    const added = await call({ action: "add", text: "write the spec" });
    expect(added.details.revision).toBeGreaterThan(0);
    expect(added.content[0]?.type === "text" && added.content[0].text).toContain("write the spec");
    const listed = await call({ action: "list", theme: "dark" });
    expect(listed.content[0]?.type === "text" && listed.content[0].text).toContain("⚪ i1");
  });

  it("accepts dependencies and reports waiting items in the details", async () => {
    const call = toolOn(memoryTodo());
    await call({ action: "add", text: "root", id: "i1" });
    await call({ action: "add", text: "child", id: "i2", deps: ["i1"] });
    const listed = await call({ action: "list", theme: "light" });
    expect(listed.details.presentation).toEqual(["i1", "i2"]);
    expect(listed.structuredContent).toMatchObject({presentation:["i1","i2"],heaps:[["i1","i2"]]});
    expect(listed.content[0]?.type === "text" && listed.content[0].text).toContain("waiting on i1");
  });

  it("surfaces a refusal as a thrown tool error so the agent sees the fault", async () => {
    const call = toolOn(memoryTodo());
    await call({ action: "add", text: "root", id: "i1" });
    await call({ action: "add", text: "child", id: "i2", deps: ["i1"] });
    // Returning the refusal as content would be recorded as a successful call
    // (`isError: false`); throwing is the only way to signal failure.
    await expect(call({ action: "order", id: "i2", position: 1 })).rejects.toThrow(/todo-order-veto/);
  });

  it("surfaces a refused add as a thrown tool error", async () => {
    const call = toolOn(memoryTodo());
    await call({ action: "add", text: "root", id: "i1" });
    await expect(call({ action: "add", text: "duplicate", id: "i1" })).rejects.toThrow(/todo-id-in-use/);
    await expect(call({ action: "add", text: "orphan", deps: ["missing"] })).rejects.toThrow(/todo-transition-refused/);
  });

  it("persists a payload-only edit instead of reporting a no-op", async () => {
    const store = memoryTodo();
    const call = toolOn(store);
    await call({ action: "add", text: "old", id: "i1" });
    await call({ action: "edit", id: "i1", text: "new", note: "a note" });
    expect(store.state.texts["i1"]).toBe("new");
    expect(store.state.notes["i1"]).toBe("a note");
    const listed = await call({ action: "list" });
    expect(listed.content[0]?.type === "text" && listed.content[0].text).toContain("new");
  });

  it("reports counts for the status action", async () => {
    const call = toolOn(memoryTodo());
    await call({ action: "add", text: "one" });
    await call({ action: "add", text: "two" });
    await call({ action: "mark", id: "i1", status: "blocked" });
    const status = await call({ action: "status", theme: "light" });
    expect(status.details.counts).toEqual({
      pending: 1,
      in_progress: 0,
      blocked: 1,
      failed: 0,
      completed_with_errors: 0,
      completed: 0,
    });
  });

  it("moves through the status machine and reports the transition count", async () => {
    const call = toolOn(memoryTodo());
    await call({ action: "add", text: "work" });
    const started = await call({ action: "mark", id: "i1", status: "in_progress" });
    expect(started.details.events).toContain("mark");
    const done = await call({ action: "mark", id: "i1", status: "completed" });
    expect(done.content[0]?.type === "text" && done.content[0].text).toContain("🟢");
  });

  it("refuses completion while a dependency is unsatisfied", async () => {
    const call = toolOn(memoryTodo());
    await call({ action: "add", text: "root", id: "i1" });
    await call({ action: "add", text: "child", id: "i2", deps: ["i1"] });
    await expect(call({ action: "mark", id: "i2", status: "completed" })).rejects.toThrow(
      /todo-transition-refused/,
    );
  });
});
