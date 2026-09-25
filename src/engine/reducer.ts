/**
 * The production reducer.
 *
 * Every structural transition is `referenceReduceTodoState`, the executable
 * mirror of `spec/TodoSystem.tla`. On top of that the reducer implements the
 * two things the tool promises:
 *
 *  - **canonical priorities**: after every command the priority of each live
 *    item is its index in the verified presentation, so the "auto-balancing"
 *    index is an invariant rather than an implementation accident;
 *  - **the forest veto**: an `order` request is realized by renumbering, and it
 *    is refused when the target permutation would place an item before a live
 *    dependency.
 *
 * Payload (`text`, `note`) and `nextId` live outside the abstract state.
 */

import {
  TERMINAL_STATUSES,
  guards as modelGuards,
  reach,
  referenceReduceTodoState,
  type ItemId,
  type ItemStatus,
  type TodoEvent,
} from "../formal/model.ts";
import { presentation } from "./projection.ts";
import {
  abstractTodoState,
  activeIds,
  advanceNextId,
  allocateId,
  isLive,
  isPresent,
  todoModelConfig,
  type TodoState,
} from "./state.ts";

export type TodoStatusArgument = Exclude<ItemStatus, "absent">;

/** A command the model-facing tool can issue. */
export type TodoCommand =
  | {
      readonly type: "add";
      readonly text: string;
      readonly note?: string;
      readonly id?: string;
      readonly deps?: readonly string[];
    }
  | { readonly type: "remove"; readonly id: string; readonly cascade?: "remove" | "block" }
  | { readonly type: "edit"; readonly id: string; readonly text?: string; readonly note?: string; readonly deps?: readonly string[] }
  | {
      readonly type: "order";
      readonly id: string;
      readonly position?: number;
      readonly before?: string;
      readonly after?: string;
      readonly to?: "first" | "last";
    }
  | { readonly type: "mark"; readonly id: string; readonly status: TodoStatusArgument }
  | { readonly type: "reopen"; readonly id: string }
  | { readonly type: "clear" };

/** The result of one accepted command. */
export interface TodoReduceResult {
  readonly state: TodoState;
  readonly events: readonly TodoEvent[];
}

/** Why a command was refused before touching the verified relation. */
export class TodoCommandError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TodoCommandError";
  }
}

function refuse(code: string, message: string): never {
  throw new TodoCommandError(code, message);
}

/** Does `item` transitively depend on `target`? */
function dependsOn(state: TodoState, item: ItemId, target: ItemId): boolean {
  return reach(abstractTodoState(state), item, target);
}

/** Live dependents of `target`, in presentation order (dependencies first). */
function liveDependents(state: TodoState, target: ItemId): ItemId[] {
  return presentation(state).filter((item) => item === target || dependsOn(state, item, target));
}

function cascadeEvents(state: TodoState, target: ItemId, mode: "remove" | "block"): TodoEvent[] {
  const closure = liveDependents(state, target);
  // Reverse topological: an item with no remaining live dependent is removed
  // (or blocked) first, so every Remove guard holds when it is applied.
  const ordered = [...closure].reverse();
  if (mode === "remove") {
    return ordered.map((item) => ({ type: "remove", item }));
  }
  const events: TodoEvent[] = [];
  for (const item of ordered) {
    if (item === target) continue;
    const status = state.status[item];
    if (status === "pending" || status === "in_progress") events.push({ type: "mark", item, status: "blocked" });
    // A blocked item is still live, so the Remove guard requires that it no
    // longer references the doomed id: drop the edge explicitly.
    const remaining = (state.deps[item] ?? []).filter((dep) => dep !== target);
    if (remaining.length !== (state.deps[item] ?? []).length) events.push({ type: "rewire", item, deps: remaining });
  }
  events.push({ type: "remove", item: target });
  return events;
}

/**
 * The target permutation for an order request, or a veto. `position` is
 * 1-based over the list *after* the moved item is taken out, which is the
 * natural "move to position k" of the final list.
 */
function orderTarget(state: TodoState, command: Extract<TodoCommand, { type: "order" }>): ItemId[] {
  const current = presentation(state);
  const id = command.id;
  if (!current.includes(id)) refuse("todo-order-not-active", `${id} is not a live item`);
  const rest = current.filter((item) => item !== id);
  let index: number | undefined;
  if (command.to === "first") index = 0;
  else if (command.to === "last") index = rest.length;
  else if (command.position !== undefined) {
    if (!Number.isInteger(command.position) || command.position < 1 || command.position > current.length) {
      refuse("todo-order-invalid", `position must be an integer in 1..${current.length}`);
    }
    index = command.position - 1;
  } else if (command.before !== undefined) {
    if (command.before === id) refuse("todo-order-invalid", "an item cannot be ordered before itself");
    const at = rest.indexOf(command.before);
    if (at < 0) refuse("todo-unknown-item", `unknown or inactive item ${command.before}`);
    index = at;
  } else if (command.after !== undefined) {
    if (command.after === id) refuse("todo-order-invalid", "an item cannot be ordered after itself");
    const at = rest.indexOf(command.after);
    if (at < 0) refuse("todo-unknown-item", `unknown or inactive item ${command.after}`);
    index = at + 1;
  } else {
    refuse("todo-order-missing", "order requires one of position, before, after, to");
  }
  const target = [...rest.slice(0, index), id, ...rest.slice(index)];
  const position = new Map(target.map((item, at) => [item, at]));
  for (const item of target) {
    for (const dep of state.deps[item] ?? []) {
      if (isLive(state, dep) && (position.get(dep) ?? 0) >= (position.get(item) ?? 0)) {
        refuse("todo-order-veto", `${item} cannot be placed before its dependency ${dep}`);
      }
    }
  }
  return target;
}

/** Translate a command into the abstract events it applies. */
export function eventsForCommand(state: TodoState, command: TodoCommand): TodoEvent[] {
  switch (command.type) {
    case "add": {
      if (command.text.trim() === "") refuse("todo-empty-text", "add requires non-empty text");
      const id = command.id ?? allocateId(state);
      if (isPresent(state, id)) refuse("todo-id-in-use", `${id} is already in the list`);
      return [{ type: "add", item: id, deps: [...(command.deps ?? [])] }];
    }
    case "remove": {
      if (!isPresent(state, command.id)) refuse("todo-unknown-item", `unknown item ${command.id}`);
      if (command.cascade !== undefined) return cascadeEvents(state, command.id, command.cascade);
      const dependents = activeIds(state).filter((live) => (state.deps[live] ?? []).includes(command.id));
      if (dependents.length > 0) {
        refuse("todo-remove-veto", `live items depend on ${command.id}: ${dependents.join(", ")}`);
      }
      return [{ type: "remove", item: command.id }];
    }
    case "edit": {
      if (!isPresent(state, command.id)) refuse("todo-unknown-item", `unknown item ${command.id}`);
      if (command.text !== undefined && command.text.trim() === "") refuse("todo-empty-text", "edit text cannot be empty");
      const events: TodoEvent[] = [];
      if (command.deps !== undefined) events.push({ type: "rewire", item: command.id, deps: [...command.deps] });
      return events;
    }
    case "order": {
      const target = orderTarget(state, command);
      const events: TodoEvent[] = [];
      target.forEach((item, index) => {
        if ((state.priority[item] ?? 0) !== index) events.push({ type: "reprioritize", item, priority: index });
      });
      return events;
    }
    case "mark": {
      if (!isPresent(state, command.id)) refuse("todo-unknown-item", `unknown item ${command.id}`);
      return [{ type: "mark", item: command.id, status: command.status }];
    }
    case "reopen": {
      if (!isPresent(state, command.id)) refuse("todo-unknown-item", `unknown item ${command.id}`);
      return [{ type: "reopen", item: command.id }];
    }
    case "clear": {
      // Terminal items are removable unless live work still references them.
      return Object.keys(state.status)
        .filter((item) => TERMINAL_STATUSES.includes(state.status[item] ?? "absent"))
        .filter((item) => !activeIds(state).some((live) => (state.deps[live] ?? []).includes(item)))
        .map((item) => ({ type: "remove", item }));
    }
  }
}

/** Ask the verified model whether one event is enabled in a live todo list. */
export function isEnabled(state: TodoState, event: TodoEvent): boolean {
  const abstract = abstractTodoState(state);
  const config = todoModelConfig(state);
  switch (event.type) {
    case "add":
      return modelGuards.add(abstract, config, event.item, event.deps);
    case "remove":
      return modelGuards.remove(abstract, config, event.item);
    case "reprioritize":
      return modelGuards.reprioritize(abstract, config, event.item, event.priority);
    case "rewire":
      return modelGuards.rewire(abstract, config, event.item, event.deps);
    case "mark":
      return modelGuards.mark(abstract, event.item, event.status);
    case "reopen":
      return modelGuards.reopen(abstract, event.item);
  }
}

function applyEvent(state: TodoState, event: TodoEvent): TodoState {
  const reduced = referenceReduceTodoState(abstractTodoState(state), event, todoModelConfig(state));
  return { ...state, ...reduced };
}

/**
 * Canonicalize onto an explicit target permutation: renumber every live
 * priority to its target index. A sequence of legal `reprioritize` events;
 * edges are never touched.
 */
export function canonicalizeTo(state: TodoState, target: readonly ItemId[]): { state: TodoState; events: TodoEvent[] } {
  const events: TodoEvent[] = [];
  let next = state;
  target.forEach((item, index) => {
    if ((next.priority[item] ?? 0) !== index) {
      const event: TodoEvent = { type: "reprioritize", item, priority: index };
      next = applyEvent(next, event);
      events.push(event);
    }
  });
  return { state: next, events };
}

/**
 * Canonicalize: renumber every live priority to its presentation index.
 * This is a sequence of legal `reprioritize` events; it never touches edges.
 */
export function canonicalize(state: TodoState): { state: TodoState; events: TodoEvent[] } {
  return canonicalizeTo(state, presentation(state));
}

/** Reduce one command against the live list. */
export function reduceTodoCommand(state: TodoState, command: TodoCommand): TodoReduceResult {
  const base = eventsForCommand(state, command);
  // A newly added item appends: the abstract Add resets its priority to 0,
  // which would jump it ahead of canonicalized priorities, so the canonical
  // target is the previous presentation followed by the new item.
  const added = base.find((event): event is Extract<TodoEvent, { type: "add" }> => event.type === "add");
  const target = added === undefined ? undefined : [...presentation(state), added.item];
  let next = state;
  for (const event of base) next = applyEvent(next, event);
  if (command.type === "add" && added !== undefined) {
    next = {
      ...next,
      texts: { ...next.texts, [added.item]: command.text },
      notes: command.note === undefined ? next.notes : { ...next.notes, [added.item]: command.note },
      nextId: advanceNextId(next, added.item),
    };
  }
  if (command.type === "edit") {
    if (command.text !== undefined) next = { ...next, texts: { ...next.texts, [command.id]: command.text } };
    if (command.note !== undefined) next = { ...next, notes: { ...next.notes, [command.id]: command.note } };
  }
  const canonical = target === undefined ? canonicalize(next) : canonicalizeTo(next, target);
  const events = [...base, ...canonical.events];
  return {
    state: { ...canonical.state, revision: state.revision + events.length },
    events,
  };
}
