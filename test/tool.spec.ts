import { describe, expect, it } from "vitest";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";
import { buildTodoTool } from "../src/extension/tool.ts";
import { memoryTodo } from "../src/extension/store.ts";

const ctx = {} as ExtensionContext;

function toolOn(store: ReturnType<typeof memoryTodo>) {
  const tool = buildTodoTool(() => store);
  return (params: unknown) => tool.execute!("call", params as never, undefined, undefined, ctx);
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
    expect(listed.content[0]?.type === "text" && listed.content[0].text).toContain("waiting on i1");
  });

  it("returns a refusal instead of throwing", async () => {
    const call = toolOn(memoryTodo());
    await call({ action: "add", text: "root", id: "i1" });
    await call({ action: "add", text: "child", id: "i2", deps: ["i1"] });
    const refused = await call({ action: "order", id: "i2", position: 1 });
    expect(refused.details.error).toBe("todo-order-veto");
    expect(refused.content[0]?.type === "text" && refused.content[0].text).toContain("refused");
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
    const refused = await call({ action: "mark", id: "i2", status: "completed" });
    expect(refused.details.error).toBe("todo-transition-refused");
  });
});
