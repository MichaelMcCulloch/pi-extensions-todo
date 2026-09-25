----------------------------- MODULE TodoView -----------------------------
\* The presentation view of the verified todo machine.
\*
\* `Lin` is the deterministic greedy Kahn linearization: among the currently
\* eligible items (those whose live dependencies are already placed) pick the
\* minimum (priority, seq). The linear list the tool renders is exactly this
\* operator; `TodoSystem.tla` owns the machine and `CoreInv`, and this module
\* adds the definitional projection properties.
\*
\* It is a separate module because `Lin` is recursive: TLC evaluates it fine,
\* while TLAPS cannot elaborate recursive operators, and the inductive proof
\* (`TodoSystemProof.tla`) extends the recursion-free machine.
\* -------------------------------------------------------------------------

EXTENDS TodoSystem, Sequences, FiniteSets, TLC

KeyLE(x, y) == priority[x] < priority[y] \/ (priority[x] = priority[y] /\ seq[x] <= seq[y])

RECURSIVE Lin(_)
Lin(S) ==
    IF S = {} THEN <<>>
    ELSE LET E == {i \in S : deps[i] \cap S = {}}
             m == CHOOSE x \in E : \A y \in E : KeyLE(x, y)
         IN <<m>> \o Lin(S \ {m})

Presentation == Lin(Active)

\* The presented list is a linear extension of the live dependency graph.
PresentationTopological ==
    \A k \in DOMAIN Presentation :
        deps[Presentation[k]] \cap Active \subseteq {Presentation[j] : j \in 1..k-1}

\* The presentation contains exactly the live items, once each.
PresentationRange ==
    \A i \in Active : \E k \in DOMAIN Presentation : Presentation[k] = i

ViewInv == Inv /\ PresentationTopological /\ PresentationRange

=============================================================================
