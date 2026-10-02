/**
 * The executable abstract model of the todo list (priority forest revision).
 *
 * This is a transcription of `spec/TodoSystem.tla`. The production reducer uses
 * `referenceReduceTodoState` directly, `test/model.spec.ts` explores the model
 * exhaustively and asserts the reachable-set size equals TLC's, and
 * `spec/TraceValidation.tla` replays the production store against the spec.
 *
 * A todo item lives in one of seven statuses. `absent` means "not in the list";
 * the other six are the user-visible statuses. `failed`, `completed_with_errors`
 * and `completed` are terminal: only `reopen` leaves them.
 *
 * The state is a forest of priority heaps over the dependency graph. The heaps
 * are derived, not stored: `linked` is undirected connectivity over live items,
 * `linearize` is the deterministic greedy Kahn order that renders the single
 * linear list, and `deps` are hard ordering constraints (the forest veto).
 */

export type ItemId = string;

export type ItemStatus =
  | "absent"
  | "pending"
  | "in_progress"
  | "blocked"
  | "failed"
  | "completed_with_errors"
  | "completed";

/** Every status, in the order the specification lists them. */
export const TODO_STATUSES: readonly ItemStatus[] = [
  "absent",
  "pending",
  "in_progress",
  "blocked",
  "failed",
  "completed_with_errors",
  "completed",
];

/** Statuses from which only `reopen` can leave. */
export const TERMINAL_STATUSES: readonly ItemStatus[] = [
  "failed",
  "completed_with_errors",
  "completed",
];

/** Statuses that satisfy a dependency. `completed_with_errors` is done work. */
export const SUCCESS_STATUSES: readonly ItemStatus[] = [
  "completed_with_errors",
  "completed",
];

/** The finite bounds the reference model is checked under. */
export interface TodoModelConfig {
  readonly items: readonly ItemId[];
  readonly maxPriority: number;
  readonly maxSeq: number;
}

/** The verification target: three items, two priorities, four sequence numbers. */
export const TODO_MODEL: TodoModelConfig = {
  items: ["i1", "i2", "i3"],
  maxPriority: 2,
  maxSeq: 4,
};

/** The complete abstract state. */
export interface AbstractTodoState {
  readonly status: Readonly<Record<ItemId, ItemStatus>>;
  readonly deps: Readonly<Record<ItemId, readonly ItemId[]>>;
  readonly priority: Readonly<Record<ItemId, number>>;
  readonly seq: Readonly<Record<ItemId, number>>;
  /** The next sequence number to hand out; never reused, never decreases. */
  readonly next: number;
}

/** The event alphabet. */
export type TodoEvent =
  | { readonly type: "add"; readonly item: ItemId; readonly deps: readonly ItemId[] }
  | { readonly type: "remove"; readonly item: ItemId }
  | { readonly type: "reprioritize"; readonly item: ItemId; readonly priority: number }
  | { readonly type: "rewire"; readonly item: ItemId; readonly deps: readonly ItemId[] }
  | { readonly type: "mark"; readonly item: ItemId; readonly status: Exclude<ItemStatus, "absent"> }
  | { readonly type: "reopen"; readonly item: ItemId };

export type TodoAction = TodoEvent["type"];

/** Every action of the product machine, in specification order. */
export const TODO_ACTIONS: readonly TodoAction[] = [
  "add",
  "remove",
  "reprioritize",
  "rewire",
  "mark",
  "reopen",
];

/** Construct the initial state. */
export function initAbstractTodoState(config: TodoModelConfig): AbstractTodoState {
  const status: Record<ItemId, ItemStatus> = {};
  const deps: Record<ItemId, readonly ItemId[]> = {};
  const priority: Record<ItemId, number> = {};
  const seq: Record<ItemId, number> = {};
  for (const item of config.items) {
    status[item] = "absent";
    deps[item] = [];
    priority[item] = 0;
    seq[item] = 0;
  }
  return { status, deps, priority, seq, next: 1 };
}

export function isPresent(state: AbstractTodoState, item: ItemId): boolean {
  return (state.status[item] ?? "absent") !== "absent";
}

export function isLive(state: AbstractTodoState, item: ItemId): boolean {
  const status = state.status[item] ?? "absent";
  return status !== "absent" && !TERMINAL_STATUSES.includes(status);
}

export function presentItems(state: AbstractTodoState, config: TodoModelConfig): ItemId[] {
  return config.items.filter((item) => isPresent(state, item));
}

export function activeItems(state: AbstractTodoState, config: TodoModelConfig): ItemId[] {
  return config.items.filter((item) => isLive(state, item));
}

/** Every dependency of a live item has finished successfully. */
export function sat(state: AbstractTodoState, item: ItemId): boolean {
  return (state.deps[item] ?? []).every((dep) => SUCCESS_STATUSES.includes(state.status[dep] ?? "absent"));
}

/** Transitive dependency over the whole graph. */
export function reach(state: AbstractTodoState, from: ItemId, to: ItemId): boolean {
  if (from === to) return false;
  const seen = new Set<ItemId>([from]);
  const queue: ItemId[] = [from];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dep of state.deps[current] ?? []) {
      if (dep === to) return true;
      if (!seen.has(dep)) {
        seen.add(dep);
        queue.push(dep);
      }
    }
  }
  return false;
}

function liveEdge(state: AbstractTodoState, x: ItemId, y: ItemId): boolean {
  return isLive(state, x) && isLive(state, y) && ((state.deps[x] ?? []).includes(y) || (state.deps[y] ?? []).includes(x));
}

/** Undirected connectivity through live items only. */
export function linked(state: AbstractTodoState, x: ItemId, y: ItemId): boolean {
  if (x === y) return true;
  if (!isLive(state, x) || !isLive(state, y)) return false;
  const seen = new Set<ItemId>([x]);
  const queue: ItemId[] = [x];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbours = new Set<ItemId>();
    for (const dep of state.deps[current] ?? []) neighbours.add(dep);
    for (const item of Object.keys(state.deps)) {
      if ((state.deps[item] ?? []).includes(current)) neighbours.add(item);
    }
    for (const next of neighbours) {
      if (next === y) return true;
      if (isLive(state, next) && !seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/** The heap (live connected component) containing a live item. */
export function heapOf(state: AbstractTodoState, item: ItemId): Set<ItemId> {
  const heap = new Set<ItemId>();
  if (!isLive(state, item)) return heap;
  for (const candidate of Object.keys(state.deps)) {
    if (linked(state, item, candidate)) heap.add(candidate);
  }
  return heap;
}

/** Every live heap, in a deterministic order. */
export function heapsOf(state: AbstractTodoState): ItemId[][] {
  const done = new Set<ItemId>();
  const heaps: ItemId[][] = [];
  for (const item of Object.keys(state.deps).sort()) {
    if (!isLive(state, item) || done.has(item)) continue;
    const heap = [...heapOf(state, item)].sort();
    for (const member of heap) done.add(member);
    heaps.push(heap);
  }
  return heaps;
}

function keyLE(state: AbstractTodoState, x: ItemId, y: ItemId): boolean {
  const px = state.priority[x] ?? 0;
  const py = state.priority[y] ?? 0;
  if (px !== py) return px < py;
  return (state.seq[x] ?? 0) <= (state.seq[y] ?? 0);
}

/**
 * The prioritized linear list: greedy Kahn with the minimum (priority, seq)
 * eligible item first. Exactly `Lin(Active)` from `spec/TodoSystem.tla`.
 */
export function linearize(state: AbstractTodoState, config: TodoModelConfig): ItemId[] {
  const active = activeItems(state, config);
  const remaining = new Set(active);
  const out: ItemId[] = [];
  while (remaining.size > 0) {
    let best: ItemId | null = null;
    for (const item of active) {
      if (!remaining.has(item)) continue;
      const blocked = (state.deps[item] ?? []).some((dep) => remaining.has(dep));
      if (blocked) continue;
      if (best === null || keyLE(state, item, best)) best = item;
    }
    if (best === null) throw new Error('todo-cycle-or-invalid-presentation');
    out.push(best);
    remaining.delete(best);
  }
  if (!presentationCertificate(state,config,out)) throw new Error('todo-invalid-presentation-certificate');
  return out;
}

/** The independently checked output contract of the Kahn presentation machine. */
export function presentationCertificate(state: AbstractTodoState, config: TodoModelConfig, order: readonly ItemId[]): boolean {
  const active = new Set(activeItems(state,config));
  const position = new Map(order.map((item,index) => [item,index+1]));
  return order.length === active.size && position.size === order.length && order.every(item => active.has(item))
    && order.every(item => (state.deps[item] ?? []).every(dep => !active.has(dep) || (position.get(dep)! > 0 && position.get(dep)! < position.get(item)!)));
}

/** Why a model step was refused. */
export class TodoStateError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "TodoStateError";
  }
}

function set<K extends string, V>(record: Readonly<Record<K, V>>, key: K, value: V): Record<K, V> {
  return { ...record, [key]: value };
}

function sameDeps(a: readonly ItemId[], b: readonly ItemId[]): boolean {
  return a.length === b.length && a.every((item) => b.includes(item));
}

/** Construct and check a rank certificate before admitting changed dependencies. */
export function rankCertificate(deps: Readonly<Record<ItemId, readonly ItemId[]>>, config: TodoModelConfig): Record<ItemId, number> | null {
  const remaining = new Set(config.items), ranks: Record<ItemId, number> = Object.create(null);
  while (remaining.size) {
    let progress = false;
    for (const item of remaining) {
      const edges = deps[item] ?? [];
      if (edges.some(dep => ranks[dep] === undefined)) continue;
      const rank = edges.reduce((r, dep) => Math.max(r, ranks[dep]! + 1), 0);
      if (!Number.isSafeInteger(rank) || rank > config.maxSeq) return null;
      ranks[item] = rank; remaining.delete(item); progress = true;
    }
    if (!progress) return null;
  }
  return config.items.every(item => (deps[item] ?? []).every(dep => ranks[dep] !== undefined && ranks[dep]! < ranks[item]!)) ? ranks : null;
}

/** The guards, one per action. */
export const guards = {
  add: (state: AbstractTodoState, config: TodoModelConfig, item: ItemId, deps: readonly ItemId[]): boolean =>
    (state.status[item] ?? "absent") === "absent" &&
    deps.every((dep) => isPresent(state, dep)) &&
    deps.every((dep) => dep !== item) &&
    state.next <= config.maxSeq &&
    rankCertificate({...state.deps,[item]:deps},config) !== null,

  remove: (state: AbstractTodoState, config: TodoModelConfig, item: ItemId): boolean =>
    isPresent(state, item) && activeItems(state, config).every((live) => !(state.deps[live] ?? []).includes(item)),

  reprioritize: (state: AbstractTodoState, config: TodoModelConfig, item: ItemId, priority: number): boolean =>
    isLive(state, item) && Number.isInteger(priority) && priority >= 0 && priority <= config.maxPriority,

  rewire: (state: AbstractTodoState, config: TodoModelConfig, item: ItemId, deps: readonly ItemId[]): boolean =>
    isLive(state, item) &&
    deps.every((dep) => isPresent(state, dep) && dep !== item) &&
    !sameDeps([...(state.deps[item] ?? [])].sort(), [...deps].sort()) &&
    deps.every((dep) => !reach(state, dep, item)) &&
    rankCertificate({...state.deps,[item]:deps},config) !== null &&
    (state.status[item] !== "in_progress" ||
      deps.every((dep) => SUCCESS_STATUSES.includes(state.status[dep] ?? "absent"))),

  mark: (
    state: AbstractTodoState,
    item: ItemId,
    status: Exclude<ItemStatus, "absent">,
  ): boolean => {
    if (!isLive(state, item)) return false;
    const current = state.status[item];
    if (SUCCESS_STATUSES.includes(status)) return sat(state, item);
    if (status === "in_progress") return (current === "pending" || current === "blocked") && sat(state, item);
    if (status === "blocked") return current === "pending" || current === "in_progress";
    if (status === "failed") return current === "pending" || current === "in_progress" || current === "blocked";
    if (status === "pending") return current === "blocked" || current === "in_progress";
    return false;
  },

  reopen: (state: AbstractTodoState, item: ItemId): boolean =>
    TERMINAL_STATUSES.includes(state.status[item] ?? "absent") &&
    Object.keys(state.deps).every((other) => {
      if (!(state.deps[other] ?? []).includes(item)) return true;
      const status = state.status[other] ?? "absent";
      return !SUCCESS_STATUSES.includes(status) && status !== "in_progress";
    }),
} as const;

/** Apply one event to the abstract model. */
export function referenceReduceTodoState(
  state: AbstractTodoState,
  event: TodoEvent,
  config: TodoModelConfig,
): AbstractTodoState {
  switch (event.type) {
    case "add": {
      require(guards.add(state, config, event.item, event.deps), "add-not-enabled", event.item);
      return {
        ...state,
        status: set(state.status, event.item, "pending"),
        deps: set(state.deps, event.item, [...event.deps]),
        priority: set(state.priority, event.item, 0),
        seq: set(state.seq, event.item, state.next),
        next: state.next + 1,
      };
    }
    case "remove": {
      require(guards.remove(state, config, event.item), "remove-not-enabled", event.item);
      const deps: Record<ItemId, readonly ItemId[]> = { ...state.deps };
      for (const other of Object.keys(deps)) {
        if (other === event.item) deps[other] = [];
        else if ((deps[other] ?? []).includes(event.item)) {
          deps[other] = (deps[other] ?? []).filter((dep) => dep !== event.item);
        }
      }
      return {
        ...state,
        status: set(state.status, event.item, "absent"),
        deps,
        priority: set(state.priority, event.item, 0),
        seq: set(state.seq, event.item, 0),
      };
    }
    case "reprioritize": {
      require(guards.reprioritize(state, config, event.item, event.priority), "reprioritize-not-enabled", event.item);
      return { ...state, priority: set(state.priority, event.item, event.priority) };
    }
    case "rewire": {
      require(guards.rewire(state, config, event.item, event.deps), "rewire-not-enabled", event.item);
      return { ...state, deps: set(state.deps, event.item, [...event.deps]) };
    }
    case "mark": {
      require(guards.mark(state, event.item, event.status), "mark-not-enabled", event.item);
      return { ...state, status: set(state.status, event.item, event.status) };
    }
    case "reopen": {
      require(guards.reopen(state, event.item), "reopen-not-enabled", event.item);
      return { ...state, status: set(state.status, event.item, "pending") };
    }
  }
}

function require(condition: boolean, code: string, subject: string): asserts condition {
  if (!condition) throw new TodoStateError(code, `event not enabled: ${code} (${subject})`);
}

function subsets(items: readonly ItemId[]): ItemId[][] {
  const out: ItemId[][] = [[]];
  for (const item of items) {
    for (const existing of [...out]) {
      out.push([...existing, item]);
    }
  }
  return out;
}

/** Enumerate every event enabled in a state. */
export function enabledEvents(state: AbstractTodoState, config: TodoModelConfig): TodoEvent[] {
  const events: TodoEvent[] = [];
  const present = presentItems(state, config);
  for (const item of config.items) {
    if (guards.add(state, config, item, [])) {
      for (const deps of subsets(present)) {
        if (guards.add(state, config, item, deps)) events.push({ type: "add", item, deps });
      }
    }
    if (guards.remove(state, config, item)) events.push({ type: "remove", item });
    if (guards.reopen(state, item)) events.push({ type: "reopen", item });
    for (let p = 0; p <= config.maxPriority; p += 1) {
      if (guards.reprioritize(state, config, item, p)) events.push({ type: "reprioritize", item, priority: p });
    }
    if (isLive(state, item)) {
      for (const deps of subsets(present.filter((dep) => dep !== item))) {
        if (guards.rewire(state, config, item, deps)) events.push({ type: "rewire", item, deps });
      }
    }
    for (const status of TODO_STATUSES) {
      if (status === "absent") continue;
      if (guards.mark(state, item, status)) events.push({ type: "mark", item, status });
    }
  }
  return events;
}

/** A single invariant failure. */
export interface TodoViolation {
  readonly invariant: string;
  readonly detail: string;
}

/** Check every safety invariant of the abstract todo list. */
export function todoInvariantViolations(state: AbstractTodoState, config: TodoModelConfig): TodoViolation[] {
  const out: TodoViolation[] = [];
  const push = (invariant: string, detail: string): void => {
    out.push({ invariant, detail });
  };

  // TypeOK: the state functions have exactly the configured domains and ranges.
  const functionOK = <T>(
    record: Readonly<Record<string, T>>,
    domain: readonly string[],
    accepts: (value: T) => boolean,
  ): boolean =>
    Object.keys(record).length === domain.length && domain.every((id) => Object.hasOwn(record, id) && accepts(record[id]!));
  const typed =
    functionOK(state.status, config.items, (value) => TODO_STATUSES.includes(value)) &&
    functionOK(state.deps, config.items, (value) => value.every((dep) => config.items.includes(dep))) &&
    functionOK(state.priority, config.items, (value) => Number.isInteger(value) && value >= 0 && value <= config.maxPriority) &&
    functionOK(state.seq, config.items, (value) => Number.isInteger(value) && value >= 0 && value <= config.maxSeq) &&
    Number.isInteger(state.next) &&
    state.next >= 1 &&
    state.next <= config.maxSeq + 1;
  if (!typed) push("TypeOK", "state function domain or range differs from the model");

  // WellFormed
  for (const item of config.items) {
    const present = isPresent(state, item);
    if (!present && (state.deps[item] ?? []).length > 0) push("WellFormed", `${item} absent but has dependencies`);
    if (present) {
      for (const dep of state.deps[item] ?? []) {
        if (!isPresent(state, dep)) push("WellFormed", `${item} depends on absent ${dep}`);
      }
    }
  }

  // SeqUnique / SeqBound
  const seenSeq = new Map<number, ItemId>();
  for (const item of presentItems(state, config)) {
    const s = state.seq[item] ?? 0;
    if (seenSeq.has(s)) push("SeqUnique", `${item} and ${seenSeq.get(s)} share seq ${s}`);
    seenSeq.set(s, item);
    if (s >= state.next) push("SeqBound", `${item} has seq ${s} >= next ${state.next}`);
  }

  // Acyclic
  for (const item of config.items) {
    if (reach(state, item, item)) push("Acyclic", `${item} reaches itself`);
  }

  // FinalSat / InProgressSat
  for (const item of config.items) {
    const status = state.status[item] ?? "absent";
    if (SUCCESS_STATUSES.includes(status) && !sat(state, item)) push("FinalSat", `${item} is ${status} with an unsatisfied dependency`);
    if (status === "in_progress" && !sat(state, item)) push("InProgressSat", `${item} is in progress with an unsatisfied dependency`);
  }

  // PresentationTopological / PresentationRange
  const presentation = linearize(state, config);
  if (presentation.length !== activeItems(state, config).length) {
    push("PresentationRange", "the presentation is shorter than the live set");
  } else {
    const position = new Map<ItemId, number>();
    presentation.forEach((item, index) => position.set(item, index));
    for (const item of presentation) {
      for (const dep of state.deps[item] ?? []) {
        if (isLive(state, dep) && (position.get(dep) ?? 0) >= (position.get(item) ?? 0)) {
          push("PresentationTopological", `${item} appears before its dependency ${dep}`);
        }
      }
    }
  }

  // LiveEdgeWithinHeap / HeapsAreClasses
  for (const item of activeItems(state, config)) {
    for (const dep of state.deps[item] ?? []) {
      if (isLive(state, dep) && !linked(state, item, dep)) {
        push("LiveEdgeWithinHeap", `${item} -> ${dep} crosses heaps`);
      }
    }
  }
  for (const x of activeItems(state, config)) {
    for (const y of activeItems(state, config)) {
      const sameHeap = [...heapOf(state, x)].sort().join("|") === [...heapOf(state, y)].sort().join("|");
      if (linked(state, x, y) !== sameHeap) push("HeapsAreClasses", `${x} / ${y} linked but heaps differ`);
    }
  }

  return out;
}

/** Names of every invariant checked above. */
export const TODO_INVARIANT_NAMES: readonly string[] = [
  "TypeOK",
  "WellFormed",
  "SeqUnique",
  "SeqBound",
  "Acyclic",
  "FinalSat",
  "InProgressSat",
  "PresentationTopological",
  "PresentationRange",
  "LiveEdgeWithinHeap",
  "HeapsAreClasses",
];
