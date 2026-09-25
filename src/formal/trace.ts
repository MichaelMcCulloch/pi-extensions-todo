/**
 * Trace generation for TLC trace validation.
 *
 * The traces are produced by driving the **production store** one command at a
 * time and recording the abstract state after every event it emits. The store's
 * transition IS `referenceReduceTodoState` (the mirror of `spec/TodoSystem.tla`),
 * so replaying these traces checks the production command→event mapping, the
 * canonical renumbering, and the store's bookkeeping against the one model.
 */

import { abstractTodoState } from "../engine/state.ts";
import type { TodoCommand } from "../engine/reducer.ts";
import { memoryTodo, type TodoStore } from "../extension/store.ts";
import {
  TODO_MODEL,
  referenceReduceTodoState,
  type AbstractTodoState,
  type TodoEvent,
} from "./model.ts";

/** One recorded step. The first step has `event: null`. */
export interface TraceStep {
  readonly event: TodoEvent | null;
  readonly state: AbstractTodoState;
}

/** A named scenario: a sequence of production commands. */
export interface Scenario {
  readonly name: string;
  readonly commands: readonly TodoCommand[];
}

const add = (id: string, text: string, deps: readonly string[] = []): TodoCommand => ({ type: "add", id, text, deps });

/** The scenarios the validator replays, covering every action. */
export function scenarios(): Scenario[] {
  return [
    {
      name: "chain-lifecycle",
      commands: [
        add("i1", "scaffold"),
        add("i2", "build", ["i1"]),
        { type: "mark", id: "i1", status: "in_progress" },
        { type: "mark", id: "i1", status: "completed" },
        { type: "mark", id: "i2", status: "in_progress" },
        { type: "mark", id: "i2", status: "completed_with_errors" },
      ],
    },
    {
      name: "two-heaps-and-order",
      commands: [
        add("i1", "design"),
        add("i2", "implement", ["i1"]),
        add("i3", "documentation"),
        { type: "order", id: "i3", to: "first" },
        { type: "mark", id: "i3", status: "completed" },
        { type: "mark", id: "i1", status: "completed" },
        { type: "mark", id: "i2", status: "in_progress" },
        { type: "mark", id: "i2", status: "completed" },
      ],
    },
    {
      name: "reopen-and-rewire",
      commands: [
        add("i1", "prototype"),
        add("i2", "harden", ["i1"]),
        { type: "mark", id: "i1", status: "failed" },
        { type: "reopen", id: "i1" },
        { type: "edit", id: "i2", deps: [] },
        { type: "mark", id: "i1", status: "completed" },
        { type: "mark", id: "i2", status: "completed" },
      ],
    },
    {
      name: "cascade-block",
      commands: [add("i1", "blocked root"), add("i2", "contingent", ["i1"]), { type: "remove", id: "i1", cascade: "block" }],
    },
    {
      name: "cascade-remove",
      commands: [add("i1", "doomed root"), add("i2", "doomed child", ["i1"]), { type: "remove", id: "i1", cascade: "remove" }],
    },
    {
      name: "clear-terminal",
      commands: [
        add("i1", "shipped"),
        { type: "mark", id: "i1", status: "completed" },
        add("i2", "broke"),
        { type: "mark", id: "i2", status: "failed" },
        { type: "clear" },
      ],
    },
    {
      name: "re-add-after-remove",
      commands: [
        add("i1", "first"),
        add("i2", "second"),
        { type: "remove", id: "i2" },
        add("i2", "second, again"),
        { type: "mark", id: "i2", status: "in_progress" },
        { type: "mark", id: "i2", status: "completed" },
      ],
    },
  ];
}

function traceState(store: TodoStore): AbstractTodoState {
  return abstractTodoState(store.state, TODO_MODEL.items);
}

function sameAbstract(left: AbstractTodoState, right: AbstractTodoState): boolean {
  const items = [...TODO_MODEL.items];
  return JSON.stringify(items.map((item) => [left.status[item], [...(left.deps[item] ?? [])].sort(), left.priority[item], left.seq[item]])) ===
    JSON.stringify(items.map((item) => [right.status[item], [...(right.deps[item] ?? [])].sort(), right.priority[item], right.seq[item]])) &&
    left.next === right.next;
}

/** Drive a scenario through the production store and record every transition. */
export function runScenario(scenario: Scenario): TraceStep[] {
  const store = memoryTodo();
  let state = traceState(store);
  const trace: TraceStep[] = [{ event: null, state }];
  for (const command of scenario.commands) {
    const result = store.apply(command);
    for (const event of result.events) {
      state = referenceReduceTodoState(state, event, TODO_MODEL);
      trace.push({ event, state });
    }
    const projected = traceState(store);
    if (!sameAbstract(projected, state)) {
      throw new Error(
        `trace divergence in ${scenario.name}: production ${JSON.stringify(projected)} != model ${JSON.stringify(state)}`,
      );
    }
  }
  return trace;
}

/* -------------------------------------------------------------------------- */
/* TLA+ rendering                                                             */
/* -------------------------------------------------------------------------- */

function quote(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function record(keys: readonly string[], render: (key: string) => string): string {
  return `[ ${keys.map((key) => `${key} |-> ${render(key)}`).join(", ")} ]`;
}

function sequence(items: readonly string[]): string {
  return `<<${items.map(quote).join(", ")}>>`;
}

function setOf(items: readonly string[]): string {
  return `{${[...items].sort().map(quote).join(", ")}}`;
}

function tlaState(state: AbstractTodoState): string {
  const items = TODO_MODEL.items;
  return [
    "[",
    `status |-> ${record(items, (i) => quote(state.status[i] ?? "absent"))}`,
    `, deps |-> ${record(items, (i) => setOf(state.deps[i] ?? []))}`,
    `, priority |-> ${record(items, (i) => String(state.priority[i] ?? 0))}`,
    `, seq |-> ${record(items, (i) => String(state.seq[i] ?? 0))}`,
    `, next |-> ${state.next}`,
    "]",
  ].join(" ");
}

function tlaEvent(event: TodoEvent | null): string {
  const fields: string[] = [`type |-> ${quote(event?.type ?? "init")}`];
  const get = (key: string): unknown => (event as unknown as Record<string, unknown> | null)?.[key];
  fields.push(`item |-> ${quote(typeof get("item") === "string" ? (get("item") as string) : "none")}`);
  fields.push(`status |-> ${quote(typeof get("status") === "string" ? (get("status") as string) : "none")}`);
  fields.push(`priority |-> ${typeof get("priority") === "number" ? String(get("priority")) : "0"}`);
  const deps = get("deps");
  fields.push(`deps |-> ${Array.isArray(deps) ? setOf(deps as string[]) : "{}"}`);
  return `[ ${fields.join(", ")} ]`;
}

function tlaTrace(steps: readonly TraceStep[]): string {
  const records = steps.map((step) => `[ event |-> ${tlaEvent(step.event)}, state |-> ${tlaState(step.state)} ]`);
  return `<<\n  ${records.join(",\n  ")}\n>>`;
}

/** Render the generated `TracesData` module TLC consumes. */
export function renderTracesModule(traces: readonly (readonly TraceStep[])[]): string {
  const rendered = traces.map((trace, index) => `\\* trace ${index}\n${tlaTrace(trace)}`);
  return [
    "---------------------------- MODULE TracesData ----------------------------",
    "\\* Generated by scripts/emit-traces.ts. Do not edit.",
    "",
    `Traces == <<\n${rendered.join(",\n")}\n>>`,
    "",
    "=============================================================================",
    "",
  ].join("\n");
}

/** Build every scenario trace from the production store. */
export function buildTraces(): { name: string; trace: TraceStep[] }[] {
  return scenarios().map((scenario) => ({ name: scenario.name, trace: runScenario(scenario) }));
}
