/**
 * The presentation layer. Everything here is a pure function of the verified
 * state: the order is `linearize` (the verified greedy Kahn relation), the
 * heaps are the verified live components, and glyphs are a function of
 * (status, theme). The tool renders exactly this; it never re-derives state.
 */

import {
  SUCCESS_STATUSES,
  heapsOf,
  linearize,
  reach,
  sat,
  type ItemId,
  type ItemStatus,
} from "../formal/model.ts";
import { abstractTodoState, isLive, todoModelConfig, type TodoState } from "./state.ts";

export type Theme = "dark" | "light";

/** The theme-dependent pending mark, plus the fixed status glyphs. */
export const PENDING_GLYPH: Readonly<Record<Theme, string>> = { dark: "⚪", light: "⚫" };

export const STATUS_GLYPH: Readonly<Record<Exclude<ItemStatus, "absent">, string>> = {
  pending: PENDING_GLYPH.light,
  in_progress: "🔵",
  blocked: "⛔",
  failed: "🔴",
  completed_with_errors: "🟡",
  completed: "🟢",
};

/** Resolve the theme: `PI_TODO_THEME` wins, then the terminal background. */
export function resolveTheme(env: Readonly<Record<string, string | undefined>> = process.env): Theme {
  const explicit = env.PI_TODO_THEME?.toLowerCase();
  if (explicit === "dark" || explicit === "light") return explicit;
  const colorfgbg = env.COLORFGBG;
  if (colorfgbg !== undefined) {
    const background = colorfgbg.split(";").at(-1)?.trim();
    if (background === "0" || background === "8") return "dark";
  }
  return "light";
}

/** The glyph for a status under a theme. Pending swaps for contrast. */
export function statusGlyph(status: ItemStatus, theme: Theme): string {
  if (status === "absent") return "";
  if (status === "pending") return PENDING_GLYPH[theme];
  return STATUS_GLYPH[status];
}

/** The prioritized linear list of live items. */
export function presentation(state: TodoState): ItemId[] {
  return linearize(abstractTodoState(state), todoModelConfig(state));
}

/** The live heaps, each in the verification's deterministic member order. */
export function heaps(state: TodoState): ItemId[][] {
  return heapsOf(abstractTodoState(state));
}

/** The dependencies of a live item that have not finished successfully. */
export function waitingDeps(state: TodoState, item: ItemId): ItemId[] {
  return (state.deps[item] ?? []).filter((dep) => !SUCCESS_STATUSES.includes(state.status[dep] ?? "absent"));
}

/** A live item is ready when every dependency has finished successfully. */
export function isReady(state: TodoState, item: ItemId): boolean {
  return isLive(state, item) && sat(abstractTodoState(state), item);
}

/**
 * The forest veto, as a predicate: can `item` be placed before `other`?
 * Exactly `not (item transitively depends on other)`, because the verified
 * presentation is a linear extension of the dependency graph.
 */
export function canPlaceBefore(state: TodoState, item: ItemId, other: ItemId): boolean {
  return item !== other && isLive(state, item) && isLive(state, other) && !reach(abstractTodoState(state), item, other);
}

/** The dual: can `item` be placed after `other`? */
export function canPlaceAfter(state: TodoState, item: ItemId, other: ItemId): boolean {
  return item !== other && isLive(state, item) && isLive(state, other) && !reach(abstractTodoState(state), other, item);
}

/** Status counts over the present items. */
export function statusCounts(state: TodoState): Record<Exclude<ItemStatus, "absent">, number> {
  const counts: Record<Exclude<ItemStatus, "absent">, number> = {
    pending: 0,
    in_progress: 0,
    blocked: 0,
    failed: 0,
    completed_with_errors: 0,
    completed: 0,
  };
  for (const item of Object.keys(state.status)) {
    const status = state.status[item] ?? "absent";
    if (status !== "absent") counts[status] += 1;
  }
  return counts;
}

/** The one-line annotator used after a status glyph. */
function annotate(state: TodoState, item: ItemId): string {
  const deps = state.deps[item] ?? [];
  const waiting = waitingDeps(state, item);
  const parts: string[] = [];
  if (deps.length > 0) parts.push(`deps: ${deps.join(", ")}`);
  if (waiting.length > 0) parts.push(`waiting on ${waiting.join(", ")}`);
  if (state.notes[item] !== undefined && state.notes[item] !== "") parts.push(state.notes[item]!);
  return parts.length > 0 ? `  (${parts.join("; ")})` : "";
}

/** Render the list as one simple, automatically prioritized linear list. */
export function renderList(state: TodoState, theme: Theme, options: { readonly includeTerminal?: boolean } = {}): string {
  const live = presentation(state);
  const counts = statusCounts(state);
  const heapList = heaps(state);
  const lines: string[] = [
    `todo revision ${state.revision} · ${live.length} live · ${heapList.length} heap(s) · ` +
      `${counts.completed + counts.completed_with_errors} done · ${counts.failed} failed · ${counts.blocked} blocked`,
  ];
  if (live.length === 0) lines.push("  (no live items)");
  const heapOf = new Map<ItemId, number>();
  heapList.forEach((heap, index) => heap.forEach((item) => heapOf.set(item, index + 1)));
  live.forEach((item, index) => {
    const status = state.status[item] ?? "pending";
    lines.push(
      `${index + 1}. ${statusGlyph(status, theme)} ${item} ${state.texts[item] ?? ""}` +
        `  [heap ${heapOf.get(item) ?? 1}]${annotate(state, item)}`,
    );
  });
  if (options.includeTerminal !== false) {
    const terminal = Object.keys(state.status)
      .filter((item) => {
        const status = state.status[item] ?? "absent";
        return status !== "absent" && !isLive(state, item);
      })
      .sort((a, b) => (state.seq[a] ?? 0) - (state.seq[b] ?? 0));
    if (terminal.length > 0) {
      lines.push("done:");
      for (const item of terminal) {
        const status = state.status[item] ?? "absent";
        lines.push(`  ${statusGlyph(status, theme)} ${item} ${state.texts[item] ?? ""}${annotate(state, item)}`);
      }
    }
  }
  return lines.join("\n");
}
