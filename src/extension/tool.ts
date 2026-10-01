/**
 * The model-facing `todo` tool.
 *
 * The list is a dependency-ordered priority forest. `list` renders exactly the
 * verified presentation; `add`/`edit` accept optional dependencies; `order`
 * moves an item subject to the forest veto; `mark` walks the verified status
 * machine; `remove` is refused while live work depends on the item unless an
 * explicit cascade is given.
 */

import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionContext, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { TodoStatusArgument } from "../engine/reducer.ts";
import type { TodoStore } from "./store.ts";
import { TodoOperationError } from "./store.ts";
import {
  heaps,
  presentation,
  renderList,
  resolveTheme,
  statusCounts,
  type Theme,
} from "../engine/projection.ts";

/** Every action the model may issue. */
export const TODO_TOOL_ACTIONS = ["add", "remove", "edit", "order", "mark", "reopen", "clear", "list", "status"] as const;

const TodoParams = Type.Object({
  action: StringEnum(TODO_TOOL_ACTIONS),
  id: Type.Optional(Type.String({ description: "Item id (for remove, edit, order, mark, reopen)." })),
  text: Type.Optional(Type.String({ description: "Item text (required for add)." })),
  note: Type.Optional(Type.String({ description: "Free-form note shown next to the item." })),
  deps: Type.Optional(Type.Array(Type.String(), { description: "Dependencies the item waits for." })),
  status: Type.Optional(
    StringEnum(["pending", "in_progress", "blocked", "failed", "completed_with_errors", "completed"] as const),
  ),
  position: Type.Optional(Type.Integer({ description: "1-based destination in the live list." })),
  before: Type.Optional(Type.String({ description: "Place the item immediately before this live item." })),
  after: Type.Optional(Type.String({ description: "Place the item immediately after this live item." })),
  to: Type.Optional(StringEnum(["first", "last"] as const, { description: "Move to the front or the back." })),
  cascade: Type.Optional(StringEnum(["remove", "block"] as const, { description: "How to handle live dependents on remove." })),
  theme: Type.Optional(StringEnum(["dark", "light"] as const, { description: "Pending glyph theme; defaults to detection." })),
  all: Type.Optional(Type.Boolean({ description: "Include terminal items (default true)." })),
});

interface TodoDetails {
  readonly action: string;
  readonly revision: number;
  readonly theme: Theme;
  readonly presentation?: readonly string[];
  readonly heaps?: readonly (readonly string[])[];
  readonly counts?: unknown;
  readonly events?: readonly string[];
}

/** Build the tool against a lazily constructed store. */
export function buildTodoTool(getStore: (ctx: ExtensionContext) => TodoStore): ToolDefinition<typeof TodoParams, TodoDetails> {
  return {
    namespace: { name: "todo", description: "Dependency-ordered task priorities" },
    name: "todo",
    label: "Todo",
    description:
      "Maintain a session todo list ordered by dependencies and priority. add/edit accept optional deps; order moves an item in the automatically prioritized list (the dependency forest vetoes illegal moves); mark sets pending, in_progress, blocked, failed, completed_with_errors, or completed; remove refuses while live work depends on the item unless cascade is given; list renders the linear list.",
    promptSnippet: "todo: maintain a dependency-ordered todo list",
    promptGuidelines: [
      "Use todo action=add with text and optional deps to enqueue work; dependencies keep prerequisites earlier in the list.",
      "Use todo action=order with before/after/position/first to reorder; illegal moves are refused with the violated dependency.",
      "Use todo action=mark to move through pending -> in_progress -> completed (or blocked/failed/completed_with_errors).",
    ],
    parameters: TodoParams,
    executionMode: "sequential",
    async execute(_toolCallId, params, _signal, _onUpdate, ctx): Promise<{ content: { type: "text"; text: string }[]; details: TodoDetails }> {
      const store = getStore(ctx);
      const theme = params.theme ?? resolveTheme();
      const includeTerminal = params.all ?? true;
      try {
        if (params.action === "list" || params.action === "status") {
          return {
            content: [{ type: "text", text: renderList(store.state, theme, { includeTerminal }) }],
            details: {
              action: params.action,
              revision: store.state.revision,
              theme,
              presentation: presentation(store.state),
              heaps: heaps(store.state),
              counts: statusCounts(store.state),
            },
          };
        }
        const command = commandFor(params);
        const result = store.apply(command);
        const lines = [
          `todo ${params.action} applied (${result.events.length} transition${result.events.length === 1 ? "" : "s"}) at revision ${result.state.revision}`,
          renderList(result.state, theme, { includeTerminal }),
        ];
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: {
            action: params.action,
            revision: result.state.revision,
            theme,
            presentation: presentation(result.state),
            heaps: heaps(result.state),
            counts: statusCounts(result.state),
            events: result.events.map((event) => event.type),
          },
        };
      } catch (error) {
        if (error instanceof TodoOperationError) {
          // The agent runtime only marks a tool result as an error when
          // `execute` throws; a refusal returned as ordinary content is
          // reported to the model as success. Rethrow with the action and the
          // stable code so the failure is visible and actionable.
          throw new TodoOperationError(error.code, `todo ${params.action} refused (${error.code}): ${error.message}`);
        }
        throw error;
      }
    },
  };
}

function commandFor(params: {
  action: (typeof TODO_TOOL_ACTIONS)[number];
  id?: string;
  text?: string;
  note?: string;
  deps?: string[];
  status?: TodoStatusArgument;
  position?: number;
  before?: string;
  after?: string;
  to?: "first" | "last";
  cascade?: "remove" | "block";
}): Parameters<TodoStore["apply"]>[0] {
  switch (params.action) {
    case "add":
      if (params.text === undefined) throw new TodoOperationError("todo-missing-text", "add requires text");
      return {
        type: "add",
        text: params.text,
        ...(params.note === undefined ? {} : { note: params.note }),
        ...(params.id === undefined ? {} : { id: params.id }),
        ...(params.deps === undefined ? {} : { deps: params.deps }),
      };
    case "remove":
      if (params.id === undefined) throw new TodoOperationError("todo-missing-id", "remove requires id");
      return { type: "remove", id: params.id, ...(params.cascade === undefined ? {} : { cascade: params.cascade }) };
    case "edit":
      if (params.id === undefined) throw new TodoOperationError("todo-missing-id", "edit requires id");
      return {
        type: "edit",
        id: params.id,
        ...(params.text === undefined ? {} : { text: params.text }),
        ...(params.note === undefined ? {} : { note: params.note }),
        ...(params.deps === undefined ? {} : { deps: params.deps }),
      };
    case "order":
      if (params.id === undefined) throw new TodoOperationError("todo-missing-id", "order requires id");
      return {
        type: "order",
        id: params.id,
        ...(params.position === undefined ? {} : { position: params.position }),
        ...(params.before === undefined ? {} : { before: params.before }),
        ...(params.after === undefined ? {} : { after: params.after }),
        ...(params.to === undefined ? {} : { to: params.to }),
      };
    case "mark":
      if (params.id === undefined) throw new TodoOperationError("todo-missing-id", "mark requires id");
      if (params.status === undefined) throw new TodoOperationError("todo-missing-status", "mark requires status");
      return { type: "mark", id: params.id, status: params.status };
    case "reopen":
      if (params.id === undefined) throw new TodoOperationError("todo-missing-id", "reopen requires id");
      return { type: "reopen", id: params.id };
    case "clear":
      return { type: "clear" };
    default:
      throw new TodoOperationError("todo-unknown-action", `unknown action ${params.action}`);
  }
}
