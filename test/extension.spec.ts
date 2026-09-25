import { describe, expect, it } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { initTodoState } from "../src/engine/state.ts";
import todoExtension, { TODO_STATE_ENTRY, latestSnapshot } from "../src/index.ts";

function ctxWith(entries: readonly unknown[]): ExtensionContext {
  return { sessionManager: { getBranch: () => entries } } as unknown as ExtensionContext;
}

describe("todo extension entry", () => {
  it("folds the newest todo snapshot out of a session branch", () => {
    const older = { ...initTodoState(), revision: 1 };
    const newer = { ...initTodoState(), revision: 2 };
    const ctx = ctxWith([
      { type: "message", id: "m1" },
      { type: "custom", customType: TODO_STATE_ENTRY, data: older },
      { type: "custom", customType: "other/state", data: { ignored: true } },
      { type: "custom", customType: TODO_STATE_ENTRY, data: newer },
    ]);
    expect(latestSnapshot(ctx)?.revision).toBe(2);
  });

  it("returns null when the branch has no snapshot", () => {
    expect(latestSnapshot(ctxWith([{ type: "message", id: "m1" }]))).toBeNull();
  });

  it("registers the tool, the session hooks, and the /todo command", () => {
    const tools: string[] = [];
    const commands: string[] = [];
    const events: string[] = [];
    const pi = {
      on: (name: string) => events.push(name),
      registerTool: (tool: { readonly name: string }) => tools.push(tool.name),
      registerCommand: (name: string) => commands.push(name),
      appendEntry: () => {},
    } as unknown as ExtensionAPI;
    todoExtension(pi);
    expect(tools).toEqual(["todo"]);
    expect(commands).toEqual(["todo"]);
    expect(events).toEqual(["session_start", "session_tree", "session_shutdown"]);
  });
});
