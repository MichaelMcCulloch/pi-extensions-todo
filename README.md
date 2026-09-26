# pi-todo-list

A [pi](https://github.com/earendil-works/pi) extension that adds a durable
**todo list** built on a formally verified ordering core: a **forest of
auto-balancing priority heaps** over the dependency graph, presented to the
model as one automatically prioritized linear list.

This is deliberately **not** the work-graph DAG. There are no worktrees, no
spawning, and no execution — the list is a passive ordering and status
structure, and the project treats the *ordering law* as the object of
verification:

- dependencies are hard constraints (the **forest veto**);
- every connected component of the live dependency graph is a heap, and
  disconnected heaps are completable in any order;
- inside a heap the dependency tree decides precedence, and the
  `(priority, seq)` key only refines it into one deterministic linear list;
- the presentation layer **is** the verified relation — it never re-derives
  state and has no heuristics.

> **Verified.** `spec/TodoSystem.tla` owns the machine; `spec/TodoView.tla`
> owns the recursive presentation. TLC explores the complete reachable state
> space of the fixture — **1,842,161 distinct states** — and checks the full
> view invariant. `spec/TodoSystemProof.tla` proves `Spec => []CoreInv` with
> TLAPS for arbitrary `Items`, `MaxPriority`, and `MaxSeq` (137 obligations).
> The production store's transition is `referenceReduceTodoState`, the mirror
> of the machine; `test/model.spec.ts` asserts the executable reachable-set
> size equals TLC's, and `spec/TraceValidation.tla` replays real store traces.

## Quick start

```bash
pnpm install
pnpm verify            # typecheck + 44 tests + TLC + trace validation + TLAPS
```

Load the extension directly during development:

```bash
pi --extension ./src/index.ts
```

Then ask the agent to `todo action=add ...`, or drive it from the tool surface
below.

The TLC JVM is capped at `TLA_JVM_MEMORY` (default `4g`); the whole pipeline
stays inside a 12 GiB budget.

## Statuses

| Core status | Default | Glyph | Terminal | Satisfies deps |
|---|---|---|---|---|
| `pending` | on add | ⚪ dark / ⚫ light | no | no |
| `in_progress` | | 🔵 | no | no |
| `blocked` | | ⛔ | no | no |
| `failed` | | 🔴 | yes | no |
| `completed_with_errors` | | 🟡 | yes | **yes** |
| `completed` | | 🟢 | yes | yes |

The pending glyph is the only theme-dependent mark. The theme comes from
`PI_TODO_THEME` (`dark`/`light`), then `COLORFGBG`, then defaults to light.
Glyphs are a pure function of `(status, theme)`; the core never sees them.

## The ordering law

Every live item belongs to exactly one **heap**: a connected component of the
live dependency graph (terminal items are history and leave the forest, so a
finished bridge can split a heap). Within a heap:

- a live dependency always appears before its dependent in the presentation;
- `order` requests are realized by canonically renumbering priorities, and are
  **vetoed** when the target permutation would place an item before a live
  dependency (`todo-order-veto`);
- `order` never changes edges or heap membership — the forest's veto is exactly
  `¬Reach(item, target)`.

Across heaps there is no dependency path in either direction, so
`LiveEdgeWithinHeap` (TLC-checked) is the formal statement of "disconnected
heaps may be completed in any order".

After every command the reducer renumbers live priorities to their presentation
indices (`CanonicalPriority`), which is the "auto-balancing" index: the order
is always a checked function of state, never a cached hope.

## The verified machine

`spec/TodoSystem.tla` has six actions:

| Action | Effect |
|---|---|
| `Add(i, D)` | add item `i` with optional dependency set `D`; appends to the list |
| `Remove(i)` | remove `i` when no live item depends on it (terminal dependents are scrubbed) |
| `Reprioritize(i, p)` | change the heap key of a live item |
| `Rewire(i, D)` | replace the dependency set of a live item (acyclicity-checked) |
| `Mark(i, s)` | a legal status transition; success and start require satisfied deps |
| `Reopen(i)` | terminal → pending, refused while a successful or in-progress dependent exists |

Derived in `spec/TodoView.tla`: `Reach` (transitive dependency), `Linked`
(undirected live connectivity), `HeapOf`/`Heaps`, and `Lin(Active)` — the
deterministic greedy Kahn linearization that the tool renders.

### Invariants

TLC checks `ViewInv` over all 1,842,161 reachable states:

| Invariant | Meaning |
|---|---|
| `TypeOK` | domains, ranges, and the fixture bounds |
| `WellFormed` | absent ⇔ not present; live deps are present; absent deps are empty |
| `SeqUnique`, `SeqBound` | sequence numbers are distinct and below `next` |
| `Acyclic` | no item transitively depends on itself |
| `FinalSat`, `InProgressSat` | successful and in-progress items have satisfied deps |
| `PresentationTopological` | every live dependency appears earlier in the list |
| `PresentationRange` | the list contains exactly the live items, once each |
| `LiveEdgeWithinHeap` | no live dependency edge crosses heaps |
| `HeapsAreClasses` | `Linked` is an equivalence relation; heaps partition the live set |

## Formal verification

```bash
pnpm verify:model     # TLC exhaustive check of the fixture (1,842,161 states)
pnpm verify:traces    # regenerate production traces and TLC-validate them
pnpm verify:formal    # both
pnpm verify:proof     # TLAPS inductive proof: Spec => []CoreInv for all constants
pnpm verify           # typecheck + tests + TLC + traces + proof
```

### What TLC proves

The complete reachable state space of the fixture (`Items = {i1,i2,i3}`,
`MaxPriority = 2`, `MaxSeq = 4`) — 33,703,609 states generated, **1,842,161
distinct**, depth 14 — including the definitional projection properties of the
recursive `Lin`. It also replays seven production traces (chain lifecycle, two
heaps with ordering, reopen/rewire, both cascades, clear, re-add) through
`TraceValidation.tla`, requiring every event to be enabled and the model's
successor to equal the recorded state.

### What TLAPS proves

[`spec/TodoSystemProof.tla`](spec/TodoSystemProof.tla) proves

```
THEOREM SafetyCore ==
  ASSUME MaxPriority \in Nat, MaxSeq \in Nat
  PROVE Spec => []CoreInv
```

for **arbitrary** `Items`, `MaxPriority`, and `MaxSeq`: `Init => CoreInv` and
every action preserves `TypeOK`, `WellFormed`, `SeqUnique`, `SeqBound`,
`FinalSat`, and `InProgressSat` (137 obligations, all discharged by tlapm).

**Scope, stated honestly.** `CoreInv` is the state-machine safety core. The
definitional projection and heap invariants (`PresentationTopological`,
`PresentationRange`, `LiveEdgeWithinHeap`, `HeapsAreClasses`) are properties of
the recursive `Lin`/`Linked` operators over every reachable state; they are
verified by TLC over the complete reachable state space rather than
inductively, because TLAPS cannot elaborate recursive operators — which is why
the machine module is recursion-free and the presentation lives in
`TodoView.tla`. Acyclicity is enforced by the `GuardRewire` reachability guard
and checked by TLC; it is not in `CoreInv`. Liveness is deliberately out of
scope: the machine has no autonomous actions and no fairness to assume, so the
only progress claims are the totality and determinism of the presentation.

### How the proof reaches the implementation

1. **Spec and mirror are one relation.** `src/formal/model.ts` transcribes
   `TodoSystem.tla`; the production reducer calls `referenceReduceTodoState`
   directly — there is no second implementation to drift.
2. **The spec is executable.** `test/model.spec.ts` explores the mirror
   exhaustively and asserts the reachable set is exactly 1,842,161 states — the
   number TLC reports. Drift changes the count and fails the test.
3. **Production traces are model behaviors.** `scripts/emit-traces.ts` drives
   the real `TodoStore`, records the abstract state after every event, and
   `spec/TraceValidation.tla` replays them with the spec's named guards.
4. **Spec parity is locked.** `test/spec-parity.spec.ts` checks that the TLA+
   `Next` action list equals the TypeScript alphabet, that every action has a
   guard, and that every invariant name is defined in the spec.

## The `todo` tool

One tool with an `action` discriminator; state is stored in the pi session as a
`todo/state` custom entry, so branching rewinds the list.

| Action | Effect |
|---|---|
| `add` | add an item (`text`, optional `id`, `deps`); appends to the list |
| `remove` | remove an item; refused while live work depends on it, unless `cascade = remove\|block` |
| `edit` | change `text`/`note`/`deps` |
| `order` | move within the list via `position`, `before`, `after`, `to = first\|last`; the forest vetoes illegal moves |
| `mark` | set `pending`, `in_progress`, `blocked`, `failed`, `completed_with_errors`, or `completed` |
| `reopen` | terminal → pending |
| `clear` | remove terminal items not referenced by live work |
| `list` / `status` | render the automatically prioritized linear list and counts |

Every item's live dependencies are annotated as `waiting on ...`; refusals are
structured (`todo-order-veto`, `todo-remove-veto`, `todo-transition-refused`,
…), not prose.

## Terminal UI

While the list has content, a compact widget above the editor shows a status
glyph and the text of each live item — no list numbers, ids, heap membership,
or dependency annotations, which are internal. It repaints whenever the store
persists a snapshot, and clicking it (or running `/todo`) opens the full list,
including terminal history, in a scrollable overlay. No other extension is
involved.

## Layout

```
src/
  formal/
    model.ts        executable mirror of spec/TodoSystem.tla (guards, reducer, invariants)
    trace.ts        production scenario runner and TLA+ trace rendering
  engine/
    state.ts        durable state, ids, normalization
    reducer.ts      command → events, canonical renumbering, cascade, order veto
    projection.ts   linearize, heaps, glyphs/theme, rendering
    verify.ts       production invariant diagnostics (store refuses violations)
  extension/
    store.ts        the single durable store; snapshots via pi custom entries
    tool.ts         the model-facing `todo` tool
  index.ts          pi extension entry (persistence, tool, /todo command)
spec/
  TodoSystem.tla          the machine (recursion-free; guards, actions, CoreInv, heap invariants)
  TodoView.tla            the recursive presentation: Lin, Presentation*, ViewInv
  TodoSystemFixture.cfg   the TLC fixture
  TodoSystemProof.tla     TLAPS: Spec => []CoreInv for arbitrary constants
  TraceValidation.tla     implementation trace replay
  generated/              traces emitted from the real engine
scripts/
  tla.mjs                 TLC driver (memory-capped)
  tlapm.mjs               TLAPS proof driver
  emit-traces.ts          trace emitter
test/
  model.spec.ts           exhaustive state space + TLC count cross-check
  spec-parity.spec.ts     TLA+ / TS definition parity
  engine, projection, tool, extension specs
```

## Scope

Verified: the ordering machine and status lifecycle, the forest veto, canonical
renumbering, heap partitioning, and the presentation projection. Outside the
verified core: pi session persistence, the tool's JSON/schema surface, and
theme detection; the store re-checks its invariants after every mutation and
refuses to persist a violating state.

The sibling repositories are [`pi-agent-harness-dag`](../directed-acyclic-graph)
and [`pi-message-board`](../message-board); this extension shares their
spec-first methodology but is independent of both.
