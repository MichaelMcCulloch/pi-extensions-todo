/**
 * The production todo state.
 *
 * `TodoState` extends the abstract state with presentation payload (`texts`,
 * `notes`) and bookkeeping (`nextId`, `revision`) that is deliberately outside
 * the verified machine: labels are opaque data, and ids/revisions never feed a
 * transition guard. `abstractTodoState` projects back onto the verified state.
 *
 * One list per session. Item ids are `i<n>`; an explicit id is accepted so the
 * trace universe (i1, i2, i3) can be re-added after a removal.
 */

import type { AbstractTodoState, ItemId, ItemStatus, TodoModelConfig } from "../formal/model.ts";
import { TERMINAL_STATUSES } from "../formal/model.ts";

/** The durable todo state. */
export interface TodoState extends AbstractTodoState {
  readonly texts: Readonly<Record<ItemId, string>>;
  readonly notes: Readonly<Record<ItemId, string>>;
  /** The next auto-assigned id number. Never reused. */
  readonly nextId: number;
  readonly revision: number;
}

/** A fresh, empty list. */
export function initTodoState(): TodoState {
  return {
    status: {},
    deps: {},
    priority: {},
    seq: {},
    next: 1,
    texts: {},
    notes: {},
    nextId: 1,
    revision: 0,
  };
}

/** Fill any fields a snapshot predating the current schema may lack. */
export function normalizeTodoState(state: TodoState): TodoState {
  const status = { ...state.status };
  const deps = { ...state.deps };
  const priority = { ...state.priority };
  const seq = { ...state.seq };
  const texts = { ...state.texts };
  const notes = { ...state.notes };
  const ids = new Set<ItemId>([
    ...Object.keys(status),
    ...Object.keys(deps),
    ...Object.keys(priority),
    ...Object.keys(seq),
    ...Object.keys(texts),
    ...Object.keys(notes),
  ]);
  for (const id of ids) {
    status[id] = status[id] ?? "absent";
    deps[id] = deps[id] ?? [];
    priority[id] = priority[id] ?? 0;
    seq[id] = seq[id] ?? 0;
    texts[id] = texts[id] ?? "";
    notes[id] = notes[id] ?? "";
  }
  return {
    status,
    deps,
    priority,
    seq,
    next: state.next ?? 1,
    texts,
    notes,
    nextId: state.nextId ?? 1,
    revision: state.revision ?? 0,
  };
}

/** Project the durable state onto the verified abstract state. */
export function abstractTodoState(state: TodoState, items?: readonly ItemId[]): AbstractTodoState {
  if (items === undefined) {
    return { status: state.status, deps: state.deps, priority: state.priority, seq: state.seq, next: state.next };
  }
  const status: Record<ItemId, ItemStatus> = {};
  const deps: Record<ItemId, readonly ItemId[]> = {};
  const priority: Record<ItemId, number> = {};
  const seq: Record<ItemId, number> = {};
  for (const item of items) {
    status[item] = state.status[item] ?? "absent";
    deps[item] = state.deps[item] ?? [];
    priority[item] = state.priority[item] ?? 0;
    seq[item] = state.seq[item] ?? 0;
  }
  return { status, deps, priority, seq, next: state.next };
}

/** The verification universe uses generous production bounds; traces use the fixture. */
export function todoModelConfig(state: TodoState, items?: readonly ItemId[]): TodoModelConfig {
  return {
    items: items ?? Object.keys(state.status),
    maxPriority: Number.MAX_SAFE_INTEGER,
    maxSeq: Number.MAX_SAFE_INTEGER,
  };
}

export function isPresent(state: TodoState, item: ItemId): boolean {
  return (state.status[item] ?? "absent") !== "absent";
}

export function isLive(state: TodoState, item: ItemId): boolean {
  const status = state.status[item] ?? "absent";
  return status !== "absent" && !TERMINAL_STATUSES.includes(status);
}

export function presentIds(state: TodoState): ItemId[] {
  return Object.keys(state.status).filter((item) => isPresent(state, item));
}

export function activeIds(state: TodoState): ItemId[] {
  return Object.keys(state.status).filter((item) => isLive(state, item));
}

/** The next id that is not already a key in the state. */
export function allocateId(state: TodoState): ItemId {
  let n = state.nextId;
  while (Object.hasOwn(state.status, `i${n}`) || Object.hasOwn(state.texts, `i${n}`)) n += 1;
  return `i${n}`;
}

/** Advance `nextId` so an explicit id can never be handed out again. */
export function advanceNextId(state: TodoState, id: ItemId): number {
  const match = /^i(\d+)$/.exec(id);
  if (match === null) return state.nextId;
  return Math.max(state.nextId, Number(match[1]) + 1);
}
