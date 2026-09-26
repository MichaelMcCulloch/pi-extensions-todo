/**
 * pi extension entry point.
 *
 * The todo list is session-scoped: snapshots are custom session entries, so
 * branching the session rewinds the list with it. There is no file-backed
 * store and no cross-process sharing — the verified core is single-writer by
 * construction.
 *
 * The list is also shown persistently above the editor while it has content,
 * and `/todo` opens a scrollable view including terminal history.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { initTodoState, type TodoState } from "./engine/state.ts";
import { TodoStore, type TodoPersistence } from "./extension/store.ts";
import { buildTodoTool } from "./extension/tool.ts";
import { TodoExplorer, TodoWidget, isTodoEmpty, renderTodoBoard, renderTodoDetail } from "./extension/hud.ts";

/** The custom-entry type that carries the complete snapshot. */
export const TODO_STATE_ENTRY = "todo/state";

/** The widget slot above the editor. */
const WIDGET_KEY = "todo-list";

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
  let currentCtx: ExtensionContext | null = null;
  let widgetTui: TUI | null = null;
  let widgetInstalled = false;

  const hideWidget = (): void => {
    if (widgetInstalled && currentCtx !== null && currentCtx.mode === "tui" && currentCtx.hasUI) {
      currentCtx.ui.setWidget(WIDGET_KEY, undefined);
    }
    widgetInstalled = false;
  };

  const refreshWidget = (): void => {
    const ctx = currentCtx;
    if (ctx === null || ctx.mode !== "tui" || !ctx.hasUI) return;
    if (isTodoEmpty(getStore(ctx).state)) {
      hideWidget();
      return;
    }
    if (!widgetInstalled) {
      ctx.ui.setWidget(WIDGET_KEY, (tui, theme) => {
        widgetTui = tui;
        return new TodoWidget(
          () => renderTodoBoard(getStore(ctx).state),
          12,
          () => void openExplorer(currentCtx ?? ctx),
          () => currentCtx?.ui.theme ?? theme,
        );
      });
      widgetInstalled = true;
    }
    widgetTui?.requestRender();
  };

  const persistence: TodoPersistence = {
    append: (snapshot) => {
      pi.appendEntry(TODO_STATE_ENTRY, snapshot);
      refreshWidget();
    },
  };

  const reload = (ctx: ExtensionContext): void => {
    store = new TodoStore(persistence, latestSnapshot(ctx) ?? initTodoState());
  };
  const getStore = (ctx: ExtensionContext): TodoStore => {
    if (store === null) reload(ctx);
    return store!;
  };

  pi.on("session_start", (_event, ctx) => {
    currentCtx = ctx;
    reload(ctx);
    refreshWidget();
  });
  pi.on("session_tree", (_event, ctx) => {
    currentCtx = ctx;
    reload(ctx);
    refreshWidget();
  });
  pi.on("session_shutdown", () => {
    hideWidget();
    store = null;
    currentCtx = null;
    widgetTui = null;
  });

  pi.registerTool(buildTodoTool(getStore));

  const openExplorer = async (ctx: ExtensionContext): Promise<void> => {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;
    await ctx.ui.custom<undefined>(
      (tui, theme, _keybindings, done) =>
        new TodoExplorer(
          () => renderTodoDetail(getStore(ctx).state),
          tui,
          () => ctx.ui.theme,
          () => done(undefined),
        ),
      { overlay: true, overlayOptions: { width: "92%", maxHeight: "92%", anchor: "center", margin: 1 } },
    );
  };

  pi.registerCommand("todo", {
    description: "Show the dependency-ordered todo list; open the scrollable explorer",
    handler: async (_args, ctx) => {
      if (ctx.mode !== "tui" || !ctx.hasUI) {
        ctx.ui.notify(renderTodoDetail(getStore(ctx).state).join("\n"), "info");
        return;
      }
      await openExplorer(ctx);
    },
  });
}
