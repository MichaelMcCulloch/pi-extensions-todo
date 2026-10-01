------------------------------ MODULE TodoSystem ------------------------------
\* The todo list as a dependency-ordered priority forest.
\*
\* The list is a forest of automatically balanced priority heaps over the
\* dependency graph. Every heap is a maximal set of live items connected by
\* dependency edges; heaps that are not connected impose no ordering on each
\* other, while inside a heap the dependency edges are hard constraints and the
\* (priority, seq) key only refines them into one deterministic linear list.
\*
\* This is deliberately NOT the work-graph DAG: there are no worktrees, no
\* spawning, and no execution. It is a passive ordering and status structure.
\*
\* Six actions:
\*
\*   Add(i, D)         add item i with optional dependency set D
\*   Remove(i)         remove i when no live item depends on it
\*   Reprioritize(i,p) change the heap key of a live item
\*   Rewire(i, D)      replace the dependency set of a live item
\*   Mark(i, s)        a legal status transition (terminal stays terminal)
\*   Reopen(i)         terminal -> pending, when no dependent would be invalid
\*
\* The reference reducer in src/formal/model.ts is a transcription of this
\* module; test/model.spec.ts asserts the executable reachable-set size equals
\* the number TLC reports, and spec/TraceValidation.tla replays real stores.
\* -------------------------------------------------------------------------

EXTENDS Naturals, Sequences, FiniteSets, TLC

CONSTANTS Items, MaxPriority, MaxSeq

Statuses == {"absent", "pending", "in_progress", "blocked", "failed",
             "completed_with_errors", "completed"}
Terminal == {"failed", "completed_with_errors", "completed"}
Success  == {"completed_with_errors", "completed"}

VARIABLES status, deps, priority, seq, next

vars == <<status, deps, priority, seq, next>>

\* ---------------------------------------------------------------------------
\* Derived state
\* ---------------------------------------------------------------------------

Present == {i \in Items : status[i] # "absent"}
Active  == {i \in Items : status[i] # "absent" /\ status[i] \notin Terminal}

IsLive(i) == status[i] # "absent" /\ status[i] \notin Terminal

\* A live item may be started or finished only when every dependency has
\* finished successfully. Dependencies on terminal items are allowed: a failed
\* dependency leaves the item unsatisfied until it is reopened.
Sat(i) == \A d \in deps[i] : status[d] \in Success

\* Transitive dependency over the whole graph, including terminal items. Used
\* for acyclicity and for the Rewire guard; a path of at most Cardinality(Items)
\* vertices exists whenever a path exists, and the invariant makes the graph
\* acyclic, so a simple path is always enough.
Reach(x, y) ==
    \E n \in 2..Cardinality(Items) :
        \E p \in [1..n -> Items] :
            /\ p[1] = x /\ p[n] = y
            /\ \A k \in 1..n-1 : p[k+1] \in deps[p[k]]

\* Undirected connectivity through *live* items only. Terminal items are
\* history: a path that runs through a finished item does not constrain the
\* ordering of the live endpoints (the finished item can never be undone while
\* anything successful or in-progress depends on it).
LiveEdge(x, y) == x \in Active /\ y \in Active /\ (y \in deps[x] \/ x \in deps[y])

Linked(x, y) ==
    x = y
    \/ \E n \in 2..Cardinality(Items) :
           \E p \in [1..n -> Items] :
               /\ p[1] = x /\ p[n] = y
               /\ \A k \in 1..n-1 : LiveEdge(p[k], p[k+1])

HeapOf(i) == {j \in Active : Linked(i, j)}
Heaps == {HeapOf(i) : i \in Active}

\* The presentation (greedy Kahn linearization) lives in `TodoView.tla`:
\* it is a recursive operator that TLC evaluates but TLAPS cannot elaborate,
\* so the machine module stays recursion-free for the inductive proof.

\* ---------------------------------------------------------------------------
\* Initial state
\* ---------------------------------------------------------------------------

Init ==
    /\ status = [i \in Items |-> "absent"]
    /\ deps = [i \in Items |-> {}]
    /\ priority = [i \in Items |-> 0]
    /\ seq = [i \in Items |-> 0]
    /\ next = 1

\* ---------------------------------------------------------------------------
\* Guards
\* ---------------------------------------------------------------------------

GuardAdd(i, D) ==
    /\ status[i] = "absent"
    /\ D \subseteq Present
    /\ next <= MaxSeq

GuardRemove(i) ==
    /\ status[i] # "absent"
    /\ \A j \in Active : i \notin deps[j]

GuardReprioritize(i, p) ==
    /\ IsLive(i)
    /\ p \in 0..MaxPriority

GuardRewire(i, D) ==
    /\ IsLive(i)
    /\ D \subseteq Present \ {i}
    /\ D # deps[i]
    /\ \A d \in D : ~Reach(d, i)
    \* An in-progress item may only be rewired onto already-satisfied deps,
    \* otherwise InProgressSat would be lost.
    /\ (status[i] = "in_progress" => \A d \in D : status[d] \in Success)

GuardMark(i, s) ==
    /\ IsLive(i)
    /\ \/ (s \in Success /\ Sat(i))
       \/ (s = "in_progress" /\ status[i] \in {"pending", "blocked"} /\ Sat(i))
       \/ (s = "blocked" /\ status[i] \in {"pending", "in_progress"})
       \/ (s = "failed" /\ status[i] \in {"pending", "in_progress", "blocked"})
       \/ (s = "pending" /\ status[i] \in {"blocked", "in_progress"})

GuardReopen(i) ==
    /\ status[i] \in Terminal
    /\ \A j \in Items : i \notin deps[j] \/ status[j] \notin (Success \cup {"in_progress"})

\* ---------------------------------------------------------------------------
\* Actions
\* ---------------------------------------------------------------------------

Add(i, D) ==
    /\ GuardAdd(i, D)
    /\ status' = [status EXCEPT ![i] = "pending"]
    /\ deps' = [deps EXCEPT ![i] = D]
    /\ priority' = [priority EXCEPT ![i] = 0]
    /\ seq' = [seq EXCEPT ![i] = next]
    /\ next' = next + 1

Remove(i) ==
    /\ GuardRemove(i)
    /\ status' = [status EXCEPT ![i] = "absent"]
    /\ deps' = [j \in Items |-> IF j = i THEN {} ELSE deps[j] \ {i}]
    /\ priority' = [priority EXCEPT ![i] = 0]
    /\ seq' = [seq EXCEPT ![i] = 0]
    /\ UNCHANGED next

Reprioritize(i, p) ==
    /\ GuardReprioritize(i, p)
    /\ priority' = [priority EXCEPT ![i] = p]
    /\ UNCHANGED <<status, deps, seq, next>>

Rewire(i, D) ==
    /\ GuardRewire(i, D)
    /\ deps' = [deps EXCEPT ![i] = D]
    /\ UNCHANGED <<status, priority, seq, next>>

Mark(i, s) ==
    /\ GuardMark(i, s)
    /\ status' = [status EXCEPT ![i] = s]
    /\ UNCHANGED <<deps, priority, seq, next>>

Reopen(i) ==
    /\ GuardReopen(i)
    /\ status' = [status EXCEPT ![i] = "pending"]
    /\ UNCHANGED <<deps, priority, seq, next>>

Next ==
    \/ \E i \in Items, D \in SUBSET Items : Add(i, D)
    \/ \E i \in Items : Remove(i)
    \/ \E i \in Items, p \in 0..MaxPriority : Reprioritize(i, p)
    \/ \E i \in Items, D \in SUBSET Items : Rewire(i, D)
    \/ \E i \in Items, s \in Statuses \ {"absent"} : Mark(i, s)
    \/ \E i \in Items : Reopen(i)

SafetySpec == Init /\ [][Next]_vars

Spec == Init /\ [][Next]_vars

\* ---------------------------------------------------------------------------
\* Invariants
\* ---------------------------------------------------------------------------

TypeOK ==
    /\ status \in [Items -> Statuses]
    /\ deps \in [Items -> SUBSET Items]
    /\ priority \in [Items -> 0..MaxPriority]
    /\ seq \in [Items -> 0..MaxSeq]
    /\ next \in 1..(MaxSeq+1)

WellFormed ==
    /\ \A i \in Items : status[i] = "absent" <=> i \notin Present
    /\ \A i \in Present : deps[i] \subseteq Present
    /\ \A i \in Items : status[i] = "absent" => deps[i] = {}

SeqUnique ==
    \A i, j \in Present : i # j => seq[i] # seq[j]

SeqBound ==
    \A i \in Present : seq[i] < next

\* The forest veto: no dependency cycle can ever exist. This is what makes a
\* reorder request that would place an item before a dependency impossible.
Acyclic ==
    \A i \in Items : ~Reach(i, i)

\* A successful item's dependencies are successful (completion is only legal
\* when Sat holds, and a finished item cannot be invalidated by reopening a
\* dependency it depends on).
FinalSat ==
    \A i \in Items : status[i] \in Success => Sat(i)

\* Work can only be in progress when all dependencies succeeded.
InProgressSat ==
    \A i \in Items : status[i] = "in_progress" => Sat(i)

\* The presented list is a linear extension of the live dependency graph: every
\* live dependency of an item appears earlier in the presentation. This is
\* checked in `TodoView.tla`, where the presentation is defined.

\* The presentation contains exactly the live items, once each.
\* (Both presentation invariants live in TodoView.tla.)

\* Every live dependency edge stays inside one heap. By symmetry of Linked,
\* items in different heaps have no live-only dependency path in either
\* direction, which is what makes disconnected heaps independently completable.
LiveEdgeWithinHeap ==
    \A i \in Active : deps[i] \cap Active \subseteq HeapOf(i)

\* Linked is an equivalence relation on live items (heaps are a partition).
HeapsAreClasses ==
    \A i, j \in Active : Linked(i, j) <=> HeapOf(i) = HeapOf(j)

Inv ==
    /\ TypeOK
    /\ WellFormed
    /\ SeqUnique
    /\ SeqBound
    /\ Acyclic
    /\ FinalSat
    /\ InProgressSat
    /\ LiveEdgeWithinHeap
    /\ HeapsAreClasses

=============================================================================
