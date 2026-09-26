/**
 * Terminal presentation for the todo list.
 *
 * The persistent widget and the `/todo` explorer both render the verified
 * presentation through `renderList` unchanged; this module only decides when
 * the widget is shown, caps it, and provides scrolling.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, type Component, type TUI, type TuiMouseEvent, type TuiMouseEventResult } from "@earendil-works/pi-tui";
import { presentation, renderList, resolveTheme, statusCounts, statusGlyph, type Theme as TodoTheme } from "../engine/projection.ts";
import { isLive, type TodoState } from "../engine/state.ts";

/** Nothing to show: no live items and no terminal history. */
export function isTodoEmpty(state: TodoState): boolean {
  if (presentation(state).length > 0) return false;
  return !Object.keys(state.status).some((item) => {
    const status = state.status[item] ?? "absent";
    return status !== "absent" && !isLive(state, item);
  });
}

/**
 * The compact widget body: glyph + text for each live item, and nothing else.
 * Numbers, item ids, heap membership, dependencies, and notes are internal and
 * belong in the explorer, not the always-on view.
 */
export function renderTodoBoard(state: TodoState, theme: TodoTheme = resolveTheme()): string[] {
  const live = presentation(state);
  const counts = statusCounts(state);
  const parts = [`${live.length} live`, `${counts.completed + counts.completed_with_errors} done`];
  if (counts.blocked > 0) parts.push(`${counts.blocked} blocked`);
  if (counts.failed > 0) parts.push(`${counts.failed} failed`);
  const lines = [`todo · ${parts.join(" · ")}`];
  for (const item of live) {
    const status = state.status[item] ?? "pending";
    lines.push(`${statusGlyph(status, theme)} ${state.texts[item] ?? ""}`);
  }
  return lines;
}

/** The full explorer body: the live list and the terminal history. */
export function renderTodoDetail(state: TodoState, theme: TodoTheme = resolveTheme()): string[] {
  return renderList(state, theme, { includeTerminal: true }).split("\n");
}

/** A full-width rule, dimmed when a theme is available. */
function separator(width: number, theme: Theme | undefined): string {
  const line = "─".repeat(Math.max(0, width));
  return theme === undefined ? line : theme.fg("borderMuted", line);
}

/** The persistent widget. `lines` is read on every render so it is always live. */
export class TodoWidget implements Component {
  public constructor(
    private readonly lines: () => string[],
    private readonly maxLines = 12,
    private readonly onActivate?: () => void,
    private readonly getTheme?: () => Theme,
  ) {}

  public invalidate(): void {
    // Rendering reads the live list each frame.
  }

  public handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    if (event.type === "click" && event.button === "left" && this.onActivate !== undefined) {
      this.onActivate();
      return { handled: true };
    }
    return undefined;
  }

  public render(width: number): string[] {
    const body = this.lines();
    if (body.length === 0) return [];
    const shown = body.slice(0, this.maxLines);
    if (body.length > this.maxLines) shown.push(`… +${body.length - this.maxLines} more — click to open`);
    const fitted = shown.map((line) => truncateToWidth(line, width, "…", true));
    return [separator(width, this.getTheme?.()), ...fitted];
  }
}

/** The scrollable `/todo` explorer overlay. */
export class TodoExplorer implements Component {
  #scroll = 0;
  #total = 0;

  public constructor(
    private readonly body: (width: number) => string[],
    private readonly tui: TUI,
    private readonly getTheme: () => Theme,
    private readonly done: () => void,
  ) {}

  public invalidate(): void {
    // The body is recomputed from the live list each render.
  }

  public handleInput(data: string): void {
    if (matchesKey(data, Key.escape) || matchesKey(data, "ctrl+c") || matchesKey(data, "q")) {
      this.done();
      return;
    }
    if (matchesKey(data, Key.up)) this.#scroll -= 1;
    else if (matchesKey(data, Key.down)) this.#scroll += 1;
    else if (matchesKey(data, Key.pageUp)) this.#scroll -= this.#viewport();
    else if (matchesKey(data, Key.pageDown)) this.#scroll += this.#viewport();
    else if (matchesKey(data, Key.home)) this.#scroll = 0;
    else if (matchesKey(data, Key.end)) this.#scroll = Number.MAX_SAFE_INTEGER;
    this.#clamp();
    this.tui.requestRender();
  }

  public render(width: number): string[] {
    const theme = this.getTheme();
    const lines: string[] = [];
    lines.push(truncateToWidth(theme.bold(theme.fg("accent", "Todo")) + theme.fg("dim", "   ↑/↓ scroll · q close"), width, "…", true));
    lines.push(theme.fg("borderMuted", "─".repeat(Math.max(0, width))));
    const body = this.body(Math.max(20, width - 2));
    this.#total = body.length;
    this.#clamp();
    const viewport = this.#viewport();
    const end = Math.min(body.length, this.#scroll + viewport);
    for (let i = this.#scroll; i < end; i++) lines.push(truncateToWidth(body[i] ?? "", width, "…", true));
    for (let i = end - this.#scroll; i < viewport; i++) lines.push(" ".repeat(Math.max(0, width)));
    lines.push(theme.fg("borderMuted", "─".repeat(Math.max(0, width))));
    const range = body.length === 0 ? "0/0" : `${this.#scroll + 1}-${end}/${body.length}`;
    lines.push(truncateToWidth(theme.fg("dim", range), width, "…", true));
    return lines;
  }

  #viewport(): number {
    return Math.max(3, this.tui.terminal.rows - 6);
  }

  #clamp(): void {
    const max = Math.max(0, this.#total - this.#viewport());
    if (this.#scroll < 0) this.#scroll = 0;
    else if (this.#scroll > max) this.#scroll = max;
  }
}
