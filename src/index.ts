/**
 * pi extension entry point.
 *
 * The todo list is session-scoped: snapshots are custom session entries, so
 * branching the session rewinds the list with it. There is no file-backed
 * store and no cross-process sharing — the verified core is single-writer by
 * construction.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { renderList, resolveTheme } from "./engine/projection.ts";
import { initTodoState, type TodoState } from "./engine/state.ts";
import { TodoStore, type TodoPersistence } from "./extension/store.ts";
import { buildTodoTool } from "./extension/tool.ts";

/** The custom-entry type that carries the complete snapshot. */
export const TODO_STATE_ENTRY = "todo/state";

/** Fold the newest persisted todo snapshot out of a session branch. */
export function latestSnapshot(ctx: ExtensionContext): TodoState | null {
  let latest: TodoState | null = null;
  for (const entry of ctx.sessionManager.getBranch()) {
    if (entry.type === "custom" && entry.customType === TODO_STATE_ENTRY && entry.data !== undefined) {
      latest = entry.data as TodoState;
    }
  }
  return latest;
}

/** Default export consumed by pi. */
export default function todoExtension(pi: ExtensionAPI): void {
  let store: TodoStore | null = null;
  const persistence: TodoPersistence = { append: (snapshot) => pi.appendEntry(TODO_STATE_ENTRY, snapshot) };

  const reload = (ctx: ExtensionContext): void => {
    store = new TodoStore(persistence, latestSnapshot(ctx) ?? initTodoState());
  };
  const getStore = (ctx: ExtensionContext): TodoStore => {
    if (store === null) reload(ctx);
    return store!;
  };

  pi.on("session_start", (_event, ctx) => reload(ctx));
  pi.on("session_tree", (_event, ctx) => reload(ctx));
  pi.on("session_shutdown", () => {
    store = null;
  });

  pi.registerTool(buildTodoTool(getStore));

  pi.registerCommand("todo", {
    description: "Show the dependency-ordered todo list",
    handler: async (_args, ctx) => {
      const theme = resolveTheme();
      ctx.ui.notify(renderList(getStore(ctx).state, theme), "info");
    },
  });
}
