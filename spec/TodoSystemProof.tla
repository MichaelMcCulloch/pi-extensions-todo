------------------------ MODULE TodoSystemProof ------------------------
\* The inductive safety proof for the parameterized TodoSystem.
\*
\* `Init => CoreInv` and every action preserves every core invariant
\* component, so `Spec => []CoreInv` holds for arbitrary constants, not only
\* the TLC fixture.
\*
\* This module proves the core only. TodoAcyclicProof and TodoHeapProof
\* strengthen it to full Inv. TodoPresentationProof proves the iterative
\* presentation contract; the legacy recursive Lin remains TLC-checked.
\*
\* From spec/:
\*   tlapm -I "$HOME/.local/tlapm/lib/tlapm/stdlib" TodoSystemProof.tla
\* ---------------------------------------------------------------------

EXTENDS TodoSystem, TLAPS, FiniteSetTheorems

CoreInv ==
    /\ TypeOK
    /\ WellFormed
    /\ SeqUnique
    /\ SeqBound
    /\ FinalSat
    /\ InProgressSat

THEOREM SafetyCore ==
  ASSUME MaxPriority \in Nat, MaxSeq \in Nat
  PROVE SafetySpec => []CoreInv

  <1>1. Init => CoreInv
    BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
           InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
           Success, CoreInv, Init

  <1>2. CoreInv /\ [Next]_vars => CoreInv'
    <2>1. CoreInv /\ UNCHANGED vars => CoreInv'
      BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
             InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
             Success, CoreInv, vars

    <2>2. \A i \in Items, D \in SUBSET Items: CoreInv /\ Add(i, D) => CoreInv'
      <3>1. \A i \in Items, D \in SUBSET Items: CoreInv /\ Add(i, D) => TypeOK'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Add, GuardAdd
      <3>2. \A i \in Items, D \in SUBSET Items: CoreInv /\ Add(i, D) => WellFormed'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Add, GuardAdd
      <3>3. \A i \in Items, D \in SUBSET Items: CoreInv /\ Add(i, D) => SeqUnique'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Add, GuardAdd
      <3>4. \A i \in Items, D \in SUBSET Items: CoreInv /\ Add(i, D) => SeqBound'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Add, GuardAdd
      <3>5. \A i \in Items, D \in SUBSET Items: CoreInv /\ Add(i, D) => FinalSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Add, GuardAdd
      <3>6. \A i \in Items, D \in SUBSET Items: CoreInv /\ Add(i, D) => InProgressSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Add, GuardAdd
      <3>7. QED
        BY SMT, <3>1, <3>2, <3>3, <3>4, <3>5, <3>6 DEF TypeOK, WellFormed,
               SeqUnique, SeqBound, FinalSat, InProgressSat, Present, Active,
               IsLive, Sat, Statuses, Terminal, Success, CoreInv

    <2>3. \A i \in Items: CoreInv /\ Remove(i) => CoreInv'
      <3>1. \A i \in Items: CoreInv /\ Remove(i) => TypeOK'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Remove, GuardRemove
      <3>2. \A i \in Items: CoreInv /\ Remove(i) => WellFormed'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Remove, GuardRemove
      <3>3. \A i \in Items: CoreInv /\ Remove(i) => SeqUnique'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Remove, GuardRemove
      <3>4. \A i \in Items: CoreInv /\ Remove(i) => SeqBound'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Remove, GuardRemove
      <3>5. \A i \in Items: CoreInv /\ Remove(i) => FinalSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Remove, GuardRemove
      <3>6. \A i \in Items: CoreInv /\ Remove(i) => InProgressSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Remove, GuardRemove
      <3>7. QED
        BY SMT, <3>1, <3>2, <3>3, <3>4, <3>5, <3>6 DEF TypeOK, WellFormed,
               SeqUnique, SeqBound, FinalSat, InProgressSat, Present, Active,
               IsLive, Sat, Statuses, Terminal, Success, CoreInv

    <2>4. \A i \in Items, p \in 0..MaxPriority: CoreInv /\ Reprioritize(i, p) => CoreInv'
      <3>1. \A i \in Items, p \in 0..MaxPriority: CoreInv /\ Reprioritize(i, p) => TypeOK'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reprioritize, GuardReprioritize
      <3>2. \A i \in Items, p \in 0..MaxPriority: CoreInv /\ Reprioritize(i, p) => WellFormed'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reprioritize, GuardReprioritize
      <3>3. \A i \in Items, p \in 0..MaxPriority: CoreInv /\ Reprioritize(i, p) => SeqUnique'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reprioritize, GuardReprioritize
      <3>4. \A i \in Items, p \in 0..MaxPriority: CoreInv /\ Reprioritize(i, p) => SeqBound'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reprioritize, GuardReprioritize
      <3>5. \A i \in Items, p \in 0..MaxPriority: CoreInv /\ Reprioritize(i, p) => FinalSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reprioritize, GuardReprioritize
      <3>6. \A i \in Items, p \in 0..MaxPriority: CoreInv /\ Reprioritize(i, p) => InProgressSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reprioritize, GuardReprioritize
      <3>7. QED
        BY SMT, <3>1, <3>2, <3>3, <3>4, <3>5, <3>6 DEF TypeOK, WellFormed,
               SeqUnique, SeqBound, FinalSat, InProgressSat, Present, Active,
               IsLive, Sat, Statuses, Terminal, Success, CoreInv

    <2>5. \A i \in Items, D \in SUBSET Items: CoreInv /\ Rewire(i, D) => CoreInv'
      <3>1. \A i \in Items, D \in SUBSET Items: CoreInv /\ Rewire(i, D) => TypeOK'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Rewire, GuardRewire
      <3>2. \A i \in Items, D \in SUBSET Items: CoreInv /\ Rewire(i, D) => WellFormed'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Rewire, GuardRewire
      <3>3. \A i \in Items, D \in SUBSET Items: CoreInv /\ Rewire(i, D) => SeqUnique'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Rewire, GuardRewire
      <3>4. \A i \in Items, D \in SUBSET Items: CoreInv /\ Rewire(i, D) => SeqBound'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Rewire, GuardRewire
      <3>5. \A i \in Items, D \in SUBSET Items: CoreInv /\ Rewire(i, D) => FinalSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Rewire, GuardRewire
      <3>6. \A i \in Items, D \in SUBSET Items: CoreInv /\ Rewire(i, D) => InProgressSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Rewire, GuardRewire
      <3>7. QED
        BY SMT, <3>1, <3>2, <3>3, <3>4, <3>5, <3>6 DEF TypeOK, WellFormed,
               SeqUnique, SeqBound, FinalSat, InProgressSat, Present, Active,
               IsLive, Sat, Statuses, Terminal, Success, CoreInv

    <2>6. \A i \in Items, s \in Statuses \ {"absent"}: CoreInv /\ Mark(i, s) => CoreInv'
      <3>1. \A i \in Items, s \in Statuses \ {"absent"}: CoreInv /\ Mark(i, s) => TypeOK'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Mark, GuardMark
      <3>2. \A i \in Items, s \in Statuses \ {"absent"}: CoreInv /\ Mark(i, s) => WellFormed'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Mark, GuardMark
      <3>3. \A i \in Items, s \in Statuses \ {"absent"}: CoreInv /\ Mark(i, s) => SeqUnique'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Mark, GuardMark
      <3>4. \A i \in Items, s \in Statuses \ {"absent"}: CoreInv /\ Mark(i, s) => SeqBound'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Mark, GuardMark
      <3>5. \A i \in Items, s \in Statuses \ {"absent"}: CoreInv /\ Mark(i, s) => FinalSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Mark, GuardMark
      <3>6. \A i \in Items, s \in Statuses \ {"absent"}: CoreInv /\ Mark(i, s) => InProgressSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Mark, GuardMark
      <3>7. QED
        BY SMT, <3>1, <3>2, <3>3, <3>4, <3>5, <3>6 DEF TypeOK, WellFormed,
               SeqUnique, SeqBound, FinalSat, InProgressSat, Present, Active,
               IsLive, Sat, Statuses, Terminal, Success, CoreInv

    <2>7. \A i \in Items: CoreInv /\ Reopen(i) => CoreInv'
      <3>1. \A i \in Items: CoreInv /\ Reopen(i) => TypeOK'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reopen, GuardReopen
      <3>2. \A i \in Items: CoreInv /\ Reopen(i) => WellFormed'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reopen, GuardReopen
      <3>3. \A i \in Items: CoreInv /\ Reopen(i) => SeqUnique'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reopen, GuardReopen
      <3>4. \A i \in Items: CoreInv /\ Reopen(i) => SeqBound'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reopen, GuardReopen
      <3>5. \A i \in Items: CoreInv /\ Reopen(i) => FinalSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reopen, GuardReopen
      <3>6. \A i \in Items: CoreInv /\ Reopen(i) => InProgressSat'
        BY SMT DEF TypeOK, WellFormed, SeqUnique, SeqBound, FinalSat,
               InProgressSat, Present, Active, IsLive, Sat, Statuses, Terminal,
               Success, CoreInv, Reopen, GuardReopen
      <3>7. QED
        BY SMT, <3>1, <3>2, <3>3, <3>4, <3>5, <3>6 DEF TypeOK, WellFormed,
               SeqUnique, SeqBound, FinalSat, InProgressSat, Present, Active,
               IsLive, Sat, Statuses, Terminal, Success, CoreInv

    <2>8. QED
      BY SMT, <2>1, <2>2, <2>3, <2>4, <2>5, <2>6, <2>7 DEF Next, vars

  <1>3. QED
    BY <1>1, <1>2, PTL DEF SafetySpec

=============================================================================
