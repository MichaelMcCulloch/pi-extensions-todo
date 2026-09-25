# Design record

The specification, the accepted defaults, and where each one lives. This is the
document to read before changing the machine.

## Accepted decisions

| # | Decision | Resolution | Where |
|---|---|---|---|
| D1 | Explicit priority + seq tiebreak | `priority` is an internal dense rank; users order by relative moves. `(priority, seq)` is the key; `seq` is monotone and unique among present items | `TodoSystem.tla` `KeyLE`/`SeqUnique`; `TodoView.tla` `Lin`; `reducer.ts` `canonicalize*` |
| D2 | 🟡 satisfies dependencies | `Success = {completed_with_errors, completed}` | `TodoSystem.tla` `Success`, `Sat` |
| D3 | Completion with unsatisfied deps refused | `GuardMark` requires `Sat(i)` for start and success | `TodoSystem.tla` `GuardMark` |
| D4 | No auto-block propagation | readiness is derived (`waiting on`); ⛔ is explicit | `projection.ts` `waitingDeps`; no status mutation on dep change |
| D5 | Terminals immutable except reopen | `GuardMark` excludes terminals; `GuardReopen` is the only exit | `TodoSystem.tla` |
| D6 | Unbounded parallel in-progress | `GuardMark` imposes no count | `TodoSystem.tla` |
| D7 | Removal vetoed; explicit cascade | `GuardRemove` vetoes live dependents; `remove` command offers `cascade=remove\|block` | `TodoSystem.tla`; `reducer.ts` `cascadeEvents` |
| D8 | Session-scoped, one list | snapshots are `todo/state` pi custom entries | `src/index.ts` |
| D9 | Heaps derived, not stored | `HeapOf`/`Heaps` are defined from `Linked`; `LiveEdgeWithinHeap`/`HeapsAreClasses` checked | `TodoSystem.tla` |
| D10 | Safety + projection; liveness conditional | no autonomous actions, so no fairness; presentation totality/determinism instead | README scope |
| D11 | `todo` tool, actions below | `add`, `remove`, `edit`, `order`, `mark`, `reopen`, `clear`, `list`, `status` | `tool.ts` |
| D12 | Presentation projection in the verified core | `Lin(Active)` is specified in `TodoView.tla`; the mirror and the renderer use it | `TodoView.tla`; `projection.ts` |

## Gaps from the specification review, as resolved

- **G1 heap key.** Dependency order is the partial order; `(priority, seq)` is
  the total refinement. `Lin` is lexicographically-minimal greedy Kahn.
- **G2 veto.** Rejected atomically with `todo-order-veto` naming the violated
  dependency. `order` never changes edges, so heap membership is stable under
  reordering.
- **G3 inter-heap order.** One deterministic list: heaps are ordered by their
  members' presentation order through `Lin`; intra-heap order is authoritative,
  inter-heap order is advisory (completion is free across heaps).
- **G4 heap merge/split.** Heaps are maximal live connected components,
  recomputed from state. Terminal items leave the active graph; adding a
  cross-heap dep merges, finishing/removing a bridge splits.
- **G5 DAG not tree.** Multiple parents merge heaps; components are DAGs.
- **G6 literal heap arrays.** Not persisted. The verified object is the order
  relation; the heaps are a derived index with checked invariants.
- **G7 renumbering.** `order` computes a target permutation, vetoes it if it is
  not a linear extension, then renumbers live priorities densely. Each
  renumbering step is a legal `reprioritize` event.
- **G8/G9/G10/G11** are D2/D3/D4/D5 above.
- **G12 parallel in-progress** is D6.
- **G13 removal cascade** is D7; cycles and dangling deps are rejected by the
  `GuardRewire` reachability check and `WellFormed`.
- **G14 theme.** `resolveTheme` from `PI_TODO_THEME`, then `COLORFGBG`, then
  light. Glyph = `(status, theme)`.
- **G15 no heuristics.** `linearize`, `heaps`, `waitingDeps`, and glyphs are
  pure functions in `engine/projection.ts` over the verified state; the tool
  renders them without re-derivation.
- **G16 liveness.** Scoped out with D10; TLC checks safety, TLAPS checks the
  machine core.
- **G17 storage** is D8; cross-process sharing is deliberately absent, so the
  verified core remains single-writer.
- **G18 vocabulary** is D11; refusals carry stable codes.

## Deliberate formal encoding choices

- **Terminal dependencies are scrubbed on removal.** `Remove(i)` clears `i`
  from every dependent's dep set (live dependents are vetoed first), so
  `WellFormed` (`depends ⊆ present`) holds for every present item without
  making terminal items mutable.
- **Reopen is vetoed, not cascaded.** `GuardReopen` refuses while any
  successful or in-progress item depends on the reopened item, which keeps
  `FinalSat` and `InProgressSat` inductive.
- **Rewiring an in-progress item** may only add already-satisfied deps; this
  closes the one hole the exhaustive test found on first run.
- **Add appends.** The abstract `Add` resets the priority to 0; the reducer
  canonicalizes onto `previous presentation ++ [new]` so a fresh item does not
  jump ahead of canonicalized priorities.
- **The view is a separate module.** `TodoView.tla` isolates the recursive
  `Lin` because TLAPS cannot elaborate recursive operators; the machine stays
  recursion-free so `TodoSystemProof.tla` can prove `[]CoreInv` for arbitrary
  constants.

## Verification map

| Layer | Checks |
|---|---|
| TLC model (`TodoView.tla` + fixture) | full `ViewInv` over 1,842,161 distinct states |
| TLAPS (`TodoSystemProof.tla`) | `Spec => []CoreInv` for arbitrary constants, 137 obligations |
| Exhaustive mirror (`test/model.spec.ts`) | same reachable set as TLC, state-for-state count |
| Trace validation | seven real store scenarios replayed by TLC |
| Spec parity | action alphabet, guards, invariant names locked |
| Production store | `verifyTodoState` after every mutation; refuses to persist violations |
